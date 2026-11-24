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
      icone: 'trans',
      ordem: 0,
      ativa: true,
    },
    { id: 2, nome: 'ONG', slug: 'ong', icone: 'arco-iris', ordem: 1, ativa: true },
    {
      id: 3,
      nome: 'Saúde Sexual',
      slug: 'saude-sexual',
      icone: 'bissexual',
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
    icone: 'progresso',
  });

  assert.equal(res.status, 302);
  const criada = categorias.find((c) => c.slug === 'casa-de-acolhimento');
  assert.ok(criada);
  assert.equal(criada.ordem, 3);
  assert.equal(criada.icone, 'progresso');
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

test('ao criar um tipo, aceita cores lisas e bandeiras novas', async () => {
  const admin = await logar(app, 'admin@teste.test');

  for (const [nome, icone] of [
    ['Tipo Turquesa', 'cor-turquesa'],
    ['Tipo Gay', 'gay'],
    ['Tipo Gênero Fluido', 'genero-fluido'],
  ]) {
    const res = await enviar(admin, '/painel/classificacao/categoria', { nome, icone });
    assert.equal(res.status, 302, icone);
    assert.equal(categorias.find((c) => c.nome === nome).icone, icone);
  }
});

test('ao editar um tipo, dá para trocar para uma cor lisa', async () => {
  // O controller confere se o nome já existe em outro tipo antes de salvar.
  mockPrisma(
    prisma.categoria,
    'findFirst',
    async ({ where }) =>
      categorias.find((c) => c.nome === where.nome && c.id !== where.id.not) ?? null,
  );
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/classificacao/categoria/1', {
    nome: 'Ambulatório',
    icone: 'cor-vermelho',
    ativa: 'on',
  });

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel/classificacao');
  assert.equal(categorias.find((c) => c.id === 1).icone, 'cor-vermelho');
  assert.ok(auditoria.some((l) => l.acao === 'categoria.atualizar' && l.entidadeId === 1));
});

test('cor ou bandeira inventada é recusada', async () => {
  // Ao recusar, a tela é desenhada de novo com os tipos e as características.
  mockPrisma(prisma.categoria, 'findMany', async () =>
    categorias.map((c) => ({ ...c, _count: { locais: 0 } })),
  );
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  const admin = await logar(app, 'admin@teste.test');
  const antes = categorias.length;
  const res = await enviar(admin, '/painel/classificacao/categoria', {
    nome: 'Tipo Inventado',
    icone: 'cor-inexistente',
  });

  assert.equal(res.status, 400);
  assert.match(res.text, /Escolha uma cor/);
  assert.equal(categorias.length, antes);
  assert.ok(!auditoria.some((l) => l.acao === 'categoria.criar'));
});

test('a tela de tipos oferece cores lisas e bandeiras ao editar e ao criar', async () => {
  // A tela mostra quantos locais cada tipo tem e lista as características.
  mockPrisma(prisma.categoria, 'findMany', async () =>
    categorias.map((c) => ({ ...c, _count: { locais: 0 } })),
  );
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  const admin = await logar(app, 'admin@teste.test');
  const res = await admin.get('/painel/classificacao');

  assert.equal(res.status, 200);
  // Uma linha por tipo cadastrado (3) mais o formulário de novo tipo: 4 seletores.
  const seletores = res.text.match(/<select[^>]*name="icone"/g) ?? [];
  assert.equal(seletores.length, categorias.length + 1);
  assert.equal(res.text.match(/<optgroup label="Cores lisas">/g).length, seletores.length);
  assert.equal(res.text.match(/<optgroup label="Bandeiras do orgulho">/g).length, seletores.length);
  assert.match(res.text, /value="cor-turquesa"/);
  assert.match(res.text, /value="genero-fluido"/);
  assert.match(res.text, /\/js\/classificacao-cores\.js/);
});
