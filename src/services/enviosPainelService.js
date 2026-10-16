import { prisma } from '../db/prisma.js';

export const STATUS = ['NOVO', 'EM_ANALISE', 'RESOLVIDO', 'ARQUIVADO'];

// A listagem não precisa expor o texto nem o contato dos relatos.
export function listar() {
  return prisma.envio.findMany({
    select: { id: true, tipo: true, status: true, criadoEm: true, lidoEm: true },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: 100,
  });
}

export function buscar(id) {
  return prisma.envio.findUnique({ where: { id } });
}

// Alteração e auditoria são indivisíveis. A serialização impede que duas pessoas
// sobrescrevam silenciosamente a mesma situação ou a primeira data de leitura.
export async function alterar(id, adminId, acao, valor) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const atual = await tx.envio.findUnique({ where: { id } });
        if (!atual) return null;
        let data;
        let detalhes;
        if (acao === 'ler') {
          if (atual.lidoEm) return atual;
          data = { lidoEm: new Date() };
          detalhes = null;
        } else if (acao === 'situacao') {
          if (atual.status === valor) return atual;
          data = {
            status: valor,
            resolvidoEm: valor === 'RESOLVIDO' ? new Date() : null,
          };
          detalhes = { anterior: atual.status, novo: valor };
        } else {
          if (atual.notasInternas === valor) return atual;
          data = { notasInternas: valor };
          // Não duplica conteúdo sensível na auditoria.
          detalhes = { alterados: ['notasInternas'] };
        }
        const envio = await tx.envio.update({ where: { id }, data });
        await tx.logAuditoria.create({
          data: { adminId, acao: `envio.${acao}`, entidade: 'Envio', entidadeId: id, detalhes },
        });
        return envio;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (erro) {
    if (erro.code === 'P2034') {
      const conflito = new Error(
        'O envio foi alterado por outra pessoa. Atualize e tente novamente.',
      );
      conflito.status = 409;
      throw conflito;
    }
    throw erro;
  }
}
