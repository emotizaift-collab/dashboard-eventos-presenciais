/**
 * O painel e cuidado por quem nao programa. Um erro cru da API do Google nao diz
 * o que clicar; estes testes travam a traducao para instrucoes acionaveis.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { explicarErroDoGoogle } from '../../dist/server/src/loader.js';

test('API do Sheets desativada vira instrucao com o link do projeto certo', () => {
  const bruto =
    'Google Sheets API has not been used in project 133567326414 before or it is disabled. ' +
    'Enable it by visiting https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=133567326414 then retry.';
  const texto = explicarErroDoGoogle(bruto);
  assert.match(texto, /nao foi ativada/);
  assert.match(texto, /Ativar/);
  assert.match(texto, /project=133567326414/);
});

test('robo sem convite vira instrucao de compartilhamento', () => {
  const texto = explicarErroDoGoogle('The caller does not have permission (403)');
  assert.match(texto, /nao foi convidada/);
  assert.match(texto, /Compartilhar/);
  assert.match(texto, /Leitor/);
});

test('nome de aba errado aponta a aba procurada e o botao de verificacao', () => {
  const texto = explicarErroDoGoogle(
    'Unable to parse range: \'Cópia Compradores Presenciais\'',
    'Cópia Compradores Presenciais',
  );
  assert.match(texto, /nao existe nenhuma aba/);
  assert.match(texto, /Cópia Compradores Presenciais/);
  assert.match(texto, /Verificar conexao/);
});

test('chave incompleta vira instrucao sobre colar o json inteiro', () => {
  const texto = explicarErroDoGoogle('error:1E08010C:DECODER routines::unsupported');
  assert.match(texto, /incompleta ou invalida/);
  assert.match(texto, /GOOGLE_SERVICE_ACCOUNT_JSON/);
});

test('erro desconhecido e repassado sem inventar explicacao', () => {
  const bruto = 'socket hang up';
  assert.equal(explicarErroDoGoogle(bruto), bruto);
});
