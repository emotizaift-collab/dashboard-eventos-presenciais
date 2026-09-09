import React from 'react';
import { MENU } from './navegacao';

interface Props {
  secaoAtiva: string;
  aoEscolher: (id: string) => void;
  /** Linha discreta no rodapé: última leitura das planilhas. */
  rodape: React.ReactNode;
}

export function Sidebar({ secaoAtiva, aoEscolher, rodape }: Props) {
  return (
    <nav className="sidebar" aria-label="Seções do painel">
      <div className="marca">
        <div className="marca-nome">IFT</div>
        <div className="marca-sub">Painel de vendas</div>
      </div>

      {MENU.map((grupo) => (
        <div className="menu" key={grupo.titulo ?? grupo.itens[0].id}>
          {grupo.titulo && <div className="menu-titulo">{grupo.titulo}</div>}
          {grupo.itens.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`menu-item${item.id === secaoAtiva ? ' ativo' : ''}`}
              aria-current={item.id === secaoAtiva ? 'page' : undefined}
              disabled={item.emBreve}
              onClick={() => aoEscolher(item.id)}
            >
              <span>{item.label}</span>
              {item.emBreve && <span className="menu-tag">em breve</span>}
            </button>
          ))}
        </div>
      ))}

      <div className="sidebar-rodape">{rodape}</div>
    </nav>
  );
}
