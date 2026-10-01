import { prisma } from '../db/prisma.js';
import { slugUnico } from '../utils/slug.js';

export const SITUACOES = {
  rascunho: { publicado: false, arquivadoEm: null },
  publicado: { publicado: true, arquivadoEm: null },
  arquivado: { arquivadoEm: { not: null } },
};

export function situacao(local) {
  if (local.arquivadoEm) return 'arquivado';
  return local.publicado ? 'publicado' : 'rascunho';
}

export function listar({ situacao: filtro, busca }) {
  const where = { ...(SITUACOES[filtro] ?? { arquivadoEm: null }) };
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { bairro: { contains: busca, mode: 'insensitive' } },
    ];
  }
  return prisma.local.findMany({
    where,
    select: {
      id: true,
      nome: true,
      slug: true,
      bairro: true,
      publicado: true,
      arquivadoEm: true,
      atualizadoEm: true,
      categoria: { select: { nome: true, icone: true, slug: true } },
    },
    orderBy: { nome: 'asc' },
  });
}

export function contarPorSituacao() {
  return Promise.all(
    Object.entries(SITUACOES).map(async ([nome, where]) => [
      nome,
      await prisma.local.count({ where }),
    ]),
  ).then(Object.fromEntries);
}

export function buscar(id) {
  return prisma.local.findUnique({
    where: { id },
    include: {
      caracteristicas: { select: { id: true } },
      criadoPor: { select: { nome: true } },
      atualizadoPor: { select: { nome: true } },
    },
  });
}

export function opcoesFormulario() {
  return Promise.all([
    prisma.categoria.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    }),
    prisma.caracteristica.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } }),
  ]).then(([categorias, caracteristicas]) => ({ categorias, caracteristicas }));
}

export async function criar({ caracteristicas, ...dados }, adminId) {
  const slug = await slugUnico(dados.nome, async (s) =>
    Boolean(await prisma.local.findUnique({ where: { slug: s }, select: { id: true } })),
  );
  return prisma.local.create({
    data: {
      ...dados,
      slug,
      criadoPorId: adminId,
      atualizadoPorId: adminId,
      caracteristicas: { connect: caracteristicas.map((id) => ({ id })) },
    },
  });
}

export function atualizar(id, { caracteristicas, ...dados }, adminId) {
  return prisma.local.update({
    where: { id },
    data: {
      ...dados,
      atualizadoPorId: adminId,
      caracteristicas: { set: caracteristicas.map((cid) => ({ id: cid })) },
    },
  });
}

// Mudanças de situação (publicar, despublicar, arquivar, restaurar).
export const ACOES = {
  publicar: () => ({ publicado: true, publicadoEm: new Date(), arquivadoEm: null }),
  despublicar: () => ({ publicado: false }),
  arquivar: () => ({ publicado: false, arquivadoEm: new Date() }),
  restaurar: () => ({ arquivadoEm: null }),
};

export function mudarSituacao(id, acao, adminId) {
  return prisma.local.update({
    where: { id },
    data: { ...ACOES[acao](), atualizadoPorId: adminId },
  });
}
