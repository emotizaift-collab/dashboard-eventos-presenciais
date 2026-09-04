/**
 * Calculo das metricas do painel.
 *
 * Regras (conforme especificacao da IFT):
 *  - ingresso individual = 1 x preco, duplo = 2 x preco, triplo = 3 x preco
 *  - convite de embaixador e gratuito e NAO entra no faturamento
 *  - Retorno = Faturamento Liquido - Total Custo Campanha
 *  - Participantes = 1x individual + 2x duplo + 3x triplo + embaixadores + convidados
 */
import type { AppConfig, DataSet, DailyPoint, Metrics } from '../../shared/types.js';

export interface MetricsFilter {
  lineId: string;
  editionId: string | null;
  from: string;
  to: string;
}

/** Aceita a linha se ela pertence a linha de evento (e a edicao, quando escolhida). */
function matchesFilter(
  filter: MetricsFilter,
  lineId: string | null,
  editionId: string | null,
): boolean {
  if (filter.editionId) return editionId === filter.editionId;
  if (filter.lineId === 'todos') return lineId !== null;
  return lineId === filter.lineId;
}

function inRange(date: string | null, from: string, to: string): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}

export function computeMetrics(
  config: AppConfig,
  data: DataSet,
  filter: MetricsFilter,
): { metrics: Metrics; warnings: string[] } {
  const warnings: string[] = [];
  const price = config.ticketPrice;

  const leads = data.leads.filter(
    (row) => matchesFilter(filter, row.lineId, row.editionId) && inRange(row.date, filter.from, filter.to),
  );

  const buyersOfEvent = data.buyers.filter((row) => matchesFilter(filter, row.lineId, row.editionId));
  const buyers = buyersOfEvent.filter((row) => inRange(row.date, filter.from, filter.to));

  const buyersSemData = buyersOfEvent.filter((row) => !row.date).length;
  if (buyersSemData > 0) {
    warnings.push(
      `${buyersSemData} registro(s) de compradores estao sem data valida e ficaram de fora do periodo selecionado. ` +
        'Confirme qual coluna da aba de compradores guarda a data da compra.',
    );
  }

  const traffic = data.traffic.filter(
    (row) => matchesFilter(filter, row.lineId, row.editionId) && inRange(row.date, filter.from, filter.to),
  );

  const individual = buyers.filter((row) => row.ticketKind === 'individual').length;
  const duplo = buyers.filter((row) => row.ticketKind === 'duplo').length;
  const triplo = buyers.filter((row) => row.ticketKind === 'triplo').length;

  const comEmbaixador = buyers.filter((row) => row.ambassador.trim() !== '');
  const convidados = comEmbaixador.length;
  const embaixadores = new Set(
    comEmbaixador.map((row) => row.ambassador.trim().toLowerCase()),
  ).size;

  const custoCampanha = round2(traffic.reduce((total, row) => total + row.cost, 0));
  const faturamentoLiquido = round2(
    individual * price + duplo * price * 2 + triplo * price * 3,
  );
  const retorno = round2(faturamentoLiquido - custoCampanha);
  const leadsTotal = leads.length;
  const participantes = individual + duplo * 2 + triplo * 3 + embaixadores + convidados;
  const custoPorLead = leadsTotal > 0 ? round2(custoCampanha / leadsTotal) : null;

  return {
    metrics: {
      custoCampanha,
      faturamentoLiquido,
      retorno,
      leadsTotal,
      participantes,
      custoPorLead,
      ingressos: { individual, duplo, triplo },
      embaixador: { embaixadores, convidados, total: embaixadores + convidados },
      serie: buildSeries(filter, leads, buyers, traffic),
      naoClassificado: collectUnmatched(data),
    },
    warnings,
  };
}

/** Uma linha por dia do intervalo, mesmo nos dias em que nao houve movimento. */
function buildSeries(
  filter: MetricsFilter,
  leads: DataSet['leads'],
  buyers: DataSet['buyers'],
  traffic: DataSet['traffic'],
): DailyPoint[] {
  const days = listDays(filter.from, filter.to);
  const leadsByDay = countByDay(leads.map((row) => row.date));
  const vendasByDay = countByDay(
    buyers.filter((row) => row.ticketKind && row.ticketKind !== 'cortesia').map((row) => row.date),
  );
  const custoByDay = new Map<string, number>();
  for (const row of traffic) {
    if (!row.date) continue;
    custoByDay.set(row.date, (custoByDay.get(row.date) ?? 0) + row.cost);
  }

  return days.map((date) => ({
    date,
    leads: leadsByDay.get(date) ?? 0,
    vendas: vendasByDay.get(date) ?? 0,
    custo: round2(custoByDay.get(date) ?? 0),
  }));
}

function countByDay(dates: Array<string | null>): Map<string, number> {
  const map = new Map<string, number>();
  for (const date of dates) {
    if (!date) continue;
    map.set(date, (map.get(date) ?? 0) + 1);
  }
  return map;
}

/** Limita a 400 dias para nao gerar um grafico gigante por engano. */
export function listDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return days;
  const cursor = new Date(start);
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Valores que nao casaram com nenhum apelido — mostrados na tela de mapeamento. */
function collectUnmatched(data: DataSet): Metrics['naoClassificado'] {
  const take = (values: string[]) =>
    [...new Set(values.filter((value) => value.trim() !== ''))].slice(0, 50);

  const leadsIgnorados = data.leads.filter((row) => !row.lineId && row.rawEvent.trim() !== '');
  const comprasSemEvento = data.buyers.filter((row) => !row.lineId && row.rawEvent.trim() !== '');
  const comprasSemTipo = data.buyers.filter(
    (row) => row.lineId && !row.ticketKind && row.rawTicketType.trim() !== '',
  );
  const custoSemEvento = data.traffic.filter((row) => !row.lineId);

  return {
    eventosLeads: take(leadsIgnorados.map((row) => row.rawEvent)),
    eventosCompradores: take(comprasSemEvento.map((row) => row.rawEvent)),
    tiposIngresso: take(comprasSemTipo.map((row) => row.rawTicketType)),
    campanhas: take(custoSemEvento.map((row) => row.campaign)),
    resumo: {
      leadsIgnorados: leadsIgnorados.length,
      comprasSemEvento: comprasSemEvento.length,
      comprasSemTipo: comprasSemTipo.length,
      custoSemEvento: round2(custoSemEvento.reduce((total, row) => total + row.cost, 0)),
    },
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
