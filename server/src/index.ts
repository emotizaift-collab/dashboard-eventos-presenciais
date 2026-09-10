/** Servidor do painel: API REST + WebSocket + entrega da interface. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { store } from './store.js';
import { ROOT } from './config.js';
import { computeMetrics, listDays, periodoDeVendas } from './metrics.js';
import { computeHighTicket } from './highticket.js';
import { lookupTab, parseDate, parseMoney, resolveColumnIndex } from './normalize.js';
import { hasCredentials, listTabs, readHeader, readTab, serviceAccountEmail } from './sheets.js';
import type { AppConfig, CampanhaResumo, MetricsResponse } from '../../shared/types.js';

const PORT = Number(process.env.PORT ?? 3000);
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN ?? '';

const app = express();
app.use(express.json({ limit: '1mb' }));

/** De qual commit e de quando e o codigo que esta rodando agora. */
function buildInfo(): Record<string, string> {
  try {
    const arquivo = path.join(ROOT, 'dist', 'build-info.json');
    if (fs.existsSync(arquivo)) {
      return JSON.parse(fs.readFileSync(arquivo, 'utf8')) as Record<string, string>;
    }
  } catch {
    /* build-info e opcional: rodando direto do TypeScript ele nao existe */
  }
  return { compiladoEm: 'desconhecido', commit: 'desconhecido', branch: 'desconhecido' };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    versao: store.getVersion(),
    demo: !hasCredentials(),
    build: buildInfo(),
  });
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
        periodoDeVendas: periodoDeVendas(data, edition.id),
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

  const campanhas = lerCampanhas(req.query.campanha);
  const { metrics, warnings } = computeMetrics(config, data, { lineId, editionId, from, to, campanhas });
  const resposta: MetricsResponse = {
    metrics,
    filtro: { lineId, editionId, from, to, campanhas },
    fetchedAt: data.fetchedAt,
    warnings: [...data.warnings, ...warnings],
    falhas: data.falhas,
    demo: !hasCredentials(),
  };
  res.json(resposta);
});

/**
 * Lista as campanhas de trafego para alimentar o filtro.
 * Ordenadas por custo, que e a ordem util para quem procura onde o dinheiro foi.
 */
