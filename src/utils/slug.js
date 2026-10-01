import { normalizar } from './formatadores.js';

export function slugify(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// Gera um slug que ainda não existe: "nome", "nome-2", "nome-3"...
export async function slugUnico(texto, existe) {
  const base = slugify(texto) || 'local';
  let slug = base;
  for (let n = 2; await existe(slug); n++) slug = `${base}-${n}`;
  return slug;
}
