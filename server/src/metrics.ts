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
  /**
   * Nomes de campanha selecionados. Vazio = todas.
   *
   * ATENCAO ao ler os numeros: o custo sai da planilha de trafego, que tem o
   * nome da campanha em cada linha, entao ele e exato por campanha. Ja a aba de
   * compradores NAO tem coluna de campanha (confirmado: DATA DA VENDA, HORARIO,
   * EVENTO, NOME, TELEFONE, EMAIL, CPF, TIPO DE INGRESSO, EMBAIXADOR, FORMS).
   * Logo, faturamento nao pode ser atribuido a uma campanha: o que este filtro
   * faz e restringir o faturamento aos EVENTOS das campanhas escolhidas.
   */
  campanhas: string[];
}

/** Nomes de campanha normalizados para comparacao, evitando diferenca de caixa/espaco. */
function chaveCampanha(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Quais edicoes uma selecao aceita, ou null quando a selecao e por linha.
 *
 * Escolher uma edicao aceita tambem a fonte de leads e trafego da linha dela
 * (EventEdition.fonteDaLinha), porque venda e lead chegam com nomes diferentes
 * na origem: a venda com o nome do produto daquela edicao, o lead e a campanha
 * com um nome generico do evento. Sem isso, escolher a edicao mostra so metade
 * do funil.
 *
 * Escolher a propria fonte nao puxa as edicoes de volta: ali a pessoa quer
 * olhar a fonte, nao o evento inteiro.
 */
function edicoesAceitas(config: AppConfig, editionId: string | null): Set<string> | null {
  if (!editionId) return null;
  const aceitas = new Set([editionId]);
  const linha = config.eventLines.find((item) =>
    item.editions.some((edicao) => edicao.id === editionId),
  );
  const escolhida = linha?.editions.find((edicao) => edicao.id === editionId);
  if (linha && escolhida && !escolhida.fonteDaLinha) {
    for (const edicao of linha.editions) {
      if (edicao.fonteDaLinha) aceitas.add(edicao.id);
    }
  }
  return aceitas;
}

/** Aceita a linha se ela pertence a linha de evento (e a edicao, quando escolhida). */
function matchesFilter(
  filter: MetricsFilter,
  lineId: string | null,
  editionId: string | null,
  aceitas: Set<string> | null,
): boolean {
  if (aceitas) return editionId !== null && aceitas.has(editionId);
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
  const aceitas = edicoesAceitas(config, filter.editionId);

  // Campanhas escolhidas restringem tambem os eventos considerados, porque e o
  // unico vinculo que existe entre campanha e venda: o evento a que ela pertence.
  const selecionadas = new Set(filter.campanhas.map(chaveCampanha));
  const eventosDasCampanhas =
    selecionadas.size === 0
      ? null
      : new Set(
          data.traffic
            .filter((row) => selecionadas.has(chaveCampanha(row.campaign)) && row.lineId)
            .map((row) => row.lineId as string),
        );

  const noEscopoDasCampanhas = (lineId: string | null): boolean =>
    eventosDasCampanhas === null || (lineId !== null && eventosDasCampanhas.has(lineId));

  const leads = data.leads.filter(
    (row) =>
      matchesFilter(filter, row.lineId, row.editionId, aceitas) &&
      noEscopoDasCampanhas(row.lineId) &&
      inRange(row.date, filter.from, filter.to),
  );

  const buyersOfEvent = data.buyers.filter(
    (row) => matchesFilter(filter, row.lineId, row.editionId, aceitas) && noEscopoDasCampanhas(row.lineId),
  );
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

  // Compra com a coluna do evento em BRANCO nao pertence a evento nenhum, entao
  // nao aparece em nenhum filtro nem na lista de "nomes nao reconhecidos" (que
  // so lista texto que existe). Sem este aviso ela some sem deixar rastro, o que
  // e o pior caso: uma venda de verdade que nunca entra em nenhum numero.
  const semEventoEmBranco = data.buyers.filter(
    (row) => row.rawEvent.trim() === '' && (row.ticketKind !== null || row.rawTicketType.trim() !== ''),
  );
  if (semEventoEmBranco.length > 0) {
    const linhas = semEventoEmBranco.map((row) => row.linha).sort((a, b) => a - b);
    const mostradas = linhas.slice(0, 15).join(', ');
    const resto = linhas.length > 15 ? ` e mais ${linhas.length - 15}` : '';
    warnings.push(
      `${semEventoEmBranco.length} compra(s) estao com a coluna do evento em branco e por isso nao entram ` +
        `em nenhum evento, em nenhum periodo. Se forem de um dos seus eventos, e faturamento que nao esta ` +
        `sendo contado. Na aba de compradores, preencha o evento nas linhas: ${mostradas}${resto}.`,
    );
  }

  // O custo, esse sim, e filtrado pelas campanhas exatas escolhidas.
  const traffic = data.traffic.filter(
    (row) =>
      matchesFilter(filter, row.lineId, row.editionId, aceitas) &&
      (selecionadas.size === 0 || selecionadas.has(chaveCampanha(row.campaign))) &&
      inRange(row.date, filter.from, filter.to),
  );

  // Uma contagem por tipo configurado. A lista de tipos e editavel pela
  // interface, entao nada aqui pode depender de um id especifico existir.
  const contagem = new Map<string, number>();
  const somaPorTipo = new Map<string, number>();
  const tiposPorId = new Map(config.ticketTypes.map((tipo) => [tipo.id, tipo]));
  // Preferir o valor registrado na planilha preserva o historico: o VIP custava
  // R$ 91,16 antes do reajuste, e recalcular tudo pelo preco de hoje reescreveria
  // vendas antigas. Linha sem valor cai no preco de tabela.
  const usarValor = config.usarValorDaPlanilha === true;
  let linhasSemValor = 0;

  for (const row of buyers) {
    if (row.ticketKind === null) continue;
    contagem.set(row.ticketKind, (contagem.get(row.ticketKind) ?? 0) + 1);

    const tipo = tiposPorId.get(row.ticketKind);
    if (!tipo || !tipo.contaComoVenda) continue;
    let valorDaLinha: number;
    if (usarValor && typeof row.valor === 'number' && Number.isFinite(row.valor)) {
      valorDaLinha = row.valor;
    } else {
      valorDaLinha = precoDoTipo(tipo, price);
      if (usarValor) linhasSemValor += 1;
    }
    somaPorTipo.set(row.ticketKind, (somaPorTipo.get(row.ticketKind) ?? 0) + valorDaLinha);
  }

  if (linhasSemValor > 0) {
    warnings.push(
      `${linhasSemValor} venda(s) estao sem valor preenchido na planilha, entao entraram pelo preco de ` +
        'tabela do tipo de ingresso. Confira essas linhas se o faturamento parecer diferente do esperado.',
    );
  }

  const ingressos = config.ticketTypes
    .filter((tipo) => tipo.contaComoVenda)
    .map((tipo) => ({
      id: tipo.id,
      label: tipo.label,
      quantidade: contagem.get(tipo.id) ?? 0,
      faturamento: round2(somaPorTipo.get(tipo.id) ?? 0),
      participantes: (contagem.get(tipo.id) ?? 0) * tipo.cadeiras,
    }));

  // Convites vem de data.ambassadors, que o loader monta da aba dedicada ou,
  // na falta dela, das proprias linhas de venda.
  const comEmbaixador = data.ambassadors.filter(
    (row) =>
      matchesFilter(filter, row.lineId, row.editionId, aceitas) &&
      noEscopoDasCampanhas(row.lineId) &&
      inRange(row.date, filter.from, filter.to),
  );
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

  // Convidado so e contado pela coluna do embaixador. Um convite sem esse nome
  // preenchido nao entra em Participantes — a pessoa vai ao evento e some da
  // conta. Nao da para deduzir o nome, entao o painel aponta e a equipe corrige.
  const tiposDeCortesia = new Set(
    config.ticketTypes
      .filter((tipo) => !tipo.contaComoVenda && !ehAcompanhante(tipo.id))
      .map((tipo) => tipo.id),
  );
  const cortesiaSemEmbaixador = buyers.filter(
    (row) => row.ticketKind !== null && tiposDeCortesia.has(row.ticketKind) && row.ambassador.trim() === '',
  );
  if (cortesiaSemEmbaixador.length > 0) {
    const linhas = cortesiaSemEmbaixador.map((row) => row.linha).sort((a, b) => a - b);
    const mostradas = linhas.slice(0, 15).join(', ');
    const resto = linhas.length > 15 ? ` e mais ${linhas.length - 15}` : '';
    warnings.push(
      `${cortesiaSemEmbaixador.length} convite(s) de embaixador estao sem o nome do embaixador preenchido, ` +
        `entao esses convidados nao entram na contagem de Participantes. ` +
        `Na aba de compradores, preencha a coluna do embaixador nas linhas: ${mostradas}${resto}.`,
    );
  }

  const custoCampanha = round2(traffic.reduce((total, row) => total + row.cost, 0));
  const faturamentoLiquido = round2(
    ingressos.reduce((total, item) => total + item.faturamento, 0),
  );
  const retorno = round2(faturamentoLiquido - custoCampanha);
  const leadsTotal = leads.length;
  // Mesmo recorte de evento, sem o recorte de data: e o que separa "deu zero
  // neste mes" de "este evento nao aparece na planilha de leads".
  const leadsSemFonte = !data.leads.some(
    (row) => matchesFilter(filter, row.lineId, row.editionId, aceitas) && noEscopoDasCampanhas(row.lineId),
  );

  // Um balde que inclua este evento significa que ha leads dele na planilha,
  // so que embolados com os de outro evento. Sem isto, o painel diria que o
  // evento nao tem lead nenhum — que e o contrario do que acontece.
  const linhaEscolhida = filter.editionId
    ? (config.eventLines.find((linha) =>
        linha.editions.some((edicao) => edicao.id === filter.editionId),
      )?.id ?? filter.lineId)
    : filter.lineId;
  const balde = config.eventLines.find(
    (linha) => linha.id !== linhaEscolhida && linha.compartilhadoCom?.includes(linhaEscolhida),
  );
  const leadsNoBalde = balde
    ? data.leads.filter(
        (row) => row.lineId === balde.id && inRange(row.date, filter.from, filter.to),
      ).length
    : 0;
  const leadsCompartilhados =
    balde && leadsNoBalde > 0 ? { rotulo: balde.label, quantidade: leadsNoBalde } : null;

  // Quanto dos numeros veio da fonte compartilhada da linha. O painel avisa na
  // tela: esses leads e esse custo sao os do PERIODO, nao os daquela edicao.
  const idsDaFonte = new Set(
    (aceitas ? [...aceitas] : [])
      .filter((id) => id !== filter.editionId)
      .filter((id) =>
        config.eventLines.some((linha) =>
          linha.editions.some((edicao) => edicao.id === id && edicao.fonteDaLinha),
        ),
      ),
  );
  const daFonte = <T extends { editionId: string | null }>(linhas: T[]): T[] =>
    linhas.filter((linha) => linha.editionId !== null && idsDaFonte.has(linha.editionId));
  const rotuloDaFonte = config.eventLines
    .flatMap((linha) => linha.editions)
    .find((edicao) => idsDaFonte.has(edicao.id))?.label;
  const custoDaFonte = round2(daFonte(traffic).reduce((total, row) => total + row.cost, 0));
  const leadsDaFonte = daFonte(leads).length;
  const fonteCompartilhada =
    rotuloDaFonte && (leadsDaFonte > 0 || custoDaFonte > 0)
      ? { rotulo: rotuloDaFonte, leads: leadsDaFonte, custo: custoDaFonte }
      : null;
  const cadeirasVendidas = ingressos.reduce((total, item) => total + item.participantes, 0);
  const participantes = cadeirasVendidas + embaixadores + convidados;
  const custoPorLead = leadsTotal > 0 ? round2(custoCampanha / leadsTotal) : null;

  return {
    metrics: {
      custoCampanha,
      faturamentoLiquido,
      retorno,
      leadsTotal,
      leadsSemFonte,
      leadsCompartilhados,
      fonteCompartilhada,
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

  const pontos: DailyPoint[] = days.map((date) => ({
    date,
    dateFim: date,
    leads: leadsByDay.get(date) ?? 0,
    vendas: vendasByDay.get(date) ?? 0,
    custo: round2(custoByDay.get(date) ?? 0),
  }));

  return days.length > DIAS_ATE_AGRUPAR ? agrupar(pontos, TAMANHO_DO_GRUPO) : pontos;
}

/** Ate este numero de dias o grafico mostra dia a dia. */
const DIAS_ATE_AGRUPAR = 31;
/** Acima disso, cada ponto passa a somar este tanto de dias. */
const TAMANHO_DO_GRUPO = 3;

/** Junta os dias em blocos, somando os valores de cada bloco. */
function agrupar(pontos: DailyPoint[], tamanho: number): DailyPoint[] {
  const saida: DailyPoint[] = [];
  for (let i = 0; i < pontos.length; i += tamanho) {
    const bloco = pontos.slice(i, i + tamanho);
    saida.push({
      date: bloco[0].date,
      dateFim: bloco[bloco.length - 1].date,
      leads: bloco.reduce((total, ponto) => total + ponto.leads, 0),
      vendas: bloco.reduce((total, ponto) => total + ponto.vendas, 0),
      custo: round2(bloco.reduce((total, ponto) => total + ponto.custo, 0)),
    });
  }
  return saida;
}

function countByDay(dates: Array<string | null>): Map<string, number> {
  const map = new Map<string, number>();
  for (const date of dates) {
    if (!date) continue;
    map.set(date, (map.get(date) ?? 0) + 1);
  }
  return map;
}

/** Limita a 1100 dias (cerca de 3 anos) para um intervalo digitado errado nao explodir. */
export function listDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return days;
  const cursor = new Date(start);
  while (cursor <= end && days.length < 1100) {
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

/**
 * Primeiro e ultimo dia em que esta edicao vendeu. Alimenta o atalho "Periodo
 * desta edicao" na tela.
 *
 * Existe porque a edicao so separa a venda: leads e custo chegam com um nome
 * generico do evento e sao recortados pela data. Quem escolhe a edicao sem
 * ajustar as datas ve o custo do evento inteiro contra o faturamento de uma
 * edicao — e nao tinha como saber a janela certa sem abrir a planilha.
 *
 * Sem venda com data, devolve null: um atalho que mandasse para um intervalo
 * inventado seria pior do que nenhum atalho.
 */
export function periodoDeVendas(
  data: DataSet | null,
  editionId: string,
): { de: string; ate: string } | null {
  if (!data) return null;
  let de: string | null = null;
  let ate: string | null = null;
  for (const row of data.buyers) {
    if (row.editionId !== editionId || !row.date) continue;
    if (de === null || row.date < de) de = row.date;
    if (ate === null || row.date > ate) ate = row.date;
  }
  return de && ate ? { de, ate } : null;
}
