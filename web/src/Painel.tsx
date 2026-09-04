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
  const serie = m.serie.map((ponto) => ({ ...ponto, rotulo: diaCurto(ponto.date) }));

  return (
    <>
      <div className="grade-principal">
        <Card rotulo="Total Custo Campanha" valor={dinheiro(m.custoCampanha)} />
        <Card rotulo="Faturamento Líquido" valor={dinheiro(m.faturamentoLiquido)} />
        <Card
          rotulo="Retorno"
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
        <h3>Leads e vendas por dia</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={serie} margin={{ top: 5, right: 12, left: -12, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3348" />
            <XAxis dataKey="rotulo" stroke="#93a0bb" fontSize={12} tickMargin={8} minTickGap={18} />
            <YAxis stroke="#93a0bb" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: '#1e2536', border: '1px solid #2a3348',
                borderRadius: 10, color: '#e8ecf5', fontSize: 13,
              }}
              labelFormatter={(rotulo: string) => {
                const ponto = serie.find((item) => item.rotulo === rotulo);
                return ponto ? dataBr(ponto.date) : rotulo;
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
