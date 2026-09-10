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

// O 4o item e a data da linha, obrigatoria nos apelidos que tem vigencia.
const casos = [
  // Evento A — nome novo
  ['[DAI] [LEADS] [ABO] [F] ALPHA - 04-09', 'dai', 'dai-ed-01'],
  ['Dinâmicas de Alto Impacto', 'dai', 'dai-ed-01'],
  ['DAI', 'dai', 'dai-ed-01'],
  // PAI = Palestrante de Alto Impacto. Ate 02/09/2026 essa identidade era do
  // evento "Formacao de Palestrantes" (a aba de vendas chama o mesmo evento de
  // "DAY TRAINING – FORMACAO DE PALESTRANTES"); de 04/09/2026 em diante ela
  // passou a ser do Dinamicas de Alto Impacto.
  ['[PAI] [VENDAS] [PAGINA] [CBO] [F] BR [VID] - 24/09/25 BID CAP', 'formacao-palestrantes', 'fp-nomes-antigos', '2025-09-24'],
  ['[PAI] [VENDAS] [INLEAD] [CBO] [F] BR [VID] - 25/08/25 BID CAP', 'formacao-palestrantes', 'fp-nomes-antigos', '2025-08-25'],
  ['[PAIAOVIVO] [LEADS] [ABO] [F] 07-08 ALPHA', 'formacao-palestrantes', 'fp-nomes-antigos', '2026-08-07'],
  ['[PAI 147$] [VENDAS] [ABO] [F] BR - 04/07/26', 'formacao-palestrantes', 'fp-nomes-antigos', '2026-07-04'],
  ['Palestrante de Alto Impacto', 'formacao-palestrantes', 'fp-nomes-antigos', '2026-01-10'],
  // "Dinamicas ao Vivo" e o nome antigo do Dinamicas Sistemicas, confirmado
  // pela IFT — nao do Dinamicas de Alto Impacto, como dizia a especificacao.
  ['[DINAMICASAOVIVO] [LEADS] [ABO] - 13-08 pg bianca', 'dinamicas-sistemicas', 'ds-nomes-antigos'],
  // Evento B — nome novo
  ['[ANIMADAY] [LEADS] [ABO] - 04-09', 'anima', 'anima-ed-01'],
  ['ANIMA Day', 'anima', 'anima-ed-01'],
  // "Day Training Sist" e o Dinamicas Sistemicas abreviado — nao o ANIMA.
  ['Day Training Sist', 'dinamicas-sistemicas', 'ds-nomes-antigos'],
];

