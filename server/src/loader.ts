/** Transforma as celulas cruas das abas nas linhas normalizadas que o painel usa. */
import type {
  AppConfig,
  BuyerRow,
  DataSet,
  LeadRow,
  TrafficRow,
} from '../../shared/types.js';
import { parseDate, parseMoney, resolveColumnIndex } from './normalize.js';
import { compileMatcher, matchEdition, matchTicketKind } from './matching.js';
import { hasCredentials, readTab } from './sheets.js';
import { buildDemoDataSet } from './demo.js';

function cell(row: string[], index: number): string {
  if (index < 0) return '';
  return (row[index] ?? '').toString().trim();
}

export async function fetchDataSet(config: AppConfig): Promise<DataSet> {
  if (!hasCredentials()) return buildDemoDataSet(config);

  const matcher = compileMatcher(config);
  const warnings: string[] = [];
  const falhas: string[] = [];

  const [leadsRaw, buyersRaw, trafficRaw] = await Promise.all([
    readTabSafe(config.sources.leads.spreadsheetId, config.sources.leads.tab, 'leads', falhas),
    readTabSafe(config.sources.buyers.spreadsheetId, config.sources.buyers.tab, 'compradores', falhas),
    readTabSafe(config.sources.traffic.spreadsheetId, config.sources.traffic.tab, 'trafego', falhas),
  ]);

  // --- Leads ---
  const leadsHeaderIndex = config.sources.leads.headerRow - 1;
  const leadsHeader = leadsRaw[leadsHeaderIndex] ?? [];
  const leadsDateCol = resolveColumnIndex(config.sources.leads.columns.date, leadsHeader);
  const leadsEventCol = resolveColumnIndex(config.sources.leads.columns.event, leadsHeader);
  if (leadsEventCol < 0 && leadsRaw.length > 0) {
    warnings.push(
      `Nao encontrei a coluna de evento na aba "${config.sources.leads.tab}". ` +
        'Confira o nome da coluna na tela de Configuracao.',
    );
  }

  const leads: LeadRow[] = [];
  for (let i = leadsHeaderIndex + 1; i < leadsRaw.length; i += 1) {
    const row = leadsRaw[i];
    if (!row || row.length === 0) continue;
    const rawEvent = cell(row, leadsEventCol);
    const date = parseDate(cell(row, leadsDateCol));
    if (!rawEvent && !date) continue;
    const match = matchEdition(matcher, rawEvent);
    leads.push({
      date,
      rawEvent,
      editionId: match?.editionId ?? null,
      lineId: match?.lineId ?? null,
    });
  }

  // --- Compradores ---
  const buyersHeaderIndex = config.sources.buyers.headerRow - 1;
  const buyersHeader = buyersRaw[buyersHeaderIndex] ?? [];
  const buyersDateCol = resolveColumnIndex(config.sources.buyers.columns.date, buyersHeader);
  const buyersEventCol = resolveColumnIndex(config.sources.buyers.columns.event, buyersHeader);
  const buyersTypeCol = resolveColumnIndex(config.sources.buyers.columns.ticketType, buyersHeader);
  const buyersAmbCol = resolveColumnIndex(config.sources.buyers.columns.ambassador, buyersHeader);

  const buyers: BuyerRow[] = [];
  for (let i = buyersHeaderIndex + 1; i < buyersRaw.length; i += 1) {
    const row = buyersRaw[i];
    if (!row || row.length === 0) continue;
    const rawEvent = cell(row, buyersEventCol);
    const rawTicketType = cell(row, buyersTypeCol);
    const ambassador = cell(row, buyersAmbCol);
    if (!rawEvent && !rawTicketType && !ambassador) continue;
    const match = matchEdition(matcher, rawEvent);
    buyers.push({
      linha: i + 1,
      date: parseDate(cell(row, buyersDateCol)),
      rawEvent,
      editionId: match?.editionId ?? null,
      lineId: match?.lineId ?? null,
      ticketKind: matchTicketKind(matcher, rawTicketType),
      rawTicketType,
      ambassador,
    });
  }

  // --- Trafego ---
  const trafficHeaderIndex = config.sources.traffic.headerRow - 1;
  const trafficHeader = trafficRaw[trafficHeaderIndex] ?? [];
  const trafficDateCol = resolveColumnIndex(config.sources.traffic.columns.date, trafficHeader);
  const trafficCampaignCol = resolveColumnIndex(config.sources.traffic.columns.campaign, trafficHeader);
  const trafficCostCol = resolveColumnIndex(config.sources.traffic.columns.cost, trafficHeader);

  const traffic: TrafficRow[] = [];
  for (let i = trafficHeaderIndex + 1; i < trafficRaw.length; i += 1) {
    const row = trafficRaw[i];
    if (!row || row.length === 0) continue;
    const campaign = cell(row, trafficCampaignCol);
    const date = parseDate(cell(row, trafficDateCol));
    // Sem data valida na coluna A a linha nao pertence a tabela diaria (rodape,
    // bloco de totais, area de anotacao). Descartar evita somar lixo no custo.
    if (!date || !campaign) continue;
    const match = matchEdition(matcher, campaign);
    traffic.push({
      date,
      campaign,
      editionId: match?.editionId ?? null,
      lineId: match?.lineId ?? null,
      cost: parseMoney(cell(row, trafficCostCol)),
    });
  }

  return { leads, buyers, traffic, fetchedAt: new Date().toISOString(), warnings, falhas };
}

