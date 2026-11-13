import { env } from '../config/env.js';

// Busca de endereço no Nominatim (OpenStreetMap). Política de uso:
// https://operations.osmfoundation.org/policies/nominatim/
// - identificar o aplicativo no User-Agent;
// - no máximo 1 consulta por segundo (aqui, uma fila simples no servidor).

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const INTERVALO_MS = 1100;
let proximaLiberada = 0;

// Retângulo do Rio Grande do Sul (oeste, norte, leste, sul), para a busca do mapa público.
export const REGIAO_RS = '-57.65,-27.08,-49.69,-33.75';

// Busca o endereço e, se nada for encontrado, tenta variações mais fáceis para o Nominatim
// (abreviações por extenso, cidade padrão, sem o número). No máximo 3 consultas.
export async function buscarEndereco(consulta, opcoes = {}) {
  for (const variante of variantesDaConsulta(consulta, opcoes)) {
    const resultados = await consultar(variante, opcoes);
    if (resultados.length > 0) return resultados;
  }
  return [];
}

const ABREVIACOES = [
  [/\bav\.?(?=\s)/gi, 'Avenida'],
  [/\br\.(?=\s)/gi, 'Rua'],
  [/^r\s+/i, 'Rua '],
  [/\btv\.?(?=\s)/gi, 'Travessa'],
  [/\bpç\.?(?=\s)|\bpca\.?(?=\s)/gi, 'Praça'],
  [/\bestr\.?(?=\s)/gi, 'Estrada'],
];

// Exportada para os testes.
export function variantesDaConsulta(consulta, { cidadePadrao } = {}) {
  const original = consulta.trim();
  let expandida = original;
  for (const [padrao, porExtenso] of ABREVIACOES) expandida = expandida.replace(padrao, porExtenso);
  const comCidade = (texto) =>
    cidadePadrao && !normalizar(texto).includes(normalizar(cidadePadrao))
      ? `${texto}, ${cidadePadrao}`
      : texto;
  // "Rua X, 123" ou "Rua X 123" → "Rua X": a rua acha mesmo quando o número não está no mapa.
  const semNumero = expandida.replace(/[,\s]+(n[º°o.]?\s*)?\d+[a-z]?\b(?=\s*(,|-|$))/i, '');
  const variantes = [original, comCidade(expandida), comCidade(semNumero)];
  return [...new Set(variantes.filter((v) => v.length >= 3))].slice(0, 3);
}

function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Com `regiao`, só devolve resultados dentro do retângulo.
async function consultar(consulta, { regiao } = {}) {
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
  if (regiao) {
    url.searchParams.set('viewbox', regiao);
    url.searchParams.set('bounded', '1');
  }

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
