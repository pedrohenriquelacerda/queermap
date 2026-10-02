import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();

// As cinco categorias do seed; o filtro do mapa mostra todas, mesmo sem locais.
const categorias = [
  { nome: 'Ambulatório trans', slug: 'ambulatorio-trans', icone: 'ambulatorio', ordem: 0 },
  { nome: 'ONG / coletivo LGBTQIA+', slug: 'ong', icone: 'ong', ordem: 1 },
  {
    nome: 'Saúde sexual e prevenção (SAE, PEP, PrEP)',
    slug: 'saude-sexual',
    icone: 'saude-sexual',
    ordem: 2,
  },
  { nome: 'Abrigo / albergue', slug: 'abrigo', icone: 'abrigo', ordem: 3 },
  { nome: 'Casa de acolhimento', slug: 'casa-acolhimento', icone: 'acolhimento', ordem: 4 },
];

beforeEach(() => mockPrisma(prisma.categoria, 'findMany', async () => categorias));
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

test('GET / lista os locais publicados', async () => {
  const findMany = mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.equal(res.status, 200);
  assert.deepEqual(findMany.mock.calls[0].arguments[0].where, {
    publicado: true,
    arquivadoEm: null,
  });
  assert.match(res.text, /class="cartao-local"/);
  assert.match(res.text, /href="\/locais\/ambulatorio-teste"/);
  assert.match(res.text, /name="car" value="oferece-prep"/);
  assert.match(res.text, /1 local\b/);
});

test('GET / mostra as cinco categorias no filtro, com a quantidade de locais de cada', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  for (const c of categorias) {
    assert.match(res.text, new RegExp(`name="tipo" value="${c.slug}"`));
    assert.match(res.text, new RegExp(`data-atalho-tipo="${c.slug}"`)); // atalho do celular
  }
  const total = (slug) =>
    res.text.match(new RegExp(`value="${slug}" />[\\s\\S]*?opcao__total">\\((\\d+)\\)`))[1];
  assert.equal(total('ambulatorio-trans'), '1');
  assert.equal(total('abrigo'), '0'); // aparece mesmo sem locais
  assert.match(res.text, /<details class="filtros__grupo" open>\s*<summary>Tipo de serviço/);
});

test('GET / filtro de características mostra só as que têm locais', async () => {
  mockPrisma(prisma.caracteristica, 'findMany', async () => {
    throw new Error('não deve consultar características à parte');
  });
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.match(res.text, /name="car" value="oferece-prep"/);
  assert.equal(res.text.match(/name="car"/g).length, 1);
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

test('GET /buscar-endereco busca só no RS e não exige login', async (t) => {
  t.after(() => mock.restoreAll());
  const chamadas = [];
  mock.method(globalThis, 'fetch', async (url) => {
    chamadas.push(String(url));
    return new Response(
      JSON.stringify([
        { lat: '-30.04', lon: '-51.22', display_name: 'Cidade Baixa, Porto Alegre' },
      ]),
    );
  });

  const res = await request(app).get('/buscar-endereco?q=Cidade%20Baixa');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.resultados, [
    { lat: -30.04, lng: -51.22, descricao: 'Cidade Baixa, Porto Alegre' },
  ]);
  assert.match(chamadas[0], /viewbox=-57\.65%2C-27\.08%2C-49\.69%2C-33\.75/);
  assert.match(chamadas[0], /bounded=1/);

  const curta = await request(app).get('/buscar-endereco?q=ab');
  assert.equal(curta.status, 400);
  assert.equal(chamadas.length, 1); // consulta curta nem chega ao Nominatim

  mock.method(globalThis, 'fetch', async () => new Response('erro', { status: 503 }));
  mock.method(console, 'error', () => {});
  const falha = await request(app).get('/buscar-endereco?q=Rua%20B');
  assert.equal(falha.status, 502);
});

test('GET / traz o campo de endereço para quando a localização não estiver disponível', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.match(res.text, /id="painel-localizacao"[^>]*hidden/);
  assert.match(res.text, /<input[^>]*id="endereco-pessoa"/);
});
