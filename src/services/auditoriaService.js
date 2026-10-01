import { prisma } from '../db/prisma.js';

// Registra uma ação do painel. Ex.: registrar(req, 'admin.criar', 'Admin', novo.id, { email })
export function registrar(req, acao, entidade, entidadeId = null, detalhes = null) {
  return prisma.logAuditoria.create({
    data: { adminId: req.admin?.id ?? null, acao, entidade, entidadeId, detalhes },
  });
}
