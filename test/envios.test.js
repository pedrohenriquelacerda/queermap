import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { analisar } from '../src/utils/filtroConteudo.js';
import { hashEmail } from '../src/utils/hash.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();
let verificacoes;
let envios;
let registros;
let emails; // e-mails "enviados" (capturados do modo desenvolvimento)
let turnstileAprova;

beforeEach(() => {
  verificacoes = [];
  envios = [];
  registros = [];
  emails = [];
  turnstileAprova = true;

  mockPrisma(prisma.local, 'findMany', async () => [
    { id: 4, nome: 'SAE Teste', slug: 'sae-teste', bairro: 'Centro' },
  ]);
  mockPrisma(
    prisma.registroEnvio,
    'count',
    async ({ where }) => registros.filter((r) => r.emailHash === where.emailHash).length,
  );
  mockPrisma(prisma.verificacaoEmail, 'create', async ({ data }) => {
    const v = { id: verificacoes.length + 1, tentativas: 0, usadoEm: null, ...data };
    verificacoes.push(v);
    return v;
  });
  mockPrisma(
    prisma.verificacaoEmail,
    'findUnique',
    async ({ where }) => verificacoes.find((v) => v.id === where.id) ?? null,
  );
  mockPrisma(prisma.verificacaoEmail, 'update', async ({ where, data }) => {
    const v = verificacoes.find((x) => x.id === where.id);
    if (data.tentativas?.increment) v.tentativas += data.tentativas.increment;
    if (data.usadoEm) v.usadoEm = data.usadoEm;
    return v;
  });
  mockPrisma(prisma.envio, 'create', (args) => ({ tipo: 'envio', args }));
  mockPrisma(prisma.registroEnvio, 'create', (args) => ({ tipo: 'registro', args }));
  mockPrisma(prisma, '$transaction', async (operacoes) => {
    for (const op of operacoes) {
      if (op.tipo === 'envio') envios.push(op.args.data);
      else registros.push(op.args.data);
    }
  });

  mock.method(console, 'info', (texto) => emails.push(texto));
  mock.method(globalThis, 'fetch', async () => Response.json({ success: turnstileAprova }));
});

afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

const relato = {
  tipo: 'RECLAMACAO',
  localId: '4',
  mensagem: 'Não respeitaram meu nome social na recepção.',
  email: 'Pessoa@Teste.test',
  'cf-turnstile-response': 'token-de-teste',
};

const enviar = (agente, url, dados) =>
  agente.post(url).type('form').set('Origin', env.siteUrl).send(dados);

function codigoDoEmail() {
  return emails.at(-1).match(/é: (\d{6})/)[1];
}

test('fluxo completo: formulário, código por e-mail e confirmação', async () => {
  const agente = request.agent(app);

  const passo1 = await enviar(agente, '/enviar', relato);
  assert.equal(passo1.status, 302);
  assert.equal(passo1.headers.location, '/enviar/confirmar');
  assert.match(emails[0], /Para: Pessoa@Teste\.test|Para: pessoa@teste\.test/);

  const tela = await agente.get('/enviar/confirmar');
  assert.match(tela.text, /pe•••@teste\.test/);

  const passo2 = await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(passo2.status, 302);
  assert.equal(passo2.headers.location, '/enviar/obrigado');

  assert.equal(envios.length, 1);
  assert.equal(envios[0].tipo, 'RECLAMACAO');
  assert.equal(envios[0].localId, 4);
  assert.equal(envios[0].emailContato, null); // não pediu contato: e-mail não é salvo
  assert.deepEqual(registros, [{ emailHash: hashEmail('pessoa@teste.test') }]);
  assert.ok(!JSON.stringify(verificacoes).includes(codigoDoEmail())); // só o hash do código

  const obrigado = await agente.get('/enviar/obrigado');
  assert.match(obrigado.text, /Seu relato chegou à ONG/);
});

test('e-mail só é salvo quando a pessoa pede contato', async () => {
  const agente = request.agent(app);
  await enviar(agente, '/enviar', { ...relato, desejaContato: 'on' });
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(envios[0].desejaContato, true);
  assert.equal(envios[0].emailContato, 'pessoa@teste.test');
});

