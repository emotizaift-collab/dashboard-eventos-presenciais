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
