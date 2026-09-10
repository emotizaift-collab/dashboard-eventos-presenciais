import React from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Metrics, MetricsResponse } from '../../shared/types';
import { dinheiro, numero, diaCurto, dataBr } from './format';

interface Props {
  dados: MetricsResponse;
}

/**
 * Cores do gráfico.
 *
 * O cobre fica só na série principal (Vendas) — é o resultado que o painel
 * existe para acompanhar. Leads é contexto e vai em cinza neutro.
 *
 * O cinza e escuro de proposito: Leads tem valores muito maiores que Vendas,
 * entao um cinza claro roubava o olhar justamente da serie que importa. Par
 * validado contra o fundo da pagina: ΔE 17,4 em visao normal, 14,3 em
 * protanopia, e contraste acima de 3:1 — passa em todas as checagens.
 */
const COR_PRINCIPAL = '#c08a4e';
const COR_SECUNDARIA = '#6e6a63';
const COR_EIXO = '#8f8a80';
const COR_GRADE = '#2a2621';

export function Painel({ dados }: Props) {
  const m = dados.metrics;
  const agrupado = m.serie.some((ponto) => ponto.date !== ponto.dateFim);
  const serie = m.serie.map((ponto) => ({
    ...ponto,
    rotulo:
      ponto.date === ponto.dateFim
        ? diaCurto(ponto.date)
        : `${diaCurto(ponto.date)}-${diaCurto(ponto.dateFim)}`,
  }));

  const lucro = m.retorno >= 0;

  return (
    <>
      <section className="heroi">
        <div className="heroi-rotulo">Resultado</div>
        <div className="heroi-valor num">{dinheiro(m.retorno)}</div>
        <div className="heroi-nota">
          <span className={`heroi-sinal ${lucro ? 'positivo' : 'negativo'}`}>
            {lucro ? 'Lucro' : 'Prejuízo'}
          </span>
          {' · '}
          Faturamento líquido menos o custo de campanha no período.
        </div>
      </section>

      <section className="metricas">
        <Metrica rotulo="Faturamento líquido" valor={dinheiro(m.faturamentoLiquido)} />
        <Metrica
          rotulo="Custo de campanha"
          valor={dinheiro(m.custoCampanha)}
          nota={
            m.fonteCompartilhada && m.fonteCompartilhada.custo > 0
              ? `Inclui ${dinheiro(m.fonteCompartilhada.custo)} do período, não separado por edição`
              : undefined
          }
        />
        <Metrica rotulo="Leads" valor={m.leadsSemFonte ? '—' : numero(m.leadsTotal)} nota={notaDosLeads(m)} />
        <Metrica rotulo="Participantes" valor={numero(m.participantes)} />
        <Metrica
          rotulo="Custo por lead"
          valor={m.custoPorLead === null ? '—' : dinheiro(m.custoPorLead)}
          nota={
            m.custoPorLead === null
              ? m.leadsSemFonte
                ? 'Não há como calcular sem leads próprios'
                : 'Sem leads no período'
              : undefined
          }
        />
      </section>

      <div className="grade-detalhe">
        <section className="secao">
          <h2 className="secao-titulo">Tipos de ingresso</h2>
          <p className="secao-sub">Quantidade vendida e o quanto cada tipo faturou.</p>
          <div className="linhas">
            {m.ingressos.map((tipo) => (
              <Item
                key={tipo.id}
                n={tipo.quantidade}
                t={tipo.label}
                extra={tipo.quantidade > 0 ? dinheiro(tipo.faturamento) : undefined}
              />
            ))}
          </div>
        </section>

        <section className="secao">
          <h2 className="secao-titulo">Embaixadores</h2>
          <p className="secao-sub">Convites gratuitos — não entram no faturamento.</p>
          <div className="linhas">
            <Item n={m.embaixador.embaixadores} t="Embaixadores" />
            <Item n={m.embaixador.convidados} t="Convidados" />
            <Item n={m.embaixador.total} t="Total" />
          </div>
        </section>
      </div>

      <section className="grafico">
        <h3>Leads e vendas {agrupado ? 'a cada 3 dias' : 'por dia'}</h3>
        <p className="grafico-sub">
          {agrupado
            ? 'O período tem mais de 31 dias, então cada ponto soma 3 dias.'
            : 'Um ponto por dia do período selecionado.'}
        </p>
        <ResponsiveContainer width="100%" height={330}>
          <LineChart data={serie} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={COR_GRADE} vertical={false} />
            <XAxis
              dataKey="rotulo"
              stroke={COR_EIXO}
              tick={{ fill: COR_EIXO, fontSize: serie.length > 20 ? 10 : 12 }}
              tickLine={false}
              axisLine={{ stroke: COR_GRADE }}
              tickMargin={8}
              interval={serie.length <= 31 ? 0 : 'preserveStartEnd'}
              minTickGap={serie.length <= 31 ? 0 : 28}
              angle={serie.length > 12 ? -45 : 0}
              textAnchor={serie.length > 12 ? 'end' : 'middle'}
              height={serie.length > 12 ? 68 : 30}
            />
            <YAxis
              stroke={COR_EIXO}
              tick={{ fill: COR_EIXO, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={48}
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
                if (!ponto) return rotulo;
                return ponto.date === ponto.dateFim
                  ? dataBr(ponto.date)
                  : `${dataBr(ponto.date)} a ${dataBr(ponto.dateFim)}`;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 13, paddingTop: 10, color: '#8f8a80' }}
              iconType="plainline"
              iconSize={18}
            />
            <Line
              type="monotone" dataKey="vendas" name="Vendas"
              stroke={COR_PRINCIPAL} strokeWidth={2.5} dot={false}
              activeDot={{ r: 4, stroke: '#1c1916', strokeWidth: 2 }}
            />
            <Line
              type="monotone" dataKey="leads" name="Leads"
              stroke={COR_SECUNDARIA} strokeWidth={1.5} dot={false}
              activeDot={{ r: 4, stroke: '#1c1916', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}

/**
 * Um "0" em Leads pode significar tres coisas muito diferentes, e sozinho ele
 * nao distingue nenhuma: deu zero no periodo, os leads deste evento estao
 * misturados com os de outro, ou nao ha fonte de lead nenhuma para ele. As
 * duas ultimas ja levaram a IFT a abrir chamado de bug em cima de numero certo.
 */
function notaDosLeads(m: Metrics): string | undefined {
  // Quando a selecao e uma edicao, os leads vem da fonte da linha e sao os do
  // periodo, nao os daquela edicao — quem separa uma edicao da outra e a data.
  const fonte = m.fonteCompartilhada;
  if (fonte && fonte.leads > 0) return 'Do período selecionado, não separado por edição';

  const balde = m.leadsCompartilhados;
  if (balde) {
    const quantos = `${numero(balde.quantidade)} lead${balde.quantidade === 1 ? '' : 's'}`;
    return m.leadsSemFonte
      ? `Os leads deste evento estão em "${balde.rotulo}" (${quantos}), sem como separar`
      : `Mais ${quantos} em "${balde.rotulo}", sem como separar`;
  }
  if (m.leadsSemFonte) return 'Este evento não aparece na planilha de leads';
  return undefined;
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
      <div className="bloco-valor num">{numero(n)}</div>
      <div className="t">{t}</div>
      {extra && <div className="extra num">{extra}</div>}
    </div>
  );
}
