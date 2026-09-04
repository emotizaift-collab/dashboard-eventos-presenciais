/**
 * Testes do reconhecimento de eventos.
 * Os nomes de campanha usados aqui foram tirados da planilha TRAFEGO IFT real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileMatcher, matchEdition, matchTicketKind } from '../../dist/server/src/matching.js';

const config = JSON.parse(fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'));
const matcher = compileMatcher(config);

const casos = [
  // Evento A — nome novo
  ['[DAI] [LEADS] [ABO] [F] ALPHA - 04-09', 'dai', 'dai-atual'],
  ['Dinâmicas de Alto Impacto', 'dai', 'dai-atual'],
  ['DAI', 'dai', 'dai-atual'],
  // Evento A — nomes historicos
  ['[PAI] [VENDAS] [PAGINA] [CBO] [F] BR [VID] - 24/09/25 BID CAP', 'dai', 'dai-historico'],
  ['[PAI] [VENDAS] [INLEAD] [CBO] [F] BR [VID] - 25/08/25 BID CAP', 'dai', 'dai-historico'],
  ['[PAIAOVIVO] [LEADS] [ABO] [F] 07-08 ALPHA', 'dai', 'dai-historico'],
  ['[PAI 147$] [VENDAS] [ABO] [F] BR - 04/07/26', 'dai', 'dai-historico'],
  ['[DINAMICASAOVIVO] [LEADS] [ABO] - 13-08 pg bianca', 'dai', 'dai-historico'],
  ['Palestrante de Alto Impacto', 'dai', 'dai-historico'],
  // Evento B — nome novo
  ['[ANIMADAY] [LEADS] [ABO] - 04-09', 'anima', 'anima-atual'],
  ['ANIMA Day', 'anima', 'anima-atual'],
  // Evento B — nome historico
  ['Day Training Sist', 'anima', 'anima-historico'],
];

test('reconhece as campanhas e os nomes dos dois eventos', () => {
  for (const [texto, linhaEsperada, edicaoEsperada] of casos) {
    const resultado = matchEdition(matcher, texto);
    assert.ok(resultado, `nao reconheceu: ${texto}`);
    assert.equal(resultado.lineId, linhaEsperada, `linha errada para: ${texto}`);
    assert.equal(resultado.editionId, edicaoEsperada, `edicao errada para: ${texto}`);
  }
});

test('ignora campanhas de outros produtos da empresa', () => {
  const forasteiras = [
    '[DI] [VENDAS] [PAGINA] [ADV] - BID CAP',
    // Confirmado pela IFT: "Dinamicas Sistemicas INFINITAS" e outro produto,
    // nao o nome antigo do ANIMA Day. So [ANIMADAY] identifica o ANIMA Day.
    'Dinâmicas Sistêmicas INFINITAS – O Treinamento',
    '[ANIMA] [LEADS] [CBO] - 07/07',
    '[PAS] [VENDAS] [INLEAD] [ABO] [F] [VID] - 29/10',
    '[7C] [VENDAS] [PAGINA] [ABO] - LAB DE ADS - 18/12',
    '[MI] [VENDAS] [PAGINA] [ADV] - 11/JAN/26',
    '[TV] [VENDAS] [PAGINA] [ADV] - BID CAP',
    '01 - FRIO VALIDADO — Cópia',
    '01 - ADVANTAGE +',
    'MENTORIAS INFINITAS',
    '',
  ];
  for (const texto of forasteiras) {
    assert.equal(matchEdition(matcher, texto), null, `casou por engano: ${texto}`);
  }
});

test('sigla curta so vale como tag ou celula inteira, nunca dentro de outra palavra', () => {
  // "PAI" nao pode casar dentro de "PAIXAO" nem de "CAMPAINHA".
  assert.equal(matchEdition(matcher, 'CAMPANHA PAIXAO BR'), null);
  assert.equal(matchEdition(matcher, 'campainha'), null);
});

test('classifica os tipos de ingresso escritos de varios jeitos', () => {
  const casosIngresso = [
    ['individual', 'individual'],
    ['Ingresso Individual', 'individual'],
    ['INDIVIDUAL ', 'individual'],
    ['cadeira dupla', 'duplo'],
    ['Cadeira Dupla', 'duplo'],
    ['duas pessoas', 'duplo'],
    ['Ingresso Duplo', 'duplo'],
    ['ingresso triplo', 'triplo'],
    ['Três pessoas', 'triplo'],
    ['TRIPLO', 'triplo'],
    ['convite embaixador', 'cortesia'],
    ['Convite Embaixador', 'cortesia'],
    ['', null],
    ['qualquer outra coisa', null],
  ];
  for (const [texto, esperado] of casosIngresso) {
    assert.equal(matchTicketKind(matcher, texto), esperado, `tipo errado para: "${texto}"`);
  }
});

test('apelidos escritos com espaco tambem sao reconhecidos', () => {
  // Valores reais encontrados nas planilhas de leads e de compradores.
  const pai = matchEdition(matcher, 'PAI AO VIVO');
  assert.ok(pai, '"PAI AO VIVO" precisa ser reconhecido');
  assert.equal(pai.editionId, 'dai-historico');

  const day = matchEdition(matcher, 'DAY TRAININ');
  assert.ok(day, '"DAY TRAININ" (digitado incompleto na planilha) precisa ser reconhecido');
  assert.equal(day.editionId, 'anima-historico');
});

test('linha de acompanhante e reconhecida e nunca vira ingresso', () => {
  // Valores reais da coluna H: a equipe liga para o comprador do duplo e
  // registra o nome da segunda pessoa numa linha propria.
  const acompanhantes = [
    'CAD DA LUCIELMA', 'CAD DE MARISA', 'CAD DO ALBERTO',
    'CAD VANESSA', 'Cad da Mara', 'CAD CIRLENE', 'CAD DA MÁRCIA BORBA',
  ];
  for (const texto of acompanhantes) {
    assert.equal(matchTicketKind(matcher, texto), 'acompanhante', `errou em: ${texto}`);
  }
});

test('acompanhante nao rouba a classificacao de um ingresso de verdade', () => {
  assert.equal(matchTicketKind(matcher, 'cadeira dupla'), 'duplo');
  assert.equal(matchTicketKind(matcher, 'individual'), 'individual');
  assert.equal(matchTicketKind(matcher, 'ingresso triplo'), 'triplo');
});
