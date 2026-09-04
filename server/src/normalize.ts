/**
 * Normalizacao de texto, datas e dinheiro vindos das planilhas.
 * As planilhas sao preenchidas a mao, entao tudo aqui e defensivo.
 */

/** Minusculas, sem acento, sem pontuacao, espacos colapsados. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai as tags entre colchetes de um nome de campanha: "[PAI] [VENDAS] x" -> ["pai","vendas"]. */
export function extractTags(value: unknown): string[] {
  const raw = String(value ?? '');
  const tags: string[] = [];
  for (const match of raw.matchAll(/\[([^\]]*)\]/g)) {
    const tag = normalizeText(match[1]);
    if (tag) tags.push(tag);
  }
  return tags;
}

/**
 * Converte a data da planilha para "YYYY-MM-DD".
 * Aceita DD/MM/AAAA, DD/MM/AA, AAAA-MM-DD, com ou sem hora, e o numero serial do Sheets.
 */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Numero serial do Google Sheets (dias desde 30/12/1899).
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    // Faixa plausivel: 1980 (29221) ate 2100 (73050). Fora disso e outro tipo de numero.
    if (serial >= 29221 && serial <= 73050) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) year = `20${year}`;
    if (Number(month) < 1 || Number(month) > 12) return null;
    if (Number(day) < 1 || Number(day) > 31) return null;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Converte dinheiro em formato brasileiro para numero.
 * Aceita "R$ 1.788,09", "-R$ 1,50", "\\-R$ 1,50", "1788.09" e vazio.
 */
export function parseMoney(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let raw = String(value).trim();
  if (!raw) return 0;

  const negative = /-/.test(raw.replace(/[^\-\d]/g, '')) || /^\\?-/.test(raw) || /\(.*\)/.test(raw);
  raw = raw.replace(/[^\d,.]/g, '');
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Formato brasileiro: ponto e milhar, virgula e decimal.
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato americano: virgula e milhar.
    raw = raw.replace(/,/g, '');
  } else {
    raw = raw.replace(/,/g, '');
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

/** "A" -> 0, "B" -> 1, "AA" -> 26. */
export function columnLetterToIndex(letter: string): number {
  let index = 0;
  for (const char of letter.toUpperCase()) {
    if (char < 'A' || char > 'Z') continue;
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Resolve a posicao de uma coluna.
 * Aceita "A" (letra fixa) ou "auto:Evento" (procura pelo titulo na linha de cabecalho).
 */
export function resolveColumnIndex(spec: string, header: string[]): number {
  if (spec.startsWith('auto:')) {
    const wanted = normalizeText(spec.slice(5));
    const found = header.findIndex((cell) => normalizeText(cell) === wanted);
    if (found >= 0) return found;
    const partial = header.findIndex((cell) => normalizeText(cell).includes(wanted) && wanted.length >= 3);
    return partial;
  }
  return columnLetterToIndex(spec);
}
