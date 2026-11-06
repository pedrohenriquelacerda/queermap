import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, logar, enviar } from './helpers/painel.js';

const app = createApp();
let consulta;

beforeEach(async () => {
  await prepararAdmins();
  consulta = null;
  mockPrisma(prisma.logAuditoria, 'count', async ({ where }) => {
    consulta = where;
    return 1;
  });
  mockPrisma(prisma.logAuditoria, 'findMany', async (args) => {
    if (args.distinct) return [{ acao: 'local.criar' }, { acao: 'sessao.entrar' }];
    return [
      {
        id: 1,
        criadoEm: new Date('2026-11-05T12:30:00Z'),
        acao: 'local.criar',
        entidade: 'Local',
        entidadeId: 42,
        admin: { nome: 'Pessoa 1', email: 'admin@teste.test' },
      },
    ];
  });
});

afterEach(restaurarPrisma);

test('histórico exige login e papel Administração', async () => {
  const anonimo = await request(app).get('/painel/auditoria');
  assert.equal(anonimo.status, 302);
  const editor = await logar(app, 'editor@teste.test');
  assert.equal((await editor.get('/painel/auditoria')).status, 403);
  const admin = await logar(app, 'admin@teste.test');
  const resposta = await admin.get('/painel/auditoria');
  assert.equal(resposta.status, 200);
  assert.match(resposta.text, /Histórico de ações/);
  assert.match(resposta.text, /local\.criar/);
  assert.match(resposta.text, /Local #42/);
});

test('filtros de pessoa, ação e período são combinados na consulta', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const resposta = await admin.get(
    '/painel/auditoria?pessoa=1&acao=local.criar&inicio=2026-11-01&fim=2026-11-05',
  );
  assert.equal(resposta.status, 200);
  assert.deepEqual(consulta, {
    adminId: 1,
    acao: 'local.criar',
    criadoEm: {
      gte: new Date('2026-11-01T03:00:00Z'),
      lt: new Date('2026-11-06T03:00:00Z'),
    },
  });
});

test('histórico não oferece alteração nem exclusão por HTTP', async () => {
  const admin = await logar(app, 'admin@teste.test');
  assert.ok((await enviar(admin, '/painel/auditoria', {})).status >= 400);
  assert.ok((await admin.delete('/painel/auditoria')).status >= 400);
});
