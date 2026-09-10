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
  ticketKind, rawTicketType: ticketKind ?? '', ambassador, valor: null,
});

/** Configuracao que calcula pelo preco de tabela, como era antes da troca de fonte. */
const configPrecoDeTabela = { ...config, usarValorDaPlanilha: false };
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

const filtro = { lineId: 'dai', editionId: null, from: '2026-09-01', to: '2026-09-03', campanhas: [] };

test('calcula faturamento pelo preco do ingresso, sem contar cortesias', () => {
  const { metrics } = computeMetrics(configPrecoDeTabela, dataset, filtro);
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
  assert.deepEqual(metrics.serie.map((p) => p.dateFim), ['2026-09-01', '2026-09-02', '2026-09-03']);
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
      compra('2026-09-01', 'vip'),
      compra('2026-09-02', 'vip'),
    ],
  };
  const base = computeMetrics(config, dataset, filtro).metrics;
  const com = computeMetrics(config, comVip, filtro).metrics;

  // 3 ingressos de R$ 297,00 a mais
  assert.equal(round(com.faturamentoLiquido - base.faturamentoLiquido), 891);
  assert.equal(qtd(com, 'vip'), 3);
  // Cada um leva 1 pessoa
  assert.equal(com.participantes - base.participantes, 3);
});

