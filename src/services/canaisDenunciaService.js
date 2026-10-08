import { prisma } from '../db/prisma.js';

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
