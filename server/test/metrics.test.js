import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeMetrics, listDays } from '../../dist/server/src/metrics.js';

const config = JSON.parse(fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'));

const lead = (date, edition = 'dai-atual') => ({ date, rawEvent: 'DAI', editionId: edition, lineId: 'dai' });
const compra = (date, ticketKind, ambassador = '', edition = 'dai-atual') => ({
  date, rawEvent: 'DAI', editionId: edition, lineId: 'dai',
  ticketKind, rawTicketType: ticketKind ?? '', ambassador,
});
const gasto = (date, cost, edition = 'dai-atual') => ({
  date, campaign: '[DAI] teste', editionId: edition, lineId: 'dai', cost,
});

const dataset = {
  leads: [lead('2026-09-01'), lead('2026-09-01'), lead('2026-09-02'), lead('2026-08-01')],
  buyers: [
    compra('2026-09-01', 'individual'),
    compra('2026-09-01', 'individual'),
    compra('2026-09-02', 'duplo'),
    compra('2026-09-02', 'triplo'),
    compra('2026-09-02', 'cortesia', 'Maria Silva'),
    compra('2026-09-02', 'cortesia', 'Maria Silva'),
    compra('2026-09-03', 'cortesia', 'João Souza'),
    compra('2026-08-01', 'individual'),
  ],
  traffic: [gasto('2026-09-01', 1000), gasto('2026-09-02', 500.5), gasto('2026-08-01', 9999)],
  fetchedAt: new Date().toISOString(),
  warnings: [],
};

const filtro = { lineId: 'dai', editionId: null, from: '2026-09-01', to: '2026-09-03' };

test('calcula faturamento pelo preco do ingresso, sem contar cortesias', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.deepEqual(metrics.ingressos, { individual: 2, duplo: 1, triplo: 1 });
  // 2 x 91,16 + 1 x 182,32 + 1 x 273,48
  assert.equal(metrics.faturamentoLiquido, 638.12);
});

test('soma o custo de campanha so dentro do periodo escolhido', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.equal(metrics.custoCampanha, 1500.5);
});

test('retorno negativo aparece como prejuizo', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.equal(metrics.retorno, -862.38);
  assert.ok(metrics.retorno < 0);
});

test('conta embaixadores distintos e convidados por linha', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  // Maria aparece 2x e Joao 1x -> 2 embaixadores, 3 convidados
  assert.deepEqual(metrics.embaixador, { embaixadores: 2, convidados: 3, total: 5 });
});

test('participantes somam as cadeiras de cada ingresso mais embaixadores e convidados', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  // 2 individuais + 1 duplo (2) + 1 triplo (3) + 2 embaixadores + 3 convidados
  assert.equal(metrics.participantes, 12);
});

test('leads e custo por lead respeitam o periodo', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.equal(metrics.leadsTotal, 3);
  assert.equal(metrics.custoPorLead, 500.17);
});

test('custo por lead fica vazio quando nao ha lead nenhum', () => {
  const vazio = { ...dataset, leads: [] };
  const { metrics } = computeMetrics(config, vazio, filtro);
  assert.equal(metrics.custoPorLead, null);
});

test('a serie tem um ponto por dia do intervalo, mesmo sem movimento', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.equal(metrics.serie.length, 3);
  assert.deepEqual(metrics.serie.map((p) => p.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.deepEqual(metrics.serie.map((p) => p.leads), [2, 1, 0]);
  // cortesia nao conta como venda
  assert.deepEqual(metrics.serie.map((p) => p.vendas), [2, 2, 0]);
});

test('filtrar por edicao separa o nome atual do historico', () => {
  const misto = {
    ...dataset,
    buyers: [...dataset.buyers, compra('2026-09-01', 'individual', '', 'dai-historico')],
  };
  const soAtual = computeMetrics(config, misto, { ...filtro, editionId: 'dai-atual' });
  const soHistorico = computeMetrics(config, misto, { ...filtro, editionId: 'dai-historico' });
  assert.equal(soAtual.metrics.ingressos.individual, 2);
  assert.equal(soHistorico.metrics.ingressos.individual, 1);
});

test('avisa quando ha compradores sem data valida', () => {
  const comSemData = { ...dataset, buyers: [...dataset.buyers, compra(null, 'individual')] };
  const { warnings } = computeMetrics(config, comSemData, filtro);
  assert.ok(warnings.some((aviso) => aviso.includes('sem data')));
});

test('intervalo invertido nao gera dias', () => {
  assert.equal(listDays('2026-09-10', '2026-09-01').length, 0);
  assert.equal(listDays('2026-09-01', '2026-09-01').length, 1);
});

test('o resumo mede o tamanho do que esta ficando de fora', () => {
  const sujo = {
    ...dataset,
    leads: [...dataset.leads, { date: '2026-09-01', rawEvent: 'OUTRO PRODUTO', editionId: null, lineId: null }],
    buyers: [
      ...dataset.buyers,
      compra('2026-09-01', null),                       // evento certo, tipo desconhecido
      { ...compra('2026-09-01', 'individual'), rawTicketType: 'CAD DA MARIA', ticketKind: null },
      { date: '2026-09-01', rawEvent: 'OUTRO', editionId: null, lineId: null, ticketKind: null, rawTicketType: '', ambassador: '' },
    ],
    traffic: [...dataset.traffic, { date: '2026-09-01', campaign: '[DI] outro produto', editionId: null, lineId: null, cost: 250 }],
  };
  const { metrics } = computeMetrics(config, sujo, filtro);
  const r = metrics.naoClassificado.resumo;

  assert.equal(r.leadsIgnorados, 1);
  assert.equal(r.comprasSemEvento, 1);
  assert.equal(r.comprasSemTipo, 1, 'so conta linha com texto no tipo, nao celula vazia');
  assert.equal(r.custoSemEvento, 250);
  assert.ok(metrics.naoClassificado.tiposIngresso.includes('CAD DA MARIA'));
});
