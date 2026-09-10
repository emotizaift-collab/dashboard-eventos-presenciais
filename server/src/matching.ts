/**
 * Decide a qual linha de evento / edicao pertence cada linha da planilha.
 *
 * A regra e conservadora de proposito: siglas curtas (PAI, DAI, DI) so casam
 * quando aparecem como tag entre colchetes ou como a celula inteira. Isso evita
 * que "PAI" case por acidente dentro de outra palavra. Nomes por extenso
 * (5 letras ou mais) tambem casam por conteudo.
 */
import { normalizeText, extractTags } from './normalize.js';
import type { AppConfig, EventEdition, TicketKind } from '../../shared/types.js';

export interface EditionMatch {
  lineId: string;
  editionId: string;
}

interface CompiledAlias {
  lineId: string;
  editionId: string;
  alias: string;
  vigenciaDe?: string;
  vigenciaAte?: string;
}

interface CompiledTicketAlias {
  kind: TicketKind;
  /** Palavras do apelido, ja normalizadas. */
  palavras: string[];
  cadeiras: number;
  /**
   * Quanto este apelido "explica" a celula. Palavra generica pesa pouco.
   * Ver o calculo do peso em compileMatcher.
   */
  peso: number;
}

export interface CompiledMatcher {
  aliases: CompiledAlias[];
  ticketTypes: CompiledTicketAlias[];
}

const MIN_LENGTH_FOR_CONTAINS = 5;

export function compileMatcher(config: AppConfig): CompiledMatcher {
  const aliases: CompiledAlias[] = [];
  for (const line of config.eventLines) {
    for (const edition of line.editions) {
      for (const alias of edition.aliases) {
        const normalized = normalizeText(alias);
        if (normalized) {
          aliases.push({
          lineId: line.id,
          editionId: edition.id,
          alias: normalized,
          vigenciaDe: edition.vigencia?.de,
          vigenciaAte: edition.vigencia?.ate,
        });
        }
      }
    }
  }
  // Aliases mais longos primeiro: "pai 147" deve ganhar de "pai".
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  const ticketTypes: CompiledTicketAlias[] = [];
  for (const tipo of config.ticketTypes) {
    for (const alias of tipo.aliases) {
      const normalized = normalizeText(alias);
      if (normalized) {
        ticketTypes.push({
          kind: tipo.id,
          palavras: normalized.split(' ').filter(Boolean),
          cadeiras: tipo.cadeiras,
          peso: 0,
        });
      }
    }
  }

  // Peso de cada palavra: 1 dividido pelo numero de tipos que a usam.
  //
  // "ingresso" aparece em individual, duplo, triplo e vip, entao nao distingue
  // nada e vale pouco. "vip" so aparece nos tipos VIP e "triplo" so em triplo e
  // vip-triplo, entao ambos valem muito. E isso que faz "INGRESSO VIP TRIPLO"
  // cair em VIP triplo, e nao em "ingresso triplo" ou "ingresso vip", que
  // tambem casam duas palavras mas explicam menos a celula.
  const tiposPorPalavra = new Map<string, Set<string>>();
  for (const entry of ticketTypes) {
    for (const palavra of entry.palavras) {
      const tipos = tiposPorPalavra.get(palavra) ?? new Set<string>();
      tipos.add(entry.kind);
      tiposPorPalavra.set(palavra, tipos);
    }
  }
  for (const entry of ticketTypes) {
    entry.peso = entry.palavras.reduce(
      (total, palavra) => total + 1 / (tiposPorPalavra.get(palavra)?.size ?? 1),
      0,
    );
  }

  return { aliases, ticketTypes };
}

/**
 * Casa um texto livre (nome de campanha ou nome de evento) com uma edicao.
 * Retorna null quando nada casa — esses valores viram "nao classificado" no painel.
 */
