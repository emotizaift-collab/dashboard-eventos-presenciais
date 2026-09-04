/** Tipos compartilhados entre o servidor e a interface. */

export type TicketKind = 'individual' | 'duplo' | 'triplo' | 'cortesia';

export interface ColumnMapLeads {
  date: string;
  event: string;
}
export interface ColumnMapBuyers {
  date: string;
  event: string;
  ticketType: string;
  ambassador: string;
}
export interface ColumnMapTraffic {
  date: string;
  campaign: string;
  cost: string;
}

export interface SourceConfig<C> {
  spreadsheetId: string;
  tab: string;
  headerRow: number;
  columns: C;
}

export interface EventEdition {
  id: string;
  label: string;
  current: boolean;
  aliases: string[];
}

export interface EventLine {
  id: string;
  label: string;
  editions: EventEdition[];
}

export interface AppConfig {
  ticketPrice: number;
  sources: {
    leads: SourceConfig<ColumnMapLeads>;
    buyers: SourceConfig<ColumnMapBuyers>;
    traffic: SourceConfig<ColumnMapTraffic>;
  };
  ticketTypes: Record<TicketKind, string[]>;
  eventLines: EventLine[];
}

/** Uma linha de lead ja normalizada. */
export interface LeadRow {
  date: string | null;
  rawEvent: string;
  editionId: string | null;
  lineId: string | null;
}

/** Uma linha de comprador ja normalizada. */
export interface BuyerRow {
  date: string | null;
  rawEvent: string;
  editionId: string | null;
  lineId: string | null;
  ticketKind: TicketKind | null;
  rawTicketType: string;
  ambassador: string;
}

/** Uma linha de trafego ja normalizada. */
export interface TrafficRow {
  date: string | null;
  campaign: string;
  editionId: string | null;
  lineId: string | null;
  cost: number;
}

export interface DataSet {
  leads: LeadRow[];
  buyers: BuyerRow[];
  traffic: TrafficRow[];
  fetchedAt: string;
  warnings: string[];
}

export interface DailyPoint {
  date: string;
  leads: number;
  vendas: number;
  custo: number;
}

export interface Metrics {
  custoCampanha: number;
  faturamentoLiquido: number;
  retorno: number;
  leadsTotal: number;
  participantes: number;
  custoPorLead: number | null;
  ingressos: { individual: number; duplo: number; triplo: number };
  embaixador: { embaixadores: number; convidados: number; total: number };
  serie: DailyPoint[];
  /** Valores que o painel nao conseguiu classificar — ajudam a ajustar o mapeamento. */
  naoClassificado: {
    eventosLeads: string[];
    eventosCompradores: string[];
    tiposIngresso: string[];
    campanhas: string[];
  };
}

export interface MetricsResponse {
  metrics: Metrics;
  filtro: { lineId: string; editionId: string | null; from: string; to: string };
  fetchedAt: string;
  warnings: string[];
  /** Verdadeiro quando o painel ainda roda sem a chave do Google (dados de exemplo). */
  demo: boolean;
}
