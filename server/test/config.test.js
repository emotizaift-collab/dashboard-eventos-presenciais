/**
 * A configuracao e editada pela interface por quem nao programa. O que estes
 * testes protegem e o caso silencioso: um campo aceito na hora de salvar mas
 * que nunca funciona depois, fazendo o painel contar menos do que existe sem
 * dar nenhum aviso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig } from '../../dist/server/src/config.js';

const base = () =>
  JSON.parse(
    fs.readFileSync(new URL('../../config/event-config.default.json', import.meta.url), 'utf8'),
  );

const comVigencia = (vigencia) => {
  const config = base();
  config.eventLines[0].editions[0].vigencia = vigencia;
  return config;
};

test('a configuracao padrao do repositorio e valida', () => {
  assert.doesNotThrow(() => validateConfig(base()));
});

test('vigencia em AAAA-MM-DD passa', () => {
  assert.doesNotThrow(() => validateConfig(comVigencia({ de: '2026-09-04' })));
  assert.doesNotThrow(() => validateConfig(comVigencia({ ate: '2026-09-03' })));
  assert.doesNotThrow(() =>
    validateConfig(comVigencia({ de: '2026-01-01', ate: '2026-12-31' })),
  );
});

test('vigencia no formato brasileiro e recusada na hora de salvar', () => {
  // A comparacao e textual, entao "04/09/2026" nunca casaria com nada e os
  // leads sumiriam calados. Melhor recusar do que aceitar e contar errado.
  assert.throws(() => validateConfig(comVigencia({ de: '04/09/2026' })), /AAAA-MM-DD/);
  assert.throws(() => validateConfig(comVigencia({ ate: '3 de setembro' })), /AAAA-MM-DD/);
});

test('vigencia que termina antes de comecar e recusada', () => {
  assert.throws(
    () => validateConfig(comVigencia({ de: '2026-09-04', ate: '2026-09-03' })),
    /depois de terminar/,
  );
});

test('vigencia vazia some, em vez de virar uma janela sem sentido', () => {
  const config = validateConfig(comVigencia({}));
  assert.equal(config.eventLines[0].editions[0].vigencia, undefined);
});

const comApelido = (apelido) => {
  const config = base();
  config.eventLines[0].editions[0].aliases = [apelido];
  return config;
};

test('apelido com vigencia propria e aceito e preservado', () => {
  const config = validateConfig(comApelido({ nome: 'DAY TRAINING', vigencia: { de: '2026-09-04' } }));
  assert.deepEqual(config.eventLines[0].editions[0].aliases, [
    { nome: 'DAY TRAINING', vigencia: { de: '2026-09-04' } },
  ]);
});

test('apelido cuja janela ficou vazia volta a ser texto simples', () => {
  // Evita a configuracao salva ir acumulando {"nome":"X"} sem proposito nenhum.
  assert.deepEqual(validateConfig(comApelido({ nome: 'ANIMADAY' })).eventLines[0].editions[0].aliases, [
    'ANIMADAY',
  ]);
  assert.deepEqual(
    validateConfig(comApelido({ nome: 'ANIMADAY', vigencia: {} })).eventLines[0].editions[0].aliases,
    ['ANIMADAY'],
  );
});

test('data invalida no apelido e recusada, dizendo qual apelido', () => {
  assert.throws(
    () => validateConfig(comApelido({ nome: 'DAY TRAINING', vigencia: { de: '04/09/2026' } })),
    /DAY TRAINING/,
  );
});

test('apelido sem nome e descartado, em vez de virar apelido vazio', () => {
  assert.deepEqual(validateConfig(comApelido({ nome: '   ' })).eventLines[0].editions[0].aliases, []);
});

test('a lista de campanhas ignoradas sobrevive a validacao', () => {
  // Sao campanhas de outros produtos da empresa, confirmadas pela IFT. Sem
  // esta lista, o gasto delas aparecia como "custo de campanha sem evento" —
  // um alerta que era quase todo ruido.
  //
  // "DI" (Dinamicas Infinitas) entra como TAG, porque a sigla so aquele
  // produto usa e assim as campanhas [DI] futuras ja nascem de fora. A do
  // "IFT" entra pelo NOME INTEIRO: IFT e a sigla da propria empresa, e apagar
  // por tag faria uma campanha de evento marcada [IFT] sumir calada.
  const config = validateConfig(base());
  assert.ok(config.campanhasIgnoradas.includes('DI'));
  assert.ok(config.campanhasIgnoradas.includes('[IFT] [LEADS] [ABO] [F] 28-02 SP'));
  // Estas duas nunca podem virar tag: "IFT" e a sigla da propria empresa, e
  // "ANIMA" e o nome do produto ANIMA, a um "DAY" de distancia do evento. Uma
  // campanha do evento escrita "[ANIMA]" por engano sumiria sem aviso — e a
  // trava do loader nao salva, porque "[ANIMA]" nao casa com o evento.
  for (const perigosa of ['IFT', 'ANIMA']) {
    assert.ok(
      !config.campanhasIgnoradas.includes(perigosa),
      `"${perigosa}" so pode ser ignorada pelo nome inteiro da campanha`,
    );
  }

  // Nenhuma entrada pode ser uma sigla que os eventos presenciais usam.
  const dosEventos = new Set(
    config.eventLines
      .flatMap((linha) => linha.editions)
      .flatMap((edicao) => edicao.aliases)
      .map((apelido) => (typeof apelido === 'string' ? apelido : apelido.nome).toUpperCase()),
  );
  for (const entrada of config.campanhasIgnoradas) {
    assert.ok(!dosEventos.has(entrada.toUpperCase()), `"${entrada}" e apelido de evento`);
  }
});
