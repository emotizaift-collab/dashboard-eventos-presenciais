/**
 * Calculo das metricas do painel.
 *
 * Regras (conforme especificacao da IFT):
 *  - ingresso individual = 1 x preco, duplo = 2 x preco, triplo = 3 x preco
 *  - convite de embaixador e gratuito e NAO entra no faturamento
 *  - Retorno = Faturamento Liquido - Total Custo Campanha
 *  - Participantes = 1x individual + 2x duplo + 3x triplo + embaixadores + convidados
 */
import type {
  AppConfig, DataSet, DailyPoint, Metrics, ValorNaoClassificado,
} from '../../shared/types.js';
import { precoDoTipo } from '../../shared/types.js';

/** Tipos que representam a 2a/3a pessoa de um ingresso ja pago. */
function ehAcompanhante(id: string): boolean {
  return id.includes('acompanhante');
}

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

  // Apontar as linhas: sem elas o aviso obriga a procurar a agulha no palheiro.
  const semData = buyersOfEvent.filter((row) => !row.date);
  if (semData.length > 0) {
    const linhas = semData.map((row) => row.linha).sort((a, b) => a - b);
    const mostradas = linhas.slice(0, 15).join(', ');
    const resto = linhas.length > 15 ? ` e mais ${linhas.length - 15}` : '';
    warnings.push(
      `${semData.length} registro(s) de compradores estao sem data valida e ficaram de fora do periodo ` +
        `selecionado. Na aba de compradores, preencha a data nas linhas: ${mostradas}${resto}.`,
    );
  }

  const traffic = data.traffic.filter(
    (row) => matchesFilter(filter, row.lineId, row.editionId) && inRange(row.date, filter.from, filter.to),
  );

  // Uma contagem por tipo configurado. A lista de tipos e editavel pela
  // interface, entao nada aqui pode depender de um id especifico existir.
  const contagem = new Map<string, number>();
  for (const row of buyers) {
    if (row.ticketKind === null) continue;
    contagem.set(row.ticketKind, (contagem.get(row.ticketKind) ?? 0) + 1);
  }

  const ingressos = config.ticketTypes
    .filter((tipo) => tipo.contaComoVenda)
    .map((tipo) => {
      const quantidade = contagem.get(tipo.id) ?? 0;
      return {
        id: tipo.id,
        label: tipo.label,
        quantidade,
        faturamento: round2(quantidade * precoDoTipo(tipo, price)),
        participantes: quantidade * tipo.cadeiras,
      };
    });

  const comEmbaixador = buyers.filter((row) => row.ambassador.trim() !== '');
  const convidados = comEmbaixador.length;
  const embaixadores = new Set(
    comEmbaixador.map((row) => row.ambassador.trim().toLowerCase()),
  ).size;

  // Cada ingresso que leva mais de uma pessoa gera acompanhante: o duplo pede 1
  // nome, o triplo pede 2. A equipe preenche isso a mao, ligando para o
  // comprador, entao a diferenca aponta quantos telefonemas ainda faltam.
  const acompanhantes = config.ticketTypes
    .filter((tipo) => !tipo.contaComoVenda && tipo.cadeiras === 0 && ehAcompanhante(tipo.id))
    .reduce((total, tipo) => total + (contagem.get(tipo.id) ?? 0), 0);
  const acompanhantesEsperados = config.ticketTypes
    .filter((tipo) => tipo.contaComoVenda && tipo.cadeiras > 1)
    .reduce((total, tipo) => total + (contagem.get(tipo.id) ?? 0) * (tipo.cadeiras - 1), 0);

  if (acompanhantes < acompanhantesEsperados) {
    warnings.push(
      `Faltam ${acompanhantesEsperados - acompanhantes} nome(s) de acompanhante a cadastrar: ` +
        `os ingressos vendidos comportam ${acompanhantesEsperados} acompanhante(s) e ` +
        `${acompanhantes} foi(ram) preenchido(s). Isso nao afeta o faturamento.`,
    );
  } else if (acompanhantes > acompanhantesEsperados) {
    warnings.push(
      `Ha ${acompanhantes} acompanhante(s) cadastrado(s), mas os ingressos vendidos comportam ` +
        `${acompanhantesEsperados}. Pode haver linha duplicada ou um tipo de ingresso digitado errado.`,
    );
  }

  const custoCampanha = round2(traffic.reduce((total, row) => total + row.cost, 0));
  const faturamentoLiquido = round2(
    ingressos.reduce((total, item) => total + item.faturamento, 0),
  );
  const retorno = round2(faturamentoLiquido - custoCampanha);
  const leadsTotal = leads.length;
  const cadeirasVendidas = ingressos.reduce((total, item) => total + item.participantes, 0);
  const participantes = cadeirasVendidas + embaixadores + convidados;
  const custoPorLead = leadsTotal > 0 ? round2(custoCampanha / leadsTotal) : null;

  return {
    metrics: {
      custoCampanha,
      faturamentoLiquido,
      retorno,
      leadsTotal,
      participantes,
      custoPorLead,
      ingressos,
      embaixador: { embaixadores, convidados, total: embaixadores + convidados },
      serie: buildSeries(config, filter, leads, buyers, traffic),
      naoClassificado: collectUnmatched(data),
    },
    warnings,
  };
}

/** Uma linha por dia do intervalo, mesmo nos dias em que nao houve movimento. */
function buildSeries(
  config: AppConfig,
  filter: MetricsFilter,
  leads: DataSet['leads'],
  buyers: DataSet['buyers'],
  traffic: DataSet['traffic'],
): DailyPoint[] {
  const days = listDays(filter.from, filter.to);
  const leadsByDay = countByDay(leads.map((row) => row.date));
  // Venda e so o que a configuracao marca como venda: cortesia e acompanhante
  // ficam de fora, senao a linha do acompanhante viraria uma venda inexistente.
  const tiposPagos = new Set(
    config.ticketTypes.filter((tipo) => tipo.contaComoVenda).map((tipo) => tipo.id),
  );
  const vendasByDay = countByDay(
    buyers.filter((row) => row.ticketKind !== null && tiposPagos.has(row.ticketKind)).map((row) => row.date),
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
  // Contar linhas, nao valores distintos: "27 nomes diferentes" nao diz se sao
  // 27 linhas ou 300, e e o numero de linhas que mede o dado que esta sumindo.
  const take = (values: string[]): ValorNaoClassificado[] => {
    const contagem = new Map<string, number>();
    for (const value of values) {
      const limpo = value.trim();
      if (!limpo) continue;
      contagem.set(limpo, (contagem.get(limpo) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([valor, linhas]) => ({ valor, linhas }))
      .sort((a, b) => b.linhas - a.linhas)
      .slice(0, 50);
  };

  const takeCampanhas = (rows: DataSet['traffic']): ValorNaoClassificado[] => {
    const agrupado = new Map<string, { linhas: number; custo: number }>();
    for (const row of rows) {
      const nome = row.campaign.trim();
      if (!nome) continue;
      const atual = agrupado.get(nome) ?? { linhas: 0, custo: 0 };
      agrupado.set(nome, { linhas: atual.linhas + 1, custo: atual.custo + row.cost });
    }
    return [...agrupado.entries()]
      .map(([valor, dados]) => ({ valor, linhas: dados.linhas, custo: round2(dados.custo) }))
      .sort((a, b) => (b.custo ?? 0) - (a.custo ?? 0))
      .slice(0, 50);
  };

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
    campanhas: takeCampanhas(custoSemEvento),
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