async function readTabSafe(
  spreadsheetId: string,
  tab: string,
  rotulo: string,
  falhas: string[],
): Promise<string[][]> {
  try {
    return await readTab(spreadsheetId, tab);
  } catch (error) {
    const bruto = error instanceof Error ? error.message : String(error);
    falhas.push(`Aba de ${rotulo} ("${tab}"): ${explicarErroDoGoogle(bruto, tab)}`);
    return [];
  }
}

/**
 * Traduz o erro tecnico do Google para uma instrucao que qualquer pessoa
 * consiga seguir. Quem cuida deste painel nao necessariamente programa, e um
 * erro cru da API nao diz o que clicar para resolver.
 */
export function explicarErroDoGoogle(mensagem: string, aba?: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes('has not been used in project') || texto.includes('serviceusage') ||
      texto.includes('it is disabled') || texto.includes('service_disabled')) {
    const projeto = mensagem.match(/project (\d+)/)?.[1];
    const link = projeto
      ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projeto}`
      : 'https://console.cloud.google.com/apis/library/sheets.googleapis.com';
    return (
      'a Google Sheets API ainda nao foi ativada no projeto do Google Cloud. ' +
      `Abra ${link} e clique no botao "Ativar". ` +
      'Depois espere cerca de 2 minutos e clique em "Atualizar agora" aqui no painel.'
    );
  }

  if (texto.includes('permission') || texto.includes('403') || texto.includes('forbidden')) {
    return (
      'a conta de robo do painel nao foi convidada para esta planilha. ' +
      'Abra a planilha, clique em Compartilhar, cole o e-mail da conta de servico ' +
      '(aparece aqui na tela de Configuracao, em "Verificar conexao com as planilhas") ' +
      'e conceda a permissao de Leitor.'
    );
  }

  if (texto.includes('unable to parse range') || texto.includes('not found')) {
    return (
      `nao existe nenhuma aba com esse nome nesta planilha${aba ? ` (procurei por "${aba}")` : ''}. ` +
      'Clique em "Verificar conexao com as planilhas" para ver os nomes reais das abas ' +
      'e corrija a grafia em "Ajustes avancados". Acentos e espacos contam.'
    );
  }

  if (texto.includes('invalid_grant') || texto.includes('invalid jwt') ||
      texto.includes('unauthorized_client') || texto.includes('decoder')) {
    return (
      'a chave do Google parece incompleta ou invalida. Confira se o conteudo do arquivo .json ' +
      'foi colado INTEIRO na configuracao GOOGLE_SERVICE_ACCOUNT_JSON, do primeiro { ate o ultimo }.'
    );
  }

  return mensagem;
}
