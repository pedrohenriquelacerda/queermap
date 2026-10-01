import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();
afterEach(restaurarPrisma);

function local(extra = {}) {
  return {
    id: 1,
    nome: 'Ambulatório Teste',
    slug: 'ambulatorio-teste',
    descricao: null,
    logradouro: 'Rua A',
    numero: '10',
    complemento: null,
    bairro: 'Centro',
    cidade: 'Porto Alegre',
    uf: 'RS',
    cep: null,
    latitude: -30.03,
    longitude: -51.23,
    telefone: '(51) 3333-4444',
    whatsapp: null,
    email: null,
    site: null,
    horarioFuncionamento: null,
    atualizadoEm: new Date('2026-09-30T12:00:00Z'),
    categoria: {
      nome: 'Ambulatório trans',
      slug: 'ambulatorio-trans',
      icone: 'ambulatorio',
      ordem: 0,
    },
    caracteristicas: [{ nome: 'Oferece PrEP', slug: 'oferece-prep' }],
    ...extra,
  };
}

test('GET / lista os locais publicados e só filtros com resultados', async () => {
  const findMany = mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.equal(res.status, 200);
  assert.deepEqual(findMany.mock.calls[0].arguments[0].where, {
    publicado: true,
    arquivadoEm: null,
  });
  assert.match(res.text, /class="cartao-local"/);
  assert.match(res.text, /href="\/locais\/ambulatorio-teste"/);
  assert.match(res.text, /name="tipo" value="ambulatorio-trans"/);
  assert.match(res.text, /name="car" value="oferece-prep"/);
  assert.match(res.text, /1 local\b/);
});

test('GET / não expõe campos internos do local', async () => {
  const findMany = mockPrisma(prisma.local, 'findMany', async () => []);

  await request(app).get('/');

  const { select } = findMany.mock.calls[0].arguments[0];
  for (const campo of ['criadoPorId', 'atualizadoPorId', 'publicado', 'arquivadoEm', 'envios']) {
    assert.equal(select[campo], undefined, `campo interno exposto: ${campo}`);
  }
});

test('GET / embute os dados do mapa sem permitir fechar a tag <script>', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local({ nome: '</script><script>alert(1)' })]);

  const res = await request(app).get('/');

  const json = res.text.match(
    /<script type="application\/json" id="dados-mapa">(.*?)<\/script>/s,
  )[1];
  assert.doesNotMatch(json, /<\/script>/i);
  assert.equal(JSON.parse(json)[0].nome, '</script><script>alert(1)');
});

test('GET / sem locais mostra estado vazio', async () => {
  mockPrisma(prisma.local, 'findMany', async () => []);

  const res = await request(app).get('/');

  assert.equal(res.status, 200);
  assert.match(res.text, /Nenhum local cadastrado ainda/);
});

test('GET /locais/:slug mostra o local publicado', async () => {
  const findFirst = mockPrisma(prisma.local, 'findFirst', async () =>
    local({ site: 'javascript:alert(1)' }),
  );

  const res = await request(app).get('/locais/ambulatorio-teste');

  assert.equal(res.status, 200);
  assert.deepEqual(findFirst.mock.calls[0].arguments[0].where, {
    publicado: true,
    arquivadoEm: null,
    slug: 'ambulatorio-teste',
  });
  assert.match(res.text, /<h1>Ambulatório Teste<\/h1>/);
  assert.match(res.text, /href="tel:5133334444"/);
  assert.match(res.text, /30 de setembro de 2026/);
  assert.doesNotMatch(res.text, /javascript:alert/); // site inválido não vira link
});

test('GET /locais/:slug responde 404 para local inexistente ou não publicado', async () => {
  mockPrisma(prisma.local, 'findFirst', async () => null);

  const res = await request(app).get('/locais/rascunho');

  assert.equal(res.status, 404);
  assert.match(res.text, /Página não encontrada/);
});
