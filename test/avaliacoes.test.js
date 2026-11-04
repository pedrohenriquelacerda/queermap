import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { notaMedia } from '../src/services/locaisService.js';
import { env } from '../src/config/env.js';

const app = createApp();
afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

test('média considera somente notas do local e conserva a ausência de avaliações', () => {
  assert.equal(notaMedia({ avaliacoes: [{ nota: 4 }, { nota: 5 }] }), 4.5);
  assert.equal(notaMedia({ avaliacoes: [] }), null);
});

test('avaliação valida a nota e nunca grava valores inválidos', async () => {
  const criar = mockPrisma(prisma.avaliacao, 'create', async () => ({}));
  for (const nota of ['0', '6', '1.5', 'abc', '']) {
    const res = await request(app)
      .post('/locais/teste/avaliacoes')
      .set('Origin', env.siteUrl)
      .send({ nota });
    assert.equal(res.status, 400);
  }
  assert.equal(criar.mock.calls.length, 0);
});

test('avaliação válida grava nota apenas para local publicado', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ success: true })));
  const buscar = mockPrisma(prisma.local, 'findFirst', async () => ({ id: 12 }));
  const criar = mockPrisma(prisma.avaliacao, 'create', async () => ({}));
  const res = await request(createApp())
    .post('/locais/teste/avaliacoes')
    .set('Origin', env.siteUrl)
    .send({ nota: '5', 'cf-turnstile-response': 'token' });
  assert.equal(res.status, 303);
  assert.deepEqual(buscar.mock.calls[0].arguments[0].where, {
    publicado: true,
    arquivadoEm: null,
    slug: 'teste',
  });
  assert.deepEqual(criar.mock.calls[0].arguments[0].data, { localId: 12, nota: 5 });
});
