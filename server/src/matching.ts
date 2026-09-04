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
}

export interface CompiledMatcher {
  aliases: CompiledAlias[];
  ticketTypes: Array<{ kind: TicketKind; alias: string }>;
}

const MIN_LENGTH_FOR_CONTAINS = 5;

export function compileMatcher(config: AppConfig): CompiledMatcher {
  const aliases: CompiledAlias[] = [];
  for (const line of config.eventLines) {
    for (const edition of line.editions) {
      for (const alias of edition.aliases) {
        const normalized = normalizeText(alias);
        if (normalized) {
          aliases.push({ lineId: line.id, editionId: edition.id, alias: normalized });
        }
      }
    }
  }
  // Aliases mais longos primeiro: "pai 147" deve ganhar de "pai".
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  const ticketTypes: Array<{ kind: TicketKind; alias: string }> = [];
  for (const tipo of config.ticketTypes) {
    for (const alias of tipo.aliases) {
      const normalized = normalizeText(alias);
      if (normalized) ticketTypes.push({ kind: tipo.id, alias: normalized });
    }
  }
  // Alias mais longo primeiro: "vip segunda cadeira" tem de ganhar de "vip".
  ticketTypes.sort((a, b) => b.alias.length - a.alias.length);

  return { aliases, ticketTypes };
}

/**
 * Casa um texto livre (nome de campanha ou nome de evento) com uma edicao.
 * Retorna null quando nada casa — esses valores viram "nao classificado" no painel.
 */
export function matchEdition(matcher: CompiledMatcher, value: unknown): EditionMatch | null {
  const text = normalizeText(value);
  if (!text) return null;
  const tags = extractTags(value);

  let best: { match: EditionMatch; score: number; length: number } | null = null;

  for (const entry of matcher.aliases) {
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

/** Classifica o texto livre da coluna "tipo de ingresso". */
export function matchTicketKind(matcher: CompiledMatcher, value: unknown): TicketKind | null {
  const text = normalizeText(value);
  if (!text) return null;
  for (const entry of matcher.ticketTypes) {
    if (text === entry.alias || containsWholeToken(text, entry.alias)) {
      return entry.kind;
    }
  }
  return null;
}

/** Todas as edicoes de uma linha de evento, ou de todas as linhas. */
export function editionsOfLine(config: AppConfig, lineId: string): EventEdition[] {
  if (lineId === 'todos') return config.eventLines.flatMap((line) => line.editions);
  const line = config.eventLines.find((item) => item.id === lineId);
  return line ? line.editions : [];
}
