import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import {
  prepararAdmins,
  enviar,
  logar,
  codigoTotp,
  SENHA,
  SEGREDO_TOTP,
} from './helpers/painel.js';
import {
  codigoDoPasso,
  gerarSegredo,
  hashCodigoRecuperacao,
  passoAtual,
} from '../src/utils/totp.js';

const app = createApp();
let admins;
let auditoria;

beforeEach(async () => {
  ({ admins, auditoria } = await prepararAdmins([
    { email: 'nova@teste.test', totpSegredo: null, totpAtivadoEm: null },
    { email: 'outra@teste.test' },
    { email: 'reuso@teste.test' },
    { email: 'recuperacao@teste.test' },
    { email: 'redefinida@teste.test' },
  ]));
  mockPrisma(prisma.local, 'count', async () => 0);
  mockPrisma(prisma.envio, 'count', async () => 0);
});

afterEach(restaurarPrisma);

// Só a senha: devolve o agente (com a sessão pendente) e a resposta.
async function senhaCerta(email) {
  const agente = request.agent(app);
  const res = await enviar(agente, '/painel/entrar', { email, senha: SENHA });
  return { agente, res };
}

const codigoErrado = () => (codigoTotp() === '000000' ? '111111' : '000000');

test('TOTP bate com o vetor da RFC 6238', () => {
  // Segredo "12345678901234567890", passo 1 (t = 59 s): 94287082, ou 287082 em 6 dígitos.
  assert.equal(codigoDoPasso('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});

test('código errado não entra e conta no mesmo bloqueio do login', async () => {
  const { agente } = await senhaCerta('outra@teste.test');
  const res = await enviar(agente, '/painel/entrar/2fa', { codigo: codigoErrado() });
  assert.equal(res.status, 401);
  assert.equal((await agente.get('/painel')).status, 302);
  assert.ok(auditoria.some((a) => a.acao === 'sessao.falha_2fa'));

  // 1 erro de código + 3 de senha + 1 de código = 5 erros da conta; o próximo já é 429.
  for (let i = 0; i < 3; i++) {
    const r = await enviar(request(app), '/painel/entrar', {
      email: 'outra@teste.test',
      senha: 'errada',
    });
    assert.equal(r.status, 401);
  }
  assert.equal(
    (await enviar(agente, '/painel/entrar/2fa', { codigo: codigoErrado() })).status,
    401,
  );
  assert.equal((await enviar(agente, '/painel/entrar/2fa', { codigo: codigoTotp() })).status, 429);
});

test('código já usado (mesmo passo) é recusado', async () => {
  mockPrisma(prisma.admin, 'updateMany', async () => ({ count: 0 }));
  const { agente } = await senhaCerta('reuso@teste.test');
  const res = await enviar(agente, '/painel/entrar/2fa', { codigo: codigoTotp() });
  assert.equal(res.status, 401);
});

test('sem passar pela senha não há tela nem código que valha', async () => {
  for (const url of ['/painel/entrar/2fa', '/painel/entrar/2fa/ativar']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/painel/entrar');
  }
  const res = await enviar(request(app), '/painel/entrar/2fa', { codigo: codigoTotp() });
  assert.equal(res.headers.location, '/painel/entrar');
});

test('código de recuperação vale uma vez', async () => {
  const codigo = 'abcde-fghjk';
  let usado = false;
  mockPrisma(prisma.codigoRecuperacao, 'updateMany', async ({ where }) => {
    const ok = where.hash === hashCodigoRecuperacao(where.adminId, codigo) && !usado;
    usado ||= ok;
    return { count: ok ? 1 : 0 };
  });
  const primeira = await senhaCerta('recuperacao@teste.test');
  const res = await enviar(primeira.agente, '/painel/entrar/2fa', { codigo: 'ABCDE-FGHJK ' });
  assert.equal(res.status, 302);
  assert.equal((await primeira.agente.get('/painel')).status, 200);
  assert.ok(auditoria.some((a) => a.acao === 'sessao.entrar' && a.detalhes?.via === 'recuperacao'));

  const segunda = await senhaCerta('recuperacao@teste.test');
  assert.equal((await enviar(segunda.agente, '/painel/entrar/2fa', { codigo })).status, 401);
});

test('conta sem 2FA é levada à ativação, que mostra QR e confirma o primeiro código', async () => {
  const { agente, res } = await senhaCerta('nova@teste.test');
  assert.equal(res.headers.location, '/painel/entrar/2fa/ativar');
  const aoVerificar = await agente.get('/painel/entrar/2fa');
  assert.equal(aoVerificar.headers.location, '/painel/entrar/2fa/ativar');

  const tela = await agente.get('/painel/entrar/2fa/ativar');
  assert.equal(tela.status, 200);
  assert.match(tela.text, /<svg/);
  const segredo = tela.text.match(/<code>([A-Z2-7]{32})<\/code>/)[1];
  assert.equal((await agente.get('/painel')).status, 302);

  const errado = codigoDoPasso(segredo, passoAtual()) === '000000' ? '111111' : '000000';
  assert.equal((await enviar(agente, '/painel/entrar/2fa/ativar', { codigo: errado })).status, 401);

  let gravado;
  const update = prisma.admin.update;
  mockPrisma(prisma.admin, 'update', async (args) => {
    if (args.data.codigosRecuperacao) gravado = args.data;
    return update(args);
  });
  const ok = await enviar(agente, '/painel/entrar/2fa/ativar', {
    codigo: codigoDoPasso(segredo, passoAtual()),
  });
  assert.equal(ok.status, 200);
  const codigos = [...ok.text.matchAll(/<code>([a-z0-9]{5}-[a-z0-9]{5})<\/code>/g)].map(
    (m) => m[1],
  );
  assert.equal(codigos.length, 10);
  assert.equal(gravado.codigosRecuperacao.create.length, 10);
  assert.ok(!JSON.stringify(gravado).includes(codigos[0]), 'códigos só como hash');
  assert.ok(!JSON.stringify(gravado).includes(segredo), 'segredo cifrado');
  assert.ok(auditoria.some((a) => a.acao === '2fa.ativar'));
  assert.equal((await agente.get('/painel')).status, 200);
});

test('admin redefine a 2FA de outra conta e isso é auditado', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const outra = admins.find((a) => a.email === 'redefinida@teste.test');
  const res = await enviar(admin, `/painel/pessoas/${outra.id}/2fa`, {});
  assert.equal(res.status, 302);
  assert.equal(outra.totpSegredo, null);
  assert.equal(outra.totpAtivadoEm, null);
  assert.ok(auditoria.some((a) => a.acao === 'admin.redefinir_2fa' && a.entidadeId === outra.id));

  // no próximo login a pessoa cai na ativação
  const { res: login } = await senhaCerta('redefinida@teste.test');
  assert.equal(login.headers.location, '/painel/entrar/2fa/ativar');
});

test('editor não redefine 2FA, e ninguém redefine a própria', async () => {
  const editor = await logar(app, 'editor@teste.test');
  assert.equal((await enviar(editor, '/painel/pessoas/1/2fa', {})).status, 403);
  const admin = await logar(app, 'admin@teste.test');
  assert.equal((await enviar(admin, '/painel/pessoas/1/2fa', {})).status, 404);
  assert.notEqual(admins[0].totpSegredo, null);
});

test('segredo gerado é base32 de 32 caracteres', () => {
  assert.match(gerarSegredo(), /^[A-Z2-7]{32}$/);
  assert.match(SEGREDO_TOTP, /^[A-Z2-7]+$/);
});
