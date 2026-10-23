import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { versaoNotas, versaoSituacao } from '../src/services/enviosPainelService.js';
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
    const res = await enviar(request(app), `/painel/envios/1/${acao}`, {
      status: 'RESOLVIDO',
      versaoSituacao: versaoSituacao(envio),
    });
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
      const res = await enviar(agente, '/painel/envios/1/situacao', {
        status,
        versaoSituacao: versaoSituacao(envio),
      });
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
  await enviar(agente, '/painel/envios/1/situacao', {
    status: 'RESOLVIDO',
    versaoSituacao: versaoSituacao(envio),
  });
  const data = envio.resolvidoEm;
  await enviar(agente, '/painel/envios/1/situacao', {
    status: 'RESOLVIDO',
    versaoSituacao: versaoSituacao(envio),
  });
  assert.equal(envio.resolvidoEm, data);
  await enviar(agente, '/painel/envios/1/situacao', {
    status: 'EM_ANALISE',
    versaoSituacao: versaoSituacao(envio),
  });
  assert.equal(envio.resolvidoEm, null);
  await enviar(agente, '/painel/envios/1/situacao', {
    status: 'RESOLVIDO',
    versaoSituacao: versaoSituacao(envio),
  });
  assert.ok(envio.resolvidoEm instanceof Date);
  assert.equal(auditoria.filter((a) => a.acao === 'envio.situacao').length, 3);
});

test('cada edição de notas é auditada sem copiar texto privado para o log', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const notasInternas of ['Contatar serviço', 'Aguardando retorno', '']) {
    assert.equal(
      (
        await enviar(agente, '/painel/envios/1/notas', {
          notasInternas,
          versaoNotas: versaoNotas(envio),
        })
      ).status,
      200,
    );
    assert.equal(envio.notasInternas, notasInternas || null);
  }
  const logs = auditoria.filter((a) => a.acao === 'envio.anotar');
  assert.equal(logs.length, 3);
  assert.doesNotMatch(JSON.stringify(logs), /Contatar serviço|Aguardando retorno/);
});

test('rejeita situação e notas inválidas e envio inexistente', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const status of ['INVALIDO', '']) {
    assert.equal(
      (
        await enviar(agente, '/painel/envios/1/situacao', {
          status,
          versaoSituacao: versaoSituacao(envio),
        })
      ).status,
      400,
    );
  }
  const array = await agente
    .post('/painel/envios/1/situacao')
    .set('Origin', 'http://localhost:3000')
    .send({ status: ['NOVO'], versaoSituacao: versaoSituacao(envio) });
  assert.equal(array.status, 400);
  for (const dados of [{}, { notasInternas: 'x'.repeat(5001), versaoNotas: versaoNotas(envio) }]) {
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
    const res = await enviar(agente, '/painel/envios/1/situacao', {
      status: 'RESOLVIDO',
      versaoSituacao: versaoSituacao(envio),
    });
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
    ['situacao', { status: 'EM_ANALISE', versaoSituacao: versaoSituacao(envio) }],
    ['notas', { notasInternas: 'Retornar ligação', versaoNotas: versaoNotas(envio) }],
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

test('cadastro preserva contexto da sugestão e valores digitados após erros repetidos', async () => {
  mockPrisma(prisma.categoria, 'findMany', async () => [{ id: 1, nome: 'ONG', ativa: true }]);
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  Object.assign(envio, {
    tipo: 'SUGESTAO_LOCAL',
    nomeLocalSugerido: 'Casa sugerida',
    categoriaSugeridaId: 1,
    enderecoLocalSugerido: 'Rua Original, 10',
    contatoLocalSugerido: 'Contato original da recepção',
    mensagem: 'Mensagem original privada',
  });
  const agente = await logar(app, 'editor@teste.test');
  const abertura = await agente.get('/painel/locais/novo?envio=1');
  assert.equal(abertura.status, 200);
  assert.match(abertura.text, /name="envioId" value="1"/);
  const dados = {
    envioId: '1',
    nome: 'Nome revisado pela ONG',
    categoriaId: '1',
    logradouro: 'Rua Revisada',
    cidade: 'Porto Alegre',
    uf: 'RS',
    latitude: '',
    longitude: '',
    contatoLocalSugerido: 'Contato adulterado no navegador',
  };
  for (let i = 0; i < 2; i++) {
    const res = await enviarFormulario(agente, '/painel/locais', dados);
    assert.equal(res.status, 400);
    assert.match(res.text, /name="envioId" value="1"/);
    assert.match(res.text, /Contato original da recepção/);
    assert.match(res.text, /Mensagem original privada/);
    assert.match(res.text, /Rua Original, 10/);
    assert.match(res.text, /value="Nome revisado pela ONG"/);
    assert.match(res.text, /value="Rua Revisada"/);
    assert.doesNotMatch(res.text, /Contato adulterado no navegador/);
  }
});

test('cadastro recusa referência inexistente, inválida ou que não seja sugestão', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const envioId of ['0', '-1', 'abc', '999', '9007199254740992', '1']) {
    const res = await enviarFormulario(agente, '/painel/locais', { envioId });
    assert.equal(res.status, 404);
  }
});

