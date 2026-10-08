import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

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

test('cabeçalho público oferece acesso ao painel administrativo', async () => {
  const res = await request(app).get('/sobre');
  assert.match(res.text, /href="\/painel\/entrar"/);
  assert.match(res.text, /Área administrativa/);
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
  for (const numero of ['100', '136', '188']) {
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
