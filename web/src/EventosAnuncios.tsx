import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CampanhaResumo, MetricsResponse } from '../../shared/types';
import { dataBr, diaCurto, dinheiro, numero } from './format';

const CHAVE_META = 'ift.eventos-presenciais-meta.v1';
const COR_PRINCIPAL = '#c08a4e';
const COR_EIXO = '#8f8a80';
const COR_GRADE = '#2a2621';

interface MetaManual {
  meta: string;
  dataEvento: string;
}

interface Props {
  dados: MetricsResponse;
  selecao: string;
  linhaSelecionada: string;
  campanhas: CampanhaResumo[];
  campanhasSelecionadas: string[];
}

function carregarMeta(selecao: string): MetaManual {
  const inicial: MetaManual = { meta: '60', dataEvento: '' };
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_META) || '{}');
    if (mapa[selecao]) return { ...inicial, ...mapa[selecao] };
    const antigo = JSON.parse(localStorage.getItem('ift.dashboard-anuncios.v2') || '{}');
    if (antigo.evento === selecao) {
      return { meta: antigo.meta || '60', dataEvento: antigo.dataEvento || '' };
    }
  } catch {
    return inicial;
  }
  return inicial;
}

function salvarMeta(selecao: string, valor: MetaManual) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_META) || '{}');
    mapa[selecao] = valor;
    localStorage.setItem(CHAVE_META, JSON.stringify(mapa));
  } catch {
    // Sem persistencia, continua funcionando na sessao.
  }
}

function diasAte(data: string): number | null {
  if (!data) return null;
  const evento = new Date(data + 'T12:00:00');
  if (Number.isNaN(evento.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12);
  return Math.round((evento.getTime() - hoje.getTime()) / 86_400_000);
}

export function EventosAnuncios({ dados, selecao, linhaSelecionada, campanhas, campanhasSelecionadas }: Props) {
  const m = dados.metrics;
  const [manual, setManual] = useState<MetaManual>(() => carregarMeta(selecao));

  useEffect(() => { setManual(carregarMeta(selecao)); }, [selecao]);
  useEffect(() => { salvarMeta(selecao, manual); }, [selecao, manual]);

  const meta = Math.max(0, parseInt(manual.meta || '0', 10) || 0);
  const vendas = m.ingressos.reduce((total, item) => total + item.quantidade, 0);
  const faltam = Math.max(meta - vendas, 0);
  const percentual = meta > 0 ? (vendas / meta) * 100 : 0;
  const dias = diasAte(manual.dataEvento);

  const serieAcumulada = useMemo(() => {
    let acumulado = 0;
    return m.serie.map((ponto) => {
      acumulado += ponto.vendas;
      return {
        ...ponto,
        rotulo: ponto.date === ponto.dateFim ? diaCurto(ponto.date) : diaCurto(ponto.date) + '-' + diaCurto(ponto.dateFim),
        acumulado,
      };
    });
  }, [m.serie]);

  const campanhasVisiveis = useMemo(() => {
    const selecionadas = new Set(campanhasSelecionadas);
    return campanhas
      .filter((item) => {
        if (selecionadas.size > 0 && !selecionadas.has(item.nome)) return false;
        if (!linhaSelecionada || linhaSelecionada === 'todos') return true;
        return item.lineId === linhaSelecionada;
      })
      .sort((a, b) => b.custo - a.custo);
  }, [campanhas, campanhasSelecionadas, linhaSelecionada]);

  return (
    <section className="meta-evento">
      <div className="meta-topo">
        <div>
          <h2 className="secao-titulo">Meta e anúncios</h2>
          <p className="secao-sub">Visão executiva do evento: onde estamos, onde precisamos chegar e quanto falta.</p>
        </div>
        <div className="meta-controles">
          <label>
            <span>Meta</span>
            <input inputMode="numeric" value={manual.meta} onChange={(e) => setManual((atual) => ({ ...atual, meta: e.target.value.replace(/[^0-9]/g, '') }))} />
          </label>
          <label>
            <span>Data do evento</span>
            <input type="date" value={manual.dataEvento} onChange={(e) => setManual((atual) => ({ ...atual, dataEvento: e.target.value }))} />
          </label>
        </div>
      </div>

      <div className="meta-kpis">
        <Kpi rotulo="Meta definida" valor={numero(meta)} />
        <Kpi rotulo="Resultado atual" valor={numero(vendas)} nota="vendas" />
        <Kpi rotulo="Faltam para a meta" valor={numero(faltam)} nota={faltam === 0 && meta > 0 ? 'Meta atingida' : undefined} />
        <Kpi rotulo="% da meta atingido" valor={percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'} />
        <Kpi rotulo="Investimento em anúncios" valor={dinheiro(m.custoCampanha)} />
        <Kpi rotulo="Leads gerados" valor={m.leadsSemFonte ? '—' : numero(m.leadsTotal)} />
        <Kpi rotulo="Dias até o evento" valor={dias === null ? '—' : dias === 0 ? 'Hoje' : numero(Math.abs(dias))} nota={dias === null ? 'Preencha a data' : dias < 0 ? 'Evento realizado' : dias > 0 ? 'dias restantes' : undefined} />
      </div>

      <div className="meta-progresso">
        <div className="meta-progresso-barra"><span style={{ width: Math.min(percentual, 100) + '%' }} /></div>
        <small>{numero(vendas)} de {numero(meta)} vendas</small>
      </div>

      <div className="meta-detalhes">
        <div className="meta-grafico">
          <h3>Evolução em relação à meta</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={serieAcumulada} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={COR_GRADE} vertical={false} />
              <XAxis dataKey="rotulo" stroke={COR_EIXO} tick={{ fill: COR_EIXO, fontSize: 10 }} tickLine={false} axisLine={{ stroke: COR_GRADE }} interval="preserveStartEnd" />
              <YAxis stroke={COR_EIXO} tick={{ fill: COR_EIXO, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#221e1a', border: '1px solid #3a352e', borderRadius: 3, color: '#edeae4', fontSize: 12, fontFamily: 'inherit' }} labelFormatter={(rotulo) => { const p = serieAcumulada.find((x) => x.rotulo === rotulo); return p ? (p.date === p.dateFim ? dataBr(p.date) : dataBr(p.date) + ' a ' + dataBr(p.dateFim)) : String(rotulo); }} />
              {meta > 0 && <ReferenceLine y={meta} stroke="#8f8a80" strokeDasharray="5 5" label={{ value: 'Meta', fill: '#8f8a80', fontSize: 11 }} />}
              <Line type="monotone" dataKey="acumulado" name="Vendas acumuladas" stroke={COR_PRINCIPAL} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="campanhas-resumo">
          <h3>Desempenho das campanhas</h3>
          <p>Investimento por campanha no período selecionado.</p>
          <div className="campanhas-lista">
            {campanhasVisiveis.length > 0 ? campanhasVisiveis.map((campanha) => (
              <div className="campanha-linha" key={campanha.nome}>
                <div><strong>{campanha.nome}</strong><span>{campanha.eventoLabel ?? 'Sem evento identificado'}</span></div>
                <b className="num">{dinheiro(campanha.custo)}</b>
              </div>
            )) : <div className="vazio">Nenhuma campanha encontrada para este evento no período.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return <div className="meta-kpi"><div className="metrica-rotulo">{rotulo}</div><div className="metrica-valor num">{valor}</div>{nota && <div className="metrica-nota">{nota}</div>}</div>;
}
