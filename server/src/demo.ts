/**
 * Dados de demonstracao.
 *
 * Usados enquanto a chave do Google nao esta configurada, para que o painel possa
 * ser aberto, revisado e aprovado antes de ligar nas planilhas de verdade.
 * Sao numeros inventados e o painel deixa isso explicito na tela.
 */
import type { AmbassadorRow, AppConfig, BuyerRow, DataSet, LeadRow, TrafficRow } from '../../shared/types.js';
import { nomeDoApelido } from '../../shared/types.js';

/** Gerador deterministico: os numeros de exemplo nao mudam a cada recarga. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function buildDemoDataSet(config: AppConfig): DataSet {
  const random = makeRandom(20260904);
  const leads: LeadRow[] = [];
  const buyers: BuyerRow[] = [];
  const traffic: TrafficRow[] = [];

  const today = new Date();
  const days: string[] = [];
  for (let i = 59; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    days.push(day.toISOString().slice(0, 10));
  }

  const nomes = ['Ana Souza', 'Carlos Lima', 'Marina Alves', 'Pedro Rocha', 'Julia Menezes'];

  for (const line of config.eventLines) {
    const edition = line.editions.find((item) => item.current) ?? line.editions[0];
    const primeiro = edition.aliases[0];
    const rotulo = primeiro ? nomeDoApelido(primeiro) : line.label;

    for (const date of days) {
      const qtdLeads = Math.floor(random() * 18) + 2;
      for (let i = 0; i < qtdLeads; i += 1) {
        leads.push({ date, rawEvent: rotulo, editionId: edition.id, lineId: line.id });
      }

      traffic.push({
        date,
        campaign: `[${rotulo}] [LEADS] [ABO] - demonstracao`,
        editionId: edition.id,
        lineId: line.id,
        cost: Math.round((random() * 480 + 120) * 100) / 100,
      });

      const qtdVendas = Math.floor(random() * 4);
      for (let i = 0; i < qtdVendas; i += 1) {
        const sorteio = random();
        const ticketKind = sorteio > 0.85 ? 'triplo' : sorteio > 0.55 ? 'duplo' : 'individual';
        buyers.push({
          linha: buyers.length + 2,
          date,
          rawEvent: rotulo,
          editionId: edition.id,
          lineId: line.id,
          ticketKind,
          rawTicketType: ticketKind,
          ambassador: '',
          valor: null,
        });
      }

      if (random() > 0.75) {
        buyers.push({
          linha: buyers.length + 2,
          date,
          rawEvent: rotulo,
          editionId: edition.id,
          lineId: line.id,
          ticketKind: 'cortesia',
          rawTicketType: 'convite embaixador',
          ambassador: nomes[Math.floor(random() * nomes.length)],
          valor: null,
        });
      }
    }
  }

  // No modo demonstracao os convites saem das proprias linhas de venda.
  const ambassadors: AmbassadorRow[] = buyers
    .filter((row) => row.ambassador.trim() !== '')
    .map((row) => ({
      linha: row.linha,
      date: row.date,
      rawEvent: row.rawEvent,
      editionId: row.editionId,
      lineId: row.lineId,
      ambassador: row.ambassador,
    }));

  return {
    leads,
    buyers,
    traffic,
    ambassadors,
    fetchedAt: new Date().toISOString(),
    falhas: [],
    warnings: [
      'Modo demonstracao: a chave de acesso do Google ainda nao foi configurada, entao estes numeros sao inventados.',
    ],
  };
}
