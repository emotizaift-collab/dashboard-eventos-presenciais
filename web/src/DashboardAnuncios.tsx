import React, { useEffect, useMemo, useState } from 'react';
import type { MetricsResponse } from '../../shared/types';
import { api, type EstadoApp } from './api';
import { dataBr, hoje } from './format';

/**
 * Dashboard de Anúncios — Painel Executivo.
 *
 * Ao escolher um evento, o painel PUXA os números reais das planilhas para o
 * período do próprio evento (o mesmo recorte de "Período desta edição" da aba
 * Eventos Presenciais): investido (custo de campanha), leads, vendas,
 * embaixadores e convidados. Só ficam manuais a Meta (padrão 60) e a Data do
 * evento — e a partir dela o painel calcula os dias que faltam.
 *
 * Derivados:
 *   - Faltam para a meta   = meta − vendas (pode ficar negativo, se passar)
 *   - Total de participantes = embaixadores + convidados + vendas
 *   - Dias até o evento    = a partir da data digitada
 *
 * Meta e Data do evento ficam guardadas no próprio navegador (localStorage), por
 * navegador/dispositivo — não são compartilhadas nem lidas pelo servidor.
 */

const CHAVE = 'ift.dashboard-anuncios.v2';

interface Manual {
  meta: string;
  dataEvento: string; // yyyy-mm-dd
  evento: string; // "linha:todos", "linha:<id>" ou "ed:<id>"
}

const INICIAL: Manual = { meta: '60', dataEvento: '', evento: 'linha:todos' };

function carregar(): Manual {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return { ...INICIAL, ...JSON.parse(bruto) };
  } catch {
    // localStorage pode estar indisponível (aba anônima etc.) — segue com o inicial.
  }
  return INICIAL;
}

