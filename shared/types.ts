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
  /** Coluna do embaixador. Vazio quando a aba nao tem essa informacao. */
  ambassador: string;
  /** Coluna com o valor da venda. Vazio quando o valor deve ser calculado. */
  valor?: string;
}
/** Aba usada so para contar embaixadores e convidados. */
export interface ColumnMapAmbassadors {
  date: string;
  event: string;
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

/**
 * Janela de validade, em AAAA-MM-DD (as duas pontas sao inclusivas).
 *
 * Existe porque um mesmo texto pode mudar de dono ao longo do tempo: na
 * planilha de leads da IFT, "DAY TRAINING" servia a dois eventos e, a partir
 * de 04/09/2026, passou a ser so do ANIMA Day. Sem a janela, ou os leads
 * antigos entram no evento errado, ou os 559 sao descartados.
 *
 * Linha sem data nao casa com apelido que tenha vigencia: nao da para
 * verificar, e chutar aqui vira lead no evento errado.
 */
export interface Vigencia {
  de?: string;
  ate?: string;
}

/**
 * Um apelido de edicao. Texto simples no caso normal; objeto quando aquele
 * nome — e so ele — vale apenas num periodo.
 *
 * A vigencia e do APELIDO, nao da edicao, porque uma edicao costuma juntar
 * nomes de idades diferentes: a edicao #01 do ANIMA Day atende ao mesmo tempo
 * por "#01 ÂNIMA Day Training" (sempre), por "ANIMADAY" (sempre) e por
 * "DAY TRAINING" (so de 04/09/2026 em diante, porque antes disso esse nome
 * tambem era do Dinamicas Sistemicas). Se a janela fosse da edicao inteira,
 * as vendas anteriores a essa data parariam de ser reconhecidas.
 */
export type AliasConfig = string | { nome: string; vigencia?: Vigencia };

/** O texto do apelido, venha ele como string ou como objeto. */
export function nomeDoApelido(alias: AliasConfig): string {
  return typeof alias === 'string' ? alias : alias.nome;
}

/** A janela do apelido; sem janela, vale a da edicao (quando houver). */
export function vigenciaDoApelido(alias: AliasConfig, edicao?: Vigencia): Vigencia | undefined {
  if (typeof alias === 'string') return edicao;
  return alias.vigencia ?? edicao;
}

export interface EventEdition {
  id: string;
  label: string;
  current: boolean;
  aliases: AliasConfig[];
  /** Janela padrao da edicao, usada pelos apelidos que nao tem a propria. */
  vigencia?: Vigencia;
  /**
   * Marca a edicao que nao e uma edicao: e a FONTE DE LEADS E TRAFEGO da linha
   * inteira, e o que ela traz vale para qualquer edicao do mesmo evento.
   *
   * Existe porque as duas pontas do funil sao nomeadas de jeitos diferentes na
   * origem. A venda chega com o nome do produto daquela edicao ("#03 DAY
   * TRAINING – FORMACAO DE PALESTRANTES..."); o lead e a campanha chegam com um
   * nome generico do evento ("PAI AO VIVO", "[PAI] [VENDAS] ..."), sem numero
   * de edicao nenhum. Sem esta marca, escolher a edicao mostrava so metade do
   * funil: faturamento e ingressos de um lado, leads e custo do outro.
   *
   * O que amarra as duas pontas e a DATA: o painel soma os leads e o custo do
   * periodo escolhido. Edicoes acontecem em epocas diferentes, entao ajustar as
   * datas para o periodo de uma edicao e o que separa uma da outra — o painel
   * nao tem como fazer isso sozinho, e por isso avisa na tela.
   *
   * E configuracao de proposito: quando outro evento passar a ter produto de
   * venda por edicao e produto de lead generico, basta marcar a fonte dele
   * aqui, sem mexer em codigo.
   */
  fonteDaLinha?: boolean;
}

export interface EventLine {
  id: string;
  label: string;
  editions: EventEdition[];
  /**
   * Ids dos eventos cujos leads caem aqui dentro, misturados e sem como
   * separar. So os "baldes" usam isto.
   *
   * Existe porque "este evento nao tem lead" e "os leads dele estao num monte
   * junto com os de outro evento" sao situacoes diferentes, e a segunda nao
   * pode aparecer como a primeira: o Dinamicas Sistemicas TEM interessados na
   * planilha, eles so estao escritos como "DAY TRAINING", que ate 03/09/2026
   * servia a ele e ao ANIMA Day ao mesmo tempo.
   */
  compartilhadoCom?: string[];
}

export interface AppConfig {
  ticketPrice: number;
  /**
   * Quando verdadeiro, o faturamento vem da coluna de valor da planilha e o
   * preco por tipo de ingresso vira apenas reserva, para linha sem valor.
   */
  usarValorDaPlanilha?: boolean;
  /**
   * Nomes de produto a ignorar por completo, comparados por igualdade exata.
   *
   * Existe por causa de uma colisao real: "PALESTRANTE DE ALTO IMPACTO" e ao
   * mesmo tempo um produto digital de ~R$ 23 (9.056 vendas) e o nome antigo do
   * evento presencial. Sem esta lista, as vendas digitais entrariam como
   * ingresso e inflariam faturamento e participantes.
   */
  produtosIgnorados?: string[];
  sources: {
    leads: SourceConfig<ColumnMapLeads>;
    buyers: SourceConfig<ColumnMapBuyers>;
    traffic: SourceConfig<ColumnMapTraffic>;
    /**
     * Opcional. Quando presente, embaixadores e convidados vem daqui, e nao da
     * aba de vendas — que pode nao ter essa coluna.
     */
    ambassadors?: SourceConfig<ColumnMapAmbassadors>;
  };
  /**
   * Campanhas de outros produtos da empresa, para sumirem do painel.
   *
   * Cada entrada pode ser uma TAG entre colchetes, escrita sem os colchetes
   * ("DI" apaga toda campanha "[DI] ...", das Dinamicas Infinitas), ou o NOME
   * INTEIRO de uma campanha ("[IFT] [LEADS] [ABO] [F] 28-02 SP").
   *
   * Os dois jeitos existem porque erram de formas diferentes. A tag pega
   * tambem as campanhas futuras dela — otimo para uma sigla que so aquele
   * produto usa, perigoso para uma sigla generica: uma campanha nova de evento
   * marcada com aquela tag sumiria calada. O nome inteiro nunca apaga nada
   * alem do que esta escrito aqui; se aparecer uma campanha nova do mesmo
   * produto, ela volta a aparecer no alerta e alguem avisa. Para "IFT", que e
   * a sigla da propria empresa, a segunda forma e a unica segura.
   *
   * A planilha de trafego e o plano de midia da empresa inteira, nao so dos
   * eventos presenciais. Sem esta lista, o gasto dos outros produtos aparece
   * como "custo de campanha sem evento" — um alerta de R$ 74 mil que na
   * verdade e so o resto da empresa. Alerta que e quase todo ruido para de ser
   * lido, e ai o problema de verdade passa junto.
   */
  campanhasIgnoradas?: string[];
  ticketTypes: TicketTypeConfig[];
  eventLines: EventLine[];
  /** A secao High Ticket. Ausente quando o painel roda so com os eventos. */
  highTicket?: HighTicketConfig;
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
  /** Numero da linha na aba, igual ao que aparece no Google Sheets. */
  linha: number;
  date: string | null;
  rawEvent: string;
  editionId: string | null;
  lineId: string | null;
  ticketKind: TicketKind | null;
  rawTicketType: string;
  ambassador: string;
  /**
   * Valor lido da planilha, quando a aba tem essa coluna. Preferido ao preco
   * de tabela porque preserva o historico: o VIP custava R$ 91,16 antes do
   * reajuste, e recalcular pelo preco de hoje reescreveria o passado.
   */
  valor: number | null;
}

/** Uma linha de convite de embaixador. */
export interface AmbassadorRow {
  linha: number;
  date: string | null;
  rawEvent: string;
  editionId: string | null;
  lineId: string | null;
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
  /** Convites de embaixador, da aba dedicada ou deduzidos da aba de vendas. */
  ambassadors: AmbassadorRow[];
  fetchedAt: string;
  warnings: string[];
  /** Falhas de leitura: o painel nao conseguiu abrir a aba. Impedem os numeros de existirem. */
  falhas: string[];
}

/**
 * Um ponto do grafico. Ate 31 dias no filtro, e um dia. Acima disso os dias
 * sao agrupados de tres em tres, senao o eixo vira uma parede de rotulos.
 * dateFim marca o ultimo dia do grupo; num ponto de um dia so, e igual a date.
 */
export interface DailyPoint {
  date: string;
  dateFim: string;
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
  /**
   * Verdadeiro quando este evento nao tem NENHUM lead na planilha, em periodo
   * nenhum — nao e "deu zero no mes", e "nao existe fonte de lead para ele".
   *
   * Sao coisas muito diferentes e um "0" sozinho nao distingue as duas. Foi a
   * causa de duas investigacoes de bug que nao eram bug: o numero estava certo
   * e a tela e que nao dizia o porque.
   */
  leadsSemFonte: boolean;
  /**
   * Preenchido quando existe um balde de leads que inclui este evento. O painel
   * mostra isso junto do numero para nao dar a entender que os leads do evento
   * nao existem — eles existem, so nao da para separar dos do outro evento.
   */
  leadsCompartilhados: { rotulo: string; quantidade: number } | null;
  /**
   * Preenchido quando a selecao e uma edicao especifica e parte dos numeros veio
   * da fonte compartilhada da linha (ver EventEdition.fonteDaLinha).
   *
   * O painel precisa dizer isso na tela: esses leads e esse custo sao os do
   * PERIODO, nao os daquela edicao. Sem o aviso, escolher a edicao #03 com o
   * filtro no historico inteiro mostra o custo do evento todo contra o
   * faturamento de uma edicao so — e um prejuizo de R$ 121 mil que nao existe.
   */
  fonteCompartilhada: { rotulo: string; leads: number; custo: number } | null;
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

/** Uma campanha de trafego, para alimentar o filtro de campanhas. */
export interface CampanhaResumo {
  nome: string;
  custo: number;
  linhas: number;
  /** Evento a que a campanha pertence, quando o nome dela permite identificar. */
  lineId: string | null;
  eventoLabel: string | null;
}

export interface MetricsResponse {
  metrics: Metrics;
  filtro: { lineId: string; editionId: string | null; from: string; to: string; campanhas: string[] };
  fetchedAt: string;
  warnings: string[];
  /** Falhas de leitura das planilhas. Se vier preenchido, os numeros nao sao confiaveis. */
  falhas: string[];
  /** Verdadeiro quando o painel ainda roda sem a chave do Google (dados de exemplo). */
  demo: boolean;
}

/* ===================== High Ticket ===================== */

/**
 * Um dos dois paineis da tela High Ticket. E configuracao, e nao codigo, porque
 * a empresa ja tem duas marcas e pode ter uma terceira: um painel novo entra
 * acrescentando um item aqui.
 *
 * `empresa` lista TODOS os textos que identificam esta marca, porque cada
 * planilha escreve de um jeito: a aba de vendas usa "IFTS" e a de leads usa
 * "SYSTEMIC" para a mesma marca. Comparacao normalizada (sem acento, sem caixa).
 *
 * `tagsDeCampanha` sao trechos procurados dentro do nome da campanha, como
 * "[SISTEMIC ACADEMY]" — mesma logica de correlacao ja usada nos eventos.
 */
export interface PainelHighTicket {
  id: string;
  label: string;
  empresa: string[];
  tagsDeCampanha: string[];
}

export interface ColunasVendasHighTicket {
  data: string;
  dataLead: string;
  dataCall: string;
  cliente: string;
  funil: string;
  sdr: string;
  mentor: string;
  produto: string;
  empresa: string;
  formaDePagamento: string;
  entrada: string;
  total: string;
}
export interface ColunasLeadsHighTicket {
  data: string;
  empresa: string;
}
export interface ColunasTrafegoHighTicket {
  data: string;
  campanha: string;
  custo: string;
}

export interface HighTicketConfig {
  sources: {
    vendas: SourceConfig<ColunasVendasHighTicket>;
    leads: SourceConfig<ColunasLeadsHighTicket>;
    trafego: SourceConfig<ColunasTrafegoHighTicket>;
  };
  paineis: PainelHighTicket[];
}

/** Uma venda high ticket ja normalizada. */
export interface VendaHighTicket {
  linha: number;
  data: string | null;
  dataLead: string | null;
  dataCall: string | null;
  cliente: string;
  funil: string;
  sdr: string;
  mentor: string;
  produto: string;
  formaDePagamento: string;
  entrada: number;
  total: number;
  /** Id do painel a que a venda pertence, ou null quando a EMPRESA nao e de nenhum. */
  painelId: string | null;
  rawEmpresa: string;
}

export interface LeadHighTicket {
  data: string | null;
  painelId: string | null;
  rawEmpresa: string;
}

export interface GastoHighTicket {
  data: string | null;
  campanha: string;
  painelId: string | null;
  custo: number;
}

export interface DadosHighTicket {
  vendas: VendaHighTicket[];
  leads: LeadHighTicket[];
  trafego: GastoHighTicket[];
  fetchedAt: string;
  falhas: string[];
}

/** Uma linha de tabela agrupada (por funil, por vendedor ou por produto). */
export interface GrupoHighTicket {
  chave: string;
  vendas: number;
  entrada: number;
  total: number;
}

export interface PontoHighTicket {
  data: string;
  faturamento: number;
  vendas: number;
}

/** Uma linha da tabela de clientes, na ordem pedida pela IFT. */
export interface ClienteHighTicket {
  data: string | null;
  dataLead: string | null;
  dataCall: string | null;
  cliente: string;
  funil: string;
  formaDePagamento: string;
  sdr: string;
  mentor: string;
  produto: string;
  total: number;
}

export interface MetricasHighTicket {
  painelId: string;
  label: string;
  investimento: number;
  leads: number;
  custoPorLead: number | null;
  faturamento: number;
  emCaixa: number;
  vendas: number;
  porFunil: GrupoHighTicket[];
  porVendedor: GrupoHighTicket[];
  porProduto: GrupoHighTicket[];
  serie: PontoHighTicket[];
  clientes: ClienteHighTicket[];
}

export interface RespostaHighTicket {
  paineis: MetricasHighTicket[];
  filtro: { from: string; to: string };
  fetchedAt: string | null;
  falhas: string[];
  /** Linhas cuja EMPRESA nao pertence a painel nenhum. Nunca somem caladas. */
  naoClassificado: {
    vendas: ValorNaoClassificado[];
    leads: ValorNaoClassificado[];
    custoSemPainel: number;
  };
}
