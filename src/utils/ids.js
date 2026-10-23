// IDs autoincrementais positivos dos modelos Int do PostgreSQL.
export function idValido(valor) {
  return typeof valor === 'string' && /^[1-9]\d*$/.test(valor) && Number(valor) <= 2147483647;
}
