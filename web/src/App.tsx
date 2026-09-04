import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppConfig, MetricsResponse } from '../../shared/types';
import { api, conectarAoVivo, type EstadoApp } from './api';
import { Painel } from './Painel';
import { Configuracao } from './Configuracao';
import { dataBr, diasAtras, hoje, horaBr, inicioDoMes } from './format';

type Aba = 'painel' | 'config';

export function App() {
  const [aba, setAba] = useState<Aba>('painel');
  const [estado, setEstado] = useState<EstadoApp | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [dados, setDados] = useState<MetricsResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const [linha, setLinha] = useState('');
  const [edicao, setEdicao] = useState('todas');
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hoje());

  // Evita corrida entre respostas: so a busca mais recente pode escrever na tela.
  const buscaAtual = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [estadoInicial, configInicial] = await Promise.all([api.estado(), api.config()]);
        setEstado(estadoInicial);
        setConfig(configInicial);
        setLinha((atual) => atual || estadoInicial.eventLines[0]?.id || 'todos');
      } catch (falha) {
        setErro(falha instanceof Error ? falha.message : String(falha));
      }
    })();
  }, []);

  const buscarMetricas = useCallback(async () => {
    if (!linha) return;
    const marca = ++buscaAtual.current;
    try {
      const resposta = await api.metricas({ line: linha, edition: edicao, from: de, to: ate });
      if (marca !== buscaAtual.current) return;
      setDados(resposta);
      setErro(null);
    } catch (falha) {
      if (marca !== buscaAtual.current) return;
      setErro(falha instanceof Error ? falha.message : String(falha));
    }
  }, [linha, edicao, de, ate]);

  useEffect(() => {
    void buscarMetricas();
  }, [buscarMetricas]);

  // Conexao ao vivo: o servidor avisa quando a planilha muda e o painel se refaz sozinho.
  useEffect(() => {
    return conectarAoVivo(() => {
      void buscarMetricas();
      void api.estado().then(setEstado).catch(() => undefined);
    });
  }, [buscarMetricas]);

  const linhaAtual = useMemo(
    () => estado?.eventLines.find((item) => item.id === linha) ?? null,
    [estado, linha],
  );

  async function atualizarAgora() {
    setAtualizando(true);
    try {
      await api.atualizarAgora();
      await buscarMetricas();
      setEstado(await api.estado());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setAtualizando(false);
    }
  }

  if (!estado || !config) {
    return (
      <div className="app">
        <div className="carregando">{erro ? `Erro: ${erro}` : 'Carregando o painel...'}</div>
      </div>
    );
  }

  const avisos = dados?.warnings ?? [];
  const falhas = dados?.falhas ?? estado.falhas ?? [];

  return (
    <div className="app">
      <header className="topo">
        <div>
          <h1>Painel de Vendas — Eventos Presenciais</h1>
          <p className="sub">
            Última leitura das planilhas: {horaBr(estado.fetchedAt)}
            {' · '}Ingresso individual: {estado.ticketPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div className="abas">
          <button className={aba === 'painel' ? 'ativa' : ''} onClick={() => setAba('painel')}>
            Painel
          </button>
          <button className={aba === 'config' ? 'ativa' : ''} onClick={() => setAba('config')}>
            Configuração
          </button>
        </div>
      </header>

      {estado.demo && (
        <div className="aviso alerta">
          <strong>Modo demonstração.</strong> A chave de acesso do Google ainda não foi configurada, então
          os números abaixo são <strong>inventados</strong>, só para você ver como o painel fica. Assim que a
          chave for instalada, ele passa a mostrar os dados reais das planilhas automaticamente.
        </div>
      )}

      {erro && <div className="aviso erro"><strong>Erro:</strong> {erro}</div>}
      {estado.erro && !estado.demo && (
        <div className="aviso erro"><strong>Falha ao ler as planilhas:</strong> {estado.erro}</div>
      )}

      {falhas.length > 0 && (
        <div className="aviso erro">
          <strong>O painel não conseguiu ler as planilhas, então os números abaixo estão zerados.</strong>
          <ul>
            {falhas.map((falha) => (
              <li key={falha}>{falha}</li>
            ))}
          </ul>
        </div>
      )}

      {avisos.length > 0 && !estado.demo && (
        <div className="aviso alerta">
          <strong>Pontos de atenção:</strong>
          <ul>
            {avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      {aba === 'painel' && (
        <>
          <div className="filtros">
            <div className="campo">
              <label htmlFor="linha">Evento</label>
              <select
                id="linha"
                value={linha}
                onChange={(e) => {
                  setLinha(e.target.value);
                  setEdicao('todas');
                }}
              >
                {estado.eventLines.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
                <option value="todos">Todos os eventos</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="edicao">Nome / edição</label>
              <select id="edicao" value={edicao} onChange={(e) => setEdicao(e.target.value)}>
                <option value="todas">Todos os nomes (atual + históricos)</option>
                {(linhaAtual?.editions ?? []).map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.label}{ed.current ? ' (atual)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="de">Data inicial</label>
              <input id="de" type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
            </div>

            <div className="campo">
              <label htmlFor="ate">Data final</label>
              <input id="ate" type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
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
              <label>&nbsp;</label>
              <button className="botao" onClick={atualizarAgora} disabled={atualizando}>
                {atualizando ? 'Atualizando...' : 'Atualizar agora'}
              </button>
            </div>
          </div>

          {dados ? (
            <Painel dados={dados} />
          ) : (
            <div className="carregando">Calculando as métricas...</div>
          )}

          <p className="rodape">
            Período selecionado: {dataBr(de)} até {dataBr(ate)}.<br />
            O painel se atualiza sozinho assim que uma planilha é editada — não precisa recarregar a página.
          </p>
        </>
      )}

      {aba === 'config' && (
        <Configuracao
          config={config}
          naoClassificado={dados?.metrics.naoClassificado ?? null}
          aoSalvar={(novo) => {
            setConfig(novo);
            void api.estado().then(setEstado).catch(() => undefined);
            void buscarMetricas();
          }}
        />
      )}
    </div>
  );
}
