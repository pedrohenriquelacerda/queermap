import { env } from '../config/env.js';

// Busca de endereço no Nominatim (OpenStreetMap). Política de uso:
// https://operations.osmfoundation.org/policies/nominatim/
// - identificar o aplicativo no User-Agent;
// - no máximo 1 consulta por segundo (aqui, uma fila simples no servidor).

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const INTERVALO_MS = 1100;
let proximaLiberada = 0;

export async function buscarEndereco(consulta) {
  const agora = Date.now();
  const espera = Math.max(0, proximaLiberada - agora);
  proximaLiberada = Math.max(agora, proximaLiberada) + INTERVALO_MS;
  if (espera) await new Promise((r) => setTimeout(r, espera));

  const url = new URL(URL_NOMINATIM);
  url.search = new URLSearchParams({
    q: consulta,
    format: 'jsonv2',
    countrycodes: 'br',
    limit: '5',
    'accept-language': 'pt-BR',
  });

  const resposta = await fetch(url, {
    headers: { 'User-Agent': `MapaSerQueer/0.1 (${env.siteUrl})` },
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const resultados = await resposta.json();
  return resultados.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    descricao: r.display_name,
  }));
}