export function matchEdition(
  matcher: CompiledMatcher,
  value: unknown,
  /** Data da linha, em AAAA-MM-DD. Necessaria para apelidos com vigencia. */
  data?: string | null,
): EditionMatch | null {
  const text = normalizeText(value);
  if (!text) return null;
  const tags = extractTags(value);

  let best: { match: EditionMatch; score: number; length: number } | null = null;

  for (const entry of matcher.aliases) {
    if (entry.vigenciaDe || entry.vigenciaAte) {
      // Sem data nao da para conferir a janela: melhor nao casar do que chutar.
      if (!data) continue;
      if (entry.vigenciaDe && data < entry.vigenciaDe) continue;
      if (entry.vigenciaAte && data > entry.vigenciaAte) continue;
    }

    let score = 0;

    if (text === entry.alias) {
      score = 3;
    } else if (tags.includes(entry.alias)) {
      score = 3;
    } else if (
      entry.alias.length >= MIN_LENGTH_FOR_CONTAINS &&
      containsWholeToken(text, entry.alias)
    ) {
      score = 2;
    } else if (
      entry.alias.length >= MIN_LENGTH_FOR_CONTAINS &&
      tags.some((tag) => tag.includes(entry.alias))
    ) {
      // Ex.: alias "anima" dentro da tag "animaday".
      score = 2;
    }

    if (score === 0) continue;

    const isBetter =
      !best || score > best.score || (score === best.score && entry.alias.length > best.length);
    if (isBetter) {
      best = {
        match: { lineId: entry.lineId, editionId: entry.editionId },
        score,
        length: entry.alias.length,
      };
    }
  }

  return best ? best.match : null;
}

/** Verifica se o alias aparece como palavra(s) inteira(s) dentro do texto. */
function containsWholeToken(text: string, alias: string): boolean {
  if (!text.includes(alias)) return false;
  const before = text.indexOf(alias) - 1;
  const after = text.indexOf(alias) + alias.length;
  const charBefore = before >= 0 ? text[before] : ' ';
  const charAfter = after < text.length ? text[after] : ' ';
  return charBefore === ' ' && charAfter === ' ';
}

/**
 * Classifica o texto livre da coluna "tipo de ingresso".
 *
 * A regra e por PALAVRAS, nao por trecho de texto: um apelido casa quando todas
 * as palavras dele aparecem na celula, em qualquer ordem. Vence o apelido que
 * mais explica a celula, somando o peso de cada palavra (palavra generica como
 * "ingresso" pesa pouco; "vip" e "triplo" pesam muito) e, no empate, o ingresso
 * que leva mais gente.
 *
 * A regra anterior era "apelido mais longo em caracteres ganha", e ela errava
 * feio: em "INGRESSO VIP TRIPLO" o apelido "ingresso vip" (12 caracteres) batia
 * "vip triplo" (10) e a venda virava um VIP simples, cobrando um terco do
 * valor. "TRIPLO VIP" caia em "triplo" por causa da ordem invertida das
 * palavras. Nenhum dos dois casos aparecia como nao reconhecido — o numero
 * saia errado em silencio, que e o pior jeito de errar.
 */
export function matchTicketKind(matcher: CompiledMatcher, value: unknown): TicketKind | null {
  const text = normalizeText(value);
  if (!text) return null;
  const palavrasDaCelula = new Set(text.split(' ').filter(Boolean));

  let melhor: { kind: TicketKind; peso: number; cadeiras: number } | null = null;
  for (const entry of matcher.ticketTypes) {
    if (!entry.palavras.every((palavra) => palavrasDaCelula.has(palavra))) continue;
    const melhorQue =
      !melhor ||
      entry.peso > melhor.peso + 1e-9 ||
      (Math.abs(entry.peso - melhor.peso) < 1e-9 && entry.cadeiras > melhor.cadeiras);
    if (melhorQue) melhor = { kind: entry.kind, peso: entry.peso, cadeiras: entry.cadeiras };
  }
  return melhor ? melhor.kind : null;
}

/** Todas as edicoes de uma linha de evento, ou de todas as linhas. */
export function editionsOfLine(config: AppConfig, lineId: string): EventEdition[] {
  if (lineId === 'todos') return config.eventLines.flatMap((line) => line.editions);
  const line = config.eventLines.find((item) => item.id === lineId);
  return line ? line.editions : [];
}
