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

test('mapa base sem ícones de comércio: OpenFreeMap na CSP e MapLibre servido localmente', async () => {
  const res = await request(app).get('/sobre');
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /connect-src[^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(csp, /worker-src 'self'/);
  assert.doesNotMatch(csp, /cartocdn/);

  for (const arquivo of [
    '/vendor/maplibre/maplibre-gl.mjs',
    '/vendor/maplibre/maplibre-gl-worker.mjs',
    '/vendor/maplibre/maplibre-gl.css',
    '/vendor/maplibre-leaflet/leaflet-maplibre-gl.js',
  ]) {
    const resposta = await request(app).get(arquivo);
    assert.equal(resposta.status, 200, arquivo);
  }
  const modulo = await request(app).get('/vendor/maplibre/maplibre-gl.mjs');
  assert.match(modulo.headers['content-type'], /javascript/);
});

test('arquivos estáticos são comprimidos, mas o HTML não', async () => {
  const js = await request(app)
    .get('/vendor/maplibre/maplibre-gl.mjs')
    .set('Accept-Encoding', 'gzip');
  assert.equal(js.status, 200);
  assert.equal(js.headers['content-encoding'], 'gzip');

  const pagina = await request(app).get('/sobre').set('Accept-Encoding', 'gzip');
  assert.equal(pagina.status, 200);
  assert.equal(pagina.headers['content-encoding'], undefined);
});
