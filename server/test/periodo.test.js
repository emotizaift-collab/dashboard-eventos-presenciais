/**
 * O atalho "Período desta edição" existe porque a edicao separa a venda, mas
 * nao os leads nem o custo: esses chegam com um nome generico do evento e so a
 * data os recorta. Sem o atalho, quem escolhe uma edicao ou ajusta as datas na
 * mao (e precisa abrir a planilha para saber quais) ou le o custo do evento
 * inteiro contra o faturamento de uma edicao so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { periodoDeVendas } from '../../dist/server/src/metrics.js';

const compra = (date, editionId) => ({
  linha: 1, date, rawEvent: '', editionId, lineId: 'formacao-palestrantes',
  ticketKind: 'individual', rawTicketType: 'individual', ambassador: '', valor: 97,
});

const dados = (buyers) => ({
  leads: [], traffic: [], ambassadors: [], buyers, fetchedAt: '', warnings: [], falhas: [],
});

test('devolve o primeiro e o ultimo dia de venda da edicao', () => {
  const d = dados([
    compra('2026-05-25', 'fp-ed-03'),
    compra('2026-05-05', 'fp-ed-03'),
    compra('2026-05-12', 'fp-ed-03'),
  ]);
  assert.deepEqual(periodoDeVendas(d, 'fp-ed-03'), { de: '2026-05-05', ate: '2026-05-25' });
});

test('nao mistura a venda de uma edicao com a de outra', () => {
  const d = dados([
    compra('2026-03-15', 'fp-ed-01'),
    compra('2026-05-25', 'fp-ed-03'),
  ]);
  assert.deepEqual(periodoDeVendas(d, 'fp-ed-01'), { de: '2026-03-15', ate: '2026-03-15' });
  assert.deepEqual(periodoDeVendas(d, 'fp-ed-03'), { de: '2026-05-25', ate: '2026-05-25' });
});

test('edicao sem venda, ou compra sem data, nao viram atalho', () => {
  // Um atalho que mandasse para um intervalo inventado seria pior que nenhum.
  assert.equal(periodoDeVendas(dados([]), 'fp-ed-03'), null);
  assert.equal(periodoDeVendas(dados([compra(null, 'fp-ed-03')]), 'fp-ed-03'), null);
  assert.equal(periodoDeVendas(null, 'fp-ed-03'), null);
  // A fonte de leads nao vende: ela nunca oferece o atalho.
  assert.equal(periodoDeVendas(dados([compra('2026-05-05', 'fp-ed-03')]), 'fp-nomes-antigos'), null);
});
