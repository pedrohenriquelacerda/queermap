import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { analisar } from '../src/utils/filtroConteudo.js';
import { hashEmail } from '../src/utils/hash.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

let app; // um por teste: os limites por IP começam do zero
let verificacoes;
let envios;
let registros;
let emails; // e-mails "enviados" (capturados do modo desenvolvimento)
let turnstileAprova;

beforeEach(() => {
  app = createApp();
  verificacoes = [];
  envios = [];
  registros = [];
  emails = [];
  turnstileAprova = true;

  mockPrisma(prisma.local, 'findMany', async () => [
    { id: 4, nome: 'SAE Teste', slug: 'sae-teste', bairro: 'Centro' },
  ]);
  mockPrisma(prisma.categoria, 'findMany', async () => [{ id: 2, nome: 'Ambulatório trans' }]);
  mockPrisma(prisma.canalDenuncia, 'findMany', async () => [
    {
      slug: 'disque-100',
      nome: 'Disque 100 · Direitos Humanos',
      descricao: 'Denúncias de violações de direitos humanos.',
      telefone: '100',
      link: 'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos',
      ordem: 1,
      ativo: true,
    },
    {
      slug: 'delegacia-combate-intolerancia',
      nome: 'Delegacia de Combate à Intolerância (Polícia Civil RS)',
      descricao: 'Registra ocorrências de crimes de ódio e discriminação.',
      telefone: '(51) 3288-2400',
      link: 'https://www.pc.rs.gov.br/delegacia-de-combate-a-intolerancia',
      ordem: 2,
      ativo: true,
    },
    {
      slug: 'ouvidoria-sus',
      nome: 'Ouvidoria do SUS',
      descricao: 'Reclamações sobre atendimento em serviços públicos de saúde.',
      telefone: '136',
      link: 'https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus',
      ordem: 3,
      ativo: true,
    },
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

test('formulário público de envio não exige login', async () => {
  const res = await request(app).get('/enviar');
  assert.equal(res.status, 200);
  assert.equal(res.headers.location, undefined);
  assert.match(res.text, /<form[^>]*action="\/enviar"/);
});

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

  const persistido = JSON.stringify({ envios, registros, verificacoes });
  assert.doesNotMatch(persistido, /127\.0\.0\.1|::ffff|user-agent/i);
  assert.doesNotMatch(persistido, /Pessoa@Teste\.test/i);

  const obrigado = await agente.get('/enviar/obrigado');
  assert.match(obrigado.text, /Seu relato chegou à ONG/);
});

test('IP é usado no anti-robô, mas não é incluído nos dados persistidos', async () => {
  let dadosTurnstile;
  mock.restoreAll();
  mock.method(console, 'info', (texto) => emails.push(texto));
  mock.method(globalThis, 'fetch', async (_url, opcoes) => {
    dadosTurnstile = Object.fromEntries(opcoes.body);
    return Response.json({ success: true });
  });

  const agente = request.agent(app);
  await enviar(agente, '/enviar', relato);
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });

  assert.ok(dadosTurnstile.remoteip);
  assert.equal(Object.hasOwn(envios[0], 'ip'), false);
  assert.equal(Object.hasOwn(registros[0], 'ip'), false);
  assert.equal(Object.hasOwn(verificacoes[0], 'ip'), false);
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

test('formulário oferece pop-up com canais oficiais e aviso sobre denúncia formal', async () => {
  const res = await request(app).get('/enviar');
  assert.equal(res.status, 200);
  assert.match(res.text, /<dialog[^>]+id="modal-canais"/);
  assert.match(res.text, /href="tel:100"/);
  assert.match(res.text, /href="tel:136"/);
  assert.match(res.text, /href="tel:5132882400"/);
  assert.match(res.text, /não substitui uma denúncia formal/);
  assert.match(res.text, /data-fechar-canais/);
});

const sugestao = {
  ...relato,
  tipo: 'SUGESTAO_LOCAL',
  nomeLocalSugerido: 'Casa Nova',
  categoriaSugeridaId: '2',
  enderecoLocalSugerido: 'Rua da República, 100, Cidade Baixa',
  contatoLocalSugerido: 'https://casanova.example',
};

test('sugestão de local exige nome, tipo, endereço e contato', async () => {
  const agente = request.agent(app);
  const semNada = await enviar(agente, '/enviar', { ...relato, tipo: 'SUGESTAO_LOCAL' });
  assert.equal(semNada.status, 400);
  assert.match(semNada.text, /Informe o nome do local sugerido/);
  assert.match(semNada.text, /Escolha o tipo de serviço/);
  assert.match(semNada.text, /Informe o endereço do local/);
  assert.match(semNada.text, /Informe um telefone, site ou e-mail do local/);
  assert.doesNotMatch(semNada.text, /Pessoa@Teste/); // não reexibe o e-mail

  const categoriaInexistente = await enviar(agente, '/enviar', {
    ...sugestao,
    categoriaSugeridaId: '99',
  });
  assert.equal(categoriaInexistente.status, 400);
  assert.match(categoriaInexistente.text, /Escolha o tipo de serviço/);
  assert.equal(emails.length, 0);
});

test('sugestão completa é salva sem o local selecionado e sem sinalizar o site', async () => {
  const agente = request.agent(app);
  await enviar(agente, '/enviar', sugestao);
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(envios[0].nomeLocalSugerido, 'Casa Nova');
  assert.equal(envios[0].categoriaSugeridaId, 2);
  assert.equal(envios[0].enderecoLocalSugerido, 'Rua da República, 100, Cidade Baixa');
  assert.equal(envios[0].contatoLocalSugerido, 'https://casanova.example');
  assert.equal(envios[0].localId, null);
  assert.equal(envios[0].sinalizado, false); // site no contato não conta como link suspeito
});

test('relato exige o local: um do mapa ou "Outro lugar" com o nome', async () => {
  const agente = request.agent(app);
  const semLocal = await enviar(agente, '/enviar', { ...relato, localId: '' });
  assert.equal(semLocal.status, 400);
  assert.match(semLocal.text, /Escolha o local ou &#34;Outro lugar&#34;/);

  const localInexistente = await enviar(agente, '/enviar', { ...relato, localId: '99' });
  assert.equal(localInexistente.status, 400);

  const outroSemNome = await enviar(agente, '/enviar', { ...relato, localId: 'outro' });
  assert.equal(outroSemNome.status, 400);
  assert.match(outroSemNome.text, /Informe o nome do lugar/);
  assert.equal(emails.length, 0);

  await enviar(agente, '/enviar', {
    ...relato,
    localId: 'outro',
    nomeLocalRelato: 'UBS Santa Cecília',
  });
  await enviar(agente, '/enviar/confirmar', { codigo: codigoDoEmail() });
  assert.equal(envios[0].localId, null);
  assert.equal(envios[0].nomeLocalRelato, 'UBS Santa Cecília');
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