test('HEAD não altera leitura nem auditoria; GET continua marcando leitura', async () => {
  const agente = await logar(app, 'editor@teste.test');
  for (const accept of ['text/html', 'application/json']) {
    assert.equal((await agente.head('/painel/envios/1').set('Accept', accept)).status, 200);
    assert.equal(envio.lidoEm, null);
    assert.equal(auditoria.filter((a) => a.acao === 'envio.ler').length, 0);
  }
  assert.equal((await agente.head('/painel/envios/999')).status, 404);
  assert.equal((await agente.get('/painel/envios/1')).status, 200);
  assert.ok(envio.lidoEm instanceof Date);
});

for (const formato of ['html', 'json']) {
  test(`notas antigas retornam 409 em ${formato}, sem perder texto nem sobrescrever a equipe`, async () => {
    const editor = await logar(app, 'editor@teste.test');
    const admin = await logar(app, 'admin@teste.test');
    const aberto = await editor.get('/painel/envios/1');
    const versao = aberto.text.match(/name="versaoNotas" value="([a-f0-9]{64})"/)[1];
    const salvar = formato === 'json' ? enviar : enviarFormulario;
    assert.equal(
      (
        await enviarFormulario(admin, '/painel/envios/1/notas', {
          notasInternas: 'Informação da equipe',
          versaoNotas: versao,
        })
      ).status,
      302,
    );
    const antigas = {
      notasInternas: '</textarea><script>texto preservado</script>',
      versaoNotas: versao,
    };
    const res = await salvar(editor, '/painel/envios/1/notas', antigas);
    assert.equal(res.status, 409);
    assert.equal(envio.notasInternas, 'Informação da equipe');
    assert.equal(auditoria.filter((a) => a.acao === 'envio.anotar').length, 1);
    let novaVersao;
    if (formato === 'json') {
      assert.equal(res.body.notasDigitadas, antigas.notasInternas);
      assert.equal(res.body.envio.notasInternas, 'Informação da equipe');
      novaVersao = res.body.envio.versaoNotas;
    } else {
      assert.match(res.text, /Informação da equipe/);
      assert.match(res.text, /&lt;script&gt;texto preservado/);
      assert.doesNotMatch(res.text, /<script>texto preservado/);
      novaVersao = res.text.match(/name="versaoNotas" value="([a-f0-9]{64})"/)[1];
    }
    assert.notEqual(novaVersao, versao);
    const revisado = await salvar(editor, '/painel/envios/1/notas', {
      notasInternas: 'Informação da equipe + minha revisão',
      versaoNotas: novaVersao,
    });
    assert.equal(revisado.status, formato === 'json' ? 200 : 302);
    assert.equal(envio.notasInternas, 'Informação da equipe + minha revisão');
  });
}

test('notas sem versão ou com versão forjada não alteram o envio', async () => {
  const agente = await logar(app, 'editor@teste.test');
  assert.equal(
    (await enviar(agente, '/painel/envios/1/notas', { notasInternas: 'Texto' })).status,
    400,
  );
  assert.equal(
    (
      await enviar(agente, '/painel/envios/1/notas', {
        notasInternas: 'Texto',
        versaoNotas: '0'.repeat(64),
      })
    ).status,
    409,
  );
  assert.equal(envio.notasInternas, null);
  assert.equal(auditoria.filter((a) => a.acao === 'envio.anotar').length, 0);
});

test('notas aceitam 5.000 caracteres e recusam 5.001 com versão válida', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const limite = await enviar(agente, '/painel/envios/1/notas', {
    notasInternas: 'x'.repeat(5000),
    versaoNotas: versaoNotas(envio),
  });
  assert.equal(limite.status, 200);
  const excedido = await enviar(agente, '/painel/envios/1/notas', {
    notasInternas: 'y'.repeat(5001),
    versaoNotas: versaoNotas(envio),
  });
  assert.equal(excedido.status, 400);
  assert.equal(envio.notasInternas, 'x'.repeat(5000));
  assert.equal(auditoria.filter((a) => a.acao === 'envio.anotar').length, 1);
});

