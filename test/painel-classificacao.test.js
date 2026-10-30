import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, enviar, logar } from './helpers/painel.js';

const app = createApp();
let auditoria;
let categorias;

beforeEach(async () => {
  ({ auditoria } = await prepararAdmins());
  categorias = [
    {
      id: 1,
      nome: 'Ambulatório',
      slug: 'ambulatorio',
      icone: 'ambulatorio',
      ordem: 0,
      ativa: true,
    },
    { id: 2, nome: 'ONG', slug: 'ong', icone: 'ong', ordem: 1, ativa: true },
    {
      id: 3,
      nome: 'Saúde Sexual',
      slug: 'saude-sexual',
      icone: 'saude-sexual',
      ordem: 2,
      ativa: true,
    },
  ];

  mockPrisma(prisma, '$transaction', async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  );
  mockPrisma(prisma.categoria, 'findMany', async () =>
    [...categorias].sort((a, b) => a.ordem - b.ordem),
  );
  mockPrisma(
    prisma.categoria,
    'findUnique',
    async ({ where }) =>
      categorias.find((c) => (where.id ? c.id === where.id : c.nome === where.nome)) ?? null,
  );
  mockPrisma(prisma.categoria, 'aggregate', async () => ({
    _max: { ordem: Math.max(...categorias.map((c) => c.ordem), -1) },
  }));
  mockPrisma(prisma.categoria, 'create', async ({ data }) => {
    const criada = { id: categorias.length + 1, ...data };
    categorias.push(criada);
    return criada;
  });
  mockPrisma(prisma.categoria, 'update', async ({ where, data }) => {
    const c = categorias.find((item) => item.id === where.id);
    if (c) Object.assign(c, data);
    return c;
  });
  mockPrisma(prisma.categoria, 'updateMany', async ({ where, data }) => {
    const c = categorias.find((item) => item.id === where.id);
    if (c) Object.assign(c, data);
    return { count: c ? 1 : 0 };
  });
});

afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

test('cria nova categoria calculando ordem automaticamente no final da fila', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria', {
    nome: 'Casa de Acolhimento',
    icone: 'acolhimento',
  });

  assert.equal(res.status, 302);
  const criada = categorias.find((c) => c.slug === 'casa-de-acolhimento');
  assert.ok(criada);
  assert.equal(criada.ordem, 3);
  assert.equal(criada.icone, 'acolhimento');
  assert.ok(auditoria.some((l) => l.acao === 'categoria.criar' && l.entidadeId === criada.id));
});

test('mover para cima troca posição com categoria anterior e audita', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria/2/mover', {
    direcao: 'subir',
  });

  assert.equal(res.status, 302);
  assert.equal(categorias.find((c) => c.id === 2).ordem, 0);
  assert.equal(categorias.find((c) => c.id === 1).ordem, 1);
  assert.ok(auditoria.some((l) => l.acao === 'categoria.reordenar' && l.entidadeId === 2));
});

test('mover para baixo troca posição com categoria seguinte e audita', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria/1/mover', {
    direcao: 'descer',
  });

  assert.equal(res.status, 302);
  assert.equal(categorias.find((c) => c.id === 1).ordem, 1);
  assert.equal(categorias.find((c) => c.id === 2).ordem, 0);
  assert.ok(auditoria.some((l) => l.acao === 'categoria.reordenar' && l.entidadeId === 1));
});

test('mover além dos limites mantém ordem inalterada', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria/1/mover', {
    direcao: 'subir',
  });

  assert.equal(res.status, 302);
  assert.equal(categorias.find((c) => c.id === 1).ordem, 0);
});

test('reordenar via requisição com array de IDs atualiza ordem completa', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria/reordenar', {
    ordem: [3, 1, 2],
  });

  assert.equal(res.status, 302);
  assert.equal(categorias.find((c) => c.id === 3).ordem, 0);
  assert.equal(categorias.find((c) => c.id === 1).ordem, 1);
  assert.equal(categorias.find((c) => c.id === 2).ordem, 2);
  assert.ok(auditoria.some((l) => l.acao === 'categoria.reordenar'));
});

test('reordenar com JSON via drag and drop retorna ok: true', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await admin
    .post('/painel/classificacao/categoria/reordenar')
    .set('Origin', 'http://localhost:3000')
    .set('Accept', 'application/json')
    .send({ ordem: [2, 3, 1] });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(categorias.find((c) => c.id === 2).ordem, 0);
  assert.equal(categorias.find((c) => c.id === 3).ordem, 1);
  assert.equal(categorias.find((c) => c.id === 1).ordem, 2);
});

test('reordenar com dados inválidos retorna erro 400 em JSON', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await admin
    .post('/painel/classificacao/categoria/reordenar')
    .set('Origin', 'http://localhost:3000')
    .set('Accept', 'application/json')
    .send({ ordem: 'invalido' });

  assert.equal(res.status, 400);
  assert.match(res.body.erro, /Lista de IDs inválida/);
});

test('editor sem permissão de admin recebe 403 ao tentar reordenar', async () => {
  const editor = await logar(app, 'editor@teste.test');
  const res = await enviar(editor, '/painel/classificacao/categoria/reordenar', {
    ordem: [1, 2, 3],
  });
  assert.equal(res.status, 403);
});