app.get('/api/high-ticket', (req, res) => {
  const config = store.getConfig();
  if (!config.highTicket) {
    res.status(404).json({ erro: 'A secao High Ticket nao esta configurada.' });
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const from = normalizeDateParam(req.query.from, defaultFrom());
  const to = normalizeDateParam(req.query.to, hoje);
  if (listDays(from, to).length === 0) {
    res.status(400).json({ erro: 'Intervalo de datas invalido: a data inicial precisa vir antes da final.' });
    return;
  }
  res.json(computeHighTicket(config, store.getHighTicket(), { from, to }));
});

app.get('/api/campanhas', (req, res) => {
  const data = store.getData();
  if (!data) {
    res.status(503).json({ erro: 'As planilhas ainda nao foram lidas. Tente de novo em instantes.' });
    return;
  }
  const config = store.getConfig();
  const hoje = new Date().toISOString().slice(0, 10);
  const from = normalizeDateParam(req.query.from, '2000-01-01');
  const to = normalizeDateParam(req.query.to, hoje);

  const rotulos = new Map(config.eventLines.map((line) => [line.id, line.label]));
  const agrupado = new Map<string, CampanhaResumo>();

  for (const row of data.traffic) {
    if (!row.campaign.trim()) continue;
    if (row.date && (row.date < from || row.date > to)) continue;
    const atual = agrupado.get(row.campaign) ?? {
      nome: row.campaign,
      custo: 0,
      linhas: 0,
      lineId: row.lineId,
      eventoLabel: row.lineId ? (rotulos.get(row.lineId) ?? null) : null,
    };
    atual.custo += row.cost;
    atual.linhas += 1;
    agrupado.set(row.campaign, atual);
  }

  const campanhas = [...agrupado.values()]
    .map((item) => ({ ...item, custo: Math.round((item.custo + Number.EPSILON) * 100) / 100 }))
    .sort((a, b) => b.custo - a.custo);

  res.json({ campanhas, periodo: { from, to } });
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

/**
 * Diagnostico: confere a chave e lista as abas reais de cada planilha.
 *
 * Com ?spreadsheetId=... inspeciona QUALQUER planilha, e nao so as
 * configuradas — serve para avaliar uma fonte candidata (abas e nomes de
 * coluna) antes de trocar a origem dos dados do painel.
 */
app.get('/api/diagnostics', async (req, res) => {
  const config = store.getConfig();

  const idAvulso = typeof req.query.spreadsheetId === 'string' ? req.query.spreadsheetId.trim() : '';
  if (idAvulso) {
    if (!hasCredentials()) {
      res.status(400).json({ erro: 'sem a chave do Google nao da para inspecionar uma planilha' });
      return;
    }
    // Com &aba=...&coluna=..., amostra os valores distintos daquela coluna.
    // Saber QUE textos existem numa coluna e o que decide se os apelidos ja
    // cadastrados continuam valendo, antes de trocar a fonte e descobrir depois.
    const abaAvulsa = typeof req.query.aba === 'string' ? req.query.aba.trim() : '';
    const colunaAvulsa = typeof req.query.coluna === 'string' ? req.query.coluna.trim() : '';
    if (abaAvulsa && colunaAvulsa) {
      try {
        const linhas = await readTab(idAvulso, abaAvulsa);
        const cabecalho = linhas[0] ?? [];
        const indice = resolveColumnIndex(
          /^[A-Z]{1,2}$/i.test(colunaAvulsa) ? colunaAvulsa : `auto:${colunaAvulsa}`,
          cabecalho,
        );
        if (indice < 0) {
          res.status(404).json({ erro: `coluna "${colunaAvulsa}" nao encontrada`, cabecalho });
          return;
        }
        // Recorte opcional por data (um dia com &data=, ou um intervalo com
        // &de=/&ate=) e soma opcional de uma coluna de dinheiro: e o que permite
        // conferir "nesta data, este produto vendeu tanto" e, principalmente,
        // "a partir de tal dia, este nome de evento aparece quantas vezes" —
        // a pergunta que decide a vigencia de um apelido ambiguo.
        const dataFiltro = typeof req.query.data === 'string' ? parseDate(req.query.data.trim()) : null;
        const de = typeof req.query.de === 'string' ? parseDate(req.query.de.trim()) : null;
        const ate = typeof req.query.ate === 'string' ? parseDate(req.query.ate.trim()) : null;
        const filtraPorData = Boolean(dataFiltro || de || ate);
        const colunaData = typeof req.query.colunaData === 'string' ? req.query.colunaData.trim() : 'Data';
        const colunaSoma = typeof req.query.somar === 'string' ? req.query.somar.trim() : '';
        const iData = filtraPorData ? resolveColumnIndex(`auto:${colunaData}`, cabecalho) : -1;
        const iSoma = colunaSoma ? resolveColumnIndex(`auto:${colunaSoma}`, cabecalho) : -1;
        if (filtraPorData && iData < 0) {
          res.status(404).json({ erro: `coluna de data "${colunaData}" nao encontrada`, cabecalho });
          return;
        }
        if (colunaSoma && iSoma < 0) {
          res.status(404).json({ erro: `coluna "${colunaSoma}" nao encontrada`, cabecalho });
          return;
        }

        const contagem = new Map<string, { linhas: number; soma: number }>();
        let consideradas = 0;
        for (let i = 1; i < linhas.length; i += 1) {
          const linha = linhas[i];
          if (!linha) continue;
          if (filtraPorData) {
            const dataDaLinha = parseDate((linha[iData] ?? '').toString());
            if (!dataDaLinha) continue;
            if (dataFiltro && dataDaLinha !== dataFiltro) continue;
            if (de && dataDaLinha < de) continue;
            if (ate && dataDaLinha > ate) continue;
          }
          consideradas += 1;
          const valor = (linha[indice] ?? '').toString().trim();
          if (!valor) continue;
          const atual = contagem.get(valor) ?? { linhas: 0, soma: 0 };
          atual.linhas += 1;
          if (iSoma >= 0) atual.soma += parseMoney((linha[iSoma] ?? '').toString());
          contagem.set(valor, atual);
        }

        res.json({
          spreadsheetId: idAvulso,
          aba: abaAvulsa,
          coluna: cabecalho[indice],
          filtroDeData: dataFiltro,
          recorte: de || ate ? { de, ate } : null,
          colunaSomada: iSoma >= 0 ? cabecalho[iSoma] : null,
          totalDeLinhasNaAba: Math.max(0, linhas.length - 1),
          linhasNoRecorte: consideradas,
          somaTotal: iSoma >= 0
            ? Math.round([...contagem.values()].reduce((t, v) => t + v.soma, 0) * 100) / 100
            : null,
          valores: [...contagem.entries()]
            .map(([valor, v]) => ({ valor, linhas: v.linhas, soma: Math.round(v.soma * 100) / 100 }))
            .sort((a, b) => b.linhas - a.linhas)
            .slice(0, 80),
        });
      } catch (error) {
        res.status(502).json({ erro: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    try {
      const abas = await listTabs(idAvulso);
      const colunasPorAba: Record<string, string[] | string> = {};
      for (const aba of abas) {
        try {
          colunasPorAba[aba] = await readHeader(idAvulso, aba);
        } catch (error) {
          colunasPorAba[aba] = `erro: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      res.json({ spreadsheetId: idAvulso, abas, colunasPorAba });
    } catch (error) {
      res.status(502).json({
        spreadsheetId: idAvulso,
        erro: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
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
    // Nomes reais das colunas: sem isso, "existe a coluna X?" so da para chutar.
    const cabecalhos = new Map<string, string[] | string>();
    await Promise.all(
      ids.map(async ([, id, aba]) => {
        const chave = `${id}::${aba}`;
        try {
          cabecalhos.set(chave, await readHeader(id, aba));
        } catch (error) {
          cabecalhos.set(chave, `erro: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );

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
        colunas: cabecalhos.get(`${id}::${aba}`) ?? null,
      };
    });
  }

  // Todo texto que aparece na coluna de tipo de ingresso, e como o painel leu
  // cada um. E a forma direta de conferir "a planilha diz X, o painel conta Y"
  // sem precisar abrir a planilha.
  const dados = store.getData();
  if (dados) {
    const porValor = new Map<string, { valor: string; linhas: number; lidoComo: string }>();
    for (const row of dados.buyers) {
      const valor = row.rawTicketType.trim();
      if (!valor) continue;
      const atual = porValor.get(valor.toLowerCase()) ?? {
        valor,
        linhas: 0,
        lidoComo: row.ticketKind ?? 'NAO RECONHECIDO',
      };
      atual.linhas += 1;
      porValor.set(valor.toLowerCase(), atual);
    }
    resultado.tiposDeIngressoNaPlanilha = [...porValor.values()].sort((a, b) => b.linhas - a.linhas);
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
/**
 * Rota /api desconhecida responde 404 em JSON.
 *
 * Sem isto, o catch-all da interface devolvia o index.html com status 200 para
 * qualquer caminho — inclusive /api/coisa-que-nao-existe. Um endpoint com erro
 * de digitacao, ou que ainda nao subiu no deploy, parecia estar funcionando.
 */
app.use('/api', (req, res) => {
  res.status(404).json({ erro: `rota nao encontrada: ${req.method} /api${req.path}` });
});

const webDist = path.join(ROOT, 'dist', 'web');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // O resto e a interface: qualquer caminho devolve o index para o React rotear.
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

/** Aceita ?campanha=A&campanha=B e tambem uma unica ocorrencia. */
function lerCampanhas(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((item) => String(item)).filter((item) => item.trim() !== '');
  if (typeof valor === 'string' && valor.trim() !== '') return [valor];
  return [];
}

function normalizeDateParam(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
}