for (const notasInternas of ['á'.repeat(5000), '漢'.repeat(5000), '😀'.repeat(2500)]) {
  test(`formulário aceita notas Unicode no limite (${Buffer.byteLength(notasInternas)} bytes UTF-8)`, async () => {
    const agente = await logar(app, 'editor@teste.test');
    const res = await enviarFormulario(agente, '/painel/envios/1/notas', {
      notasInternas,
      versaoNotas: versaoNotas(envio),
    });
    assert.equal(res.status, 302);
    assert.equal(envio.notasInternas, notasInternas);
  });
}

test('ampliação do parser fica limitada às notas e mantém limite finito', async () => {
  const agente = await logar(app, 'editor@teste.test');
  const grande = 'á'.repeat(5000);
  assert.equal(
    (await enviarFormulario(agente, '/painel/envios/1/situacao', { extra: grande })).status,
    413,
  );
  assert.equal(
    (await enviarFormulario(agente, '/painel/envios/1/notas', { notasInternas: 'x'.repeat(70000) }))
      .status,
    413,
  );
  assert.equal(envio.notasInternas, null);
});

for (const formato of ['html', 'json']) {
  test(`situação antiga retorna 409 em ${formato} sem reabrir envio resolvido`, async () => {
    const editor = await logar(app, 'editor@teste.test');
    const admin = await logar(app, 'admin@teste.test');
    const antes = await admin.get('/painel/envios/1');
    const token = antes.text.match(/name="versaoSituacao" value="([a-f0-9]{64})"/)[1];
    assert.equal(
      (
        await enviar(editor, '/painel/envios/1/situacao', {
          status: 'RESOLVIDO',
          versaoSituacao: token,
        })
      ).status,
      200,
    );
    const data = envio.resolvidoEm;
    const enviarFormato = formato === 'json' ? enviar : enviarFormulario;
    const res = await enviarFormato(admin, '/painel/envios/1/situacao', {
      status: 'EM_ANALISE',
      versaoSituacao: token,
    });
    assert.equal(res.status, 409);
    assert.equal(envio.status, 'RESOLVIDO');
    assert.equal(envio.resolvidoEm, data);
    assert.equal(auditoria.filter((a) => a.acao === 'envio.situacao').length, 1);
    const nova =
      formato === 'json'
        ? res.body.envio.versaoSituacao
        : res.text.match(/name="versaoSituacao" value="([a-f0-9]{64})"/)[1];
    if (formato === 'json') assert.equal(res.body.situacaoDigitada, 'EM_ANALISE');
    else assert.match(res.text, /value="EM_ANALISE" selected/);
    const revisado = await enviarFormato(admin, '/painel/envios/1/situacao', {
      status: 'EM_ANALISE',
      versaoSituacao: nova,
    });
    assert.equal(revisado.status, formato === 'json' ? 200 : 302);
    assert.equal(envio.status, 'EM_ANALISE');
  });
}

test('situação sem versão ou forjada não altera o envio', async () => {
  const agente = await logar(app, 'editor@teste.test');
  assert.equal(
    (await enviar(agente, '/painel/envios/1/situacao', { status: 'RESOLVIDO' })).status,
    400,
  );
  assert.equal(
    (
      await enviar(agente, '/painel/envios/1/situacao', {
        status: 'RESOLVIDO',
        versaoSituacao: '0'.repeat(64),
      })
    ).status,
    409,
  );
  assert.equal(envio.status, 'NOVO');
});

test('IDs fora da faixa Int são recusados antes de consultar o banco', async () => {
  const consulta = mockPrisma(prisma.envio, 'findUnique', async () => {
    throw new Error('Não deveria consultar');
  });
  const agente = await logar(app, 'editor@teste.test');
  for (const id of ['2147483648', '9007199254740991', '0', '-1', '01', 'abc']) {
    assert.equal((await agente.get(`/painel/envios/${id}`)).status, 404);
    assert.equal((await agente.head(`/painel/envios/${id}`)).status, 404);
    assert.equal((await agente.get(`/painel/locais/novo?envio=${id}`)).status, 404);
    assert.equal((await enviarFormulario(agente, '/painel/locais', { envioId: id })).status, 404);
  }
  assert.equal(consulta.mock.callCount(), 0);
});
