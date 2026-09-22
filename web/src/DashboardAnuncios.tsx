import React, { useEffect, useMemo, useState } from 'react';
import type { MetricsResponse } from '../../shared/types';
import { api, type EstadoApp } from './api';
import { dataBr, diasAtras, hoje, inicioDoMes } from './format';

/**
 * Dashboard de Anúncios — Painel Executivo.
 *
 * Calcula EXATAMENTE como a aba Eventos Presenciais: os números vêm das
 * planilhas para o Evento selecionado e a janela de datas escolhida (Data
 * inicial/final, padrão últimos 30 dias). Assim o custo/investido bate com o
 * daquela aba — antes divergiam porque este painel usava o período de vendas do
 * evento, e o custo de campanha é filtrado por data.
 *
 * Puxados das planilhas: investido (custo de campanha), leads, vendas,
 * embaixadores, convidados.
 * Derivados:
 *   - Faltam para a meta   = meta − vendas (pode ficar negativo, se passar)
 *   - Total de participantes = embaixadores + convidados + vendas
 *   - Dias até o evento    = a partir da data digitada
 *
 * Manuais: Meta (padrão 60) e Data do evento — guardadas no próprio navegador
 * (localStorage), por navegador/dispositivo. A janela de datas segue a mesma
 * lógica da aba Eventos Presenciais e não é persistida (reabre nos últimos 30
 * dias).
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

export function DashboardAnuncios() {
  const [manual, setManual] = useState<Manual>(carregar);
  const [eventLines, setEventLines] = useState<EstadoApp['eventLines']>([]);
  const [dados, setDados] = useState<MetricsResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Janela de datas: mesma lógica da aba Eventos Presenciais (padrão 30 dias).
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hoje());

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

  // Puxa os números reais — mesmíssima chamada da aba Eventos Presenciais.
  useEffect(() => {
    let cancelado = false;
    const edicao = manual.evento.startsWith('ed:') ? manual.evento.slice(3) : '';
    const linha = edicao ? 'todos' : manual.evento.replace(/^linha:/, '');
    setCarregando(true);
    api
      .metricas({ line: linha, edition: edicao || undefined, from: de, to: ate, campanhas: [] })
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
  }, [manual.evento, de, ate]);

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
          <label htmlFor="an-de">Data inicial</label>
          <input id="an-de" type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
        </div>

        <div className="campo">
          <label htmlFor="an-ate">Data final</label>
          <input id="an-ate" type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
        </div>

        <div className="campo">
          <label>Atalhos</label>
          <div className="atalhos">
            <button onClick={() => { setDe(hoje()); setAte(hoje()); }}>Hoje</button>
            <button onClick={() => { setDe(diasAtras(6)); setAte(hoje()); }}>7 dias</button>
            <button onClick={() => { setDe(diasAtras(29)); setAte(hoje()); }}>30 dias</button>
            <button onClick={() => { setDe(inicioDoMes()); setAte(hoje()); }}>Este mês</button>
            <button onClick={() => { setDe('2024-01-01'); setAte(hoje()); }}>Tudo</button>
          </div>
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
        Investido, leads, vendas, embaixadores e convidados são puxados das planilhas para o evento e a
        janela de datas selecionados{dados ? ` (${dataBr(de)} a ${dataBr(ate)})` : ''} — o mesmo cálculo da
        aba Eventos Presenciais. Meta e data do evento você preenche à mão (ficam salvas neste navegador).
        Faltam para a meta e total de participantes são calculados automaticamente.
      </p>
    </>
  );
}
