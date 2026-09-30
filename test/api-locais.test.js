import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

// O banco é substituído por um mock: os testes não precisam do Postgres.
const app = createApp();

afterEach(() => {
  mock.restoreAll();
  restaurarPrisma();
});

test('GET /api/locais consulta só locais publicados e não arquivados', async () => {
  const findMany = mockPrisma(prisma.local, 'findMany', async () => []);

  const res = await request(app).get('/api/locais');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { locais: [] });
  const [args] = findMany.mock.calls[0].arguments;
  assert.deepEqual(args.where, { publicado: true, arquivadoEm: null });
});

test('GET /api/locais não expõe campos internos', async () => {
  const findMany = mockPrisma(prisma.local, 'findMany', async () => []);

  await request(app).get('/api/locais');

  const { select } = findMany.mock.calls[0].arguments[0];
  for (const campo of ['criadoPorId', 'atualizadoPorId', 'publicado', 'arquivadoEm', 'envios']) {
    assert.equal(select[campo], undefined, `campo interno exposto: ${campo}`);
  }
});

test('GET /api/locais devolve os locais e permite cache curto', async () => {
  const local = { id: 1, nome: 'Teste', latitude: -30, longitude: -51 };
  mockPrisma(prisma.local, 'findMany', async () => [local]);

  const res = await request(app).get('/api/locais');

  assert.deepEqual(res.body.locais, [local]);
  assert.equal(res.headers['cache-control'], 'public, max-age=60');
});

test('GET /api/locais responde 500 em JSON sem vazar detalhes do erro', async () => {
  mockPrisma(prisma.local, 'findMany', async () => {
    throw new Error('senha do banco no stack trace');
  });
  mock.method(console, 'error', () => {});

  const res = await request(app).get('/api/locais').set('Accept', 'application/json');

  assert.equal(res.status, 500);
  assert.match(res.headers['content-type'], /json/);
  assert.doesNotMatch(JSON.stringify(res.body), /senha/);
});
