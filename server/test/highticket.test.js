/**
 * A secao High Ticket separa dois paineis pela coluna EMPRESA. O que estes
 * testes travam e a parte que ja mordeu o painel de eventos varias vezes: uma
 * linha que nao casa com nada some sem aviso, e um numero errado passa por
 * certo. Aqui nada pode sumir calado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeHighTicket } from '../../dist/server/src/highticket.js';

const config = JSON.parse(
  fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'),
);

const venda = (extra) => ({
  linha: 2, data: '2026-05-10', dataLead: '2026-05-01', dataCall: '2026-05-05',
  cliente: 'Fulano', funil: 'Aplicação', sdr: 'Ana', mentor: 'Carlos',
  produto: 'Formação', formaDePagamento: 'Cartão', entrada: 1000, total: 5000,
  painelId: 'ift', rawEmpresa: 'IFT', ...extra,
});
const lead = (extra) => ({ data: '2026-05-10', painelId: 'ift', rawEmpresa: 'IFT', ...extra });
const gasto = (extra) => ({ data: '2026-05-10', campanha: '[IFT] [LEADS] x', painelId: 'ift', custo: 100, ...extra });

const dados = (extra) => ({ vendas: [], leads: [], trafego: [], fetchedAt: '', falhas: [], ...extra });
const maio = { from: '2026-05-01', to: '2026-05-31' };
const painel = (r, id) => r.paineis.find((p) => p.painelId === id);

test('separa os dois paineis pela coluna EMPRESA', () => {
  const r = computeHighTicket(config, dados({
    vendas: [venda({}), venda({ painelId: 'sistemico', rawEmpresa: 'IFTS', total: 9000, entrada: 3000 })],
    leads: [lead({}), lead({}), lead({ painelId: 'sistemico', rawEmpresa: 'SYSTEMIC' })],
    trafego: [gasto({}), gasto({ painelId: 'sistemico', campanha: '[SISTEMIC ACADEMY] x', custo: 400 })],
  }), maio);

  const ift = painel(r, 'ift');
  assert.equal(ift.faturamento, 5000);
  assert.equal(ift.emCaixa, 1000);
  assert.equal(ift.vendas, 1);
  assert.equal(ift.leads, 2);
  assert.equal(ift.investimento, 100);
  assert.equal(ift.custoPorLead, 50);

  const sis = painel(r, 'sistemico');
  assert.equal(sis.faturamento, 9000);
  assert.equal(sis.emCaixa, 3000);
  assert.equal(sis.leads, 1);
  assert.equal(sis.investimento, 400);
  assert.equal(sis.custoPorLead, 400);
});

test('respeita o intervalo de datas escolhido', () => {
  const r = computeHighTicket(config, dados({
    vendas: [venda({}), venda({ data: '2026-04-20', total: 7777 })],
    leads: [lead({}), lead({ data: '2026-04-20' })],
    trafego: [gasto({}), gasto({ data: '2026-04-20', custo: 999 })],
  }), maio);
  const ift = painel(r, 'ift');
  assert.equal(ift.faturamento, 5000, 'a venda de abril nao entra em maio');
  assert.equal(ift.leads, 1);
  assert.equal(ift.investimento, 100);
});

test('EMPRESA fora dos dois paineis nunca some calada', () => {
  // A aba de vendas real tem uma linha com EMPRESA "ONT", que nao e nem IFT nem
  // IFTS. Sem esta lista ela desapareceria de todos os numeros sem rastro.
  const r = computeHighTicket(config, dados({
    vendas: [venda({ painelId: null, rawEmpresa: 'ONT', total: 12000 })],
    leads: [lead({ painelId: null, rawEmpresa: '' })],
    trafego: [gasto({ painelId: null, campanha: '[PAI] outra coisa', custo: 250 })],
  }), maio);

  assert.deepEqual(r.naoClassificado.vendas, [{ valor: 'ONT', linhas: 1 }]);
  assert.deepEqual(r.naoClassificado.leads, [{ valor: '(em branco)', linhas: 1 }]);
  assert.equal(r.naoClassificado.custoSemPainel, 250);
  assert.equal(painel(r, 'ift').faturamento, 0, 'nao pode cair num painel por acidente');
});

test('agrupa por funil, vendedor e produto, e ordena pelo maior total', () => {
  const r = computeHighTicket(config, dados({
    vendas: [
      venda({ funil: 'Aplicação', mentor: 'Carlos', produto: 'Formação', total: 1000, entrada: 100 }),
      venda({ funil: 'Aplicação', mentor: 'Bia', produto: 'Mentoria', total: 8000, entrada: 800 }),
      venda({ funil: 'Indicação', mentor: 'Carlos', produto: 'Formação', total: 3000, entrada: 300 }),
    ],
  }), maio);
  const ift = painel(r, 'ift');

  assert.deepEqual(ift.porFunil, [
    { chave: 'Aplicação', vendas: 2, entrada: 900, total: 9000 },
    { chave: 'Indicação', vendas: 1, entrada: 300, total: 3000 },
  ]);
  assert.deepEqual(ift.porVendedor.map((g) => g.chave), ['Bia', 'Carlos']);
  assert.deepEqual(ift.porProduto, [
    { chave: 'Formação', vendas: 2, entrada: 400, total: 4000 },
    { chave: 'Mentoria', vendas: 1, entrada: 800, total: 8000 },
  ].sort((a, b) => b.total - a.total));
});

test('venda com o campo em branco vira rotulo, em vez de sumir da tabela', () => {
  // Se ela sumisse, a soma da tabela nao bateria com o faturamento do topo — e
  // ninguem descobriria por que.
  const r = computeHighTicket(config, dados({
    vendas: [venda({ funil: '', mentor: '  ', produto: '', total: 15000, entrada: 0 })],
  }), maio);
  const ift = painel(r, 'ift');
  assert.deepEqual(ift.porFunil.map((g) => g.chave), ['Sem funil']);
  assert.deepEqual(ift.porVendedor.map((g) => g.chave), ['Sem vendedor']);
  assert.deepEqual(ift.porProduto.map((g) => g.chave), ['Sem produto']);
  const somaDaTabela = ift.porFunil.reduce((t, g) => t + g.total, 0);
  assert.equal(somaDaTabela, ift.faturamento, 'a tabela tem de fechar com o topo');
});

test('sem lead no periodo, o custo por lead e traco e nao uma divisao por zero', () => {
  const r = computeHighTicket(config, dados({ trafego: [gasto({})] }), maio);
  assert.equal(painel(r, 'ift').leads, 0);
  assert.equal(painel(r, 'ift').custoPorLead, null);
});

test('a serie tem um ponto por dia com venda, em ordem', () => {
  const r = computeHighTicket(config, dados({
    vendas: [
      venda({ data: '2026-05-20', total: 2000 }),
      venda({ data: '2026-05-10', total: 1000 }),
      venda({ data: '2026-05-10', total: 500 }),
    ],
  }), maio);
  assert.deepEqual(painel(r, 'ift').serie, [
    { data: '2026-05-10', faturamento: 1500, vendas: 2 },
    { data: '2026-05-20', faturamento: 2000, vendas: 1 },
  ]);
});

test('a tabela de clientes vem da venda mais recente para a mais antiga', () => {
  const r = computeHighTicket(config, dados({
    vendas: [
      venda({ data: '2026-05-02', cliente: 'Antiga' }),
      venda({ data: '2026-05-28', cliente: 'Recente' }),
    ],
  }), maio);
  assert.deepEqual(painel(r, 'ift').clientes.map((c) => c.cliente), ['Recente', 'Antiga']);
});

test('sem planilha lida, a tela mostra zeros em vez de quebrar', () => {
  const r = computeHighTicket(config, null, maio);
  assert.equal(r.paineis.length, 2);
  assert.equal(painel(r, 'ift').faturamento, 0);
  assert.equal(r.fetchedAt, null);
});

test('os dois paineis da configuracao continuam sendo IFT e Sistemico', () => {
  const ids = config.highTicket.paineis.map((p) => p.id);
  assert.deepEqual(ids, ['ift', 'sistemico']);
  // A aba de vendas escreve "IFTS" e a de leads escreve "SYSTEMIC" para a mesma
  // marca. Perder uma das duas grafias zera metade de um painel.
  const sis = config.highTicket.paineis[1].empresa.map((e) => e.toUpperCase());
  assert.ok(sis.includes('IFTS'), 'a grafia da aba de vendas');
  assert.ok(sis.includes('SYSTEMIC'), 'a grafia da aba de leads');
});
