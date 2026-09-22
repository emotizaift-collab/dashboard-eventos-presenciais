import React, { useEffect, useMemo, useState } from 'react';
import type { CampanhaResumo } from '../../shared/types';
import { api } from './api';
import { hoje } from './format';
import { FiltroCampanhas } from './FiltroCampanhas';

/**
 * Dashboard de Anúncios — Painel Executivo.
 *
 * Diferente das outras seções, este painel NÃO lê as planilhas: são números que
 * a pessoa preenche à mão a cada ciclo de campanha (investido, leads, vendas,
 * embaixadores, convidados, meta e a data do evento). A partir deles o painel
 * calcula sozinho:
 *   - Faltam para a meta = meta − vendas (pode ficar negativo, se passar da meta)
 *   - Dias até o evento   = a partir da data digitada
 *   - Total de participantes = embaixadores + convidados + vendas
 *
 * O que a pessoa digita fica guardado no próprio navegador (localStorage), então
 * recarregar a página não apaga o preenchimento. É por navegador/dispositivo —
 * não é compartilhado nem lido pelo servidor.
 */

const CHAVE = 'ift.dashboard-anuncios.v1';

interface Estado {
  investido: string; // texto livre, formato "2.354,79"
  leads: string;
  vendas: string;
  meta: string;
  embaixadores: string;
  convidados: string;
  dataEvento: string; // yyyy-mm-dd
  campanhas: string[]; // nomes das campanhas selecionadas para este ciclo
}

const INICIAL: Estado = {
  investido: '',
  leads: '',
  vendas: '',
  meta: '60',
  embaixadores: '',
  convidados: '',
  dataEvento: '',
  campanhas: [],
};

function carregar(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return { ...INICIAL, ...JSON.parse(bruto) };
  } catch {
    // localStorage pode estar indisponível (aba anônima etc.) — segue com o inicial.
  }
  return INICIAL;
}

/** Converte "2.354,79" ou "76" em número; vazio ou inválido vira 0. */
function paraNumero(texto: string): number {
  if (!texto) return 0;
  let s = texto.trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const inteiro = (t: string) => Math.round(paraNumero(t));

const reais = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function diasAteEvento(data: string): number | null {
  if (!data) return null;
  const evento = new Date(data + 'T00:00:00');
  if (Number.isNaN(evento.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((evento.getTime() - hoje.getTime()) / 86_400_000);
}

export function DashboardAnuncios() {
  const [estado, setEstado] = useState<Estado>(carregar);
  const [listaCampanhas, setListaCampanhas] = useState<CampanhaResumo[]>([]);

  // Lista TODAS as campanhas: busca o período inteiro, sem recorte de datas.
  useEffect(() => {
    let cancelado = false;
    api
      .campanhas({ from: '2024-01-01', to: hoje() })
      .then((r) => {
        if (!cancelado) setListaCampanhas(r.campanhas);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      // Sem persistência disponível: o painel continua funcionando na sessão.
    }
  }, [estado]);

  const set = (campo: keyof Estado) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEstado((atual) => ({ ...atual, [campo]: e.target.value }));

  const vendas = inteiro(estado.vendas);
  const meta = inteiro(estado.meta);
  const faltam = meta - vendas;
  const total = inteiro(estado.embaixadores) + inteiro(estado.convidados) + vendas;
  const dias = useMemo(() => diasAteEvento(estado.dataEvento), [estado.dataEvento]);

  const classeFaltam =
    faltam <= 0 ? 'positivo' : faltam <= Math.max(1, meta * 0.25) ? 'acento' : 'negativo';

  return (
    <>
      <div className="filtros">
        <div className="campo">
          <label htmlFor="an-investido">Investido (c/ imposto)</label>
          <input
            id="an-investido"
            inputMode="decimal"
            placeholder="0,00"
            value={estado.investido}
            onChange={set('investido')}
          />
        </div>
        <div className="campo">
          <label htmlFor="an-leads">Leads gerados</label>
          <input id="an-leads" inputMode="numeric" placeholder="0" value={estado.leads} onChange={set('leads')} />
        </div>
        <div className="campo">
          <label htmlFor="an-vendas">Vendas</label>
          <input id="an-vendas" inputMode="numeric" placeholder="0" value={estado.vendas} onChange={set('vendas')} />
        </div>
        <div className="campo">
          <label htmlFor="an-meta">Meta</label>
          <input id="an-meta" inputMode="numeric" placeholder="60" value={estado.meta} onChange={set('meta')} />
        </div>
        <div className="campo">
          <label htmlFor="an-embaixadores">Embaixadores</label>
          <input
            id="an-embaixadores"
            inputMode="numeric"
            placeholder="0"
            value={estado.embaixadores}
            onChange={set('embaixadores')}
          />
        </div>
        <div className="campo">
          <label htmlFor="an-convidados">Convidados</label>
          <input
            id="an-convidados"
            inputMode="numeric"
            placeholder="0"
            value={estado.convidados}
            onChange={set('convidados')}
          />
        </div>
        <div className="campo">
          <label htmlFor="an-data">Data do evento</label>
          <input id="an-data" type="date" value={estado.dataEvento} onChange={set('dataEvento')} />
        </div>
        <div className="campo" style={{ minWidth: 260 }}>
          <label>Campanhas</label>
          <FiltroCampanhas
            campanhas={listaCampanhas}
            selecionadas={estado.campanhas}
            aoMudar={(nomes) => setEstado((atual) => ({ ...atual, campanhas: nomes }))}
          />
        </div>
      </div>

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

      <div className="metricas">
        <div className="metrica">
          <div className="metrica-rotulo">Investido (c/ imposto)</div>
          <div className="metrica-valor">{reais(paraNumero(estado.investido))}</div>
        </div>
        <div className="metrica">
          <div className="metrica-rotulo">Leads gerados</div>
          <div className="metrica-valor num">{inteiro(estado.leads)}</div>
        </div>
        <div className="metrica">
          <div className="metrica-rotulo">Vendas</div>
          <div className="metrica-valor num">{vendas}</div>
          <div className="metrica-nota">Meta: {meta}</div>
        </div>
        <div className="metrica">
          <div className="metrica-rotulo">Faltam para a meta</div>
          <div
            className="metrica-valor num"
            style={{
              color:
                classeFaltam === 'positivo'
                  ? 'var(--positivo)'
                  : classeFaltam === 'negativo'
                    ? 'var(--negativo)'
                    : 'var(--acento)',
            }}
          >
            {faltam}
          </div>
          <div className="metrica-nota">
            {faltam <= 0 ? 'Meta batida' : 'meta − vendas'}
          </div>
        </div>
        <div className="metrica">
          <div className="metrica-rotulo">Total de participantes</div>
          <div className="metrica-valor num">{total}</div>
          <div className="metrica-nota">embaixadores + convidados + vendas</div>
        </div>
      </div>

      <p className="rodape">
        Os números deste painel são preenchidos à mão, a cada ciclo. O que você digita fica salvo neste
        navegador — recarregar a página não apaga. Dias até o evento, faltam para a meta e total de
        participantes são calculados automaticamente.
      </p>
    </>
  );
}
