import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
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
  { nome: 'Abrigo', slug: 'abrigo', icone: 'abrigo', ordem: 3 },
  { nome: 'Albergue', slug: 'albergue', icone: 'albergue', ordem: 4 },
  { nome: 'Centros POP', slug: 'centro-pop', icone: 'centro-pop', ordem: 5 },
  { nome: 'Casas de Cidadania', slug: 'casa-cidadania', icone: 'casa-cidadania', ordem: 6 },
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

test('GET / mostra as categorias da Sprint 5 no filtro, com a quantidade de locais de cada', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  for (const c of categorias) {
    assert.match(res.text, new RegExp(`name="tipo" value="${c.slug}"`));
    assert.match(res.text, new RegExp(`data-atalho-tipo="${c.slug}"`)); // atalho do celular
  }
  const total = (slug) =>
    res.text.match(new RegExp(`value="${slug}" />[\\s\\S]*?opcao__total">\\((\\d+)\\)`))[1];
  assert.equal(total('ambulatorio-trans'), '1');
  assert.equal(total('abrigo'), '0');
  assert.equal(total('albergue'), '0');
  assert.equal(total('centro-pop'), '0');
  assert.equal(total('casa-cidadania'), '0');
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

const buscarEndereco = (q) =>
  request(app).post('/buscar-endereco').set('Origin', env.siteUrl).send({ q });

test('POST /buscar-endereco busca só no RS e não exige login', async (t) => {
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

  const res = await buscarEndereco('Cidade Baixa');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.resultados, [
    { lat: -30.04, lng: -51.22, descricao: 'Cidade Baixa, Porto Alegre' },
  ]);
  assert.match(chamadas[0], /viewbox=-57\.65%2C-27\.08%2C-49\.69%2C-33\.75/);
  assert.match(chamadas[0], /bounded=1/);

  const curta = await buscarEndereco('ab');
  assert.equal(curta.status, 400);
  assert.equal(chamadas.length, 1); // consulta curta nem chega ao Nominatim

  // O endereço não é mais aceito na URL.
  assert.equal((await request(app).get('/buscar-endereco?q=Cidade%20Baixa')).status, 404);

  mock.method(globalThis, 'fetch', async () => new Response('erro', { status: 503 }));
  mock.method(console, 'error', () => {});
  const falha = await buscarEndereco('Rua B');
  assert.equal(falha.status, 502);
});

test('busca de endereço de outro site é bloqueada (CSRF)', async () => {
  const res = await request(app)
    .post('/buscar-endereco')
    .set('Origin', 'https://outro.example')
    .send({ q: 'Cidade Baixa' });
  assert.equal(res.status, 403);
});

test('health check com banco fora do ar não grava o endereço do banco no log', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  mockPrisma(prisma, '$queryRaw', async () => {
    throw Object.assign(new Error("Can't reach database server at `ep-segredo.neon.tech:5432`"), {
      code: 'P1001',
    });
  });

  const res = await request(app).get('/health');

  assert.equal(res.status, 503);
  assert.deepEqual(logs, ['Health check falhou: P1001']);
});

test('GET / traz o campo de endereço para quando a localização não estiver disponível', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.match(res.text, /id="painel-localizacao"[^>]*hidden/);
  assert.match(res.text, /<input[^>]*id="endereco-pessoa"/);
});

test('GET / mostra as características mais procuradas como atalhos e o resto em "Mais características"', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [
    local({
      caracteristicas: [
        { nome: 'Oferece PrEP', slug: 'oferece-prep' },
        { nome: 'Testagem rápida de IST', slug: 'testagem-ist' },
      ],
    }),
  ]);

  const res = await request(app).get('/');

  const atalhos = res.text.match(/<fieldset class="filtros__destaque">[\s\S]*?<\/fieldset>/)[0];
  assert.match(atalhos, /name="car" value="oferece-prep"/);
  assert.doesNotMatch(atalhos, /testagem-ist/);

  const mais = res.text.match(
    /<details class="filtros__grupo filtros__mais">[\s\S]*?<\/details>/,
  )[0];
  assert.match(mais, /name="car" value="testagem-ist"/);
  assert.match(mais, /Mais características/);

  // Cada característica aparece uma só vez nos filtros (os atalhos usam as mesmas caixas).
  assert.equal(res.text.match(/name="car"/g).length, 2);
});

test('GET / desabilita tipos sem locais e explica como os filtros se combinam', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.match(res.text, /disabled name="tipo" value="abrigo"/);
  assert.doesNotMatch(res.text, /disabled name="tipo" value="ambulatorio-trans"/);
  // No celular o atalho de um tipo sem locais nem aparece.
  assert.match(res.text, /data-atalho-tipo="abrigo" aria-pressed="false" hidden/);
  assert.doesNotMatch(res.text, /data-atalho-tipo="ambulatorio-trans" aria-pressed="false" hidden/);

  assert.match(res.text, /Marque mais de um para ver todos eles/);
  assert.match(res.text, /Mostra só os locais que têm todas as marcadas/);
});

test('GET / traz a busca, o "Perto de mim" e a folha de filtros do celular', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);

  const res = await request(app).get('/');

  assert.match(res.text, /placeholder="Buscar local ou serviço"/);
  assert.match(res.text, /id="perto-de-mim"[^>]*hidden/); // o JavaScript mostra o botão
  assert.match(res.text, /id="abrir-filtros"[\s\S]*?aria-controls="filtros-corpo"/);
  assert.match(res.text, /id="filtros-corpo"/);
  assert.match(res.text, /data-ir-para="lista"[\s\S]*?data-contagem-numero>1</);
});

test('GET / com locais sem as características em destaque mostra todas em "Características"', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [
    local({ caracteristicas: [{ nome: 'Testagem rápida de IST', slug: 'testagem-ist' }] }),
  ]);

  const res = await request(app).get('/');

  assert.doesNotMatch(res.text, /filtros__destaque/);
  assert.match(res.text, /<summary>\s*Características\s/);
});
