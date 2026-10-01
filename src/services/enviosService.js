import { prisma } from '../db/prisma.js';
import { gerarCodigo, hashCodigo, mesmoHash } from '../utils/hash.js';

export const LIMITE_ENVIOS = 5; // por e-mail...
export const JANELA_DIAS = 30; // ...a cada 30 dias
export const VALIDADE_CODIGO_MIN = 15;
export const MAX_TENTATIVAS = 5;

const diasAtras = (dias) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

export async function atingiuLimite(emailHash) {
  const recentes = await prisma.registroEnvio.count({
    where: { emailHash, criadoEm: { gte: diasAtras(JANELA_DIAS) } },
  });
  return recentes >= LIMITE_ENVIOS;
}

// Cria o código de confirmação. Só o hash do código fica salvo.
export async function criarVerificacao(emailHash) {
  const codigo = gerarCodigo();
  const verificacao = await prisma.verificacaoEmail.create({
    data: {
      emailHash,
      codigoHash: hashCodigo(emailHash, codigo),
      expiraEm: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000),
    },
  });
  return { verificacaoId: verificacao.id, codigo };
}

// Retorna null se o código confere; senão, o motivo do erro.
export async function conferirCodigo(verificacaoId, emailHash, codigo) {
  const v = await prisma.verificacaoEmail.findUnique({ where: { id: verificacaoId } });
  if (!v || v.emailHash !== emailHash || v.usadoEm) return 'invalido';
  if (v.expiraEm < new Date()) return 'expirado';
  if (v.tentativas >= MAX_TENTATIVAS) return 'tentativas';

  if (!mesmoHash(v.codigoHash, hashCodigo(emailHash, codigo))) {
    // O incremento é feito no banco (atômico); usamos o valor que ele devolve.
    const { tentativas } = await prisma.verificacaoEmail.update({
      where: { id: v.id },
      data: { tentativas: { increment: 1 } },
    });
    return tentativas >= MAX_TENTATIVAS ? 'tentativas' : 'incorreto';
  }

  await prisma.verificacaoEmail.update({ where: { id: v.id }, data: { usadoEm: new Date() } });
  return null;
}

// Grava o envio e conta mais um para o limite (sem ligação entre os dois registros).
export function registrar(dados, emailHash) {
  return prisma.$transaction([
    prisma.envio.create({ data: dados }),
    prisma.registroEnvio.create({ data: { emailHash } }),
  ]);
}

export function locaisParaSelecao() {
  return prisma.local.findMany({
    where: { publicado: true, arquivadoEm: null },
    select: { id: true, nome: true, slug: true, bairro: true },
    orderBy: { nome: 'asc' },
  });
}
