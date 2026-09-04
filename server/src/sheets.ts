/**
 * Leitura das planilhas via Google Sheets API.
 *
 * Le SEMPRE aba por aba (spreadsheets.values.get com o range da aba). A planilha
 * "BASE DE LEADS" tem quase 3 MB e varios anos de historico de outros produtos;
 * exportar o arquivo inteiro trava e trunca antes de chegar nas abas que
 * interessam. Pedindo a aba isolada, cada leitura fica pequena e confiavel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';
import { ROOT } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

let cachedClient: JWT | null = null;
let credentialsChecked = false;
let credentialsAvailable = false;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function readCredentials(): ServiceAccountKey | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) {
    try {
      return JSON.parse(inline) as ServiceAccountKey;
    } catch (error) {
      console.error('[sheets] GOOGLE_SERVICE_ACCOUNT_JSON nao e um JSON valido:', error);
      return null;
    }
  }

  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(ROOT, 'credentials', 'google-service-account.json'),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as ServiceAccountKey;
      } catch (error) {
        console.error(`[sheets] nao consegui ler ${file}:`, error);
      }
    }
  }
  return null;
}

/** Verdadeiro quando a chave do Google esta configurada. Sem ela o painel roda em modo demonstracao. */
export function hasCredentials(): boolean {
  if (!credentialsChecked) {
    credentialsAvailable = readCredentials() !== null;
    credentialsChecked = true;
  }
  return credentialsAvailable;
}

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const key = readCredentials();
  if (!key) throw new Error('Credenciais do Google nao configuradas');
  cachedClient = new JWT({
    email: key.client_email,
    key: key.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  return cachedClient;
}

/** Le uma aba inteira e devolve a matriz de celulas ja como texto formatado. */
export async function readTab(spreadsheetId: string, tab: string): Promise<string[][]> {
  const client = getClient();
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}` +
    '?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

  const response = await client.request<{ values?: string[][] }>({ url });
  return response.data.values ?? [];
}

/** Nomes de todas as abas — usado pela tela de diagnostico para conferir a grafia. */
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const client = getClient();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    '?fields=sheets.properties.title';
  const response = await client.request<{
    sheets?: Array<{ properties?: { title?: string } }>;
  }>({ url });
  return (response.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));
}

/** E-mail da conta de robo — o usuario precisa compartilhar as planilhas com ele. */
export function serviceAccountEmail(): string | null {
  const key = readCredentials();
  return key?.client_email ?? null;
}
