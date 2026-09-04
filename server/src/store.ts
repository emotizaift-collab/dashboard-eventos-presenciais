/**
 * Guarda em memoria a configuracao e a ultima leitura das planilhas.
 *
 * As planilhas sao lidas:
 *  - quando o servidor sobe;
 *  - quando o Apps Script avisa que a planilha mudou (webhook);
 *  - de tempos em tempos, como rede de seguranca caso um aviso se perca.
 */
import type { AppConfig, DataSet } from '../../shared/types.js';
import { loadConfig, saveConfig, resetConfig } from './config.js';
import { fetchDataSet } from './loader.js';

type Listener = (version: number) => void;

const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS ?? 5 * 60 * 1000);

class Store {
  private config: AppConfig = loadConfig();
  private data: DataSet | null = null;
  private version = 0;
  private listeners = new Set<Listener>();
  private pending: Promise<void> | null = null;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  getConfig(): AppConfig {
    return this.config;
  }

  getData(): DataSet | null {
    return this.data;
  }

  getVersion(): number {
    return this.version;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async updateConfig(next: AppConfig): Promise<AppConfig> {
    this.config = saveConfig(next);
    await this.refresh('configuracao alterada');
    return this.config;
  }

  async restoreDefaultConfig(): Promise<AppConfig> {
    this.config = resetConfig();
    await this.refresh('configuracao restaurada');
    return this.config;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Chamadas simultaneas compartilham a mesma leitura em andamento. */
  async refresh(motivo: string): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.doRefresh(motivo).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doRefresh(motivo: string): Promise<void> {
    try {
      const data = await fetchDataSet(this.config);
      this.data = data;
      this.lastError = null;
      this.version += 1;
      console.log(
        `[store] atualizado (${motivo}): ${data.leads.length} leads, ` +
          `${data.buyers.length} compradores, ${data.traffic.length} linhas de trafego`,
      );
      for (const listener of this.listeners) listener(this.version);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[store] falha ao atualizar (${motivo}):`, this.lastError);
    }
  }

  start(): void {
    void this.refresh('inicializacao');
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.refresh('verificacao periodica'), REFRESH_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const store = new Store();
