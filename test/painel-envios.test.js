import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';
import { prepararAdmins, enviar as enviarFormulario, logar } from './helpers/painel.js';

const app = createApp();
const enviar = (...args) => enviarFormulario(...args).set('Accept', 'application/json');
let envio;
let auditoria;
let falharAuditoria;
let conflito;
let consultas;

beforeEach(async () => {
  ({ auditoria } = await prepararAdmins());
  falharAuditoria = false;
  conflito = false;
  consultas = [];
  envio = {
    id: 1,
    tipo: 'RECLAMACAO',
    status: 'NOVO',
    mensagem: 'Relato privado',
    emailContato: 'privado@teste.test',
    desejaContato: true,
    criadoEm: new Date('2026-10-15T15:00:00Z'),
    lidoEm: null,
    resolvidoEm: null,
    notasInternas: null,
  };
  mockPrisma(prisma.envio, 'findUnique', async ({ where }) =>
    where.id === 1 ? { ...envio } : null,
  );
  mockPrisma(prisma.envio, 'findMany', async (args) => {
    consultas.push(args);
    return [{ ...envio, mensagem: undefined, emailContato: undefined }];
  });
  mockPrisma(prisma, '$transaction', async (executar, opcoes) => {
    assert.equal(opcoes.isolationLevel, 'Serializable');
    if (conflito) throw Object.assign(new Error('conflito'), { code: 'P2034' });
    const anterior = { ...envio };
    const registros = [];
    try {
      const resultado = await executar({
        envio: {
          findUnique: async ({ where }) => (where.id === 1 ? { ...envio } : null),
          update: async ({ data }) => Object.assign(envio, data),
        },
        logAuditoria: {
          create: async ({ data }) => {
            if (falharAuditoria) throw new Error('auditoria indisponível');
            registros.push(data);
          },
        },
      });
      auditoria.push(...registros);
      return resultado;
    } catch (erro) {
      envio = anterior;
      throw erro;
    }
  });
});
afterEach(restaurarPrisma);

test('sem login, nenhuma rota permite consultar ou alterar envios', async () => {
  for (const url of ['/painel/envios', '/painel/envios/1']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/painel\/entrar/);
    assert.doesNotMatch(res.text, /Relato privado/);
  }
  for (const acao of ['ler', 'situacao', 'notas']) {
    const res = await enviar(request(app), `/painel/envios/1/${acao}`, { status: 'RESOLVIDO' });
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/painel\/entrar/);
  }
  assert.equal(envio.status, 'NOVO');
  assert.equal(envio.lidoEm, null);
});

for (const papel of ['admin', 'editor']) {
  test(`${papel} consulta, registra primeira leitura e percorre as situações`, async () => {
    const agente = await logar(app, `${papel}@teste.test`);
    assert.equal(
      (await agente.get('/painel/envios').set('Accept', 'application/json')).status,
      200,
    );
    const detalhe = await agente.get('/painel/envios/1').set('Accept', 'application/json');
    assert.equal(detalhe.body.envio.mensagem, 'Relato privado');
    assert.equal(envio.lidoEm, null); // GET não altera dados.
    await enviar(agente, '/painel/envios/1/ler', {});
    const leitura = envio.lidoEm;
    assert.ok(leitura instanceof Date);
    await enviar(agente, '/painel/envios/1/ler', {});
    assert.equal(envio.lidoEm, leitura);
    for (const status of ['EM_ANALISE', 'RESOLVIDO', 'ARQUIVADO', 'NOVO']) {
      const res = await enviar(agente, '/painel/envios/1/situacao', { status });
      assert.equal(res.status, 200);
      assert.equal(envio.status, status);
      assert.equal(envio.resolvidoEm instanceof Date, status === 'RESOLVIDO');
    }
    const logs = auditoria.filter((a) => a.entidade === 'Envio');
    assert.equal(logs.length, 5);
    assert.ok(logs.every((a) => a.adminId === (papel === 'admin' ? 1 : 2)));
    assert.deepEqual(logs[1].detalhes, { anterior: 'NOVO', novo: 'EM_ANALISE' });
  });
}

