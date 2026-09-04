/** Tipos compartilhados entre o servidor e a interface. */

/** Id de um tipo de ingresso configurado (ex.: 'individual', 'vip', 'acompanhante'). */
export type TicketKind = string;

/**
 * Um tipo de ingresso, editavel pela interface.
 *
 * cadeiras = quantas pessoas o ingresso leva ao evento. Vale 0 em dois casos:
 *  - 'cortesia': o convidado ja e contado pela coluna do embaixador;
 *  - 'acompanhante': a segunda pessoa de um duplo. Quem compra nao consegue
 *    cadastrar o nome dela na hora, entao a equipe liga depois e registra numa
 *    linha propria ("CAD DA <comprador>"). O ingresso duplo JA contabilizou
 *    essa cadeira e esse valor; contar de novo dobraria tudo.
 *
 * preco = null significa "ticketPrice x cadeiras", entao mudar o preco base
 * ajusta individual, duplo e triplo de uma vez. Um numero fixa o valor daquele
 * tipo, para ingressos com preco proprio (VIP, inteira).
 */
export interface TicketTypeConfig {
  id: string;
  label: string;
  aliases: string[];
  cadeiras: number;
  preco: number | null;
  contaComoVenda: boolean;
}

/** Quanto vale um ingresso desse tipo, em reais. */
export function precoDoTipo(tipo: TicketTypeConfig, precoBase: number): number {
  return tipo.preco === null ? precoBase * tipo.cadeiras : tipo.preco;
}

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
  ticketTypes: TicketTypeConfig[];
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
  /** Falhas de leitura: o painel nao conseguiu abrir a aba. Impedem os numeros de existirem. */
  falhas: string[];
}

export interface DailyPoint {
  date: string;
  leads: number;
  vendas: number;
  custo: number;
}

/** Um valor nao reconhecido e o tamanho do que ele representa. */
export interface ValorNaoClassificado {
  valor: string;
  /** Quantas linhas da planilha tem esse valor. */
  linhas: number;
  /** Soma em reais, so para campanhas de trafego. */
  custo?: number;
}

export interface Metrics {
  custoCampanha: number;
  faturamentoLiquido: number;
  retorno: number;
  leadsTotal: number;
  participantes: number;
  custoPorLead: number | null;
  /** Um bloco por tipo de ingresso que conta como venda, na ordem da configuracao. */
  ingressos: Array<{
    id: string;
    label: string;
    quantidade: number;
    faturamento: number;
    participantes: number;
  }>;
  embaixador: { embaixadores: number; convidados: number; total: number };
  serie: DailyPoint[];
  /** Valores que o painel nao conseguiu classificar — ajudam a ajustar o mapeamento. */
  naoClassificado: {
    eventosLeads: ValorNaoClassificado[];
    eventosCompradores: ValorNaoClassificado[];
    tiposIngresso: ValorNaoClassificado[];
    campanhas: ValorNaoClassificado[];
    /** Quanto cada problema custa em dado perdido. Valor distinto engana; o que importa e o tamanho. */
    resumo: {
      leadsIgnorados: number;
      comprasSemEvento: number;
      comprasSemTipo: number;
      custoSemEvento: number;
    };
  };
}

export interface MetricsResponse {
  metrics: Metrics;
  filtro: { lineId: string; editionId: string | null; from: string; to: string };
  fetchedAt: string;
  warnings: string[];
  /** Falhas de leitura das planilhas. Se vier preenchido, os numeros nao sao confiaveis. */
  falhas: string[];
  /** Verdadeiro quando o painel ainda roda sem a chave do Google (dados de exemplo). */
  demo: boolean;
}
