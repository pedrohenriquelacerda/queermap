import assert from 'node:assert/strict';
import request from 'supertest';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/db/prisma.js';
import { gerarHash } from '../../src/utils/senha.js';
import { mockPrisma } from './mockPrisma.js';

export const SENHA = 'senha-de-teste-123';
let hash;

// Cria as "tabelas" em memória de pessoas e auditoria e liga os mocks do Prisma.
export async function prepararAdmins(extras = []) {
  hash ??= await gerarHash(SENHA);
  const pessoa = (id, email, papel, outros = {}) => ({
    id,
    nome: `Pessoa ${id}`,
    email,
    papel,
    ativo: true,
    precisaTrocarSenha: false,
    senhaHash: hash,
    ...outros,
  });
  const admins = [
    pessoa(1, 'admin@teste.test', 'ADMIN'),
    pessoa(2, 'editor@teste.test', 'EDITOR'),
    ...extras.map((e, i) => pessoa(3 + i, e.email, e.papel ?? 'EDITOR', e)),
  ];
  const auditoria = [];
  const achar = ({ where }) =>
    admins.find((a) => (where.id ? a.id === where.id : a.email === where.email)) ?? null;

  mockPrisma(prisma.admin, 'findUnique', async (args) => achar(args));
  mockPrisma(prisma.admin, 'findMany', async () => admins);
  mockPrisma(
    prisma.admin,
    'count',
    async ({ where }) =>
      admins.filter((a) => a.papel === 'ADMIN' && a.ativo && a.id !== where.id.not).length,
  );
  mockPrisma(prisma.admin, 'update', async ({ where, data }) =>
    Object.assign(achar({ where }), data),
  );
  mockPrisma(prisma.admin, 'create', async ({ data }) => {
    const nova = { id: admins.length + 1, ativo: true, ...data };
    admins.push(nova);
    return nova;
  });
  mockPrisma(prisma.logAuditoria, 'create', async ({ data }) => auditoria.push(data));
  return { admins, auditoria };
}

// Envio de formulário como o navegador faria (com Origin do próprio site).
export const enviar = (agente, url, dados) =>
  agente.post(url).type('form').set('Origin', env.siteUrl).send(dados);

export async function logar(app, email) {
  const agente = request.agent(app);
  const res = await enviar(agente, '/painel/entrar', { email, senha: SENHA });
  assert.equal(res.status, 302, 'login deveria funcionar');
  return agente;
}
