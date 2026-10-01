import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, enviar, logar as logarNoApp, SENHA } from './helpers/painel.js';

const app = createApp();
let admins; // "tabela" em memória
let auditoria;
let hash;

beforeEach(async () => {
  ({ admins, auditoria } = await prepararAdmins([
    { email: 'provisoria@teste.test', precisaTrocarSenha: true },
    { email: 'limite@teste.test' },
  ]));
  hash = admins[0].senhaHash;
  mockPrisma(prisma.local, 'count', async () => 0);
  mockPrisma(prisma.envio, 'count', async () => 0);
});

afterEach(restaurarPrisma);

const logar = (email) => logarNoApp(app, email);

test('painel exige login e lembra a página pedida', async () => {
  const res = await request(app).get('/painel/pessoas');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel/entrar?volta=%2Fpainel%2Fpessoas');
});

test('envio sem Origin do próprio site é bloqueado (CSRF)', async () => {
  const res = await request(app)
    .post('/painel/entrar')
    .type('form')
    .set('Origin', 'https://site-malicioso.example')
    .send({ email: 'admin@teste.test', senha: SENHA });
  assert.equal(res.status, 403);
});

test('senha errada e e-mail inexistente dão a mesma mensagem', async () => {
  const errada = await enviar(request(app), '/painel/entrar', {
    email: 'admin@teste.test',
    senha: 'errada',
  });
  const inexistente = await enviar(request(app), '/painel/entrar', {
    email: 'ninguem@teste.test',
    senha: 'errada',
  });
  for (const res of [errada, inexistente]) {
    assert.equal(res.status, 401);
    assert.match(res.text, /E-mail ou senha incorretos/);
  }
});

test('login certo cria sessão, registra auditoria e abre o painel', async () => {
  const agente = request.agent(app);
  const res = await enviar(agente, '/painel/entrar', {
    email: ' ADMIN@teste.test ',
    senha: SENHA,
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel');
  assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  assert.ok(auditoria.some((a) => a.acao === 'sessao.entrar' && a.adminId === 1));

  const inicio = await agente.get('/painel');
  assert.equal(inicio.status, 200);
  assert.match(inicio.text, /Olá, Pessoa/);
  assert.equal(inicio.headers['cache-control'], 'no-store');
});

test('depois do login não redireciona para outro site', async () => {
  const res = await enviar(request(app), '/painel/entrar', {
    email: 'admin@teste.test',
    senha: SENHA,
    volta: '//site-malicioso.example',
  });
  assert.equal(res.headers.location, '/painel');
});

test('bloqueia após 5 tentativas erradas', async () => {
  const dados = { email: 'limite@teste.test', senha: 'errada' };
  for (let i = 0; i < 5; i++) {
    assert.equal((await enviar(request(app), '/painel/entrar', dados)).status, 401);
  }
  const bloqueado = await enviar(request(app), '/painel/entrar', { ...dados, senha: SENHA });
  assert.equal(bloqueado.status, 429);
  assert.match(bloqueado.text, /Muitas tentativas/);
});

test('senha provisória obriga a trocar antes de usar o painel', async () => {
  const agente = await logar('provisoria@teste.test');
  const res = await agente.get('/painel');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel/conta');
});

test('troca de senha valida a senha atual e a confirmação', async () => {
  const agente = await logar('provisoria@teste.test');

  const atualErrada = await enviar(agente, '/painel/conta', {
    atual: 'errada',
    nova: 'nova-senha-segura',
    confirmacao: 'nova-senha-segura',
  });
  assert.equal(atualErrada.status, 400);
  assert.match(atualErrada.text, /Senha atual incorreta/);

  const naoConfere = await enviar(agente, '/painel/conta', {
    atual: SENHA,
    nova: 'nova-senha-segura',
    confirmacao: 'outra-coisa',
  });
  assert.equal(naoConfere.status, 400);
  assert.match(naoConfere.text, /As senhas não conferem/);

  const curta = await enviar(agente, '/painel/conta', {
    atual: SENHA,
    nova: 'curta',
    confirmacao: 'curta',
  });
  assert.equal(curta.status, 400);

  const ok = await enviar(agente, '/painel/conta', {
    atual: SENHA,
    nova: 'nova-senha-segura',
    confirmacao: 'nova-senha-segura',
  });
  assert.equal(ok.status, 302);
  assert.equal(admins[2].precisaTrocarSenha, false);
  assert.notEqual(admins[2].senhaHash, hash);

  const inicio = await agente.get('/painel');
  assert.equal(inicio.status, 200);
  assert.match(inicio.text, /Senha alterada/);
});

test('pessoa editora não acessa a gestão de pessoas', async () => {
  const agente = await logar('editor@teste.test');
  const res = await agente.get('/painel/pessoas');
  assert.equal(res.status, 403);
});

test('admin cadastra pessoa com senha provisória mostrada uma vez', async () => {
  const agente = await logar('admin@teste.test');
  const res = await enviar(agente, '/painel/pessoas', {
    nome: 'Nova Pessoa',
    email: 'nova@teste.test',
    papel: 'EDITOR',
  });
  assert.equal(res.status, 200);
  const senha = res.text.match(/class="senha-provisoria">([^<]+)</)[1];
  assert.match(senha, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  const nova = admins.find((a) => a.email === 'nova@teste.test');
  assert.equal(nova.precisaTrocarSenha, true);
  assert.ok(!nova.senhaHash.includes(senha)); // só o hash é salvo

  const repetida = await enviar(agente, '/painel/pessoas', {
    nome: 'Outra',
    email: 'nova@teste.test',
    papel: 'EDITOR',
  });
  assert.equal(repetida.status, 400);
  assert.match(repetida.text, /Já existe uma pessoa com este e-mail/);
});

test('admin não pode tirar o próprio acesso de administração', async () => {
  const agente = await logar('admin@teste.test');
  const res = await enviar(agente, '/painel/pessoas/1', {
    nome: 'Eu',
    papel: 'EDITOR',
    ativo: 'on',
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /seu próprio acesso/);
  assert.equal(admins[0].papel, 'ADMIN');
});

test('conta desativada perde o acesso na hora', async () => {
  const agente = await logar('editor@teste.test');
  admins[1].ativo = false;
  const res = await agente.get('/painel');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/painel\/entrar/);
});

test('sair encerra a sessão', async () => {
  const agente = await logar('admin@teste.test');
  const saida = await enviar(agente, '/painel/sair', {});
  assert.equal(saida.status, 302);
  const depois = await agente.get('/painel');
  assert.equal(depois.status, 302);
});

test('desmarcar "Acesso ativo" (checkbox não enviada) desativa a pessoa', async () => {
  const agente = await logar('admin@teste.test');
  const res = await enviar(agente, '/painel/pessoas/2', { nome: 'Pessoa 2', papel: 'EDITOR' });
  assert.equal(res.status, 302);
  assert.equal(admins[1].ativo, false);
});
