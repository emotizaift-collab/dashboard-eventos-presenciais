import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeMetrics, listDays } from '../../dist/server/src/metrics.js';

/** Quantidade de um tipo de ingresso no resultado. */
const qtd = (metrics, id) => metrics.ingressos.find((t) => t.id === id)?.quantidade ?? 0;

const config = JSON.parse(fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'));

const lead = (date, edition = 'dai-atual') => ({ date, rawEvent: 'DAI', editionId: edition, lineId: 'dai' });
let proximaLinha = 2;
const compra = (date, ticketKind, ambassador = '', edition = 'dai-atual') => ({
  linha: proximaLinha++,
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
  assert.equal(qtd(metrics, 'individual'), 2);
  assert.equal(qtd(metrics, 'duplo'), 1);
  assert.equal(qtd(metrics, 'triplo'), 1);
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
  assert.equal(qtd(soAtual.metrics, 'individual'), 2);
  assert.equal(qtd(soHistorico.metrics, 'individual'), 1);
});

test('o aviso de data faltando aponta o numero da linha na planilha', () => {
  const semData = { ...compra(null, 'individual'), linha: 137 };
  const outra = { ...compra(null, 'duplo'), linha: 42 };
  const comSemData = { ...dataset, buyers: [...dataset.buyers, semData, outra] };
  const { warnings } = computeMetrics(config, comSemData, filtro);
  const aviso = warnings.find((w) => w.includes('sem data valida'));
  assert.ok(aviso, 'precisa avisar');
  // Ordenado do menor para o maior, para bater com a ordem de rolagem da planilha.
  assert.match(aviso, /linhas: 42, 137/);
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
  assert.deepEqual(metrics.naoClassificado.tiposIngresso, [{ valor: 'CAD DA MARIA', linhas: 1 }]);
});

test('acompanhante nao entra no faturamento, nos participantes nem nas vendas do grafico', () => {
  const comAcompanhantes = {
    ...dataset,
    buyers: [
      ...dataset.buyers,
      compra('2026-09-02', 'acompanhante'),       // segunda pessoa do duplo
      compra('2026-09-02', 'acompanhante'),       // duas do triplo
      compra('2026-09-02', 'acompanhante'),
    ],
  };
  const base = computeMetrics(config, dataset, filtro).metrics;
  const com = computeMetrics(config, comAcompanhantes, filtro).metrics;

  assert.equal(com.faturamentoLiquido, base.faturamentoLiquido, 'faturamento nao pode dobrar');
  assert.equal(com.participantes, base.participantes, 'a cadeira do duplo ja foi contada');
  assert.deepEqual(com.ingressos, base.ingressos);
  assert.equal(qtd(com, 'acompanhante'), 0, 'acompanhante nao aparece entre os tipos vendidos');
  assert.deepEqual(
    com.serie.map((p) => p.vendas),
    base.serie.map((p) => p.vendas),
    'acompanhante nao e uma venda nova',
  );
});

test('avisa quantos nomes de acompanhante ainda faltam preencher', () => {
  // 1 duplo + 1 triplo => 1 + 2 = 3 acompanhantes esperados; ha 1 cadastrado.
  const parcial = { ...dataset, buyers: [...dataset.buyers, compra('2026-09-02', 'acompanhante')] };
  const { warnings } = computeMetrics(config, parcial, filtro);
  const aviso = warnings.find((w) => w.includes('acompanhante'));
  assert.ok(aviso, 'precisa avisar sobre os nomes que faltam');
  assert.match(aviso, /Faltam 2 nome/);
});

test('avisa quando ha acompanhante demais para os ingressos vendidos', () => {
  const demais = {
    ...dataset,
    buyers: [...dataset.buyers, ...Array.from({ length: 9 }, () => compra('2026-09-02', 'acompanhante'))],
  };
  const { warnings } = computeMetrics(config, demais, filtro);
  assert.ok(warnings.some((w) => w.includes('linha duplicada')));
});

test('os nao classificados vem com o numero de linhas, e nao so o valor distinto', () => {
  const repetido = {
    ...dataset,
    buyers: [
      ...dataset.buyers,
      { ...compra('2026-09-01', null), rawTicketType: 'Vip' },
      { ...compra('2026-09-01', null), rawTicketType: 'Vip' },
      { ...compra('2026-09-02', null), rawTicketType: 'Vip' },
      { ...compra('2026-09-02', null), rawTicketType: 'Inteira' },
    ],
  };
  const { metrics } = computeMetrics(config, repetido, filtro);
  // Ordenado do maior para o menor: 3 linhas "Vip" pesam mais que 1 "Inteira".
  assert.deepEqual(metrics.naoClassificado.tiposIngresso, [
    { valor: 'Vip', linhas: 3 },
    { valor: 'Inteira', linhas: 1 },
  ]);
  assert.equal(metrics.naoClassificado.resumo.comprasSemTipo, 4);
});

test('campanha nao reconhecida mostra quanto dinheiro esta parado nela', () => {
  const comGasto = {
    ...dataset,
    traffic: [
      ...dataset.traffic,
      { date: '2026-09-01', campaign: '[XX] outro produto', editionId: null, lineId: null, cost: 100 },
      { date: '2026-09-02', campaign: '[XX] outro produto', editionId: null, lineId: null, cost: 250.5 },
    ],
  };
  const { metrics } = computeMetrics(config, comGasto, filtro);
  assert.deepEqual(metrics.naoClassificado.campanhas, [
    { valor: '[XX] outro produto', linhas: 2, custo: 350.5 },
  ]);
});

test('VIP usa o preco proprio, e nao o preco base', () => {
  const comVip = {
    ...dataset,
    buyers: [
      ...dataset.buyers,
      compra('2026-09-01', 'vip'),
      compra('2026-09-01', 'inteira'),
      compra('2026-09-02', 'vip-segunda-cadeira'),
    ],
  };
  const base = computeMetrics(config, dataset, filtro).metrics;
  const com = computeMetrics(config, comVip, filtro).metrics;

  // 3 ingressos de R$ 297,00 a mais
  assert.equal(round(com.faturamentoLiquido - base.faturamentoLiquido), 891);
  assert.equal(qtd(com, 'vip'), 1);
  assert.equal(qtd(com, 'inteira'), 1);
  assert.equal(qtd(com, 'vip-segunda-cadeira'), 1);
  // Cada um leva 1 pessoa
  assert.equal(com.participantes - base.participantes, 3);
});

test('a 2a cadeira do VIP e venda separada: entra no faturamento e no grafico', () => {
  const comVip = { ...dataset, buyers: [...dataset.buyers, compra('2026-09-01', 'vip-segunda-cadeira')] };
  const base = computeMetrics(config, dataset, filtro).metrics;
  const com = computeMetrics(config, comVip, filtro).metrics;
  assert.equal(round(com.faturamentoLiquido - base.faturamentoLiquido), 297);
  assert.equal(com.serie[0].vendas, base.serie[0].vendas + 1);
});

test('mudar o preco base move os tipos calculados e nao mexe no VIP', () => {
  const outroPreco = { ...config, ticketPrice: 100 };
  const comVip = { ...dataset, buyers: [...dataset.buyers, compra('2026-09-01', 'vip')] };
  const { metrics } = computeMetrics(outroPreco, comVip, filtro);
  const porId = Object.fromEntries(metrics.ingressos.map((t) => [t.id, t]));
  assert.equal(porId.individual.faturamento, 200, '2 individuais a R$ 100');
  assert.equal(porId.duplo.faturamento, 200, '1 duplo = 2 cadeiras a R$ 100');
  assert.equal(porId.triplo.faturamento, 300);
  assert.equal(porId.vip.faturamento, 297, 'preco proprio nao acompanha o preco base');
});

function round(v) { return Math.round(v * 100) / 100; }