test('repetir resolução preserva data; reabrir e resolver cria nova resolução', async () => {
  const agente = await logar(app, 'editor@teste.test');
  await enviar(agente, '/painel/envios/1/situacao', { status: 'RESOLVIDO' });
  const data = envio.resolvidoEm;
  await enviar(agente, '/painel/envios/1/situacao', { status: 'RESOLVIDO' });
  assert.equal(envio.resolvidoEm, data);
  await enviar(agente, '/painel/envios/1/situacao', { status: 'EM_ANALISE' });
  assert.equal(envio.resolvidoEm, null);
  await enviar(agente, '/painel/envios/1/situacao', { status: 'RESOLVIDO' });
  assert.ok(envio.resolvidoEm instanceof Date);
  assert.equal(auditoria.filter((a) => a.acao === 'envio.situacao').length, 3);
});

test('cada edição de notas é auditada sem copiar texto privado para o log', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const notasInternas of ['Contatar serviço', 'Aguardando retorno', '']) {
    assert.equal((await enviar(agente, '/painel/envios/1/notas', { notasInternas })).status, 200);
    assert.equal(envio.notasInternas, notasInternas || null);
  }
  const logs = auditoria.filter((a) => a.acao === 'envio.anotar');
  assert.equal(logs.length, 3);
  assert.doesNotMatch(JSON.stringify(logs), /Contatar serviço|Aguardando retorno/);
});

test('rejeita situação e notas inválidas e envio inexistente', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const status of ['INVALIDO', '']) {
    assert.equal((await enviar(agente, '/painel/envios/1/situacao', { status })).status, 400);
  }
  const array = await agente
    .post('/painel/envios/1/situacao')
    .set('Origin', 'http://localhost:3000')
    .send({ status: ['NOVO'] });
  assert.equal(array.status, 400);
  for (const dados of [{}, { notasInternas: 'x'.repeat(5001) }]) {
    assert.equal((await enviar(agente, '/painel/envios/1/notas', dados)).status, 400);
  }
  assert.equal((await agente.get('/painel/envios/999')).status, 404);
  assert.equal((await enviar(agente, '/painel/envios/999/ler', {})).status, 404);
  assert.equal((await agente.get('/painel/envios/9007199254740992')).status, 404);
  assert.equal(envio.status, 'NOVO');
});

test('proteção de origem impede alteração de outro site', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente
    .post('/painel/envios/1/ler')
    .set('Origin', 'https://outro.test')
    .send({});
  assert.equal(res.status, 403);
  assert.equal(envio.lidoEm, null);
});

test('falha da auditoria reverte alteração; conflito retorna 409', async () => {
  const agente = await logar(app, 'editor@teste.test');
  falharAuditoria = true;
  const original = console.error;
  console.error = () => {};
  try {
    const res = await enviar(agente, '/painel/envios/1/situacao', { status: 'RESOLVIDO' });
    assert.equal(res.status, 500);
  } finally {
    console.error = original;
  }
  assert.equal(envio.status, 'NOVO');
  assert.equal(envio.resolvidoEm, null);
  assert.equal(auditoria.filter((a) => a.entidade === 'Envio').length, 0);
  conflito = true;
  assert.equal((await enviar(agente, '/painel/envios/1/ler', {})).status, 409);
});

test('lista HTML mostra tipo, local, data, situação e motivo da sinalização', async () => {
  envio.nomeLocalRelato = 'Serviço de teste';
  envio.sinalizado = true;
  envio.motivoFiltro = 'Contém link';
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel/envios?tipo=RECLAMACAO&status=NOVO&pagina=2');
  assert.equal(res.status, 200);
  for (const texto of [
    'Serviço de teste',
    'Reclamação',
    'Novo',
    '15 de outubro',
    'Sinalizado',
    'Contém link',
  ]) {
    assert.ok(res.text.includes(texto), texto);
  }
  assert.doesNotMatch(res.text, /privado@teste.test|Relato privado/);
  assert.deepEqual(consultas.at(-1).where, { tipo: 'RECLAMACAO', status: 'NOVO' });
  assert.equal(consultas.at(-1).skip, 50);
  assert.equal(consultas.at(-1).take, 51);
  assert.match(res.text, /pagina=1&amp;tipo=RECLAMACAO&amp;status=NOVO/);
});

