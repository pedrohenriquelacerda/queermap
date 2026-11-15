import { prisma } from '../db/prisma.js';

// Registra uma ação do painel. Ex.: registrar(req, 'admin.criar', 'Admin', novo.id, { email })
export function registrar(req, acao, entidade, entidadeId = null, detalhes = null, db = prisma) {
  return db.logAuditoria.create({
    data: { adminId: req.admin?.id ?? null, acao, entidade, entidadeId, detalhes },
  });
}

// ─── Histórico (somente leitura) ────────────────────────────────────────────

export const POR_PAGINA = 50;

// Opções dos filtros: todas as pessoas (inclusive desativadas) e as ações já registradas.
export function opcoesFiltro() {
  return Promise.all([
    prisma.admin.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.logAuditoria.findMany({
      distinct: ['acao'],
      select: { acao: true },
      orderBy: { acao: 'asc' },
    }),
  ]);
}

export function contar(where) {
  return prisma.logAuditoria.count({ where });
}

// Os "detalhes" de cada registro não são listados.
export function listar(where, pagina) {
  return prisma.logAuditoria.findMany({
    where,
    select: {
      id: true,
      criadoEm: true,
      acao: true,
      entidade: true,
      entidadeId: true,
      admin: { select: { nome: true, email: true } },
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });
}
