import type { AppConfig, CampanhaResumo, MetricsResponse } from '../../shared/types';

export interface EstadoApp {
  demo: boolean;
  fetchedAt: string | null;
  versao: number;
  erro: string | null;
  falhas: string[];
  ticketPrice: number;
  eventLines: Array<{
    id: string;
    label: string;
    editions: Array<{
      id: string;
      label: string;
      current: boolean;
      /** Primeiro e ultimo dia em que a edicao vendeu, quando houve venda. */
      periodoDeVendas: { de: string; ate: string } | null;
    }>;
  }>;
}

async function pedir<T>(url: string, options?: RequestInit): Promise<T> {
  const resposta = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}) as { erro?: string });
    throw new Error(corpo.erro ?? `Erro ${resposta.status} ao falar com o servidor`);
  }
  return (await resposta.json()) as T;
}

export const api = {
  estado: () => pedir<EstadoApp>('/api/state'),
  metricas: (params: {
    line: string;
    edition?: string;
    from: string;
    to: string;
    campanhas: string[];
  }) => {
    const busca = new URLSearchParams({ line: params.line, from: params.from, to: params.to });
    if (params.edition) busca.set('edition', params.edition);
    // Nome de campanha tem virgula, colchete e espaco: um parametro por campanha
    // evita ter de inventar um separador que nao exista nos nomes.
    for (const campanha of params.campanhas) busca.append('campanha', campanha);
    return pedir<MetricsResponse>(`/api/metrics?${busca.toString()}`);
  },
  campanhas: (params: { from: string; to: string }) =>
    pedir<{ campanhas: CampanhaResumo[] }>(`/api/campanhas?${new URLSearchParams(params).toString()}`),
  config: () => pedir<AppConfig>('/api/config'),
  salvarConfig: (config: AppConfig) =>
    pedir<AppConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config) }),
  restaurarConfig: () => pedir<AppConfig>('/api/config/reset', { method: 'POST' }),
  atualizarAgora: () => pedir<{ ok: boolean }>('/api/refresh', { method: 'POST' }),
  diagnostico: () => pedir<Record<string, unknown>>('/api/diagnostics'),
};

/** Conexao ao vivo: o servidor avisa sempre que as planilhas mudam. */
export function conectarAoVivo(aoAtualizar: () => void): () => void {
  let socket: WebSocket | null = null;
  let tentativa = 0;
  let timer: number | undefined;
  let encerrado = false;

  const conectar = () => {
    if (encerrado) return;
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocolo}://${location.host}/ws`);

    socket.onmessage = (evento) => {
      try {
        const dados = JSON.parse(evento.data as string) as { tipo?: string };
        if (dados.tipo === 'dados-atualizados') aoAtualizar();
      } catch {
        /* mensagem fora do formato esperado: ignorar */
      }
    };
    socket.onopen = () => {
      tentativa = 0;
    };
    socket.onclose = () => {
      if (encerrado) return;
      // Reconecta com espera crescente, no maximo 30s.
      const espera = Math.min(30000, 1000 * 2 ** tentativa);
      tentativa += 1;
      timer = window.setTimeout(conectar, espera);
    };
    socket.onerror = () => socket?.close();
  };

  conectar();

  return () => {
    encerrado = true;
    if (timer) window.clearTimeout(timer);
    socket?.close();
  };
}
