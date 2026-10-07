import { prisma } from '../db/prisma.js';

export function listarAtivos() {
  return prisma.canalDenuncia.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  });
}
