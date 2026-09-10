/**
 * A secao High Ticket: dois paineis lado a lado, IFT e Sistemico.
 *
 * E um modulo separado do resto do painel de proposito. As fontes sao outras
 * (outra aba de vendas, outra aba de leads, outra aba de trafego) e o que separa
 * um painel do outro tambem: nos eventos e o nome do evento, aqui e a coluna
 * EMPRESA. Misturar os dois calculos so criaria condicional.
 */
import type {
  AppConfig,
  ClienteHighTicket,
  DadosHighTicket,
  GastoHighTicket,
  GrupoHighTicket,
  HighTicketConfig,
  LeadHighTicket,
  MetricasHighTicket,
  PainelHighTicket,
  PontoHighTicket,
  RespostaHighTicket,
  ValorNaoClassificado,
  VendaHighTicket,
} from '../../shared/types.js';
import { normalizeText, parseDate, parseMoney, resolveColumnIndex } from './normalize.js';
import { explicarErroDoGoogle } from './loader.js';
import { hasCredentials, readTab } from './sheets.js';

function cell(row: string[], index: number): string {
  if (index < 0) return '';
  return (row[index] ?? '').toString().trim();
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * A qual painel pertence este texto de EMPRESA.
 *
 * Cada planilha escreve a mesma marca de um jeito — a aba de vendas usa "IFTS",
 * a de leads usa "SYSTEMIC" — entao o painel lista todas as grafias que
 * respondem por ele, e a comparacao e normalizada.
 */
function painelPorEmpresa(paineis: PainelHighTicket[], empresa: string): string | null {
  const alvo = normalizeText(empresa);
  if (!alvo) return null;
  for (const painel of paineis) {
    if (painel.empresa.some((nome) => normalizeText(nome) === alvo)) return painel.id;
  }
  return null;
}

/** A qual painel pertence esta campanha, pelo trecho procurado no nome dela. */
function painelPorCampanha(paineis: PainelHighTicket[], campanha: string): string | null {
  const alvo = normalizeText(campanha);
  if (!alvo) return null;
  for (const painel of paineis) {
    if (painel.tagsDeCampanha.some((tag) => alvo.includes(normalizeText(tag)))) return painel.id;
  }
  return null;
}

export async function fetchHighTicket(config: AppConfig): Promise<DadosHighTicket | null> {
  const ht = config.highTicket;
  if (!ht || !hasCredentials()) return null;

  const falhas: string[] = [];
  const [vendasRaw, leadsRaw, trafegoRaw] = await Promise.all([
    lerAba(ht.sources.vendas.spreadsheetId, ht.sources.vendas.tab, 'vendas high ticket', falhas),
    lerAba(ht.sources.leads.spreadsheetId, ht.sources.leads.tab, 'leads high ticket', falhas),
    lerAba(ht.sources.trafego.spreadsheetId, ht.sources.trafego.tab, 'trafego high ticket', falhas),
  ]);

  return {
    vendas: lerVendas(ht, vendasRaw),
    leads: lerLeads(ht, leadsRaw),
    trafego: lerTrafego(ht, trafegoRaw),
    fetchedAt: new Date().toISOString(),
    falhas,
  };
}

function lerVendas(ht: HighTicketConfig, linhas: string[][]): VendaHighTicket[] {
  const inicio = ht.sources.vendas.headerRow - 1;
  const cabecalho = linhas[inicio] ?? [];
  const col = ht.sources.vendas.columns;
  const i = {
    data: resolveColumnIndex(col.data, cabecalho),
    dataLead: resolveColumnIndex(col.dataLead, cabecalho),
    dataCall: resolveColumnIndex(col.dataCall, cabecalho),
    cliente: resolveColumnIndex(col.cliente, cabecalho),
    funil: resolveColumnIndex(col.funil, cabecalho),
    sdr: resolveColumnIndex(col.sdr, cabecalho),
    mentor: resolveColumnIndex(col.mentor, cabecalho),
    produto: resolveColumnIndex(col.produto, cabecalho),
    empresa: resolveColumnIndex(col.empresa, cabecalho),
    formaDePagamento: resolveColumnIndex(col.formaDePagamento, cabecalho),
    entrada: resolveColumnIndex(col.entrada, cabecalho),
    total: resolveColumnIndex(col.total, cabecalho),
  };

  const vendas: VendaHighTicket[] = [];
  for (let n = inicio + 1; n < linhas.length; n += 1) {
    const linha = linhas[n];
    if (!linha || linha.length === 0) continue;
    const cliente = cell(linha, i.cliente);
    const rawEmpresa = cell(linha, i.empresa);
    const total = parseMoney(cell(linha, i.total));
    // Linha sem cliente e sem valor e rodape ou sobra de formatacao.
    if (!cliente && !rawEmpresa && total === 0) continue;
    vendas.push({
      linha: n + 1,
      data: parseDate(cell(linha, i.data)),
      dataLead: parseDate(cell(linha, i.dataLead)),
      dataCall: parseDate(cell(linha, i.dataCall)),
      cliente,
      funil: cell(linha, i.funil),
      sdr: cell(linha, i.sdr),
      mentor: cell(linha, i.mentor),
      produto: cell(linha, i.produto),
      formaDePagamento: cell(linha, i.formaDePagamento),
      entrada: parseMoney(cell(linha, i.entrada)),
      total,
      painelId: painelPorEmpresa(ht.paineis, rawEmpresa),
      rawEmpresa,
    });
  }
  return vendas;
}

function lerLeads(ht: HighTicketConfig, linhas: string[][]): LeadHighTicket[] {
  const inicio = ht.sources.leads.headerRow - 1;
  const cabecalho = linhas[inicio] ?? [];
  const iData = resolveColumnIndex(ht.sources.leads.columns.data, cabecalho);
  const iEmpresa = resolveColumnIndex(ht.sources.leads.columns.empresa, cabecalho);

  const leads: LeadHighTicket[] = [];
  for (let n = inicio + 1; n < linhas.length; n += 1) {
    const linha = linhas[n];
    if (!linha || linha.length === 0) continue;
    const rawEmpresa = cell(linha, iEmpresa);
    const data = parseDate(cell(linha, iData));
    if (!rawEmpresa && !data) continue;
    leads.push({ data, rawEmpresa, painelId: painelPorEmpresa(ht.paineis, rawEmpresa) });
  }
  return leads;
}

function lerTrafego(ht: HighTicketConfig, linhas: string[][]): GastoHighTicket[] {
  const inicio = ht.sources.trafego.headerRow - 1;
  const cabecalho = linhas[inicio] ?? [];
  const iData = resolveColumnIndex(ht.sources.trafego.columns.data, cabecalho);
  const iCampanha = resolveColumnIndex(ht.sources.trafego.columns.campanha, cabecalho);
  const iCusto = resolveColumnIndex(ht.sources.trafego.columns.custo, cabecalho);

  const gastos: GastoHighTicket[] = [];
  for (let n = inicio + 1; n < linhas.length; n += 1) {
    const linha = linhas[n];
    if (!linha || linha.length === 0) continue;
    const campanha = cell(linha, iCampanha);
    const data = parseDate(cell(linha, iData));
    // Sem data valida a linha nao pertence a tabela diaria (rodape, totais).
    if (!data || !campanha) continue;
    gastos.push({
      data,
      campanha,
      custo: parseMoney(cell(linha, iCusto)),
      painelId: painelPorCampanha(ht.paineis, campanha),
    });
  }
  return gastos;
}

async function lerAba(
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

/* ===================== Calculo ===================== */

function noPeriodo(data: string | null, from: string, to: string): boolean {
  if (!data) return false;
  return data >= from && data <= to;
}

/**
 * Agrupa as vendas por uma coluna de texto (funil, vendedor ou produto).
 *
 * Vazio vira um rotulo explicito em vez de sumir: uma venda de R$ 15 mil com o
 * funil em branco tem de aparecer na tabela, senao a soma da tabela nao bate com
 * o faturamento do topo e ninguem descobre por que.
 */
function agrupar(
  vendas: VendaHighTicket[],
  chaveDe: (venda: VendaHighTicket) => string,
  rotuloVazio: string,
): GrupoHighTicket[] {
  const grupos = new Map<string, GrupoHighTicket>();
  for (const venda of vendas) {
    const chave = chaveDe(venda).trim() || rotuloVazio;
    const atual = grupos.get(chave) ?? { chave, vendas: 0, entrada: 0, total: 0 };
    atual.vendas += 1;
    atual.entrada += venda.entrada;
    atual.total += venda.total;
    grupos.set(chave, atual);
  }
  return [...grupos.values()]
    .map((grupo) => ({ ...grupo, entrada: round2(grupo.entrada), total: round2(grupo.total) }))
    .sort((a, b) => b.total - a.total || b.vendas - a.vendas);
}

/** Um ponto por dia com movimento. Dia parado nao vira ponto: a serie e curta. */
function serieDiaria(vendas: VendaHighTicket[]): PontoHighTicket[] {
  const porDia = new Map<string, PontoHighTicket>();
  for (const venda of vendas) {
    if (!venda.data) continue;
    const ponto = porDia.get(venda.data) ?? { data: venda.data, faturamento: 0, vendas: 0 };
    ponto.faturamento += venda.total;
    ponto.vendas += 1;
    porDia.set(venda.data, ponto);
  }
  return [...porDia.values()]
    .map((ponto) => ({ ...ponto, faturamento: round2(ponto.faturamento) }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

function contar(valores: string[]): ValorNaoClassificado[] {
  const contagem = new Map<string, number>();
  for (const valor of valores) {
    const chave = valor.trim() || '(em branco)';
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([valor, linhas]) => ({ valor, linhas }))
    .sort((a, b) => b.linhas - a.linhas);
}

export function computeHighTicket(
  config: AppConfig,
  dados: DadosHighTicket | null,
  filtro: { from: string; to: string },
): RespostaHighTicket {
  const paineis = config.highTicket?.paineis ?? [];
  const { from, to } = filtro;

  const vendasNoPeriodo = (dados?.vendas ?? []).filter((v) => noPeriodo(v.data, from, to));
  const leadsNoPeriodo = (dados?.leads ?? []).filter((l) => noPeriodo(l.data, from, to));
  const gastosNoPeriodo = (dados?.trafego ?? []).filter((g) => noPeriodo(g.data, from, to));

  const metricas: MetricasHighTicket[] = paineis.map((painel) => {
    const vendas = vendasNoPeriodo.filter((v) => v.painelId === painel.id);
    const leads = leadsNoPeriodo.filter((l) => l.painelId === painel.id).length;
    const investimento = round2(
      gastosNoPeriodo
        .filter((g) => g.painelId === painel.id)
        .reduce((soma, g) => soma + g.custo, 0),
    );
    const faturamento = round2(vendas.reduce((soma, v) => soma + v.total, 0));
    const emCaixa = round2(vendas.reduce((soma, v) => soma + v.entrada, 0));

    const clientes: ClienteHighTicket[] = vendas
      .slice()
      .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
      .map((v) => ({
        data: v.data,
        dataLead: v.dataLead,
        dataCall: v.dataCall,
        cliente: v.cliente,
        funil: v.funil,
        formaDePagamento: v.formaDePagamento,
        sdr: v.sdr,
        mentor: v.mentor,
        produto: v.produto,
        total: v.total,
      }));

    return {
      painelId: painel.id,
      label: painel.label,
      investimento,
      leads,
      custoPorLead: leads > 0 ? round2(investimento / leads) : null,
      faturamento,
      emCaixa,
      vendas: vendas.length,
      porFunil: agrupar(vendas, (v) => v.funil, 'Sem funil'),
      porVendedor: agrupar(vendas, (v) => v.mentor, 'Sem vendedor'),
      porProduto: agrupar(vendas, (v) => v.produto, 'Sem produto'),
      serie: serieDiaria(vendas),
      clientes,
    };
  });

  return {
    paineis: metricas,
    filtro: { from, to },
    fetchedAt: dados?.fetchedAt ?? null,
    falhas: dados?.falhas ?? [],
    naoClassificado: {
      vendas: contar(vendasNoPeriodo.filter((v) => !v.painelId).map((v) => v.rawEmpresa)),
      leads: contar(leadsNoPeriodo.filter((l) => !l.painelId).map((l) => l.rawEmpresa)),
      custoSemPainel: round2(
        gastosNoPeriodo.filter((g) => !g.painelId).reduce((soma, g) => soma + g.custo, 0),
      ),
    },
  };
}
