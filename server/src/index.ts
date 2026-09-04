/** Servidor do painel: API REST + WebSocket + entrega da interface. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { store } from './store.js';
import { ROOT } from './config.js';
import { computeMetrics, listDays } from './metrics.js';
import { lookupTab } from './normalize.js';
import { hasCredentials, listTabs, serviceAccountEmail } from './sheets.js';
import type { AppConfig, MetricsResponse } from '../../shared/types.js';

const PORT = Number(process.env.PORT ?? 3000);
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN ?? '';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, versao: store.getVersion(), demo: !hasCredentials() });
});

/** Estado geral: usado pela interface para montar os seletores. */
app.get('/api/state', (_req, res) => {
  const data = store.getData();
  res.json({
    demo: !hasCredentials(),
    fetchedAt: data?.fetchedAt ?? null,
    versao: store.getVersion(),
    erro: store.getLastError(),
    falhas: data?.falhas ?? [],
    ticketPrice: store.getConfig().ticketPrice,
    eventLines: store.getConfig().eventLines.map((line) => ({
      id: line.id,
      label: line.label,
      editions: line.editions.map((edition) => ({
        id: edition.id,
        label: edition.label,
        current: edition.current,
      })),
    })),
  });
});

app.get('/api/metrics', (req, res) => {
  const data = store.getData();
  if (!data) {
    res.status(503).json({ erro: 'As planilhas ainda nao foram lidas. Tente de novo em instantes.' });
    return;
  }

  const config = store.getConfig();
  const hoje = new Date().toISOString().slice(0, 10);
  const from = normalizeDateParam(req.query.from, defaultFrom());
  const to = normalizeDateParam(req.query.to, hoje);
  const lineId = String(req.query.line ?? config.eventLines[0]?.id ?? 'todos');
  const editionParam = req.query.edition ? String(req.query.edition) : '';
  const editionId = editionParam && editionParam !== 'todas' ? editionParam : null;

  if (listDays(from, to).length === 0) {
    res.status(400).json({ erro: 'Intervalo de datas invalido: a data inicial precisa vir antes da final.' });
    return;
  }

  const { metrics, warnings } = computeMetrics(config, data, { lineId, editionId, from, to });
  const resposta: MetricsResponse = {
    metrics,
    filtro: { lineId, editionId, from, to },
    fetchedAt: data.fetchedAt,
    warnings: [...data.warnings, ...warnings],
    falhas: data.falhas,
    demo: !hasCredentials(),
  };
  res.json(resposta);
});

app.get('/api/config', (_req, res) => {
  res.json(store.getConfig());
});

app.put('/api/config', async (req, res) => {
  try {
    const saved = await store.updateConfig(req.body as AppConfig);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ erro: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/config/reset', async (_req, res) => {
  try {
    res.json(await store.restoreDefaultConfig());
  } catch (error) {
    res.status(500).json({ erro: error instanceof Error ? error.message : String(error) });
  }
});

/** Diagnostico: confere a chave e lista as abas reais de cada planilha. */
app.get('/api/diagnostics', async (_req, res) => {
  const config = store.getConfig();
  const resultado: Record<string, unknown> = {
    chaveConfigurada: hasCredentials(),
    contaDeServico: serviceAccountEmail(),
    ultimoErro: store.getLastError(),
  };

  if (hasCredentials()) {
    const ids = [
      ['leads', config.sources.leads.spreadsheetId, config.sources.leads.tab],
      ['buyers', config.sources.buyers.spreadsheetId, config.sources.buyers.tab],
      ['traffic', config.sources.traffic.spreadsheetId, config.sources.traffic.tab],
    ] as const;
    const vistos = new Map<string, string[] | string>();
    for (const [, id] of ids) {
      if (vistos.has(id)) continue;
      try {
        vistos.set(id, await listTabs(id));
      } catch (error) {
        vistos.set(id, `erro: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    resultado.planilhas = ids.map(([fonte, id, aba]) => {
      const abas = vistos.get(id);
      const busca = Array.isArray(abas) ? lookupTab(aba, abas) : null;
      return {
        fonte,
        spreadsheetId: id,
        abaConfigurada: aba,
        abasEncontradas: abas,
        // O Google ignora maiusculas/minusculas, mas nao ignora acentos.
        abaExiste: busca ? busca.encontrada : null,
        grafiaExata: busca ? busca.exata : null,
        nomeRealDaAba: busca ? busca.nomeReal : null,
        sugestao: busca && !busca.encontrada ? busca.sugestao : null,
      };
    });
  }

  res.json(resultado);
});

/** Recebe o aviso do Google Apps Script de que uma planilha foi editada. */
app.post('/api/webhook/sheets', async (req, res) => {
  const token = String(req.query.token ?? req.header('x-webhook-token') ?? '');
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
    res.status(401).json({ erro: 'token invalido' });
    return;
  }
  res.json({ ok: true });
  await store.refresh('aviso da planilha');
});

/** Botao "atualizar agora" da interface. */
app.post('/api/refresh', async (_req, res) => {
  await store.refresh('pedido manual');
  res.json({ ok: true, versao: store.getVersion(), erro: store.getLastError() });
});

// --- Interface ---
const webDist = path.join(ROOT, 'dist', 'web');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket: WebSocket) => {
  socket.send(JSON.stringify({ tipo: 'ola', versao: store.getVersion() }));
  const unsubscribe = store.subscribe((versao) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ tipo: 'dados-atualizados', versao }));
    }
  });
  socket.on('close', unsubscribe);
  socket.on('error', unsubscribe);
});

store.start();

server.listen(PORT, () => {
  console.log(`[servidor] painel disponivel na porta ${PORT}`);
  if (!hasCredentials()) {
    console.log('[servidor] MODO DEMONSTRACAO: configure a chave do Google para ver os numeros reais.');
  }
});

function normalizeDateParam(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
}