test('a 2a cadeira do VIP e venda separada: entra no faturamento e no grafico', () => {
  // Confirmado com a IFT: diferente do acompanhante de duplo, a segunda cadeira
  // do VIP e cobrada a parte. Hoje ela e classificada como um VIP.
  const comVip = { ...dataset, buyers: [...dataset.buyers, compra('2026-09-01', 'vip')] };
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

test('compra sem o nome do evento e denunciada, nao descartada em silencio', () => {
  // Coluna do evento vazia: a linha nao casa com nenhum evento e tambem nao
  // aparece em "nomes nao reconhecidos", porque nao ha texto para listar.
  const orfa = {
    linha: 88, date: '2026-09-01', rawEvent: '   ', editionId: null, lineId: null,
    ticketKind: null, rawTicketType: 'individual', ambassador: '',
  };
  const comOrfa = { ...dataset, buyers: [...dataset.buyers, orfa] };
  const { metrics, warnings } = computeMetrics(config, comOrfa, filtro);

  const aviso = warnings.find((w) => w.includes('coluna do evento em branco'));
  assert.ok(aviso, 'uma venda invisivel precisa ser denunciada');
  assert.match(aviso, /linhas: 88/);

  // E continua fora das contas: o aviso e para a pessoa agir, nao um chute.
  assert.equal(metrics.naoClassificado.eventosCompradores.length, 0);
});

test('linha totalmente vazia nao vira alarme falso', () => {
  const vazia = {
    linha: 99, date: null, rawEvent: '', editionId: null, lineId: null,
    ticketKind: null, rawTicketType: '', ambassador: '',
  };
  const { warnings } = computeMetrics(config, { ...dataset, buyers: [...dataset.buyers, vazia] }, filtro);
  assert.ok(!warnings.some((w) => w.includes('coluna do evento em branco')));
});

// --- Filtro de campanhas (Fase 1, item 5 e 6) ---

const datasetCampanhas = {
  leads: [lead('2026-09-01'), lead('2026-09-02')],
  buyers: [compra('2026-09-01', 'individual'), compra('2026-09-02', 'duplo')],
  traffic: [
    { date: '2026-09-01', campaign: '[DAI] [LEADS] [ABO] - 04-09', editionId: 'dai-atual', lineId: 'dai', cost: 300 },
    { date: '2026-09-02', campaign: '[DAI] [VENDAS] [PAGINA] - 05-09', editionId: 'dai-atual', lineId: 'dai', cost: 200 },
    { date: '2026-09-02', campaign: '[PAI] [VENDAS] [INLEAD] - antiga', editionId: 'dai-historico', lineId: 'dai', cost: 999 },
  ],
  fetchedAt: new Date().toISOString(),
  warnings: [],
  falhas: [],
};

test('sem campanha selecionada, o custo soma todas as campanhas do evento', () => {
  const { metrics } = computeMetrics(config, datasetCampanhas, filtro);
  assert.equal(metrics.custoCampanha, 1499);
});

test('com campanhas selecionadas, o custo soma exatamente as escolhidas', () => {
  const escolha = {
    ...filtro,
    campanhas: ['[DAI] [LEADS] [ABO] - 04-09', '[DAI] [VENDAS] [PAGINA] - 05-09'],
  };
  const { metrics } = computeMetrics(config, datasetCampanhas, escolha);
  assert.equal(metrics.custoCampanha, 500, 'a campanha antiga nao foi escolhida e nao pode entrar');
});

test('o nome da campanha e comparado sem diferenciar caixa e espaco em volta', () => {
  const escolha = { ...filtro, campanhas: ['  [dai] [leads] [abo] - 04-09  '] };
  const { metrics } = computeMetrics(config, datasetCampanhas, escolha);
  assert.equal(metrics.custoCampanha, 300);
});

test('faturamento segue o EVENTO das campanhas escolhidas, nao a campanha em si', () => {
  // A aba de compradores nao tem coluna de campanha: o vinculo possivel e o evento.
  // Como as duas campanhas escolhidas sao do mesmo evento, o faturamento e o do evento inteiro.
  const escolha = { ...filtro, campanhas: ['[DAI] [LEADS] [ABO] - 04-09'] };
  const semFiltro = computeMetrics(config, datasetCampanhas, filtro).metrics;
  const comFiltro = computeMetrics(config, datasetCampanhas, escolha).metrics;
  assert.equal(comFiltro.faturamentoLiquido, semFiltro.faturamentoLiquido);
  assert.equal(comFiltro.leadsTotal, semFiltro.leadsTotal);
});

test('escolher campanha de outro evento zera faturamento e leads do evento filtrado', () => {
  const outroEvento = {
    ...datasetCampanhas,
    traffic: [
      ...datasetCampanhas.traffic,
      { date: '2026-09-01', campaign: '[ANIMADAY] [LEADS] - 04-09', editionId: 'anima-atual', lineId: 'anima', cost: 50 },
    ],
  };
  const escolha = { ...filtro, lineId: 'todos', campanhas: ['[ANIMADAY] [LEADS] - 04-09'] };
  const { metrics } = computeMetrics(config, outroEvento, escolha);
  assert.equal(metrics.custoCampanha, 50);
  assert.equal(metrics.faturamentoLiquido, 0, 'nao ha compra do ANIMA Day neste dataset');
  assert.equal(metrics.leadsTotal, 0);
});

test('Resultado e sempre faturamento menos custo', () => {
  const escolha = { ...filtro, campanhas: ['[DAI] [LEADS] [ABO] - 04-09'] };
  const { metrics } = computeMetrics(config, datasetCampanhas, escolha);
  assert.equal(metrics.retorno, round(metrics.faturamentoLiquido - metrics.custoCampanha));
});

test('VIP duplo e triplo valem 2x e 3x o VIP, e levam 2 e 3 pessoas', () => {
  const comVips = {
    ...dataset,
    buyers: [...dataset.buyers, compra('2026-09-01', 'vip-duplo'), compra('2026-09-01', 'vip-triplo')],
  };
  const base = computeMetrics(config, dataset, filtro).metrics;
  const com = computeMetrics(config, comVips, filtro).metrics;

  // 594,00 + 891,00
  assert.equal(round(com.faturamentoLiquido - base.faturamentoLiquido), 1485);
  assert.equal(com.participantes - base.participantes, 5, '2 cadeiras + 3 cadeiras');
  assert.equal(qtd(com, 'vip-duplo'), 1);
  assert.equal(qtd(com, 'vip-triplo'), 1);
});

test('os tipos aparecem no painel na ordem pedida', () => {
  const { metrics } = computeMetrics(config, dataset, filtro);
  assert.deepEqual(
    metrics.ingressos.map((t) => t.id).slice(0, 6),
    ['individual', 'duplo', 'triplo', 'vip', 'vip-duplo', 'vip-triplo'],
  );
});

test('VIP duplo e triplo tambem cobram acompanhante', () => {
  // 1 cadeira extra do VIP duplo + 2 do VIP triplo, alem do duplo e triplo comuns.
  const comVips = {
    ...dataset,
    buyers: [...dataset.buyers, compra('2026-09-01', 'vip-duplo'), compra('2026-09-01', 'vip-triplo')],
  };
  const { warnings } = computeMetrics(config, comVips, filtro);
  const aviso = warnings.find((w) => w.includes('acompanhante'));
  assert.ok(aviso);
  assert.match(aviso, /comportam 6 acompanhante/);
});

// --- Agrupamento do grafico ---

const seriePara = (from, to) =>
  computeMetrics(config, { ...dataset, leads: [], buyers: [], traffic: [] }, {
    ...filtro, from, to,
  }).metrics.serie;

test('ate 31 dias o grafico mostra um ponto por dia', () => {
  const trintaUm = seriePara('2026-09-01', '2026-10-01'); // 31 dias
  assert.equal(trintaUm.length, 31);
  assert.ok(trintaUm.every((p) => p.date === p.dateFim), 'nenhum ponto pode agrupar');
  assert.equal(trintaUm[0].date, '2026-09-01');
  assert.equal(trintaUm[30].date, '2026-10-01');
});

test('a partir de 32 dias os dias sao agrupados de tres em tres', () => {
  const trintaDois = seriePara('2026-09-01', '2026-10-02'); // 32 dias
  assert.equal(trintaDois.length, 11, '32 dias em blocos de 3 = 11 pontos');
  assert.equal(trintaDois[0].date, '2026-09-01');
  assert.equal(trintaDois[0].dateFim, '2026-09-03');
  // O ultimo bloco fica incompleto quando o total nao e multiplo de 3.
  assert.equal(trintaDois[10].date, '2026-10-01');
  assert.equal(trintaDois[10].dateFim, '2026-10-02');
});

test('agrupar soma os valores dos dias do bloco, sem perder nada', () => {
  const leadsDiarios = [];
  const cursor = new Date('2026-09-01T00:00:00Z');
  for (let i = 0; i < 33; i += 1) {
    const dia = cursor.toISOString().slice(0, 10);
    leadsDiarios.push(lead(dia), lead(dia)); // 2 leads por dia, 33 dias = 66
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const { metrics } = computeMetrics(
    config,
    { ...dataset, leads: leadsDiarios, buyers: [], traffic: [] },
    { ...filtro, from: '2026-09-01', to: '2026-10-03' },
  );
  assert.equal(metrics.serie.length, 11);
  assert.ok(metrics.serie.every((p) => p.leads === 6), 'cada bloco de 3 dias tem 6 leads');
  assert.equal(metrics.serie.reduce((t, p) => t + p.leads, 0), 66, 'o total nao pode mudar');
  assert.equal(metrics.leadsTotal, 66);
});

test('um dia so continua sendo um ponto', () => {
  const umDia = seriePara('2026-09-01', '2026-09-01');
  assert.equal(umDia.length, 1);
  assert.equal(umDia[0].date, umDia[0].dateFim);
});

test('convite de embaixador sem o nome do embaixador e apontado, com as linhas', () => {
  // O convidado só é contado pela coluna do embaixador. Sem esse nome, a
  // pessoa vai ao evento e não aparece em Participantes.
  const semNome = { ...compra('2026-09-01', 'cortesia', ''), linha: 210 };
  const comNome = compra('2026-09-01', 'cortesia', 'Ana Paula');
  const { metrics, warnings } = computeMetrics(
    config,
    { ...dataset, buyers: [...dataset.buyers, semNome, comNome] },
    filtro,
  );
  const aviso = warnings.find((w) => w.includes('sem o nome do embaixador'));
  assert.ok(aviso, 'precisa apontar o convite sem embaixador');
  assert.match(aviso, /linhas: 210/);
  // O que tem nome continua contando normalmente.
  assert.ok(metrics.embaixador.convidados >= 1);
});

test('acompanhante sem nome de embaixador nao vira alarme falso', () => {
  const { warnings } = computeMetrics(
    config,
    { ...dataset, buyers: [...dataset.buyers, compra('2026-09-01', 'acompanhante', '')] },
    filtro,
  );
  assert.ok(!warnings.some((w) => w.includes('sem o nome do embaixador')));
});

// --- Valor vindo da planilha (fonte VENDAS TOTAL LOW TICKET) ---

const configComValor = { ...config, usarValorDaPlanilha: true };
const compraComValor = (date, ticketKind, valor) => ({ ...compra(date, ticketKind), valor });

test('com valor na planilha, o faturamento e a soma do que esta escrito', () => {
  const dados = {
    ...dataset,
    buyers: [
      compraComValor('2026-09-01', 'individual', 91.16),
      compraComValor('2026-09-02', 'vip', 91.16),   // VIP antes do reajuste
      compraComValor('2026-09-02', 'vip', 297),     // VIP depois do reajuste
    ],
  };
  const { metrics } = computeMetrics(configComValor, dados, filtro);
  assert.equal(metrics.faturamentoLiquido, 479.32, '91,16 + 91,16 + 297,00');
  // O preco de tabela do VIP (R$ 297) nao pode reescrever a venda antiga.
  const vip = metrics.ingressos.find((t) => t.id === 'vip');
  assert.equal(vip.faturamento, 388.16);
  assert.equal(vip.quantidade, 2);
});

test('venda sem valor na planilha cai no preco de tabela, e avisa', () => {
  const dados = { ...dataset, buyers: [compraComValor('2026-09-01', 'individual', null)] };
  const { metrics, warnings } = computeMetrics(configComValor, dados, filtro);
  assert.equal(metrics.faturamentoLiquido, 91.16);
  assert.ok(warnings.some((w) => w.includes('sem valor preenchido')));
});

test('sem usarValorDaPlanilha, o calculo por preco de tabela continua valendo', () => {
  const dados = { ...dataset, buyers: [compraComValor('2026-09-01', 'vip', 91.16)] };
  const { metrics } = computeMetrics(configPrecoDeTabela, dados, filtro);
  assert.equal(metrics.faturamentoLiquido, 297, 'ignora o valor da planilha quando a opcao esta desligada');
});
