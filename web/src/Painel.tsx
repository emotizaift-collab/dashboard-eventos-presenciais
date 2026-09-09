import React from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { MetricsResponse } from '../../shared/types';
import { dinheiro, numero, diaCurto, dataBr } from './format';

interface Props {
  dados: MetricsResponse;
}

export function Painel({ dados }: Props) {
  const m = dados.metrics;
  // Quando o servidor agrupa (acima de 31 dias no filtro), o rotulo vira a
  // faixa: "01/09-03/09". Ate 31 dias cada ponto e um dia.
  const agrupado = m.serie.some((ponto) => ponto.date !== ponto.dateFim);
  const serie = m.serie.map((ponto) => ({
    ...ponto,
    rotulo: ponto.date === ponto.dateFim
      ? diaCurto(ponto.date)
      : `${diaCurto(ponto.date)}-${diaCurto(ponto.dateFim)}`,
  }));

  return (
    <>
      <div className="grade-principal">
        <Card rotulo="Total Custo Campanha" valor={dinheiro(m.custoCampanha)} />
        <Card rotulo="Faturamento Líquido" valor={dinheiro(m.faturamentoLiquido)} />
        <Card
          rotulo="Resultado"
          valor={dinheiro(m.retorno)}
          tom={m.retorno >= 0 ? 'positivo' : 'negativo'}
          nota={m.retorno >= 0 ? 'No azul' : 'No vermelho'}
        />
        <Card rotulo="Leads Total" valor={numero(m.leadsTotal)} />
        <Card rotulo="Participantes" valor={numero(m.participantes)} />
        <Card
          rotulo="Custo por Lead"
          valor={m.custoPorLead === null ? '—' : dinheiro(m.custoPorLead)}
          nota={m.custoPorLead === null ? 'Sem leads no período' : undefined}
        />
      </div>

      <div className="grade-secundaria">
        <div className="bloco">
          <h3>Tipos de ingresso</h3>
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
        </div>
        <div className="bloco">
          <h3>Embaixadores</h3>
          <div className="linhas">
            <Item n={m.embaixador.embaixadores} t="Embaixador" />
            <Item n={m.embaixador.convidados} t="Convidados" />
            <Item n={m.embaixador.total} t="Total" />
          </div>
        </div>
      </div>

      <div className="grafico">
        <h3>
          Leads e vendas {agrupado ? 'a cada 3 dias' : 'por dia'}
          {agrupado && (
            <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 10, fontWeight: 400 }}>
              — o período tem mais de 31 dias, então cada ponto soma 3 dias
            </span>
          )}
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={serie} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3348" />
            <XAxis
              dataKey="rotulo"
              stroke="#93a0bb"
              fontSize={serie.length > 20 ? 10 : 12}
              tickMargin={8}
              interval={serie.length <= 31 ? 0 : 'preserveStartEnd'}
              minTickGap={serie.length <= 31 ? 0 : 28}
              angle={serie.length > 12 ? -45 : 0}
              textAnchor={serie.length > 12 ? 'end' : 'middle'}
              height={serie.length > 12 ? 68 : 30}
            />
            <YAxis stroke="#93a0bb" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: '#1e2536', border: '1px solid #2a3348',
                borderRadius: 10, color: '#e8ecf5', fontSize: 13,
              }}
              labelFormatter={(rotulo: string) => {
                const ponto = serie.find((item) => item.rotulo === rotulo);
                if (!ponto) return rotulo;
                return ponto.date === ponto.dateFim
                  ? dataBr(ponto.date)
                  : `${dataBr(ponto.date)} a ${dataBr(ponto.dateFim)}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
            <Line
              type="monotone" dataKey="leads" name="Leads"
              stroke="#4f8cff" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
            />
            <Line
              type="monotone" dataKey="vendas" name="Vendas"
              stroke="#2fbf71" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function Card({
  rotulo, valor, tom, nota,
}: {
  rotulo: string; valor: string; tom?: 'positivo' | 'negativo'; nota?: string;
}) {
  return (
    <div className="card">
      <div className="rotulo">{rotulo}</div>
      <div className={`valor${tom ? ` ${tom}` : ''}`}>{valor}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

function Item({ n, t, extra }: { n: number; t: string; extra?: string }) {
  return (
    <div className="linha-item">
      <div className="n">{numero(n)}</div>
      <div className="t">{t}</div>
      {extra && <div className="extra">{extra}</div>}
    </div>
  );
}
