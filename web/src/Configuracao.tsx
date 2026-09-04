import React, { useState } from 'react';
import type { AppConfig, Metrics } from '../../shared/types';
import { api } from './api';

interface Props {
  config: AppConfig;
  naoClassificado: Metrics['naoClassificado'] | null;
  aoSalvar: (config: AppConfig) => void;
}

export function Configuracao({ config, naoClassificado, aoSalvar }: Props) {
  const [rascunho, setRascunho] = useState<AppConfig>(() => clonar(config));
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [avancado, setAvancado] = useState(false);
  const [diagnostico, setDiagnostico] = useState<string | null>(null);

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(config);

  const editions = rascunho.eventLines.flatMap((linha) =>
    linha.editions.map((ed) => ({ id: ed.id, rotulo: `${linha.label} — ${ed.label}` })),
  );

  function atualizar(mudanca: (draft: AppConfig) => void) {
    const copia = clonar(rascunho);
    mudanca(copia);
    setRascunho(copia);
  }

  function adicionarApelido(edicaoId: string, apelido: string) {
    const limpo = apelido.trim();
    if (!limpo) return;
    atualizar((draft) => {
      for (const linha of draft.eventLines) {
        for (const ed of linha.editions) {
          if (ed.id === edicaoId && !ed.aliases.some((a) => a.toLowerCase() === limpo.toLowerCase())) {
            ed.aliases.push(limpo);
          }
        }
      }
    });
  }

  function removerApelido(edicaoId: string, apelido: string) {
    atualizar((draft) => {
      for (const linha of draft.eventLines) {
        for (const ed of linha.editions) {
          if (ed.id === edicaoId) ed.aliases = ed.aliases.filter((a) => a !== apelido);
        }
      }
    });
  }

  async function salvar() {
    setSalvando(true);
    setRecado(null);
    try {
      const salvo = await api.salvarConfig(rascunho);
      setRascunho(clonar(salvo));
      aoSalvar(salvo);
      setRecado({ tipo: 'info', texto: 'Configuração salva. O painel já está usando as regras novas.' });
    } catch (erro) {
      setRecado({ tipo: 'erro', texto: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    if (!confirm('Isso apaga as suas alterações e volta tudo para o padrão de fábrica. Continuar?')) return;
    setSalvando(true);
    try {
      const padrao = await api.restaurarConfig();
      setRascunho(clonar(padrao));
      aoSalvar(padrao);
      setRecado({ tipo: 'info', texto: 'Configuração restaurada para o padrão.' });
    } catch (erro) {
      setRecado({ tipo: 'erro', texto: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setSalvando(false);
    }
  }

  async function rodarDiagnostico() {
    setDiagnostico('Verificando...');
    try {
      const resultado = await api.diagnostico();
      setDiagnostico(JSON.stringify(resultado, null, 2));
    } catch (erro) {
      setDiagnostico(erro instanceof Error ? erro.message : String(erro));
    }
  }

  const sugestoes = juntarSugestoes(naoClassificado);

  return (
    <>
      {recado && <div className={`aviso ${recado.tipo === 'erro' ? 'erro' : 'info'}`}>{recado.texto}</div>}

      <div className="config-secao">
        <h2>Nomes e apelidos dos eventos</h2>
        <p className="explica">
          O painel junta tudo o que estiver listado aqui embaixo como sendo o mesmo evento. Se um dia o
          evento mudar de nome, é só adicionar o nome novo na caixinha — não precisa mexer em programação.
          Vale tanto para a sigla usada no tráfego pago (ex.: <code className="mono">DAI</code>) quanto para
          o nome por extenso usado nas planilhas de leads e de compradores.
        </p>

        {rascunho.eventLines.map((linha) => (
          <div className="linha-evento" key={linha.id}>
            <header>
              <h4>{linha.label}</h4>
            </header>
            {linha.editions.map((ed) => (
              <div className="edicao" key={ed.id}>
                <div className="edicao-titulo">
                  <strong>{ed.label}</strong>
                  {ed.current && <span className="tag-atual">Nome atual</span>}
                </div>
                <div className="apelidos">
                  {ed.aliases.map((apelido) => (
                    <span className="apelido" key={apelido}>
                      {apelido}
                      <button
                        type="button"
                        title="Remover este apelido"
                        onClick={() => removerApelido(ed.id, apelido)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <CampoNovoApelido aoAdicionar={(valor) => adicionarApelido(ed.id, valor)} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {sugestoes.length > 0 && (
        <div className="config-secao">
          <h2>Nomes que o painel não reconheceu</h2>
          <p className="explica">
            Estes valores apareceram nas planilhas mas não batem com nenhum apelido cadastrado, então
            <strong> não estão sendo contados em lugar nenhum</strong>. Se algum deles for de um dos seus
            eventos, escolha a qual pertence e clique em Adicionar. Se não for (é de outro produto da
            empresa), pode ignorar.
          </p>
          <table className="tabela">
            <thead>
              <tr>
                <th>Valor encontrado</th>
                <th>Onde apareceu</th>
                <th style={{ width: 340 }}>Pertence a</th>
              </tr>
            </thead>
            <tbody>
              {sugestoes.map((sugestao) => (
                <LinhaSugestao
                  key={`${sugestao.origem}:${sugestao.valor}`}
                  sugestao={sugestao}
                  editions={editions}
                  aoAdicionar={adicionarApelido}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="config-secao">
        <h2>Preço do ingresso</h2>
        <p className="explica">
          Valor de um ingresso individual. O duplo conta como duas vezes esse valor e o triplo como três.
          Convite de embaixador é gratuito e não entra no faturamento.
        </p>
        <div className="campo">
          <label htmlFor="preco">Preço em reais</label>
          <input
            id="preco"
            type="number"
            step="0.01"
            min="0"
            value={rascunho.ticketPrice}
            onChange={(evento) =>
              atualizar((draft) => {
                draft.ticketPrice = Number(evento.target.value);
              })
            }
          />
        </div>
      </div>

      <div className="config-secao">
        <h2>Ajustes avançados</h2>
        <p className="explica">
          De onde o painel lê os dados. Só mexa aqui se alguma aba for renomeada ou se as planilhas
          mudarem de lugar. O botão de verificação mostra os nomes reais das abas de cada planilha.
        </p>
        <div className="barra-acoes">
          <button type="button" className="botao" onClick={() => setAvancado((v) => !v)}>
            {avancado ? 'Esconder' : 'Mostrar'} ajustes avançados
          </button>
          <button type="button" className="botao" onClick={rodarDiagnostico}>
            Verificar conexão com as planilhas
          </button>
        </div>

        {avancado && (
          <div style={{ marginTop: 16 }}>
            {(['leads', 'buyers', 'traffic'] as const).map((chave) => (
              <div className="linha-evento" key={chave}>
                <header>
                  <h4>{rotuloFonte(chave)}</h4>
                </header>
                <div className="filtros" style={{ margin: 0, background: 'transparent', border: 0, padding: 0 }}>
                  <div className="campo">
                    <label>ID da planilha</label>
                    <input
                      value={rascunho.sources[chave].spreadsheetId}
                      onChange={(e) =>
                        atualizar((d) => {
                          d.sources[chave].spreadsheetId = e.target.value.trim();
                        })
                      }
                    />
                  </div>
                  <div className="campo">
                    <label>Nome da aba</label>
                    <input
                      value={rascunho.sources[chave].tab}
                      onChange={(e) =>
                        atualizar((d) => {
                          d.sources[chave].tab = e.target.value;
                        })
                      }
                    />
                  </div>
                  <div className="campo">
                    <label>Linha do cabeçalho</label>
                    <input
                      type="number"
                      min="1"
                      value={rascunho.sources[chave].headerRow}
                      onChange={(e) =>
                        atualizar((d) => {
                          d.sources[chave].headerRow = Math.max(1, Number(e.target.value) || 1);
                        })
                      }
                    />
                  </div>
                  {Object.keys(rascunho.sources[chave].columns).map((coluna) => (
                    <div className="campo" key={coluna}>
                      <label>{rotuloColuna(coluna)}</label>
                      <input
                        style={{ minWidth: 120 }}
                        value={(rascunho.sources[chave].columns as unknown as Record<string, string>)[coluna]}
                        onChange={(e) =>
                          atualizar((d) => {
                            (d.sources[chave].columns as unknown as Record<string, string>)[coluna] = e.target.value.trim();
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {diagnostico && (
          <pre
            style={{
              background: '#0f1420', border: '1px solid #2a3348', borderRadius: 10,
              padding: 14, fontSize: 12, overflowX: 'auto', marginTop: 14, lineHeight: 1.5,
            }}
          >
            {diagnostico}
          </pre>
        )}
      </div>

      <div className="barra-acoes">
        <button type="button" className="botao primario" disabled={!alterado || salvando} onClick={salvar}>
          {salvando ? 'Salvando...' : alterado ? 'Salvar alterações' : 'Nada para salvar'}
        </button>
        <button type="button" className="botao perigo" disabled={salvando} onClick={restaurar}>
          Restaurar padrão
        </button>
        {alterado && <span style={{ fontSize: 13, color: '#f5b544' }}>Você tem alterações não salvas.</span>}
      </div>
    </>
  );
}

function CampoNovoApelido({ aoAdicionar }: { aoAdicionar: (valor: string) => void }) {
  const [valor, setValor] = useState('');
  return (
    <input
      placeholder="+ adicionar apelido"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          aoAdicionar(valor);
          setValor('');
        }
      }}
      onBlur={() => {
        if (valor.trim()) {
          aoAdicionar(valor);
          setValor('');
        }
      }}
    />
  );
}

interface Sugestao {
  valor: string;
  origem: string;
}

function LinhaSugestao({
  sugestao, editions, aoAdicionar,
}: {
  sugestao: Sugestao;
  editions: Array<{ id: string; rotulo: string }>;
  aoAdicionar: (edicaoId: string, valor: string) => void;
}) {
  const [destino, setDestino] = useState(editions[0]?.id ?? '');
  const [pronto, setPronto] = useState(false);

  return (
    <tr>
      <td><code className="mono">{sugestao.valor}</code></td>
      <td style={{ color: '#93a0bb' }}>{sugestao.origem}</td>
      <td>
        {pronto ? (
          <span style={{ color: '#2fbf71', fontSize: 13 }}>Adicionado — lembre de salvar</span>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} style={{ flex: 1 }}>
              {editions.map((ed) => (
                <option key={ed.id} value={ed.id}>{ed.rotulo}</option>
              ))}
            </select>
            <button
              type="button"
              className="botao"
              onClick={() => {
                aoAdicionar(destino, sugestao.valor);
                setPronto(true);
              }}
            >
              Adicionar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function juntarSugestoes(nc: Metrics['naoClassificado'] | null): Sugestao[] {
  if (!nc) return [];
  const grupos: Array<[string[], string]> = [
    [nc.campanhas, 'Tráfego pago'],
    [nc.eventosLeads, 'Planilha de leads'],
    [nc.eventosCompradores, 'Planilha de compradores'],
  ];
  const vistos = new Set<string>();
  const saida: Sugestao[] = [];
  for (const [valores, origem] of grupos) {
    for (const valor of valores) {
      const chave = valor.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ valor, origem });
    }
  }
  return saida.slice(0, 60);
}

function rotuloFonte(chave: 'leads' | 'buyers' | 'traffic'): string {
  if (chave === 'leads') return 'Planilha de leads (Interessados Eventos Presenciais)';
  if (chave === 'buyers') return 'Planilha de compradores (Cópia Compradores Presenciais)';
  return 'Planilha de tráfego pago (PLAN PARA DASH)';
}

function rotuloColuna(coluna: string): string {
  const mapa: Record<string, string> = {
    date: 'Coluna da data',
    event: 'Coluna do evento',
    ticketType: 'Coluna do tipo de ingresso',
    ambassador: 'Coluna do embaixador',
    campaign: 'Coluna do nome da campanha',
    cost: 'Coluna do custo',
  };
  return mapa[coluna] ?? coluna;
}

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}
