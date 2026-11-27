import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, logar } from './helpers/painel.js';

const app = createApp();
let consultasEnvio;

beforeEach(async () => {
  await prepararAdmins();
  consultasEnvio = [];
  mockPrisma(prisma.visitaMensal, 'findMany', async ({ where, distinct }) =>
    distinct
      ? [{ ano: 2025 }, { ano: 2026 }]
      : where.ano === 2026
        ? [
            { mes: 1, total: 10 },
            { mes: 3, total: 5 },
          ]
        : [],
  );
  mockPrisma(prisma.envio, 'groupBy', async (args) => {
    consultasEnvio.push(args);
    return [
      { tipo: 'ELOGIO', status: 'NOVO', _count: { _all: 2 } },
      { tipo: 'ELOGIO', status: 'RESOLVIDO', _count: { _all: 1 } },
      { tipo: 'RECLAMACAO', status: 'NOVO', _count: { _all: 4 } },
    ];
  });
});
afterEach(restaurarPrisma);

test('exige login', async () => {
  const res = await request(app).get('/painel/metricas');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/painel\/entrar/);
});

test('mostra visualizadores por mês do ano escolhido, com meses zerados', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel/metricas?ano=2026');
  assert.equal(res.status, 200);
  assert.match(res.text, /Visualizadores por mês em 2026/);
  assert.match(res.text, /<strong>15<\/strong> visualizadores no ano/);
  assert.match(res.text, /Fevereiro/);
  assert.match(res.text, /<option value="2025" >2025<\/option>/);
});

test('mostra envios por tipo e situação, com total', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel/metricas');
  assert.match(res.text, /<th scope="row">Elogio<\/th>\s*<td>2<\/td>\s*<td>0<\/td>\s*<td>1<\/td>/);
  assert.match(res.text, /<strong>7<\/strong> envios/);
  assert.deepEqual(consultasEnvio[0].where, {});
});

test('filtro de período inclui o dia final inteiro (Brasília)', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel/metricas?inicio=2026-11-01&fim=2026-11-30');
  assert.equal(res.status, 200);
  const { gte, lt } = consultasEnvio[0].where.criadoEm;
  assert.equal(gte.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(lt.toISOString(), '2026-12-01T03:00:00.000Z');
});

test('filtros inválidos dão 400', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const consulta of [
    'ano=abc',
    'ano=0x7e9',
    'ano=%202026',
    'ano=2026.0',
    'ano=1999',
    'ano=2026&ano=2025',
    'inicio=2026-02-30',
    'inicio=2026-11-10&fim=2026-11-01',
    'fim=ontem',
  ]) {
    const res = await agente.get(`/painel/metricas?${consulta}`);
    assert.equal(res.status, 400, consulta);
  }
});
