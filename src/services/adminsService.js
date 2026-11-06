import { prisma } from '../db/prisma.js';

const camposSessao = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  precisaTrocarSenha: true,
  totpAtivadoEm: true,
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

// --- 2FA ---

// Marca o passo do código como usado; falso se ele (ou um mais novo) já foi usado.
export async function usarPasso(id, passo) {
  const { count } = await prisma.admin.updateMany({
    where: { id, OR: [{ totpUltimoPasso: null }, { totpUltimoPasso: { lt: passo } }] },
    data: { totpUltimoPasso: passo },
  });
  return count === 1;
}

export async function usarCodigoRecuperacao(adminId, hash) {
  const { count } = await prisma.codigoRecuperacao.updateMany({
    where: { adminId, hash, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  return count === 1;
}

export function ativarDoisFatores(id, totpSegredo, passo, hashes) {
  return prisma.admin.update({
    where: { id },
    data: {
      totpSegredo,
      totpAtivadoEm: new Date(),
      totpUltimoPasso: passo,
      codigosRecuperacao: { deleteMany: {}, create: hashes.map((hash) => ({ hash })) },
    },
    select: camposSessao,
  });
}

export function redefinirDoisFatores(id) {
  return prisma.admin.update({
    where: { id },
    data: {
      totpSegredo: null,
      totpAtivadoEm: null,
      totpUltimoPasso: null,
      codigosRecuperacao: { deleteMany: {} },
    },
    select: camposSessao,
  });
}
