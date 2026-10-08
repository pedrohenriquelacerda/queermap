import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();

beforeEach(() => {
  mockPrisma(prisma.canalDenuncia, 'findMany', async () => [
    {
      nome: 'Disque 100 · Direitos Humanos',
      descricao: 'Recebe denúncias de violações de direitos humanos.',
      telefone: '100',
      link: 'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos',
      ordem: 1,
      ativo: true,
    },
    {
      nome: 'Delegacia de Combate à Intolerância',
      descricao: 'Registra ocorrências de discriminação.',
      telefone: '197',
      link: 'https://www.pc.rs.gov.br/fale-conosco',
      ordem: 2,
      ativo: true,
    },
    {
      nome: 'Ouvidoria do SUS',
      descricao: 'Reclamações sobre serviços públicos de saúde.',
      telefone: '136',
      link: 'https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus',
      ordem: 3,
      ativo: true,
    },
  ]);
});

afterEach(restaurarPrisma);

const paginas = [
  ['/sobre', 'Sobre o Mapa SerQueer'],
  ['/canais-de-denuncia', 'Canais de denúncia'],
  ['/privacidade', 'Privacidade'],
];

test('site público não exige login', async () => {
  for (const caminho of ['/sobre', '/canais-de-denuncia', '/privacidade']) {
    const res = await request(app).get(caminho);
    assert.equal(res.status, 200, `${caminho} deveria abrir sem sessão`);
    assert.notEqual(res.headers.location, '/painel/entrar');
  }
});

test('acesso da equipe ao painel fica no rodapé, não no cabeçalho', async () => {
  const res = await request(app).get('/sobre');
  const [topo] = res.text.match(/<header class="topo">[\s\S]*?<\/header>/);
  const [rodape] = res.text.match(/<footer class="rodape">[\s\S]*?<\/footer>/);
  assert.doesNotMatch(topo, /\/painel\/entrar/);
  assert.match(rodape, /href="\/painel\/entrar"[^>]*>Acesso da equipe/);
});

for (const [caminho, titulo] of paginas) {
  test(`GET ${caminho} renderiza a página`, async () => {
    const res = await request(app).get(caminho);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`<h1>${titulo}</h1>`));
    // Link do menu marcado como página atual
    assert.match(res.text, new RegExp(`href="${caminho}"\\s+aria-current="page"`));
  });
}

test('páginas têm metadados para compartilhamento', async () => {
  const res = await request(app).get('/sobre');
  assert.match(res.text, /<meta name="description" content="[^"]+"/);
  assert.match(res.text, /<meta property="og:title" content="Sobre · Mapa SerQueer"/);
  assert.match(res.text, /<link rel="canonical" href="http[^"]+\/sobre"/);
});

test('canais de denúncia trazem os telefones oficiais', async () => {
  const res = await request(app).get('/canais-de-denuncia');
  for (const numero of ['100', '136', '197', '188']) {
    assert.match(res.text, new RegExp(`href="tel:${numero}"`));
  }
});

test('página de privacidade explica o uso transitório e a não persistência do IP', async () => {
  const res = await request(app).get('/privacidade');
  assert.match(res.text, /IP é usado apenas durante a requisição/);
  assert.match(res.text, /não é salvo no banco de dados/);
  assert.match(res.text, /incluindo o endereço IP/);
});

test('fonte é servida localmente com cache longo', async () => {
  const res = await request(app).get('/vendor/fontes/atkinson-hyperlegible-latin-400-normal.woff2');
  assert.equal(res.status, 200);
  assert.match(res.headers['cache-control'], /immutable/);
});

test('página de erro 404 usa o layout do site', async () => {
  const res = await request(app).get('/nao-existe');
  assert.equal(res.status, 404);
  assert.match(res.text, /class="topo"/);
  assert.match(res.text, /Voltar para o mapa/);
});
