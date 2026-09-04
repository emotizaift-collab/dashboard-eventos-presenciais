/**
 * Grava quando e de qual commit o build foi gerado.
 *
 * Sem isso nao da para saber se o que esta no ar e a versao nova ou a antiga —
 * e um aviso que nao aparece fica ambiguo: ou o problema nao existe, ou o
 * deploy nao chegou. Essa duvida ja custou tempo uma vez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function git(comando) {
  try {
    return execSync(comando, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

const info = {
  compiladoEm: new Date().toISOString(),
  commit: process.env.RENDER_GIT_COMMIT ?? git('git rev-parse --short HEAD') ?? 'desconhecido',
  branch: process.env.RENDER_GIT_BRANCH ?? git('git rev-parse --abbrev-ref HEAD') ?? 'desconhecido',
};

const destino = path.join(process.cwd(), 'dist', 'build-info.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(info, null, 2), 'utf8');
console.log('[build-info]', JSON.stringify(info));
