// Regra única para a lista e os marcadores. Distâncias são medidas em quilômetros.
export function distanciaKm(origem, destino) {
  const pontos = [...origem, ...destino];
  if (
    pontos.some((n) => !Number.isFinite(n)) ||
    Math.abs(origem[0]) > 90 ||
    Math.abs(destino[0]) > 90 ||
    Math.abs(origem[1]) > 180 ||
    Math.abs(destino[1]) > 180
  )
    return Infinity;
  const rad = (graus) => (graus * Math.PI) / 180;
  const dLat = rad(destino[0] - origem[0]);
  const dLng = rad(destino[1] - origem[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(origem[0])) * Math.cos(rad(destino[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function localCorresponde(
  local,
  { termos = [], tipos = [], caracteristicas = [], nota = null, distancia = null, origem = null },
) {
  return (
    (nota === null || (Number.isFinite(nota) && nota >= 1 && nota <= 5)) &&
    (distancia === null || (Number.isFinite(distancia) && distancia >= 0)) &&
    termos.every((t) => local.busca.includes(t)) &&
    (tipos.length === 0 || tipos.includes(local.tipo)) &&
    caracteristicas.every((c) => local.caracteristicas.includes(c)) &&
    (nota === null || (Number.isFinite(local.nota) && local.nota >= nota)) &&
    (distancia === null ||
      (origem !== null && distanciaKm(origem, [local.lat, local.lng]) <= distancia))
  );
}