test('reconhece as campanhas e os nomes dos dois eventos', () => {
  for (const [texto, linhaEsperada, edicaoEsperada, data] of casos) {
    const resultado = matchEdition(matcher, texto, data);
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
  // "PAI AO VIVO" depende da data: a regra completa esta nos testes de vigencia.
  const pai = matchEdition(matcher, 'PAI AO VIVO', '2026-08-01');
  assert.ok(pai, '"PAI AO VIVO" precisa ser reconhecido');
  assert.equal(pai.editionId, 'fp-nomes-antigos');

  // "DAY TRAININ" (digitado incompleto na planilha) e um dos nomes genericos:
  // depende da data da linha. A regra completa esta nos testes de vigencia.
  const day = matchEdition(matcher, 'DAY TRAININ', '2026-09-10');
  assert.ok(day, '"DAY TRAININ" precisa ser reconhecido');
  assert.equal(day.editionId, 'anima-ed-01');
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

test('as grafias reais da planilha da IFT sao todas classificadas certo', () => {
  // Lista extraida da propria coluna TIPO DE INGRESSO pelo /api/diagnostics.
  const reais = [
    ['INDIVIDUAL', 'individual'],
    ['Ingresso Individual', 'individual'],
    // "VIP - INDIVIDUAL" caia em individual e cobrava R$ 91,16 no lugar de R$ 297.
    ['VIP - INDIVIDUAL', 'vip'],
    ['2 PESSOAS', 'duplo'],
    ['Ingresso Duplo', 'duplo'],
    ['3 PESSOAS', 'triplo'],
    ['Ingresso Triplo', 'triplo'],
    ['Vip', 'vip'],
    ['INGRESSO VIP', 'vip'],
    ['Inteira', 'vip'],
    ['VIP - SEGUNDA CADEIRA', 'vip'],
    ['INGRESSO VIP DUPLO', 'vip-duplo'],
    ['INGRESSO VIP TRIPLO', 'vip-triplo'],
    ['CONVITE EMBAIXADOR MÃE', 'cortesia'],
    ['CONVITE EMBAIXADOR PAI', 'cortesia'],
    ['CONVITE EMBAIXADORA PAI', 'cortesia'],
    ['CAD DA LUCIELMA', 'acompanhante'],
    ['CADE DE CARLOS CABREIRA', 'acompanhante'],
  ];
  for (const [texto, esperado] of reais) {
    assert.equal(matchTicketKind(matcher, texto), esperado, `errou em: ${texto}`);
  }
});

test('os produtos da aba de vendas caem no evento certo', () => {
  // Duas familias de produto comecam com "Day Training". O apelido curto
  // sozinho puxava as duas para o ANIMA Day — foi assim que 217 vendas do
  // "Formacao de Palestrantes" foram parar no evento errado.
  // Aqui interessa a LINHA de evento; a edicao exata tem teste proprio.
  const casos = [
    ['#03 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'formacao-palestrantes'],
    ['🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru', 'formacao-palestrantes'],
    ['#05 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'formacao-palestrantes'],
    ['#02 Day Training - Dinâmicas Sistêmicas', 'dinamicas-sistemicas'],
    ['Day Training - Dinâmicas Sistêmicas', 'dinamicas-sistemicas'],
    ['#01  ÂNIMA Day Training', 'anima'],
    ['#01🎤 DAY TRAINING – Dinamicas de Alto Impacto com Professor', 'dai'],
  ];
  for (const [produto, esperado] of casos) {
    const r = matchEdition(matcher, produto);
    assert.ok(r, `nao reconheceu: ${produto}`);
    assert.equal(r.lineId, esperado, `evento errado para: ${produto}`);
  }
});

test('os produtos digitais da aba de vendas ficam de fora', () => {
  // Estes tres estao em produtosIgnorados e sao descartados antes do
  // casamento; os outros simplesmente nao casam com nenhum apelido.
  const config = JSON.parse(fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'));
  for (const nome of ['PALESTRANTE DE ALTO IMPACTO', 'PALESTRANTE DE ALTO IMPACTO [VITALICIO]', 'PALESTRANTE DE ALTO IMPACTO - 147']) {
    assert.ok(config.produtosIgnorados.includes(nome), `${nome} precisa estar na lista de descarte`);
  }
  for (const nome of [
    'Dinâmicas Sistêmicas INFINITAS – O Treinamento',
    'COMO VENDER TREINAMENTOS PARA EMPRESAS',
    'IA para criar Palestras Transformadoras',
    'Bianca IA - fonte sistêmica',
    'Protocolo de Atendimento Sistêmico',
  ]) {
    assert.equal(matchEdition(matcher, nome), null, `${nome} nao pode virar evento`);
  }
});

test('cada edicao numerada cai na sua propria edicao, sem roubar as vizinhas', () => {
  // Os apelidos sao o nome EXATO como aparece na coluna Produto. Igualdade
  // exata vence casamento parcial, entao "#02" nunca cai no "#03" nem no
  // generico sem numero.
  const casos = [
    ['#01🎤 DAY TRAINING – Dinamicas de Alto Impacto com Professor Massaru Ogata', 'dai-ed-01'],
    ['#01  ÂNIMA Day Training', 'anima-ed-01'],
    ['#02 Day Training - Dinâmicas Sistêmicas', 'ds-ed-02'],
    ['#03 Day Training - Dinâmicas Sistêmicas', 'ds-ed-03'],
    ['#04 Day Training - Dinâmicas Sistêmicas', 'ds-ed-04'],
    ['Day Training - Dinâmicas Sistêmicas', 'ds-ed-01'],
    ['#02 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru', 'fp-ed-02'],
    ['#03 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'fp-ed-03'],
    ['#04 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'fp-ed-04'],
    ['#05 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'fp-ed-05'],
    ['🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru', 'fp-ed-01'],
  ];
  for (const [produto, esperado] of casos) {
    const r = matchEdition(matcher, produto);
    assert.ok(r, `nao reconheceu: ${produto}`);
    assert.equal(r.editionId, esperado, `edicao errada para: ${produto}`);
  }
});

test('as tres linhas de evento continuam separadas', () => {
  const linhaDe = (produto) => matchEdition(matcher, produto)?.lineId;
  assert.equal(linhaDe('#01🎤 DAY TRAINING – Dinamicas de Alto Impacto com Professor Massaru Ogata'), 'dai');
  assert.equal(linhaDe('#02 Day Training - Dinâmicas Sistêmicas'), 'dinamicas-sistemicas');
  assert.equal(linhaDe('#01  ÂNIMA Day Training'), 'anima');
  assert.equal(linhaDe('#03 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata'), 'formacao-palestrantes');
});


/**
 * "DAY TRAINING", sozinho, nao diz de qual evento o lead e: ANIMA Day e
 * Dinamicas Sistemicas sao os dois series "Day Training", e a planilha de leads
 * escreve so isso em 559 linhas. A IFT confirmou a regra: ate 03/09/2026 o nome
 * servia aos dois eventos; de 04/09/2026 em diante e so do ANIMA Day.
 *
 * Por isso o apelido tem VIGENCIA, e a data da linha decide o dono. Sem esses
 * testes o erro volta calado: o painel simplesmente para de contar os leads (foi
 * o que aconteceu antes, com 60% dos leads sumindo sem nenhum aviso).
 */
test('"DAY TRAINING" muda de dono conforme a data do lead', () => {
  const dono = (data) => matchEdition(matcher, 'DAY TRAINING', data);

  // Antes da virada: fica no balde compartilhado, nao no ANIMA.
  assert.equal(dono('2026-09-03')?.lineId, 'day-training-compartilhado');
  assert.equal(dono('2025-01-15')?.lineId, 'day-training-compartilhado');

  // No dia da virada e depois: ANIMA Day.
  assert.equal(dono('2026-09-04')?.lineId, 'anima');
  assert.equal(dono('2026-09-10')?.lineId, 'anima');
  assert.equal(dono('2027-03-01')?.lineId, 'anima');
});

test('as variacoes de grafia de "DAY TRAINING" seguem a mesma regra', () => {
  for (const texto of ['DAY TRAINING', 'Day Training', 'DAYTRAINING', 'DAY TRAININ']) {
    assert.equal(matchEdition(matcher, texto, '2026-09-10')?.lineId, 'anima', texto);
    assert.equal(
      matchEdition(matcher, texto, '2026-01-10')?.lineId,
      'day-training-compartilhado',
      texto,
    );
  }
});

test('linha sem data nao casa com apelido que depende de data', () => {
  // Chutar a janela seria pior do que nao classificar: o numero sairia errado
  // sem ninguem perceber. Sem data, o lead vai para "nao classificado".
  assert.equal(matchEdition(matcher, 'DAY TRAINING', null), null);
  assert.equal(matchEdition(matcher, 'DAY TRAINING'), null);
});

test('o apelido generico nao rouba os nomes completos dos eventos', () => {
  // Todos estes contem "DAY TRAINING" e caem dentro da vigencia do ANIMA, mas
  // o nome exato tem que ganhar do generico.
  const dentroDaVigencia = '2026-09-10';
  const casos = [
    ['#02 Day Training - Dinâmicas Sistêmicas', 'dinamicas-sistemicas'],
    ['Day Training - Dinâmicas Sistêmicas', 'dinamicas-sistemicas'],
    ['#03 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata', 'formacao-palestrantes'],
    ['🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru', 'formacao-palestrantes'],
    ['#01🎤 DAY TRAINING – Dinamicas de Alto Impacto com Professor Massaru Ogata', 'dai'],
    ['#01  ÂNIMA Day Training', 'anima'],
  ];
  for (const [texto, linhaEsperada] of casos) {
    assert.equal(matchEdition(matcher, texto, dentroDaVigencia)?.lineId, linhaEsperada, texto);
  }
});


/**
 * A edicao #01 do ANIMA Day e a mesma coisa que "ANIMA Day" — eram duas
 * entradas no menu para o mesmo evento, e a IFT pediu para juntar. Juntar so e
 * possivel porque a vigencia e de cada APELIDO, e nao da edicao: "DAY TRAINING"
 * so vale de 04/09/2026 em diante, enquanto "#01 ÂNIMA Day Training" e
 * "ANIMADAY" valem sempre. Se a janela fosse da edicao inteira, as vendas
 * anteriores a essa data parariam de ser reconhecidas — 
 * exatamente o estrago que a vigencia veio evitar.
 */
test('a edicao #01 do ANIMA atende por nomes de idades diferentes', () => {
  const antes = '2026-08-01';
  const depois = '2026-09-10';

  // Nomes proprios do evento: valem nas duas datas.
  for (const nome of ['#01  ÂNIMA Day Training', 'ANIMADAY', 'ANIMA Day']) {
    for (const data of [antes, depois]) {
      const r = matchEdition(matcher, nome, data);
      assert.equal(r?.editionId, 'anima-ed-01', `${nome} em ${data}`);
    }
  }

  // Nome generico: so depois da virada.
  assert.equal(matchEdition(matcher, 'DAY TRAINING', depois)?.editionId, 'anima-ed-01');
  assert.equal(matchEdition(matcher, 'DAY TRAINING', antes)?.lineId, 'day-training-compartilhado');

  // E sem data nenhuma, o nome proprio continua funcionando.
  assert.equal(matchEdition(matcher, 'ANIMADAY')?.editionId, 'anima-ed-01');
});

test('cada evento tem uma unica entrada por edicao no menu', () => {
  // O ANIMA Day e o Dinamicas de Alto Impacto apareciam duas vezes cada um no
  // seletor de evento ("Edicao #01" e o nome do evento), como se fossem coisas
  // diferentes. Sao a mesma edicao.
  const edicoes = (lineId) =>
    config.eventLines.find((l) => l.id === lineId).editions.map((e) => e.id);
  assert.deepEqual(edicoes('anima'), ['anima-ed-01']);
  // O 'dai-nomes-pai' nao e outra edicao do evento: e o balde dos nomes que a
  // aba de leads e o trafego usam, que nao existem na coluna Produto.
  assert.deepEqual(edicoes('dai'), ['dai-ed-01', 'dai-nomes-pai']);
});

/**
 * O que o seletor "Nome do Evento" mostra tem que ser o texto EXATO da coluna
 * Produto da aba de vendas — sem abreviar, encurtar nem padronizar. Foi um
 * pedido explicito da IFT, e a razao e pratica: quem confere o painel contra a
 * planilha precisa achar a mesma linha nos dois lugares. Um rotulo "melhorado"
 * ("Edicao #02") obriga a pessoa a adivinhar a que produto ele corresponde.
 *
 * O teste compara o rotulo com o proprio apelido, entao mexer no nome do
 * produto sem mexer no rotulo (ou vice-versa) quebra aqui, em vez de virar um
 * nome errado calado na tela.
 */
test('o rotulo da edicao e o nome literal do produto', () => {
  const deProduto = [
    'dai-ed-01', 'anima-ed-01',
    'fp-ed-01', 'fp-ed-02', 'fp-ed-03', 'fp-ed-04', 'fp-ed-05',
    'ds-ed-01', 'ds-ed-02', 'ds-ed-03', 'ds-ed-04',
  ];
  const porId = new Map(
    config.eventLines.flatMap((l) => l.editions).map((e) => [e.id, e]),
  );
  for (const id of deProduto) {
    const ed = porId.get(id);
    assert.ok(ed, `edicao sumiu da configuracao: ${id}`);
    assert.equal(ed.label, ed.aliases[0], `o rotulo de ${id} nao e o nome do produto`);
  }
});

test('so as edicoes sem produto proprio tem rotulo descritivo', () => {
  // Estas tres nao existem na coluna Produto: sao baldes de leads e de trafego,
  // onde a planilha usa nomes que nao sao nome de produto nenhum. Nao ha texto
  // literal para exibir, entao o rotulo explica o que elas sao.
  const semProduto = config.eventLines
    .flatMap((l) => l.editions)
    .filter((e) => e.label !== (typeof e.aliases[0] === 'string' ? e.aliases[0] : null))
    .map((e) => e.id);
  assert.deepEqual(semProduto.sort(), ['dai-nomes-pai', 'ds-nomes-antigos', 'dt-ambiguo', 'fp-nomes-antigos']);
});


/**
 * "PAI AO VIVO" e o unico texto que a aba de leads usa para o publico de
 * palestrantes, e ele trocou de evento no meio do caminho: ate 02/09/2026 sao
 * interessados na Formacao de Palestrantes; de 04/09/2026 em diante o mesmo
 * texto passou a ser Dinamicas de Alto Impacto (regra confirmada pela IFT).
 *
 * O dia 03/09/2026 ficou deliberadamente sem dono: a IFT nao o citou, e nao ha
 * nenhum lead nele. Um lead lancado ali depois aparece como nao reconhecido, em
 * vez de ser chutado para um dos dois eventos sem ninguem ficar sabendo.
 */
test('"PAI AO VIVO" muda de evento em 04/09/2026', () => {
  const dono = (data) => matchEdition(matcher, 'PAI AO VIVO', data);

  assert.equal(dono('2025-06-10')?.lineId, 'formacao-palestrantes');
  assert.equal(dono('2026-09-02')?.lineId, 'formacao-palestrantes');

  assert.equal(dono('2026-09-03'), null, 'o dia da virada nao pertence a ninguem');

  assert.equal(dono('2026-09-04')?.lineId, 'dai');
  assert.equal(dono('2026-09-10')?.lineId, 'dai');
  assert.equal(dono('2027-01-05')?.lineId, 'dai');
});

/**
 * A IFT confirmou que as campanhas de trafego viraram junto com os leads: toda
 * a identidade "PAI" passou para o Dinamicas de Alto Impacto em 04/09/2026.
 *
 * O nome da campanha carrega a data em que ela foi criada ("- 24/09/25"), mas
 * quem manda e a DATA DA LINHA: a planilha de trafego tem uma linha por
 * campanha por dia, entao uma campanha que rodasse dos dois lados da virada
 * teria o gasto dividido dia a dia entre os dois eventos. E o comportamento
 * certo, porque o custo e diario.
 */
test('as campanhas PAI tambem viram DAI em 04/09/2026', () => {
  const campanhas = [
    '[PAIAOVIVO] [LEADS] [ABO] [F] 07-08 ALPHA',
    '[PAI] [VENDAS] [PAGINA] [CBO] [F] BR [VID] - 24/09/25 BID CAP',
    '[PAI 147$] [VENDAS] [ABO] [F] BR - 04/07/26',
  ];
  for (const campanha of campanhas) {
    assert.equal(
      matchEdition(matcher, campanha, '2026-08-20')?.lineId,
      'formacao-palestrantes',
      `antes da virada: ${campanha}`,
    );
    assert.equal(
      matchEdition(matcher, campanha, '2026-09-10')?.lineId,
      'dai',
      `depois da virada: ${campanha}`,
    );
  }
});

test('os nomes proprios do Formacao de Palestrantes nao se movem', () => {
  // So a identidade "PAI" mudou de dono. Os nomes de produto continuam onde
  // estao — sem isso, R\$ 24 mil de faturamento trocariam de evento sozinhos.
  const depois = '2026-09-10';
  const produtos = [
    '🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru',
    '#05 🎤 DAY TRAINING – FORMAÇÃO DE PALESTRANTES com Professor Massaru Ogata',
  ];
  for (const produto of produtos) {
    assert.equal(matchEdition(matcher, produto, depois)?.lineId, 'formacao-palestrantes', produto);
  }
});
