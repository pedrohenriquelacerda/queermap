import { prisma } from '../db/prisma.js';

const camposSessao = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  precisaTrocarSenha: true,
};

export function buscarParaSessao(id) {
  return prisma.admin.findUnique({ where: { id }, select: { ...camposSessao, senhaHash: true } });
}

export function buscarPorEmail(email) {
  return prisma.admin.findUnique({ where: { email } });
}

export function buscarPorId(id) {
  return prisma.admin.findUnique({ where: { id } });
}

export function listar() {
  return prisma.admin.findMany({
    select: { ...camposSessao, ultimoLoginEm: true, criadoEm: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
}

export function criar(dados) {
  return prisma.admin.create({ data: dados, select: camposSessao });
}

export function atualizar(id, dados) {
  return prisma.admin.update({ where: { id }, data: dados, select: camposSessao });
}

// Admins ativos além desta pessoa (para nunca ficar sem ninguém administrando).
export function contarOutrosAdminsAtivos(id) {
  return prisma.admin.count({ where: { papel: 'ADMIN', ativo: true, id: { not: id } } });
}
