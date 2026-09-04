export const dinheiro = (valor: number): string =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const numero = (valor: number): string => valor.toLocaleString('pt-BR');

/** "2026-09-04" -> "04/09" */
export const diaCurto = (iso: string): string => {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
};

/** "2026-09-04" -> "04/09/2026" */
export const dataBr = (iso: string): string => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

export const horaBr = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const hoje = (): string => new Date().toISOString().slice(0, 10);

export const diasAtras = (dias: number): string => {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
};

export const inicioDoMes = (): string => new Date().toISOString().slice(0, 8) + '01';
