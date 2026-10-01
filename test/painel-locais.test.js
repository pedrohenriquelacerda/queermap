import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, enviar, logar } from './helpers/painel.js';

const app = createApp();
let locais;
let auditoria;

const categorias = [
  {
    id: 1,
    nome: 'Ambulatório trans',
    slug: 'ambulatorio-trans',
    icone: 'ambulatorio',
    ordem: 0,
    ativa: true,
  },
];
const caracteristicas = [{ id: 7, nome: 'Oferece PrEP', slug: 'oferece-prep', ativa: true }];

const valido = {
  nome: 'Ambulatório Novo',
  categoriaId: '1',
  logradouro: 'Rua A',
  numero: '10',
  cidade: 'Porto Alegre',
  uf: 'rs',
  latitude: '-30.03',
  longitude: '-51.22',
  site: 'https://exemplo.org',
  caracteristicas: '7',
};

beforeEach(async () => {
  ({ auditoria } = await prepararAdmins());
  locais = [];
  const achar = (where) =>
    locais.find((l) => (where.id ? l.id === where.id : l.slug === where.slug)) ?? null;
  mockPrisma(prisma.categoria, 'findMany', async () => categorias);
  mockPrisma(prisma.caracteristica, 'findMany', async () => caracteristicas);
  mockPrisma(prisma.local, 'findUnique', async ({ where }) => {
    const l = achar(where);
    return l && { ...l, caracteristicas: l.caracteristicasIds.map((id) => ({ id })) };
  });
  mockPrisma(prisma.local, 'findMany', async () => locais);
  mockPrisma(prisma.local, 'count', async () => locais.length);
  mockPrisma(prisma.local, 'create', async ({ data }) => {
    const { caracteristicas: c, ...resto } = data;
    const novo = {
      id: locais.length + 1,
      publicado: false,
      arquivadoEm: null,
      caracteristicasIds: c.connect.map((x) => x.id),
      ...resto,
    };
    locais.push(novo);
    return novo;
  });
  mockPrisma(prisma.local, 'update', async ({ where, data }) => {
    const { caracteristicas: c, ...resto } = data;
    const l = Object.assign(achar(where), resto);
    if (c) l.caracteristicasIds = c.set.map((x) => x.id);
    return l;
  });
});

afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

test('cria local como rascunho, com slug e características', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await enviar(agente, '/painel/locais', valido);

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel/locais/1');
  const [local] = locais;
  assert.equal(local.slug, 'ambulatorio-novo');
  assert.equal(local.uf, 'RS');
  assert.equal(local.publicado, false);
  assert.equal(local.criadoPorId, 2);
  assert.deepEqual(local.caracteristicasIds, [7]);
  assert.ok(auditoria.some((a) => a.acao === 'local.criar'));
});

test('slug repetido ganha sufixo', async () => {
  locais.push({ id: 99, slug: 'ambulatorio-novo', caracteristicasIds: [] });
  const agente = await logar(app, 'editor@teste.test');
  await enviar(agente, '/painel/locais', valido);
  assert.equal(locais.at(-1).slug, 'ambulatorio-novo-2');
});

