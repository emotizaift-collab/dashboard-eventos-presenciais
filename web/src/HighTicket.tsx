import React from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type {
  GrupoHighTicket, MetricasHighTicket, RespostaHighTicket,
} from '../../shared/types';
import { dinheiro, numero, diaCurto, dataBr } from './format';

interface Props {
  dados: RespostaHighTicket;
}

/**
 * Uma serie so por grafico, no cobre do tema.
 *
 * O faturamento e a unica medida no eixo. Vendas (contagem) fica nas metricas do
 * topo e nao entra aqui: duas medidas de escalas diferentes no mesmo grafico
 * pediriam dois eixos, e dois eixos fazem qualquer par de linhas parecer que se
 * cruza onde nao se cruza. Serie unica tambem dispensa legenda — o titulo ja diz
 * o que a linha e.
 *
 * Os dois paineis usam o mesmo cobre de proposito: sao o mesmo numero de duas
 * marcas, lado a lado. Cor diferente sugeriria categorias diferentes.
 */
const COR_PRINCIPAL = '#c08a4e';
const COR_GRADE = '#2a2621';
const COR_EIXO = '#8f8a80';

export function HighTicket({ dados }: Props) {
  const { naoClassificado } = dados;
  const temSobra =
    naoClassificado.vendas.length > 0 ||
    naoClassificado.leads.length > 0 ||
    naoClassificado.custoSemPainel > 0;

  return (
    <>
      {dados.falhas.length > 0 && (
        <div className="falhas">
          <strong>Não consegui ler uma das planilhas do High Ticket.</strong>
          <ul>
            {dados.falhas.map((falha) => (
              <li key={falha}>{falha}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ht-paineis">
        {dados.paineis.map((painel) => (
          <PainelDaMarca key={painel.painelId} p={painel} />
        ))}
      </div>

      {temSobra && (
        <section className="secao ht-sobra">
          <h2 className="secao-titulo">Fora dos dois painéis</h2>
          <p className="secao-sub">
            Linhas cuja EMPRESA não é de nenhuma das marcas, e campanhas sem a etiqueta
            de nenhuma delas. Aparecem aqui para não sumirem da conta em silêncio.
          </p>
          <div className="linhas">
            {naoClassificado.vendas.map((item) => (
              <Item key={`v-${item.valor}`} n={item.linhas} t={`Vendas com EMPRESA “${item.valor}”`} />
            ))}
            {naoClassificado.leads.map((item) => (
              <Item key={`l-${item.valor}`} n={item.linhas} t={`Leads com EMPRESA “${item.valor}”`} />
            ))}
            {naoClassificado.custoSemPainel > 0 && (
              <Item
                n={0}
                t="Investimento em campanhas de outros produtos"
                extra={dinheiro(naoClassificado.custoSemPainel)}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}

function PainelDaMarca({ p }: { p: MetricasHighTicket }) {
  const serie = p.serie.map((ponto) => ({ ...ponto, rotulo: diaCurto(ponto.data) }));

  return (
    <div className="ht-painel">
      <h2 className="ht-marca">{p.label}</h2>

      <div className="ht-metricas">
        <Metrica rotulo="Investimento" valor={dinheiro(p.investimento)} />
        <Metrica rotulo="Leads" valor={numero(p.leads)} />
        <Metrica
          rotulo="Custo por lead"
          valor={p.custoPorLead === null ? '—' : dinheiro(p.custoPorLead)}
          nota={p.custoPorLead === null ? 'Sem leads no período' : undefined}
        />
        <Metrica rotulo="Faturamento" valor={dinheiro(p.faturamento)} />
        <Metrica rotulo="Em caixa" valor={dinheiro(p.emCaixa)} />
        <Metrica rotulo="Vendas" valor={numero(p.vendas)} />
      </div>

      <section className="ht-grafico">
        <h3>Faturamento por dia</h3>
        {serie.length === 0 ? (
          <p className="vazio">Nenhuma venda no período selecionado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={serie} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={COR_GRADE} vertical={false} />
              <XAxis
                dataKey="rotulo"
                stroke={COR_EIXO}
                tick={{ fill: COR_EIXO, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: COR_GRADE }}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                stroke={COR_EIXO}
                tick={{ fill: COR_EIXO, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(valor: number) => dinheiro(valor)}
              />
              <Tooltip
                cursor={{ stroke: '#3a352e', strokeWidth: 1 }}
                contentStyle={{
                  background: '#221e1a',
                  border: '1px solid #3a352e',
                  borderRadius: 3,
                  color: '#edeae4',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
                labelStyle={{ color: '#8f8a80', marginBottom: 4 }}
                labelFormatter={(rotulo: string) => {
                  const ponto = serie.find((item) => item.rotulo === rotulo);
                  return ponto ? dataBr(ponto.data) : rotulo;
                }}
                formatter={(valor: number, nome: string) => [dinheiro(valor), nome]}
              />
              <Line
                type="monotone"
                dataKey="faturamento"
                name="Faturamento"
                stroke={COR_PRINCIPAL}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, stroke: '#1c1916', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <Tabela titulo="Desempenho — funil de venda" grupos={p.porFunil} coluna="Funil" />
      <Tabela titulo="Faturamento por vendedor" grupos={p.porVendedor} coluna="Vendedor" />
      <Tabela titulo="Produtos vendidos" grupos={p.porProduto} coluna="Produto" />

      <section className="secao">
        <h2 className="secao-titulo">Clientes</h2>
        <p className="secao-sub">Quem comprou no período, da venda mais recente para a mais antiga.</p>
        {p.clientes.length === 0 ? (
          <p className="vazio">Nenhuma venda no período selecionado.</p>
        ) : (
          <div className="ht-rolagem">
            <table className="ht-tabela">
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Lead</th>
                  <th>Call</th>
                  <th>Cliente</th>
                  <th>Funil</th>
                  <th>Pagamento</th>
                  <th>SDR</th>
                  <th>Mentor</th>
                  <th>Produto</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.clientes.map((c, i) => (
                  <tr key={`${c.cliente}-${c.data}-${i}`}>
                    <td className="num">{c.data ? diaCurto(c.data) : '—'}</td>
                    <td className="num">{c.dataLead ? diaCurto(c.dataLead) : '—'}</td>
                    <td className="num">{c.dataCall ? diaCurto(c.dataCall) : '—'}</td>
                    <td>{c.cliente || '—'}</td>
                    <td>{c.funil || '—'}</td>
                    <td>{c.formaDePagamento || '—'}</td>
                    <td>{c.sdr || '—'}</td>
                    <td>{c.mentor || '—'}</td>
                    <td>{c.produto || '—'}</td>
                    <td className="num">{dinheiro(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tabela({
  titulo,
  grupos,
  coluna,
}: {
  titulo: string;
  grupos: GrupoHighTicket[];
  coluna: string;
}) {
  return (
    <section className="secao">
      <h2 className="secao-titulo">{titulo}</h2>
      {grupos.length === 0 ? (
        <p className="vazio">Nenhuma venda no período selecionado.</p>
      ) : (
        <div className="ht-rolagem">
          <table className="ht-tabela">
            <thead>
              <tr>
                <th>{coluna}</th>
                <th className="num">Vendas</th>
                <th className="num">Entrada</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <tr key={grupo.chave}>
                  <td>{grupo.chave}</td>
                  <td className="num">{numero(grupo.vendas)}</td>
                  <td className="num">{dinheiro(grupo.entrada)}</td>
                  <td className="num">{dinheiro(grupo.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="metrica">
      <div className="metrica-rotulo">{rotulo}</div>
      <div className="metrica-valor num">{valor}</div>
      {nota && <div className="metrica-nota">{nota}</div>}
    </div>
  );
}

function Item({ n, t, extra }: { n: number; t: string; extra?: string }) {
  return (
    <div className="linha-item">
      {extra ? <div className="bloco-valor num">{extra}</div> : <div className="bloco-valor num">{numero(n)}</div>}
      <div className="t">{t}</div>
    </div>
  );
}
