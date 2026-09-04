/**
 * AVISO DE EDIÇÃO — Google Apps Script
 * ====================================
 *
 * Este script fica dentro da planilha e avisa o painel toda vez que alguém
 * mexe nela. É isso que faz uma venda nova aparecer no painel na hora.
 *
 * Instale este mesmo script nas DUAS planilhas ("BASE DE LEADS" e "TRÁFEGO IFT").
 * O passo a passo com todos os cliques está no README.md, na seção
 * "Passo 4 — Ligar a atualização instantânea".
 *
 * Antes de usar, preencha as duas linhas abaixo.
 */

// Endereço do painel na internet, terminando em /api/webhook/sheets
var URL_DO_PAINEL = 'https://COLE-AQUI-O-ENDERECO-DO-PAINEL/api/webhook/sheets';

// A mesma senha que você colocou na configuração WEBHOOK_TOKEN do painel.
var SENHA_DO_AVISO = 'COLE-AQUI-A-MESMA-SENHA';

/**
 * Função chamada automaticamente pelo gatilho.
 * Não precisa executar na mão — o Google chama sozinho.
 */
function avisarPainel(e) {
  try {
    var abaEditada = '';
    try {
      abaEditada = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
    } catch (semAba) {
      abaEditada = 'desconhecida';
    }

    UrlFetchApp.fetch(URL_DO_PAINEL + '?token=' + encodeURIComponent(SENHA_DO_AVISO), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        planilha: SpreadsheetApp.getActiveSpreadsheet().getName(),
        aba: abaEditada,
        quando: new Date().toISOString()
      }),
      muteHttpExceptions: true
    });
  } catch (erro) {
    // Nunca deixar o erro estourar: se o painel estiver fora do ar por um
    // instante, a planilha precisa continuar funcionando normalmente.
    console.error('Nao consegui avisar o painel: ' + erro);
  }
}

/**
 * Rode esta função UMA VEZ, na mão, para criar o gatilho automático.
 * Depois disso pode esquecer que ela existe.
 */
function instalarGatilho() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();

  // Remove gatilhos antigos desta mesma função, para não duplicar avisos.
  var gatilhos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < gatilhos.length; i++) {
    if (gatilhos[i].getHandlerFunction() === 'avisarPainel') {
      ScriptApp.deleteTrigger(gatilhos[i]);
    }
  }

  ScriptApp.newTrigger('avisarPainel').forSpreadsheet(planilha).onChange().create();
  ScriptApp.newTrigger('avisarPainel').forSpreadsheet(planilha).onEdit().create();

  SpreadsheetApp.getUi().alert(
    'Pronto! O painel vai ser avisado toda vez que esta planilha for alterada.'
  );
}

/**
 * Teste manual: rode esta função para conferir se o painel está recebendo o aviso.
 * Se der tudo certo, o painel recarrega os dados na mesma hora.
 */
function testarAviso() {
  avisarPainel({});
  SpreadsheetApp.getUi().alert(
    'Aviso enviado. Abra o painel e veja se o horário da "última leitura" mudou.'
  );
}
