/**
 * Conferencia dos nomes de aba. Os nomes usados aqui sao os reais das planilhas
 * da IFT, lidos pela Google Sheets API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookupTab } from '../../dist/server/src/normalize.js';

const ABAS_BASE_DE_LEADS = [
  'Base 1',
  'INTERESSADOS EVENTOS PRESENCIAIS',
  'COPIA COMPRADORES PRESENCIAL',
  'COMPRADORES LT',
  'LEADS ANIMA',
  'DAY TRAIN. SIST. 18.04',
];

test('grafia identica e reconhecida como exata', () => {
  const r = lookupTab('COPIA COMPRADORES PRESENCIAL', ABAS_BASE_DE_LEADS);
  assert.equal(r.exata, true);
  assert.equal(r.encontrada, true);
});

test('so a caixa diferente ainda e encontrada, porque o Google ignora maiusculas', () => {
  const r = lookupTab('Interessados Eventos Presenciais', ABAS_BASE_DE_LEADS);
  assert.equal(r.encontrada, true, 'o Google acha essa aba, o diagnostico nao pode dizer que nao existe');
  assert.equal(r.exata, false);
  assert.equal(r.nomeReal, 'INTERESSADOS EVENTOS PRESENCIAIS');
});

test('acento a mais faz a aba nao ser encontrada, e sugere a certa', () => {
  const r = lookupTab('Cópia Compradores Presencial', ABAS_BASE_DE_LEADS);
  assert.equal(r.encontrada, false, 'acento quebra de verdade a leitura no Google');
  assert.equal(r.sugestao, 'COPIA COMPRADORES PRESENCIAL');
});

test('plural errado tambem nao e encontrado, mas a sugestao aponta a aba certa', () => {
  const r = lookupTab('Cópia Compradores Presenciais', ABAS_BASE_DE_LEADS);
  assert.equal(r.encontrada, false);
  assert.equal(r.sugestao, 'COPIA COMPRADORES PRESENCIAL');
});

test('aba inexistente nao inventa correspondencia', () => {
  const r = lookupTab('ABA QUE NAO EXISTE EM LUGAR NENHUM', ABAS_BASE_DE_LEADS);
  assert.equal(r.encontrada, false);
  assert.equal(r.nomeReal, null);
});

test('as abas configuradas por padrao batem com as reais das planilhas', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'));
  const abasTrafego = ['PLAN PARA DASH', 'BASE', 'DADOS', 'VENDAS'];

  assert.equal(lookupTab(config.sources.leads.tab, ABAS_BASE_DE_LEADS).exata, true);
  assert.equal(lookupTab(config.sources.buyers.tab, ABAS_BASE_DE_LEADS).exata, true);
  assert.equal(lookupTab(config.sources.traffic.tab, abasTrafego).exata, true);
});
