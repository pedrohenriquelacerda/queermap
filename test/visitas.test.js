import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { anoMesBrasilia, inicioDoProximoMes } from '../src/utils/periodo.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();
const NAVEGADOR = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0';
let upserts;

beforeEach(() => {
  upserts = [];
  mockPrisma(prisma.visitaMensal, 'upsert', async (args) => upserts.push(args));
  mockPrisma(prisma.canalDenuncia, 'findMany', async () => []);
  mockPrisma(prisma.categoria, 'findMany', async () => []);
  mockPrisma(prisma.local, 'findMany', async () => []);
  mockPrisma(prisma.local, 'findFirst', async () => null); // local inexistente -> 404
  mockPrisma(prisma, '$queryRaw', async () => [{ ok: 1 }]); // health check
});
afterEach(restaurarPrisma);

const mesAtual = () => {
  const { ano, mes } = anoMesBrasilia();
  return `${ano}-${String(mes).padStart(2, '0')}`;
};

test('primeiro acesso do mês conta 1 e entrega o cookie só com o mês', async () => {
  const res = await request(app).get('/sobre').set('User-Agent', NAVEGADOR);
  assert.equal(res.status, 200);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].update, { total: { increment: 1 } });
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('sq_v='));
  assert.ok(cookie.startsWith(`sq_v=${mesAtual()};`), 'o cookie guarda só AAAA-MM');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Expires=/i);
});

test('quem já tem o cookie do mês não conta de novo', async () => {
  const res = await request(app)
    .get('/sobre')
    .set('User-Agent', NAVEGADOR)
    .set('Cookie', `sq_v=${mesAtual()}`);
  assert.equal(res.status, 200);
  assert.equal(upserts.length, 0);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('cookie de outro mês conta como novo visualizador', async () => {
  await request(app).get('/sobre').set('User-Agent', NAVEGADOR).set('Cookie', 'sq_v=2020-01');
  assert.equal(upserts.length, 1);
});

test('robôs, requisições sem User-Agent, HEAD e erro 404 não contam', async () => {
  await request(app).get('/sobre').set('User-Agent', 'Googlebot/2.1');
  await request(app).get('/sobre').set('User-Agent', '');
  await request(app).head('/sobre').set('User-Agent', NAVEGADOR);
  const naoExiste = await request(app).get('/nao-existe').set('User-Agent', NAVEGADOR);
  const semLocal = await request(app).get('/locais/nao-existe').set('User-Agent', NAVEGADOR);
  assert.equal(naoExiste.status, 404);
  assert.equal(semLocal.status, 404);
  assert.equal(upserts.length, 0);
});

test('health check e painel não contam', async () => {
  const saude = await request(app).get('/health').set('User-Agent', NAVEGADOR);
  const painel = await request(app).get('/painel/entrar').set('User-Agent', NAVEGADOR);
  assert.equal(saude.status, 200);
  assert.equal(painel.status, 200);
  assert.equal(upserts.length, 0);
});

test('falha ao gravar a contagem não derruba a página', async () => {
  restaurarPrisma();
  mockPrisma(prisma.visitaMensal, 'upsert', async () => {
    throw new Error('banco fora do ar');
  });
  const res = await request(app).get('/sobre').set('User-Agent', NAVEGADOR);
  assert.equal(res.status, 200);
});

test('a página de privacidade explica a contagem de visitantes', async () => {
  const res = await request(app).get('/privacidade').set('User-Agent', NAVEGADOR);
  assert.match(res.text, /quantos visitantes/);
});

test('o cookie expira no início do mês seguinte (Brasília)', () => {
  assert.equal(
    inicioDoProximoMes({ ano: 2026, mes: 12 }).toISOString(),
    '2027-01-01T03:00:00.000Z',
  );
  assert.equal(
    inicioDoProximoMes({ ano: 2026, mes: 11 }).toISOString(),
    '2026-12-01T03:00:00.000Z',
  );
});
