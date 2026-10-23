import { prisma } from '../db/prisma.js';
import { slugUnico } from '../utils/slug.js';
import * as auditoria from './auditoriaService.js';

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

export function atualizar(id, { caracteristicas, ...dados }, req, versao) {
  return prisma.$transaction(async (tx) => {
    const atual = await buscarParaAlterar(tx, id, versao);
    const alterados = camposAlterados(atual, { ...dados, caracteristicas });
    await tx.local
      .update({
        where: { id },
        data: {
          ...dados,
          atualizadoPorId: req.admin.id,
          caracteristicas: { set: caracteristicas.map((cid) => ({ id: cid })) },
        },
      })
      .catch((err) => {
        // Erros de referências fornecidas no formulário, não da auditoria.
        if (['P2003', 'P2018'].includes(err.code)) {
          throw Object.assign(new Error('Categoria ou características inválidas.'), {
            status: 400,
          });
        }
        throw err;
      });
    await auditoria.registrar(req, 'local.atualizar', 'Local', id, { alterados }, tx);
  });
}

// Mudanças de situação (publicar, despublicar, arquivar, restaurar).
export const ACOES = {
  publicar: () => ({ publicado: true, publicadoEm: new Date(), arquivadoEm: null }),
  despublicar: () => ({ publicado: false }),
  arquivar: () => ({ publicado: false, arquivadoEm: new Date() }),
  restaurar: () => ({ arquivadoEm: null }),
};

// Lista explícita: propriedades herdadas nunca são ações.
export const ACOES_PERMITIDAS = ['publicar', 'despublicar', 'arquivar', 'restaurar'];

export function mudarSituacao(id, acao, req, versao) {
  if (!ACOES_PERMITIDAS.includes(acao)) {
    throw Object.assign(new Error('Ação não encontrada.'), { status: 404 });
  }
  return prisma.$transaction(async (tx) => {
    const atual = await buscarParaAlterar(tx, id, versao);
    await tx.local.update({
      where: { id },
      data: { ...ACOES[acao](), atualizadoPorId: req.admin.id },
    });
    await auditoria.registrar(req, `local.${acao}`, 'Local', id, { nome: atual.nome }, tx);
  });
}

async function buscarParaAlterar(tx, id, versao) {
  await tx.$queryRaw`SELECT id FROM local WHERE id = ${id} FOR UPDATE`;
  const atual = await tx.local.findUnique({
    where: { id },
    include: { caracteristicas: { select: { id: true } } },
  });
  if (!atual) throw Object.assign(new Error('Local não encontrado.'), { status: 404 });
  if (versao !== undefined && atual.atualizadoEm.toISOString() !== versao) {
    throw Object.assign(
      new Error('O local mudou. Recarregue a página antes de tentar novamente.'),
      { status: 409 },
    );
  }
  return atual;
}

function camposAlterados(antes, depois) {
  const ids = antes.caracteristicas
    .map((c) => c.id)
    .sort()
    .join(',');
  return Object.keys(depois).filter((campo) =>
    campo === 'caracteristicas'
      ? [...depois.caracteristicas].sort().join(',') !== ids
      : String(antes[campo] ?? '') !== String(depois[campo] ?? ''),
  );
}

// O bloqueio impede que restauração/edição concorra com a validação da exclusão.
// A FK dos envios também impede novos vínculos enquanto o local é excluído.
export async function apagar(id, versao, req) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM local WHERE id = ${id} FOR UPDATE`;
    const local = await tx.local.findUnique({ where: { id } });
    if (!local) throw Object.assign(new Error('Local não encontrado.'), { status: 404 });
    if (!local.arquivadoEm || local.publicado || local.atualizadoEm.toISOString() !== versao) {
      throw Object.assign(
        new Error('O local mudou ou não está arquivado. Confira os dados novamente.'),
        { status: 409 },
      );
    }
    const relatos = await tx.envio.updateMany({
      where: { localId: id },
      data: { nomeLocalRelato: local.nome },
    });
    await tx.local.delete({ where: { id } });
    await auditoria.registrar(
      req,
      'local.apagar',
      'Local',
      id,
      {
        nome: local.nome,
        relatosPreservados: relatos.count,
      },
      tx,
    );
  });
}
