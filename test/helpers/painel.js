import assert from 'node:assert/strict';
import request from 'supertest';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/db/prisma.js';
import { gerarHash } from '../../src/utils/senha.js';
import { cifrar, codigoDoPasso, passoAtual } from '../../src/utils/totp.js';
import { mockPrisma } from './mockPrisma.js';

export const SENHA = 'senha-de-teste-123';
export const SEGREDO_TOTP = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
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
    // Todas as contas de teste já têm a 2FA ativa (obrigatória no painel).
    totpSegredo: cifrar(SEGREDO_TOTP),
    totpAtivadoEm: new Date(),
    totpUltimoPasso: null,
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
  // Anti-reuso do código: o helper repete logins no mesmo passo, então aqui sempre libera.
  mockPrisma(prisma.admin, 'updateMany', async () => ({ count: 1 }));
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

export const codigoTotp = (segredo = SEGREDO_TOTP) => codigoDoPasso(segredo, passoAtual());

// Login completo: senha e depois o código de 2FA.
export async function logar(app, email) {
  const agente = request.agent(app);
  const res = await enviar(agente, '/painel/entrar', { email, senha: SENHA });
  assert.equal(res.status, 302, 'login deveria funcionar');
  assert.equal(res.headers.location, '/painel/entrar/2fa');
  const res2 = await enviar(agente, '/painel/entrar/2fa', { codigo: codigoTotp() });
  assert.equal(res2.status, 302, '2FA deveria funcionar');
  return agente;
}
