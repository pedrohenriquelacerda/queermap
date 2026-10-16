import { prisma } from '../db/prisma.js';
import { hmac, mesmoHash } from '../utils/hash.js';

export const STATUS = ['NOVO', 'EM_ANALISE', 'RESOLVIDO', 'ARQUIVADO'];

export const TIPOS = ['SUGESTAO_LOCAL', 'ELOGIO', 'RECLAMACAO', 'DISCRIMINACAO'];

// Paginação e filtros no banco; nenhum relato ou contato vai para a lista.
export function listar({ tipo, status, pagina = 1 } = {}) {
  return prisma.envio.findMany({
    where: { ...(tipo ? { tipo } : {}), ...(status ? { status } : {}) },
    select: {
      id: true,
      tipo: true,
      status: true,
      criadoEm: true,
      lidoEm: true,
      nomeLocalSugerido: true,
      nomeLocalRelato: true,
      local: { select: { nome: true } },
      sinalizado: true,
      motivoFiltro: true,
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    skip: (pagina - 1) * 50,
    take: 51,
  });
}

export function buscar(id) {
  return prisma.envio.findUnique({
    where: { id },
    include: { local: { select: { nome: true } }, categoriaSugerida: { select: { nome: true } } },
  });
}

// A versão depende só das notas: leitura e situação não invalidam o formulário.
export function versaoNotas(envio) {
  return hmac(JSON.stringify(['notas-envio', envio.id, envio.notasInternas ?? null]));
}

// Alteração e auditoria são indivisíveis. A versão detecta formulários antigos;
// Serializable protege a comparação e gravação contra transações concorrentes.
export async function alterar(id, adminId, acao, valor, versaoEsperada) {
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
          if (!mesmoHash(versaoEsperada, versaoNotas(atual))) {
            const conflito = new Error(
              'As anotações foram alteradas por outra pessoa. Compare os textos antes de salvar novamente.',
            );
            conflito.status = 409;
            throw conflito;
          }
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
