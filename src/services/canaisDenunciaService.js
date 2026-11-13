import { prisma } from '../db/prisma.js';
import { slugUnico } from '../utils/slug.js';

const ordenacao = [{ ordem: 'asc' }, { nome: 'asc' }];

export function listarAtivos() {
  return prisma.canalDenuncia.findMany({ where: { ativo: true }, orderBy: ordenacao });
}

export function listarTodos() {
  return prisma.canalDenuncia.findMany({ orderBy: ordenacao });
}

export function buscar(id) {
  return prisma.canalDenuncia.findUnique({ where: { id } });
}

export function atualizar(id, dados) {
  return prisma.canalDenuncia.update({ where: { id }, data: dados });
}

export async function criar(dados) {
  const slug = await slugUnico(dados.nome, async (s) =>
    Boolean(await prisma.canalDenuncia.findUnique({ where: { slug: s }, select: { id: true } })),
  );
  return prisma.canalDenuncia.create({ data: { ...dados, slug } });
}
