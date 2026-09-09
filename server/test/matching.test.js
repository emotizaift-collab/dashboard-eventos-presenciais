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

test('os tipos vistos no dado real da IFT sao classificados certo', () => {
  const casos = [
    ['Vip', 'vip'],
    ['VIP', 'vip'],
    // "Inteira" e "VIP - SEGUNDA CADEIRA" foram absorvidos pelo VIP: mesmo
    // preco (R$ 297) e mesma ocupacao (1 cadeira), entao os blocos separados
    // sairam da tela sem mudar nenhum numero.
    ['VIP - SEGUNDA CADEIRA', 'vip'],
    ['Inteira', 'vip'],
    // "CADE DE" e a grafia com um erro de digitacao de "CAD DE".
    ['CADE DE CARLOS CABREIRA', 'acompanhante'],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(matchTicketKind(matcher, texto), esperado, `errou em: ${texto}`);
  }
});

test('VIP duplo e VIP triplo nao sao confundidos com o VIP simples', () => {
  // O alias mais longo tem de ganhar: "vip duplo" nao pode cair em "vip".
  assert.equal(matchTicketKind(matcher, 'VIP'), 'vip');
  assert.equal(matchTicketKind(matcher, 'Vip'), 'vip');
  assert.equal(matchTicketKind(matcher, 'VIP duplo'), 'vip-duplo');
  assert.equal(matchTicketKind(matcher, 'vip dupla'), 'vip-duplo');
  assert.equal(matchTicketKind(matcher, 'CADEIRA DUPLA VIP'), 'vip-duplo');
  assert.equal(matchTicketKind(matcher, 'VIP triplo'), 'vip-triplo');
  assert.equal(matchTicketKind(matcher, 'VIP 3 PESSOAS'), 'vip-triplo');
  // E o duplo comum continua comum.
  assert.equal(matchTicketKind(matcher, 'cadeira dupla'), 'duplo');
  assert.equal(matchTicketKind(matcher, 'VIP - SEGUNDA CADEIRA'), 'vip');
});

test('"Inteira" e "VIP - SEGUNDA CADEIRA" passam a contar como VIP', () => {
  // Os dois blocos sairam da tela, mas as linhas continuam valendo R$ 297 e
  // 1 cadeira — os apelidos foram absorvidos pelo VIP para nao sumir dinheiro.
  assert.equal(matchTicketKind(matcher, 'Inteira'), 'vip');
  assert.equal(matchTicketKind(matcher, 'VIP - SEGUNDA CADEIRA'), 'vip');
  assert.equal(matchTicketKind(matcher, 'Vip'), 'vip');
  // E os VIP com mais cadeiras continuam distintos.
  assert.equal(matchTicketKind(matcher, 'VIP duplo'), 'vip-duplo');
  assert.equal(matchTicketKind(matcher, 'VIP triplo'), 'vip-triplo');
});

test('o tipo de ingresso e lido por palavras, em qualquer ordem, sem se perder em palavra generica', () => {
  const casos = [
    // A grafia com "ingresso" na frente derrubava o casamento: "ingresso vip"
    // é mais longo que "vip triplo" e vencia, transformando um ingresso de
    // R$ 891 num de R$ 297 sem nenhum aviso.
    ['INGRESSO VIP TRIPLO', 'vip-triplo'],
    ['INGRESSO VIP DUPLO', 'vip-duplo'],
    ['INGRESSO VIP', 'vip'],
    // Ordem invertida das palavras.
    ['TRIPLO VIP', 'vip-triplo'],
    ['CADEIRA DUPLA VIP', 'vip-duplo'],
    ['CADEIRA TRIPLA VIP', 'vip-triplo'],
    // Formas curtas.
    ['VIP 3', 'vip-triplo'],
    ['VIP 2', 'vip-duplo'],
    ['VIP TRIO', 'vip-triplo'],
    // E os tipos comuns continuam comuns.
    ['ingresso triplo', 'triplo'],
    ['ingresso duplo', 'duplo'],
    ['Ingresso Individual', 'individual'],
    ['cadeira dupla', 'duplo'],
    ['3 pessoas', 'triplo'],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(matchTicketKind(matcher, texto), esperado, `errou em: ${texto}`);
  }
});
