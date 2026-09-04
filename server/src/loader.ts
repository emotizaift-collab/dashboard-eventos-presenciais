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

  const [leadsRaw, buyersRaw, trafficRaw] = await Promise.all([
    readTabSafe(config.sources.leads.spreadsheetId, config.sources.leads.tab, 'leads', warnings),
    readTabSafe(config.sources.buyers.spreadsheetId, config.sources.buyers.tab, 'compradores', warnings),
    readTabSafe(config.sources.traffic.spreadsheetId, config.sources.traffic.tab, 'trafego', warnings),
  ]);

  // --- Leads ---
  const leadsHeaderIndex = config.sources.leads.headerRow - 1;
  const leadsHeader = leadsRaw[leadsHeaderIndex] ?? [];
  const leadsDateCol = resolveColumnIndex(config.sources.leads.columns.date, leadsHeader);
  const leadsEventCol = resolveColumnIndex(config.sources.leads.columns.event, leadsHeader);
  if (leadsEventCol < 0) {
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

  return { leads, buyers, traffic, fetchedAt: new Date().toISOString(), warnings };
}

async function readTabSafe(
  spreadsheetId: string,
  tab: string,
  rotulo: string,
  warnings: string[],
): Promise<string[][]> {
  try {
    return await readTab(spreadsheetId, tab);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`Nao consegui ler a aba de ${rotulo} ("${tab}"): ${detail}`);
    return [];
  }
}
