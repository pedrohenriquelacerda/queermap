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

test('todas as áreas administrativas exigem login', async () => {
  for (const caminho of [
    '/painel',
    '/painel/conta',
    '/painel/pessoas',
    '/painel/locais',
    '/painel/classificacao',
  ]) {
    const res = await request(app).get(caminho);
    assert.equal(res.status, 302, `${caminho} deveria redirecionar`);
    assert.match(res.headers.location, /^\/painel\/entrar\?volta=/);
  }
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

test('login retorna à página administrativa pedida', async () => {
  const res = await enviar(request(app), '/painel/entrar', {
    email: 'admin@teste.test',
    senha: SENHA,
    volta: '/painel/locais?status=rascunho',
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/painel/locais?status=rascunho');
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

test('pessoa editora não cria conta por requisição direta', async () => {
  const agente = await logar('editor@teste.test');
  const res = await enviar(agente, '/painel/pessoas', {
    nome: 'Conta indevida',
    email: 'indevida@teste.test',
    papel: 'EDITOR',
  });
  assert.equal(res.status, 403);
  assert.equal(
    admins.some((a) => a.email === 'indevida@teste.test'),
    false,
  );
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
  assert.equal(saida.headers.location, '/painel/entrar');
  const depois = await agente.get('/painel');
  assert.equal(depois.status, 302);
});

test('logada no site público, a pessoa vê a faixa da equipe, sem cache', async () => {
  const visitante = await request(app).get('/sobre');
  assert.doesNotMatch(visitante.text, /barra-equipe/);

  const agente = await logar('admin@teste.test');
  const res = await agente.get('/sobre');
  assert.match(res.text, /class="barra-equipe"/);
  assert.match(res.text, /Conta da equipe: <strong>Pessoa 1<\/strong>/);
  assert.match(res.text, /<a href="\/painel">Ir ao painel<\/a>/);
  assert.match(res.text, /action="\/painel\/sair"[\s\S]*?name="volta" value="\/sobre"/);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  // Rodapé: logada, "Ir ao painel" no lugar de "Acesso da equipe".
  const [rodape] = res.text.match(/<footer class="rodape">[\s\S]*?<\/footer>/);
  assert.match(rodape, /href="\/painel"[^>]*>Ir ao painel/);
  assert.doesNotMatch(rodape, /Acesso da equipe/);
});

test('senha trocada em outro lugar encerra as outras sessões da conta', async () => {
  const agente = await logar('editor@teste.test');
  assert.equal((await agente.get('/painel')).status, 200);

  admins[1].senhaHash = 'hash-da-senha-redefinida'; // ex.: um admin redefiniu a senha
  const depois = await agente.get('/painel');
  assert.equal(depois.status, 302);
  assert.match(depois.headers.location, /^\/painel\/entrar/);
});

test('sessão expira após 30 min sem uso', async (t) => {
  const agente = await logar('admin@teste.test');
  const inicio = Date.now();
  const relogio = t.mock.method(Date, 'now', () => inicio + 29 * 60 * 1000);
  assert.equal((await agente.get('/painel')).status, 200); // 29 min: ainda vale (e renova)

  relogio.mock.mockImplementation(() => inicio + 29 * 60 * 1000 + 31 * 60 * 1000);
  const parada = await agente.get('/painel');
  assert.equal(parada.status, 302);
  assert.match(parada.headers.location, /^\/painel\/entrar/);
});

test('mesmo em uso, a sessão termina 8 h depois do login', async (t) => {
  const agente = await logar('admin@teste.test');
  const inicio = Date.now();
  let agora = inicio;
  t.mock.method(Date, 'now', () => agora);

  // Um acesso a cada 25 min (nunca fica 30 min parada) até 7h55...
  for (let i = 1; i <= 19; i++) {
    agora = inicio + i * 25 * 60 * 1000;
    assert.equal((await agente.get('/painel')).status, 200, `${i * 25} min`);
  }
  // ...e às 8h20 já não vale mais.
  agora = inicio + 20 * 25 * 60 * 1000;
  const parada = await agente.get('/painel');
  assert.equal(parada.status, 302);
});

test('sair pela faixa do site volta para a mesma página, nunca para outro site', async () => {
  const agente = await logar('admin@teste.test');
  const saida = await enviar(agente, '/painel/sair', { volta: '/sobre' });
  assert.equal(saida.headers.location, '/sobre');
  assert.doesNotMatch((await agente.get('/sobre')).text, /barra-equipe/);

  for (const volta of ['//golpe.example', '/\\golpe.example', 'https://golpe.example']) {
    const outro = await logar('admin@teste.test');
    const res = await enviar(outro, '/painel/sair', { volta });
    assert.equal(res.headers.location, '/painel/entrar', `volta=${volta}`);
  }
});

test('desmarcar "Acesso ativo" (checkbox não enviada) desativa a pessoa', async () => {
  const agente = await logar('admin@teste.test');
  const res = await enviar(agente, '/painel/pessoas/2', { nome: 'Pessoa 2', papel: 'EDITOR' });
  assert.equal(res.status, 302);
  assert.equal(admins[1].ativo, false);
});
