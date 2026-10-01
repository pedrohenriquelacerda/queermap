import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Sem sessionStore o express-session usa memória. Rotas fixas: não precisam do banco.
const app = createApp();

test('arquivos do Leaflet são servidos localmente', async () => {
  const res = await request(app).get('/vendor/leaflet/leaflet.js');
  assert.equal(res.status, 200);
});

test('rota inexistente retorna 404', async () => {
  const res = await request(app).get('/nao-existe');
  assert.equal(res.status, 404);
  assert.match(res.text, /Página não encontrada/);
});

test('envia cabeçalhos de segurança', async () => {
  const res = await request(app).get('/sobre');
  assert.ok(res.headers['content-security-policy']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('envia Referer de origem para os tiles do OpenStreetMap', async () => {
  const res = await request(app).get('/sobre');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});
