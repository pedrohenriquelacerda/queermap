import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.js';
import {
  limparDadosVencidos,
  agendarLimpeza,
  RETENCAO_VERIFICACAO_HORAS,
} from '../src/services/limpezaService.js';
import { registrar, JANELA_DIAS } from '../src/services/enviosService.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
  mock.timers.reset();
});

// Banco de mentira: deleteMany aplica o filtro "criadoEm < limite" de verdade.
function bancoFalso({ verificacoes, registros }) {
  const apagar =
    (lista) =>
    async ({ where }) => {
      const antes = lista.length;
      const restantes = lista.filter((r) => !(r.criadoEm < where.criadoEm.lt));
      lista.splice(0, lista.length, ...restantes);
      return { count: antes - lista.length };
    };
  mockPrisma(prisma.verificacaoEmail, 'deleteMany', apagar(verificacoes));
  mockPrisma(prisma.registroEnvio, 'deleteMany', apagar(registros));
  mockPrisma(prisma, '$transaction', async (operacoes) => Promise.all(operacoes));
}

test('apaga códigos de confirmação vencidos e registros de limite com mais de 30 dias', async () => {
  const agora = new Date('2026-11-24T12:00:00Z');
  const verificacoes = [
    { id: 1, criadoEm: new Date(agora - 3 * HORA) }, // vencida: apagar
    { id: 2, criadoEm: new Date(agora - 20 * 60 * 1000) }, // recente: manter
  ];
  const registros = [
    { id: 'a', criadoEm: new Date(agora - (JANELA_DIAS + 1) * DIA) }, // fora da janela: apagar
    { id: 'b', criadoEm: new Date(agora - (JANELA_DIAS - 1) * DIA) }, // dentro da janela: manter
  ];
  bancoFalso({ verificacoes, registros });

  const resultado = await limparDadosVencidos(agora);

  assert.deepEqual(resultado, { verificacoes: 1, registros: 1 });
  assert.deepEqual(
    verificacoes.map((v) => v.id),
    [2],
  );
  assert.deepEqual(
    registros.map((r) => r.id),
    ['b'],
  );
});

test('o código de confirmação só é guardado por pouco tempo depois de vencer', () => {
  // O código vale 15 min; a margem da limpeza não pode passar de poucas horas.
  assert.ok(RETENCAO_VERIFICACAO_HORAS <= 24);
});

test('a limpeza agendada roda ao iniciar, repete no intervalo e para quando pedido', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const chamadas = [];
  mockPrisma(prisma, '$transaction', async () => {
    chamadas.push(1);
    return [{ count: 0 }, { count: 0 }];
  });
  mockPrisma(prisma.verificacaoEmail, 'deleteMany', async () => ({ count: 0 }));
  mockPrisma(prisma.registroEnvio, 'deleteMany', async () => ({ count: 0 }));
  mock.method(console, 'info', () => {});

  const parar = agendarLimpeza({ intervaloHoras: 6 });
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(chamadas.length, 1, 'roda uma vez ao iniciar');

  mock.timers.tick(6 * HORA);
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(chamadas.length, 2, 'roda de novo depois de 6 h');

  parar();
  mock.timers.tick(12 * HORA);
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(chamadas.length, 2, 'não roda mais depois de parar');
});

test('falha na limpeza não derruba o servidor nem grava detalhes no log', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const logs = [];
  mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  mockPrisma(prisma, '$transaction', async () => {
    throw Object.assign(new Error('falha com email: pessoa@teste.test'), { code: 'P1001' });
  });
  mockPrisma(prisma.verificacaoEmail, 'deleteMany', async () => ({ count: 0 }));
  mockPrisma(prisma.registroEnvio, 'deleteMany', async () => ({ count: 0 }));

  const parar = agendarLimpeza({ intervaloHoras: 6 });
  await new Promise((resolver) => setImmediate(resolver));
  parar();

  assert.equal(logs.length, 1);
  assert.match(logs[0], /P1001/);
  assert.doesNotMatch(logs[0], /pessoa@teste\.test/);
});

test('o registro do limite guarda só a data, sem o horário do envio', async () => {
  const gravados = [];
  mockPrisma(prisma.envio, 'create', (args) => ({ tipo: 'envio', args }));
  mockPrisma(prisma.registroEnvio, 'create', (args) => ({ tipo: 'registro', args }));
  mockPrisma(prisma, '$transaction', async (operacoes) => {
    for (const op of operacoes) gravados.push(op);
  });

  await registrar({ tipo: 'RELATO', mensagem: 'texto' }, 'hash-do-email');

  const registro = gravados.find((op) => op.tipo === 'registro').args.data;
  assert.equal(registro.emailHash, 'hash-do-email');
  const meiaNoite = new Date(registro.criadoEm);
  assert.equal(meiaNoite.getUTCHours(), 0);
  assert.equal(meiaNoite.getUTCMinutes(), 0);
  assert.equal(meiaNoite.getUTCSeconds(), 0);
  assert.equal(meiaNoite.getUTCMilliseconds(), 0);
});
