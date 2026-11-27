// As datas dos filtros são dias no horário de Brasília. O Brasil não tem horário de verão
// desde 2019, então o fuso é fixo em -03:00 (o mesmo usado em fmt.dataHora).
const FUSO_BRASILIA = '-03:00';

// "2026-11-05" -> início desse dia em Brasília; null se a data não existir (ex.: 30/02).
export function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}T00:00:00${FUSO_BRASILIA}`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor ? data : null;
}

// Limite exclusivo que inclui o dia inteiro escolhido (início do dia seguinte).
export function fimDoDia(inicioDoDia) {
  const exclusivo = new Date(inicioDoDia);
  exclusivo.setUTCDate(exclusivo.getUTCDate() + 1);
  return exclusivo;
}

const partesBrasilia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: 'numeric',
});

// Ano e mês (1-12) de um instante, no horário de Brasília.
export function anoMesBrasilia(instante = new Date()) {
  const partes = Object.fromEntries(
    partesBrasilia.formatToParts(instante).map(({ type, value }) => [type, value]),
  );
  return { ano: Number(partes.year), mes: Number(partes.month) };
}

// Primeiro instante do mês seguinte, em Brasília (quando o cookie do mês expira).
export function inicioDoProximoMes({ ano, mes }) {
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return new Date(
    `${proximoAno}-${String(proximoMes).padStart(2, '0')}-01T00:00:00${FUSO_BRASILIA}`,
  );
}
