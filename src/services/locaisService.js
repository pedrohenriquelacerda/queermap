import { prisma } from '../db/prisma.js';

// Apenas campos que podem ir para o público. Nada de autoria, notas ou datas internas.
const camposPublicos = {
  id: true,
  nome: true,
  slug: true,
  descricao: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  cep: true,
  latitude: true,
  longitude: true,
  telefone: true,
  whatsapp: true,
  email: true,
  site: true,
  horarioFuncionamento: true,
  atualizadoEm: true,
  categoria: { select: { nome: true, slug: true, icone: true, ordem: true } },
  caracteristicas: {
    where: { ativa: true },
    select: { nome: true, slug: true },
    orderBy: { nome: 'asc' },
  },
};

const visivel = { publicado: true, arquivadoEm: null };

export function listarPublicados() {
  return prisma.local.findMany({
    where: visivel,
    select: camposPublicos,
    orderBy: { nome: 'asc' },
  });
}

export function buscarPublicadoPorSlug(slug) {
  return prisma.local.findFirst({
    where: { ...visivel, slug },
    select: camposPublicos,
  });
}
