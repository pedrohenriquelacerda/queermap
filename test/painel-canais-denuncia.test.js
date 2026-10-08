import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, enviar, logar } from './helpers/painel.js';

const app = createApp();
let canais;
let auditoria;

beforeEach(async () => {
  ({ auditoria } = await prepararAdmins());
  canais = [
    {
      id: 1,
      slug: 'disque-100',
      nome: 'Disque 100 · Direitos Humanos',
      descricao: 'Recebe denúncias de direitos humanos.',
      telefone: '100',
      link: 'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos',
      ordem: 1,
      ativo: true,
    },
  ];
  mockPrisma(prisma.canalDenuncia, 'findMany', async ({ where } = {}) =>
    where?.ativo ? canais.filter((canal) => canal.ativo) : canais,
  );
  mockPrisma(
    prisma.canalDenuncia,
    'findUnique',
    async ({ where }) => canais.find((canal) => canal.id === where.id) ?? null,
  );
  mockPrisma(prisma.canalDenuncia, 'update', async ({ where, data }) => {
    const canal = canais.find((item) => item.id === where.id);
    Object.assign(canal, data);
    return canal;
  });
});

afterEach(restaurarPrisma);

test('editor não gerencia canais de denúncia', async () => {
  const editor = await logar(app, 'editor@teste.test');
  assert.equal((await editor.get('/painel/canais-denuncia')).status, 403);
});

test('admin edita telefone, link e dados do canal no painel', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const pagina = await admin.get('/painel/canais-denuncia');
  assert.equal(pagina.status, 200);
  assert.match(pagina.text, /Disque 100/);

  const res = await enviar(admin, '/painel/canais-denuncia/1', {
    nome: 'Disque Direitos Humanos',
    descricao: 'Atendimento gratuito.',
    telefone: '100',
    link: 'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos',
    ordem: '1',
    ativo: 'on',
  });
  assert.equal(res.status, 302);
  assert.equal(canais[0].nome, 'Disque Direitos Humanos');
  assert.equal(canais[0].ativo, true);
  assert.ok(auditoria.some((log) => log.acao === 'canal_denuncia.atualizar'));

  const publico = await request(app).get('/canais-de-denuncia');
  assert.match(publico.text, /Disque Direitos Humanos/);
});

test('admin não consegue salvar link inseguro e pode ocultar um canal', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const inseguro = await enviar(admin, '/painel/canais-denuncia/1', {
    nome: canais[0].nome,
    descricao: canais[0].descricao,
    telefone: canais[0].telefone,
    link: 'javascript:alert(1)',
    ordem: '1',
    ativo: 'on',
  });
  assert.equal(inseguro.status, 400);
  assert.match(inseguro.text, /Use um link http:\/\/ ou https:\/\/ válido/);
  assert.equal(
    canais[0].link,
    'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos',
  );

  const oculto = await enviar(admin, '/painel/canais-denuncia/1', {
    nome: canais[0].nome,
    descricao: canais[0].descricao,
    telefone: canais[0].telefone,
    link: canais[0].link,
    ordem: '1',
  });
  assert.equal(oculto.status, 302);
  assert.equal(canais[0].ativo, false);
  const publico = await request(app).get('/canais-de-denuncia');
  assert.doesNotMatch(publico.text, /href="tel:100"/);
});

test('erro ao salvar mostra todos os problemas e mantém o que foi digitado', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const res = await enviar(admin, '/painel/canais-denuncia/1', {
    nome: 'Nome digitado agora',
    descricao: canais[0].descricao,
    telefone: 'x',
    link: canais[0].link,
    ordem: '150',
    ativo: 'on',
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /Informe um telefone válido/);
  assert.match(res.text, /Use um número de 0 a 99/);
  assert.match(res.text, /value="Nome digitado agora"/);
  assert.equal(canais[0].nome, 'Disque 100 · Direitos Humanos');
});