test('abrir detalhe HTML marca como lido, escapa conteúdo e respeita consentimento', async () => {
  envio.mensagem = '<script>alert(1)</script>';
  envio.desejaContato = false;
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel/envios/1');
  assert.equal(res.status, 200);
  assert.ok(envio.lidoEm instanceof Date);
  assert.match(res.text, /&lt;script&gt;/);
  assert.doesNotMatch(res.text, /<script>alert|privado@teste.test/);
  const json = await agente.get('/painel/envios/1').set('Accept', 'application/json');
  assert.equal(json.body.envio.emailContato, null);
  envio.desejaContato = true;
  assert.match((await agente.get('/painel/envios/1')).text, /privado@teste.test/);
  assert.equal(auditoria.filter((a) => a.acao === 'envio.ler').length, 1);
});

test('formulários HTML salvam situação e notas e redirecionam ao detalhe', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const [acao, dados] of [
    ['situacao', { status: 'EM_ANALISE' }],
    ['notas', { notasInternas: 'Retornar ligação' }],
  ]) {
    const res = await enviarFormulario(agente, `/painel/envios/1/${acao}`, dados);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/painel/envios/1');
  }
  const detalhe = await agente.get('/painel/envios/1');
  assert.match(detalhe.text, /Retornar ligação/);
  assert.equal(envio.status, 'EM_ANALISE');
});

test('somente sugestão abre cadastro preenchido e salva como rascunho', async () => {
  mockPrisma(prisma.categoria, 'findMany', async () => [{ id: 1, nome: 'ONG', ativa: true }]);
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  const agente = await logar(app, 'editor@teste.test');
  assert.equal((await agente.get('/painel/locais/novo?envio=1')).status, 404);
  Object.assign(envio, {
    tipo: 'SUGESTAO_LOCAL',
    nomeLocalSugerido: 'Casa do cuidado',
    categoriaSugeridaId: 1,
    enderecoLocalSugerido: 'Rua Teste, 12',
    contatoLocalSugerido: 'https://servico.test',
  });
  const detalhe = await agente.get('/painel/envios/1');
  assert.match(detalhe.text, /Criar local a partir desta sugestão/);
  const form = await agente.get('/painel/locais/novo?envio=1');
  assert.equal(form.status, 200);
  assert.match(form.text, /value="Casa do cuidado"/);
  assert.match(form.text, /value="Rua Teste, 12"/);
  assert.match(form.text, /value="https:\/\/servico.test"/);
  assert.match(form.text, /Salvar como rascunho/);
  let criado;
  mockPrisma(prisma.local, 'findUnique', async () => null);
  mockPrisma(prisma.local, 'create', async ({ data }) => {
    criado = { id: 10, publicado: false, ...data };
    return criado;
  });
  const salvo = await enviarFormulario(agente, '/painel/locais', {
    nome: 'Casa do cuidado',
    categoriaId: '1',
    logradouro: 'Rua Teste',
    numero: '12',
    cidade: 'Porto Alegre',
    uf: 'RS',
    latitude: '-30.03',
    longitude: '-51.22',
  });
  assert.equal(salvo.status, 302);
  assert.equal(criado.publicado, false);
  assert.equal(envio.status, 'NOVO');
});

test('filtros inválidos são recusados e paginação mantém filtros', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const query of ['tipo=INVALIDO', 'status=INVALIDO', 'pagina=0', 'pagina=1.5']) {
    assert.equal((await agente.get(`/painel/envios?${query}`)).status, 400);
  }
  mockPrisma(prisma.envio, 'findMany', async () =>
    Array.from({ length: 51 }, (_, i) => ({ ...envio, id: i + 1 })),
  );
  const res = await agente.get('/painel/envios?tipo=RECLAMACAO&status=NOVO');
  assert.match(res.text, /pagina=2&amp;tipo=RECLAMACAO&amp;status=NOVO/);
  assert.doesNotMatch(res.text, /href="\/painel\/envios\/51"/);
});

test('início mostra contador de novos e link para a caixa de entrada filtrada', async () => {
  mockPrisma(prisma.local, 'count', async () => 0);
  mockPrisma(prisma.envio, 'count', async ({ where }) => {
    assert.deepEqual(where, { status: 'NOVO' });
    return 7;
  });
  const agente = await logar(app, 'editor@teste.test');
  const res = await agente.get('/painel');
  assert.match(res.text, /indicador__numero">7</);
  assert.match(res.text, /href="\/painel\/envios\?status=NOVO"/);
});