test('relato de discriminação mostra os canais oficiais no final', async () => {
  const agente = request.agent(app);
  await enviar(agente, '/enviar', { ...relato, tipo: 'DISCRIMINACAO' });
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  const obrigado = await agente.get('/enviar/obrigado');
  assert.match(obrigado.text, /Disque 100/);
  assert.match(obrigado.text, /href="tel:136"/);
});

test('sugestão de local exige o nome e ignora o local selecionado', async () => {
  const agente = request.agent(app);
  const semNome = await enviar(agente, '/enviar', { ...relato, tipo: 'SUGESTAO_LOCAL' });
  assert.equal(semNome.status, 400);
  assert.match(semNome.text, /Informe o nome do local sugerido/);
  assert.doesNotMatch(semNome.text, /Pessoa@Teste/); // não reexibe o e-mail

  await enviar(agente, '/enviar', {
    ...relato,
    tipo: 'SUGESTAO_LOCAL',
    nomeLocalSugerido: 'Casa Nova',
  });
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(envios[0].nomeLocalSugerido, 'Casa Nova');
  assert.equal(envios[0].localId, null);
});

test('sem passar no anti-robô não envia código', async () => {
  turnstileAprova = false;
  const res = await enviar(request(app), '/enviar', relato);
  assert.equal(res.status, 400);
  assert.match(res.text, /não é um robô/);
  assert.equal(emails.length, 0);
});

test('limite de 5 envios por e-mail em 30 dias', async () => {
  for (let i = 0; i < 5; i++) registros.push({ emailHash: hashEmail('pessoa@teste.test') });
  const res = await enviar(request(app), '/enviar', relato);
  assert.equal(res.status, 429);
  assert.match(res.text, /já fez 5 envios/);
  assert.equal(emails.length, 0);
});

test('código errado conta tentativa; depois de 5 é preciso pedir outro', async () => {
  const agente = request.agent(app);
  await enviar(agente, '/enviar', relato);
  const certo = codigoDoEmail();
  const errado = certo === '000000' ? '111111' : '000000';

  for (let i = 0; i < 4; i++) {
    const res = await enviar(agente, '/enviar/confirmar', { codigo: errado });
    assert.match(res.text, /Código incorreto/);
  }
  const ultima = await enviar(agente, '/enviar/confirmar', { codigo: errado });
  assert.match(ultima.text, /Muitas tentativas/);

  const tarde = await enviar(agente, '/enviar/confirmar', { codigo: certo });
  assert.equal(tarde.status, 400);
  assert.equal(envios.length, 0);
});

test('código expirado não vale', async () => {
  const agente = request.agent(app);
  await enviar(agente, '/enviar', relato);
  verificacoes[0].expiraEm = new Date(Date.now() - 1000);
  const res = await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.match(res.text, /O código expirou/);
  assert.equal(envios.length, 0);
});

test('filtro de conteúdo marca, mas nunca bloqueia', async () => {
  assert.deepEqual(analisar('Fui bem atendida, recomendo.'), {
    sinalizado: false,
    motivoFiltro: null,
  });
  assert.match(analisar('Me chamaram de VIADO na recepção').motivoFiltro, /linguagem ofensiva/);
  assert.match(analisar('Veja em https://golpe.example').motivoFiltro, /contém link/);
  assert.match(analisar('AAAAAAAAAAAAAAAAAAAAAAAA!!!').motivoFiltro, /caracteres repetidos/);

  const agente = request.agent(app);
  await enviar(agente, '/enviar', {
    ...relato,
    mensagem: 'Me chamaram de viado na recepção do posto.',
  });
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(envios[0].sinalizado, true);
  assert.equal(envios[0].motivoFiltro, 'linguagem ofensiva');
});

test('telas do fluxo não abrem fora de ordem', async () => {
  assert.equal((await request(app).get('/enviar/confirmar')).headers.location, '/enviar');
  assert.equal((await request(app).get('/enviar/obrigado')).headers.location, '/');
});