test('valida campos obrigatórios, posição e site', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await enviar(agente, '/painel/locais', {
    ...valido,
    nome: '',
    latitude: '',
    site: 'javascript:alert(1)',
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /Informe o nome/);
  assert.match(res.text, /Posicione o local no mapa/);
  assert.match(res.text, /https:\/\//);
  assert.equal(locais.length, 0);
  // Mantém o que foi digitado
  assert.match(res.text, /value="Rua A"/);
});

test('coordenadas fora do RS são recusadas', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await enviar(agente, '/painel/locais', {
    ...valido,
    latitude: '-51.22',
    longitude: '-30.03',
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /dentro do RS/);
});

test('publicar, arquivar e restaurar mudam a situação e são auditados', async () => {
  const agente = await logar(app, 'editor@teste.test');
  await enviar(agente, '/painel/locais', valido);

  await enviar(agente, '/painel/locais/1/publicar', {});
  assert.equal(locais[0].publicado, true);
  assert.ok(locais[0].publicadoEm instanceof Date);

  await enviar(agente, '/painel/locais/1/arquivar', {});
  assert.equal(locais[0].publicado, false);
  assert.ok(locais[0].arquivadoEm instanceof Date);

  await enviar(agente, '/painel/locais/1/restaurar', {});
  assert.equal(locais[0].arquivadoEm, null);

  const acoes = auditoria.map((a) => a.acao);
  for (const acao of ['local.publicar', 'local.arquivar', 'local.restaurar'])
    assert.ok(acoes.includes(acao));
});

test('ação desconhecida responde 404', async () => {
  const agente = await logar(app, 'editor@teste.test');
  await enviar(agente, '/painel/locais', valido);
  const res = await enviar(agente, '/painel/locais/1/apagar', {});
  assert.equal(res.status, 404);
});

test('edição registra quais campos mudaram', async () => {
  const agente = await logar(app, 'editor@teste.test');
  await enviar(agente, '/painel/locais', valido);
  await enviar(agente, '/painel/locais/1', {
    ...valido,
    telefone: '(51) 3333-4444',
    caracteristicas: [],
  });
  const registro = auditoria.find((a) => a.acao === 'local.atualizar');
  assert.deepEqual(registro.detalhes.alterados.sort(), ['caracteristicas', 'telefone']);
});

test('busca de endereço usa o Nominatim com identificação e trata falhas', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const chamadas = [];
  mock.method(globalThis, 'fetch', async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes });
    return new Response(
      JSON.stringify([{ lat: '-30.05', lon: '-51.17', display_name: 'Av. Ipiranga, 6681' }]),
    );
  });

  const res = await agente.get('/painel/locais/geocodificar?q=Av.%20Ipiranga%206681');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.resultados, [
    { lat: -30.05, lng: -51.17, descricao: 'Av. Ipiranga, 6681' },
  ]);
  assert.match(chamadas[0].url, /nominatim\.openstreetmap\.org.*countrycodes=br/);
  assert.match(chamadas[0].opcoes.headers['User-Agent'], /MapaSerQueer/);

  const curta = await agente.get('/painel/locais/geocodificar?q=a');
  assert.equal(curta.status, 400);

  mock.method(globalThis, 'fetch', async () => new Response('erro', { status: 503 }));
  mock.method(console, 'error', () => {});
  const falha = await agente.get('/painel/locais/geocodificar?q=Rua%20B');
  assert.equal(falha.status, 502);
});

test('editor não acessa tipos e características; admin sim', async () => {
  const editor = await logar(app, 'editor@teste.test');
  assert.equal((await editor.get('/painel/classificacao')).status, 403);

  mockPrisma(prisma.categoria, 'findMany', async () =>
    categorias.map((c) => ({ ...c, _count: { locais: 0 } })),
  );
  mockPrisma(prisma.caracteristica, 'findMany', async () =>
    caracteristicas.map((c) => ({ ...c, _count: { locais: 0 } })),
  );
  const admin = await logar(app, 'admin@teste.test');
  const res = await admin.get('/painel/classificacao');
  assert.equal(res.status, 200);
  assert.match(res.text, /Oferece PrEP/);
});

test('nova característica recebe slug e nome repetido é recusado', async () => {
  const criadas = [];
  mockPrisma(prisma.caracteristica, 'findUnique', async ({ where }) =>
    where.nome === 'Oferece PrEP' ? caracteristicas[0] : null,
  );
  mockPrisma(prisma.caracteristica, 'create', async ({ data }) => {
    criadas.push(data);
    return { id: 8, ...data };
  });
  mockPrisma(prisma.categoria, 'findMany', async () => []);
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  const admin = await logar(app, 'admin@teste.test');

  const ok = await enviar(admin, '/painel/classificacao/caracteristica', {
    nome: 'Atende à noite',
  });
  assert.equal(ok.status, 302);
  assert.equal(criadas[0].slug, 'atende-a-noite');
  assert.equal(criadas[0].ativa, true);

  const repetida = await enviar(admin, '/painel/classificacao/caracteristica', {
    nome: 'Oferece PrEP',
  });
  assert.equal(repetida.status, 400);
  assert.match(repetida.text, /Já existe um item com este nome/);
});
