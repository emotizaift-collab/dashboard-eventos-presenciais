/**
 * Carrega e grava a configuracao do painel.
 *
 * config/event-config.default.json  -> padrao versionado no repositorio
 * data/event-config.json            -> o que a interface grava (tem prioridade)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, TicketTypeConfig } from '../../shared/types.js';

/**
 * Raiz do projeto. Sobe os diretorios ate achar o package.json, para funcionar
 * tanto rodando o TypeScript direto (server/src) quanto o build (dist/server/src).
 */
function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const ROOT = findRoot();

const DEFAULT_PATH = path.join(ROOT, 'config', 'event-config.default.json');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const OVERRIDE_PATH = path.join(DATA_DIR, 'event-config.json');

function readJson(file: string): AppConfig {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as AppConfig;
}

export function loadDefaultConfig(): AppConfig {
  return readJson(DEFAULT_PATH);
}

export function loadConfig(): AppConfig {
  if (fs.existsSync(OVERRIDE_PATH)) {
    try {
      return validateConfig(readJson(OVERRIDE_PATH));
    } catch (error) {
      console.error('[config] arquivo salvo invalido, usando o padrao:', error);
    }
  }
  return validateConfig(loadDefaultConfig());
}

export function saveConfig(config: AppConfig): AppConfig {
  const validated = validateConfig(config);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OVERRIDE_PATH, JSON.stringify(validated, null, 2), 'utf8');
  return validated;
}

export function resetConfig(): AppConfig {
  if (fs.existsSync(OVERRIDE_PATH)) fs.rmSync(OVERRIDE_PATH);
  return loadConfig();
}

/** Barra configuracoes quebradas antes que elas derrubem o painel. */
export function validateConfig(config: AppConfig): AppConfig {
  if (typeof config.ticketPrice !== 'number' || !(config.ticketPrice > 0)) {
    throw new Error('ticketPrice precisa ser um numero maior que zero');
  }
  if (!Array.isArray(config.eventLines) || config.eventLines.length === 0) {
    throw new Error('e preciso ter pelo menos uma linha de evento');
  }

  const lineIds = new Set<string>();
  const editionIds = new Set<string>();
  for (const line of config.eventLines) {
    if (!line.id || !line.label) throw new Error('toda linha de evento precisa de id e nome');
    if (line.id === 'todos') throw new Error('"todos" e um id reservado');
    if (lineIds.has(line.id)) throw new Error(`linha de evento duplicada: ${line.id}`);
    lineIds.add(line.id);

    if (!Array.isArray(line.editions) || line.editions.length === 0) {
      throw new Error(`a linha "${line.label}" precisa de pelo menos uma edicao`);
    }
    for (const edition of line.editions) {
      if (!edition.id || !edition.label) throw new Error('toda edicao precisa de id e nome');
      if (editionIds.has(edition.id)) throw new Error(`edicao duplicada: ${edition.id}`);
      editionIds.add(edition.id);
      if (!Array.isArray(edition.aliases)) edition.aliases = [];
      edition.aliases = edition.aliases.map((alias) => String(alias).trim()).filter(Boolean);
      edition.current = Boolean(edition.current);
    }
  }

  config.ticketTypes = migrarTiposDeIngresso(config.ticketTypes);
  if (config.ticketTypes.length === 0) {
    throw new Error('e preciso ter pelo menos um tipo de ingresso');
  }
  const tipoIds = new Set<string>();
  for (const tipo of config.ticketTypes) {
    if (!tipo.id || !tipo.label) throw new Error('todo tipo de ingresso precisa de id e nome');
    if (tipoIds.has(tipo.id)) throw new Error(`tipo de ingresso duplicado: ${tipo.id}`);
    tipoIds.add(tipo.id);
    if (!Array.isArray(tipo.aliases)) tipo.aliases = [];
    tipo.aliases = tipo.aliases.map((alias) => String(alias).trim()).filter(Boolean);
    if (typeof tipo.cadeiras !== 'number' || tipo.cadeiras < 0 || !Number.isInteger(tipo.cadeiras)) {
      throw new Error(`"${tipo.label}": cadeiras precisa ser um numero inteiro de 0 para cima`);
    }
    if (tipo.preco !== null && (typeof tipo.preco !== 'number' || tipo.preco < 0)) {
      throw new Error(`"${tipo.label}": preco precisa ser um numero de 0 para cima, ou vazio`);
    }
    tipo.contaComoVenda = Boolean(tipo.contaComoVenda);
    if (tipo.contaComoVenda && tipo.cadeiras === 0) {
      throw new Error(
        `"${tipo.label}" conta como venda mas ocupa 0 cadeiras. ` +
          'Um ingresso vendido precisa levar pelo menos uma pessoa ao evento.',
      );
    }
  }

  for (const key of ['leads', 'buyers', 'traffic'] as const) {
    const source = config.sources?.[key];
    if (!source?.spreadsheetId || !source?.tab) {
      throw new Error(`a fonte "${key}" precisa de spreadsheetId e nome da aba`);
    }
    if (typeof source.headerRow !== 'number' || source.headerRow < 1) source.headerRow = 1;
  }

  return config;
}

/**
 * Aceita o formato antigo de ticketTypes, um objeto {id: [apelidos]} sem preco
 * nem numero de cadeiras. Existiu antes de o VIP aparecer no dado real; uma
 * configuracao ja salva pela interface ainda pode estar nesse formato.
 */
function migrarTiposDeIngresso(valor: unknown): TicketTypeConfig[] {
  if (Array.isArray(valor)) return valor as TicketTypeConfig[];
  if (!valor || typeof valor !== 'object') return [];

  const CADEIRAS: Record<string, number> = { individual: 1, duplo: 2, triplo: 3 };
  return Object.entries(valor as Record<string, string[]>).map(([id, aliases]) => {
    const cadeiras = CADEIRAS[id] ?? (id === 'cortesia' || id === 'acompanhante' ? 0 : 1);
    return {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      aliases: Array.isArray(aliases) ? aliases : [],
      cadeiras,
      preco: cadeiras === 0 ? 0 : null,
      contaComoVenda: cadeiras > 0,
    };
  });
}
