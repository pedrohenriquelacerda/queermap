// Filtro automático de conteúdo: só MARCA o envio para a ONG revisar com atenção.
// Nunca bloqueia, porque um relato de discriminação pode citar ofensas recebidas.

import { normalizar } from './formatadores.js';

// Lista curta de termos ofensivos comuns (sem acento, minúsculas). A ONG pode ampliar.
const TERMOS_OFENSIVOS = [
  'viado',
  'veado',
  'bicha',
  'sapatao',
  'traveco',
  'baitola',
  'boiola',
  'puta',
  'caralho',
  'porra',
  'merda',
  'vagabund',
  'arrombad',
  'filho da puta',
  'vai tomar no',
];

export function analisar(texto) {
  const motivos = [];
  const normal = normalizar(texto);

  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|xyz|io|br)\b/i.test(texto)) {
    motivos.push('contém link');
  }
  if (TERMOS_OFENSIVOS.some((t) => new RegExp(`\\b${t}`).test(normal))) {
    motivos.push('linguagem ofensiva');
  }
  const letras = texto.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letras.length >= 20 && letras === letras.toUpperCase()) {
    motivos.push('texto todo em maiúsculas');
  }
  if (/(.)\1{7,}/.test(texto)) {
    motivos.push('caracteres repetidos');
  }

  return { sinalizado: motivos.length > 0, motivoFiltro: motivos.join(', ') || null };
}
