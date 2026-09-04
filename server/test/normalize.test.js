import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseMoney, columnLetterToIndex, resolveColumnIndex } from '../../dist/server/src/normalize.js';

test('le datas nos formatos que aparecem nas planilhas', () => {
  assert.equal(parseDate('01/01/2026'), '2026-01-01');
  assert.equal(parseDate('27/02/2026'), '2026-02-27');
  assert.equal(parseDate('4/9/2026'), '2026-09-04');
  assert.equal(parseDate('21/12/2025 05:45'), '2025-12-21');
  assert.equal(parseDate('2026-09-04'), '2026-09-04');
  assert.equal(parseDate('09/12/25'), '2025-12-09');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('total'), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('32/13/2026'), null);
});

test('le valores em reais, inclusive negativos e com escape da planilha', () => {
  assert.equal(parseMoney('R$ 1.788,09'), 1788.09);
  assert.equal(parseMoney('R$ 45,12'), 45.12);
  assert.equal(parseMoney('R$ 0,00'), 0);
  assert.equal(parseMoney('-R$ 1,50'), -1.5);
  assert.equal(parseMoney('\\-R$ 4.099,57'), -4099.57);
  assert.equal(parseMoney('R$ 3.551,60'), 3551.6);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney(null), 0);
  assert.equal(parseMoney(1234.5), 1234.5);
});

test('converte letra de coluna em posicao', () => {
  assert.equal(columnLetterToIndex('A'), 0);
  assert.equal(columnLetterToIndex('C'), 2);
  assert.equal(columnLetterToIndex('F'), 5);
  assert.equal(columnLetterToIndex('I'), 8);
  assert.equal(columnLetterToIndex('J'), 9);
  assert.equal(columnLetterToIndex('AA'), 26);
});

test('acha a coluna pelo titulo do cabecalho', () => {
  const cabecalho = ['Data', 'Nome', 'E-mail', 'Evento', 'Telefone'];
  assert.equal(resolveColumnIndex('auto:Evento', cabecalho), 3);
  assert.equal(resolveColumnIndex('auto:evento', cabecalho), 3);
  assert.equal(resolveColumnIndex('auto:Nao existe', cabecalho), -1);
  assert.equal(resolveColumnIndex('B', cabecalho), 1);
});
