import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CampanhaResumo } from '../../shared/types';
import { dinheiro } from './format';

interface Props {
  campanhas: CampanhaResumo[];
  selecionadas: string[];
  aoMudar: (nomes: string[]) => void;
}

/**
 * Multi-seleção de campanhas com busca.
 *
 * A busca existe porque a planilha de tráfego tem dezenas de campanhas de vários
 * produtos: o caso de uso é digitar "DAI" e marcar todas de uma vez.
 */
export function FiltroCampanhas({ campanhas, selecionadas, aoMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return campanhas;
    return campanhas.filter(
      (item) =>
        item.nome.toLowerCase().includes(termo) ||
        (item.eventoLabel ?? '').toLowerCase().includes(termo),
    );
  }, [campanhas, busca]);

  const marcadas = new Set(selecionadas);

  function alternar(nome: string) {
    const proximo = new Set(marcadas);
    if (proximo.has(nome)) proximo.delete(nome);
    else proximo.add(nome);
    aoMudar([...proximo]);
  }

  const rotulo =
    selecionadas.length === 0
      ? 'Todas as campanhas'
      : selecionadas.length === 1
        ? '1 campanha selecionada'
        : `${selecionadas.length} campanhas selecionadas`;

  return (
    <div className="multi" ref={caixa}>
      <button type="button" className="multi-botao" onClick={() => setAberto((v) => !v)}>
        <span>{rotulo}</span>
        <span className="multi-seta">{aberto ? '▲' : '▼'}</span>
      </button>

      {aberto && (
        <div className="multi-painel">
          <input
            className="multi-busca"
            autoFocus
            placeholder="Buscar por nome ou sigla (ex.: DAI)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <div className="multi-acoes">
            <button
              type="button"
              onClick={() => aoMudar([...new Set([...selecionadas, ...filtradas.map((c) => c.nome)])])}
              disabled={filtradas.length === 0}
            >
              Marcar {busca.trim() ? `as ${filtradas.length} filtradas` : 'todas'}
            </button>
            <button type="button" onClick={() => aoMudar([])} disabled={selecionadas.length === 0}>
              Limpar seleção
            </button>
          </div>

          <div className="multi-lista">
            {filtradas.length === 0 && <div className="multi-vazio">Nenhuma campanha encontrada.</div>}
            {filtradas.map((item) => (
              <label className="multi-item" key={item.nome}>
                <input
                  type="checkbox"
                  checked={marcadas.has(item.nome)}
                  onChange={() => alternar(item.nome)}
                />
                <span className="multi-nome">
                  {item.nome}
                  <span className="multi-meta">
                    {item.eventoLabel ?? 'sem evento identificado'} · {dinheiro(item.custo)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