const inteiro = (t: string) => {
  const n = parseInt((t || '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const reais = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (n: number) => n.toLocaleString('pt-BR');

function diasAteEvento(data: string): number | null {
  if (!data) return null;
  const evento = new Date(data + 'T00:00:00');
  if (Number.isNaN(evento.getTime())) return null;
  const agora = new Date();
  const hojeD = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((evento.getTime() - hojeD.getTime()) / 86_400_000);
}

/** De qual período puxar os números para o evento selecionado. */
function periodoDoEvento(
  evento: string,
  eventLines: EstadoApp['eventLines'],
): { from: string; to: string } {
  const tudo = { from: '2024-01-01', to: hoje() };

  if (evento === 'linha:todos') return tudo;

  if (evento.startsWith('ed:')) {
    const id = evento.slice(3);
    for (const linha of eventLines) {
      const ed = linha.editions.find((e) => e.id === id);
      if (ed) return ed.periodoDeVendas ? { from: ed.periodoDeVendas.de, to: ed.periodoDeVendas.ate } : tudo;
    }
    return tudo;
  }

  // linha:<id> — evento inteiro: do início da edição mais antiga ao fim da mais recente.
  const id = evento.replace(/^linha:/, '');
  const linha = eventLines.find((l) => l.id === id);
  const periodos = (linha?.editions ?? [])
    .map((e) => e.periodoDeVendas)
    .filter((p): p is { de: string; ate: string } => Boolean(p));
  if (periodos.length === 0) return tudo;
  const de = periodos.map((p) => p.de).sort()[0];
  const ate = periodos.map((p) => p.ate).sort().slice(-1)[0];
  return { from: de, to: ate };
}

export function DashboardAnuncios() {
  const [manual, setManual] = useState<Manual>(carregar);
  const [eventLines, setEventLines] = useState<EstadoApp['eventLines']>([]);
  const [dados, setDados] = useState<MetricsResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Lista de eventos e edições: a mesma fonte da aba Eventos Presenciais.
  useEffect(() => {
    let cancelado = false;
    api
      .estado()
      .then((r) => {
        if (!cancelado) setEventLines(r.eventLines);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  // Persiste apenas os campos manuais.
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(manual));
    } catch {
      // Sem persistência disponível: o painel continua funcionando na sessão.
    }
  }, [manual]);

  const periodo = useMemo(
    () => periodoDoEvento(manual.evento, eventLines),
    [manual.evento, eventLines],
  );

  // Puxa os números reais do período do evento selecionado.
  useEffect(() => {
    let cancelado = false;
    const edicao = manual.evento.startsWith('ed:') ? manual.evento.slice(3) : '';
    const linha = edicao ? 'todos' : manual.evento.replace(/^linha:/, '');
    setCarregando(true);
    api
      .metricas({
        line: linha,
        edition: edicao || undefined,
        from: periodo.from,
        to: periodo.to,
        campanhas: [],
      })
      .then((r) => {
        if (cancelado) return;
        setDados(r);
        setErro(null);
      })
      .catch((falha) => {
        if (cancelado) return;
        setErro(falha instanceof Error ? falha.message : String(falha));
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [manual.evento, periodo.from, periodo.to]);

  const setCampo = (campo: keyof Manual) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setManual((atual) => ({ ...atual, [campo]: e.target.value }));

  const m = dados?.metrics ?? null;
  const investido = m?.custoCampanha ?? 0;
  const leadsSemFonte = m?.leadsSemFonte ?? false;
  const leads = m?.leadsTotal ?? 0;
  const vendas = m ? m.ingressos.reduce((soma, i) => soma + i.quantidade, 0) : 0;
  const embaixadores = m?.embaixador.embaixadores ?? 0;
  const convidados = m?.embaixador.convidados ?? 0;

  const meta = inteiro(manual.meta);
  const faltam = meta - vendas;
  const total = embaixadores + convidados + vendas;
  const dias = useMemo(() => diasAteEvento(manual.dataEvento), [manual.dataEvento]);

  const corFaltam =
    faltam <= 0 ? 'var(--positivo)' : faltam <= Math.max(1, meta * 0.25) ? 'var(--acento)' : 'var(--negativo)';

  return (
    <>
      <div className="filtros">
        <div className="campo">
          <label htmlFor="an-evento">Evento</label>
          <select id="an-evento" value={manual.evento} onChange={setCampo('evento')}>
            <option value="linha:todos">Todos os eventos</option>
            {eventLines.map((item) => (
              <optgroup key={item.id} label={item.label}>
                <option value={`linha:${item.id}`}>{item.label} — todas as edições</option>
                {item.editions.map((ed) => (
                  <option key={ed.id} value={`ed:${ed.id}`}>
                    {ed.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="an-meta">Meta</label>
          <input id="an-meta" inputMode="numeric" placeholder="60" value={manual.meta} onChange={setCampo('meta')} />
        </div>
        <div className="campo">
          <label htmlFor="an-data">Data do evento</label>
          <input id="an-data" type="date" value={manual.dataEvento} onChange={setCampo('dataEvento')} />
        </div>
      </div>

      {erro && (
        <div className="aviso erro">
          <strong>Não foi possível ler as planilhas:</strong> {erro}
        </div>
      )}

      {/* KPI herói: dias até o evento é a leitura de 10 segundos. */}
      <div className="heroi">
        <div className="heroi-rotulo">Dias até o evento</div>
        <div className="heroi-valor">
          {dias === null ? '—' : dias > 0 ? dias : dias === 0 ? 'Hoje' : Math.abs(dias)}
        </div>
        <div className="heroi-nota">
          {dias === null
            ? 'Preencha a data do evento acima para o painel contar os dias.'
            : dias > 0
              ? `Faltam ${dias === 1 ? '1 dia' : `${dias} dias`} para o evento.`
              : dias === 0
                ? 'O evento é hoje.'
                : `O evento foi há ${Math.abs(dias) === 1 ? '1 dia' : `${Math.abs(dias)} dias`}.`}
        </div>
      </div>

      {carregando && !m ? (
        <div className="carregando">Puxando os números do evento...</div>
      ) : (
        <div className="metricas">
          <div className="metrica">
            <div className="metrica-rotulo">Investido (c/ imposto)</div>
            <div className="metrica-valor num">{reais(investido)}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Leads gerados</div>
            <div className="metrica-valor num">{leadsSemFonte ? '—' : numero(leads)}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Vendas</div>
            <div className="metrica-valor num">{numero(vendas)}</div>
            <div className="metrica-nota">Meta: {meta}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Faltam para a meta</div>
            <div className="metrica-valor num" style={{ color: corFaltam }}>{faltam}</div>
            <div className="metrica-nota">{faltam <= 0 ? 'Meta batida' : 'meta − vendas'}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Embaixadores</div>
            <div className="metrica-valor num">{numero(embaixadores)}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Convidados</div>
            <div className="metrica-valor num">{numero(convidados)}</div>
          </div>
          <div className="metrica">
            <div className="metrica-rotulo">Total de participantes</div>
            <div className="metrica-valor num">{numero(total)}</div>
            <div className="metrica-nota">embaixadores + convidados + vendas</div>
          </div>
        </div>
      )}

      <p className="rodape">
        Investido, leads, vendas, embaixadores e convidados são puxados das planilhas para o período do
        evento selecionado{dados ? ` (${dataBr(periodo.from)} a ${dataBr(periodo.to)})` : ''}. Meta e data do
        evento você preenche à mão — ficam salvas neste navegador. Faltam para a meta e total de participantes
        são calculados automaticamente.
      </p>
    </>
  );
}
