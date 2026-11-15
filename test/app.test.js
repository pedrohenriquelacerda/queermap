import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

// Sem sessionStore o express-session usa memória. Rotas fixas: não precisam do banco.
const app = createApp();

test('arquivos do Leaflet são servidos localmente', async () => {
  const res = await request(app).get('/vendor/leaflet/leaflet.js');
  assert.equal(res.status, 200);
});

test('rota inexistente retorna 404', async () => {
  const res = await request(app).get('/nao-existe');
  assert.equal(res.status, 404);
  assert.match(res.text, /Página não encontrada/);
});

test('envia cabeçalhos de segurança', async () => {
  const res = await request(app).get('/sobre');
  assert.ok(res.headers['content-security-policy']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('envia Referer de origem para os tiles do OpenStreetMap', async () => {
  const res = await request(app).get('/sobre');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});

test('erro interno não leva dados do usuário para o log', async (t) => {
  t.after(restaurarPrisma);
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  const erroPrisma = Object.assign(
    new Error(
      'Invalid `prisma.envio.create()`: mensagem: "Sofri preconceito", email: "pessoa@teste.test"',
    ),
    { name: 'PrismaClientKnownRequestError', code: 'P2002' },
  );
  mockPrisma(prisma.local, 'findMany', async () => {
    throw erroPrisma;
  });
  mockPrisma(prisma.categoria, 'findMany', async () => []);

  const res = await request(app).get('/?q=pessoa@teste.test');

  assert.equal(res.status, 500);
  assert.match(res.text, /Algo deu errado/);
  const log = logs.join('\n');
  assert.match(log, /PrismaClientKnownRequestError P2002 em GET \/$/m);
  assert.match(log, /at /); // onde aconteceu continua no log
  assert.doesNotMatch(log, /Sofri preconceito|pessoa@teste\.test/);
});
