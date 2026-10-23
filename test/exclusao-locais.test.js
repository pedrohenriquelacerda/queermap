import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import { apagar, atualizar, mudarSituacao } from '../src/services/locaisPainelService.js';
import { prepararAdmins, enviar, logar } from './helpers/painel.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

let local, tx, ordem, armazenamento, relatos;
const app = createApp();
beforeEach(async () => {
  await prepararAdmins();
  local = {
    id: 42,
    nome: 'Local Fictício',
    publicado: false,
    arquivadoEm: new Date('2026-01-01'),
    atualizadoEm: new Date('2026-01-02'),
    caracteristicas: [],
  };
  armazenamento = new Map([
    [42, local],
    [43, { ...local, id: 43, nome: 'Local de controle' }],
  ]);
  relatos = [
    { id: 1, localId: 42, nomeLocalRelato: null },
    { id: 2, localId: 42, nomeLocalRelato: null },
  ];
  ordem = [];
  tx = {
    $queryRaw: mock.fn(async () => {
      ordem.push('bloquear');
      return [{ id: 42 }];
    }),
    local: {
      findUnique: mock.fn(async ({ where }) =>
        where.id === 42 ? local : (armazenamento.get(where.id) ?? null),
      ),
      update: mock.fn(async ({ data }) => {
        ordem.push('alterar');
        const { caracteristicas, ...campos } = data;
        Object.assign(local, campos);
        if (caracteristicas) local.caracteristicas = caracteristicas.set;
        local.atualizadoEm = new Date(local.atualizadoEm.getTime() + 1);
        return local;
      }),
      delete: mock.fn(async ({ where }) => {
        ordem.push('excluir');
        const removido = armazenamento.get(where.id);
        if (!removido) throw Object.assign(new Error('Local ausente'), { code: 'P2025' });
        armazenamento.delete(where.id);
        for (const relato of relatos) if (relato.localId === where.id) relato.localId = null;
        if (where.id === 42) local = null;
        return removido;
      }),
    },
    envio: {
      findUnique: mock.fn(async ({ where }) => prisma.envio.findUnique({ where })),
      update: mock.fn(async ({ where, data }) => {
        const envio = await prisma.envio.findUnique({ where });
        if (!envio) throw Object.assign(new Error('Envio ausente'), { code: 'P2025' });
        Object.assign(envio, data);
        return envio;
      }),
      updateMany: mock.fn(async ({ where, data }) => {
        ordem.push('preservar');
        const vinculados = relatos.filter((relato) => relato.localId === where.localId);
        for (const relato of vinculados) Object.assign(relato, data);
        return { count: vinculados.length };
      }),
    },
    logAuditoria: {
      create: mock.fn(async () => {
        ordem.push('auditar');
      }),
    },
  };
  mockPrisma(prisma.local, 'findUnique', async () => local);
  mockPrisma(prisma, '$transaction', async (fn) => {
    const antes = structuredClone({ armazenamento, relatos, local });
    try {
      return await fn(tx);
    } catch (err) {
      ({ armazenamento, relatos, local } = antes);
      if (local) armazenamento.set(42, local);
      throw err;
    }
  });
});
afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

test('exclusão bloqueia linha, preserva nomes, exclui e audita na mesma transação', async () => {
  const nome = local.nome;
  const controle = structuredClone(armazenamento.get(43));
  await apagar(42, local.atualizadoEm.toISOString(), { admin: { id: 1 } });
  assert.deepEqual(ordem, ['bloquear', 'preservar', 'excluir', 'auditar']);
  assert.deepEqual(tx.envio.updateMany.mock.calls[0].arguments[0], {
    where: { localId: 42 },
    data: { nomeLocalRelato: nome },
  });
  assert.deepEqual(tx.logAuditoria.create.mock.calls[0].arguments[0].data, {
    adminId: 1,
    acao: 'local.apagar',
    entidade: 'Local',
    entidadeId: 42,
    detalhes: { nome, relatosPreservados: 2 },
  });
  assert.deepEqual(tx.local.delete.mock.calls[0].arguments[0], { where: { id: 42 } });
  assert.equal(armazenamento.has(42), false);
  assert.deepEqual(armazenamento.get(43), controle);
  assert.ok(relatos.every((relato) => relato.localId === null && relato.nomeLocalRelato === nome));
});

test('rascunho, publicado e versão antiga não permitem exclusão', async () => {
  for (const estado of [
    { arquivadoEm: null, publicado: false },
    { arquivadoEm: null, publicado: true },
    { arquivadoEm: new Date(), publicado: false, atualizadoEm: new Date() },
  ]) {
    const versao = '2026-01-02T00:00:00.000Z';
    Object.assign(local, estado);
    await assert.rejects(apagar(42, versao, {}), { status: 409 });
  }
  assert.equal(tx.local.delete.mock.callCount(), 0);
  assert.equal(tx.envio.updateMany.mock.callCount(), 0);
});

test('local inexistente retorna 404 sem mutações', async () => {
  local = null;
  await assert.rejects(apagar(42, '', {}), { status: 404 });
  assert.equal(tx.local.delete.mock.callCount(), 0);
});

test('falha da auditoria é propagada para abortar a transação', async () => {
  const antes = structuredClone({ armazenamento, relatos });
  let mutacaoObservada = false;
  tx.logAuditoria.create = async () => {
    mutacaoObservada = !armazenamento.has(42) && relatos.every((relato) => relato.localId === null);
    throw Object.assign(new Error('falha simulada da FK de auditoria'), { code: 'P2003' });
  };
  await assert.rejects(apagar(42, local.atualizadoEm.toISOString(), {}), { code: 'P2003' });
  assert.equal(
    mutacaoObservada,
    true,
    'A falha deve acontecer depois da exclusão e da preservação',
  );
  assert.deepEqual({ armazenamento, relatos }, antes);
});

test('edição e estado solicitam FOR UPDATE com o ID correto antes de alterar', async () => {
  const req = { admin: { id: 1 } };
  const executar = [
    () =>
      atualizar(
        42,
        { nome: 'Editado', caracteristicas: [] },
        req,
        local.atualizadoEm.toISOString(),
      ),
    () => mudarSituacao(42, 'arquivar', req, local.atualizadoEm.toISOString()),
    () => mudarSituacao(42, 'restaurar', req, local.atualizadoEm.toISOString()),
  ];
  for (let i = 0; i < executar.length; i++) {
    await executar[i]();
    assert.equal(tx.$queryRaw.mock.callCount(), i + 1);
    const [partes, id] = tx.$queryRaw.mock.calls[i].arguments;
    assert.equal(
      partes.join('?').replace(/\s+/g, ' ').trim(),
      'SELECT id FROM local WHERE id = ? FOR UPDATE',
    );
    assert.equal(id, 42);
    assert.deepEqual(ordem.slice(-3), ['bloquear', 'alterar', 'auditar']);
  }
});

test('confirmação e POST exigem login e Administração', async () => {
  for (const path of ['/painel/locais/42/excluir', '/painel/locais/42/apagar']) {
    const anon = path.endsWith('apagar')
      ? await enviar(request(app), path, {})
      : await request(app).get(path);
    assert.equal(anon.status, 302);
    const editor = await logar(app, 'editor@teste.test');
    const denied = path.endsWith('apagar')
      ? await enviar(editor, path, {})
      : await editor.get(path);
    assert.equal(denied.status, 403);
  }
  assert.equal(tx.local.delete.mock.callCount(), 0);
});

test('POST exige checkbox e assinatura vinculada à sessão e versão', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const form = await admin.get('/painel/locais/42/excluir');
  assert.equal(form.status, 200);
  const token = /name="token" value="([a-f0-9]+)"/.exec(form.text)[1];
  for (const dados of [{}, { token }, { token: '0'.repeat(64), confirmacao: 'excluir' }]) {
    assert.equal((await enviar(admin, '/painel/locais/42/apagar', dados)).status, 400);
  }
  const outro = await logar(app, 'admin@teste.test');
  assert.equal(
    (await enviar(outro, '/painel/locais/42/apagar', { token, confirmacao: 'excluir' })).status,
    400,
  );
  assert.equal(tx.local.delete.mock.callCount(), 0);
  assert.equal(
    (await enviar(admin, '/painel/locais/42/apagar', { token, confirmacao: 'excluir' })).status,
    302,
  );
  assert.equal(tx.local.delete.mock.callCount(), 1);
});

test('restauração após abrir confirmação impede exclusão', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const form = await admin.get('/painel/locais/42/excluir');
  const token = /name="token" value="([a-f0-9]+)"/.exec(form.text)[1];
  local.arquivadoEm = null;
  assert.equal(
    (await enviar(admin, '/painel/locais/42/apagar', { token, confirmacao: 'excluir' })).status,
    409,
  );
  assert.equal((await admin.get('/painel/locais/42/excluir')).status, 409);
});

test('restauração que perde para exclusão concorrente retorna 404, não 500', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const transacao = prisma.$transaction;
  mockPrisma(prisma, '$transaction', async (fn) => {
    try {
      return await transacao(fn);
    } catch (err) {
      // Exclusão confirmada em outra transação não é desfeita pelo rollback local.
      if (err.code === 'P2025') {
        local = null;
        armazenamento.delete(42);
      }
      throw err;
    }
  });
  tx.local.update = async () => {
    throw Object.assign(new Error('Local excluído durante a restauração'), { code: 'P2025' });
  };
  assert.equal((await enviar(admin, '/painel/locais/42/restaurar', {})).status, 404);
});

test('P2025 na edição distingue local excluído (404) de vínculo alterado (409)', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const dados = {
    nome: 'Local Fictício',
    categoriaId: '1',
    logradouro: 'Rua Fictícia',
    cidade: 'Porto Alegre',
    uf: 'RS',
    latitude: '-30.03',
    longitude: '-51.22',
  };
  tx.local.update = async () => {
    throw Object.assign(new Error('Vínculo ausente'), { code: 'P2025' });
  };
  assert.equal((await enviar(admin, '/painel/locais/42', dados)).status, 409);
  const transacao = prisma.$transaction;
  mockPrisma(prisma, '$transaction', async (fn) => {
    try {
      return await transacao(fn);
    } catch (err) {
      // Exclusão confirmada em outra transação não é desfeita pelo rollback local.
      if (err.code === 'P2025') {
        local = null;
        armazenamento.delete(42);
      }
      throw err;
    }
  });
  tx.local.update = async () => {
    throw Object.assign(new Error('Excluído'), { code: 'P2025' });
  };
  assert.equal((await enviar(admin, '/painel/locais/42', dados)).status, 404);
});

test('edição e mudanças de situação usam a mesma transação para atualização e log', async () => {
  const req = { admin: { id: 1 } };
  await atualizar(
    42,
    { nome: 'Nome novo', caracteristicas: [] },
    req,
    local.atualizadoEm.toISOString(),
  );
  assert.equal(tx.local.update.mock.callCount(), 1);
  assert.equal(tx.logAuditoria.create.mock.calls[0].arguments[0].data.acao, 'local.atualizar');
  for (const acao of ['arquivar', 'restaurar']) {
    await mudarSituacao(42, acao, req, local.atualizadoEm.toISOString());
  }
  assert.equal(tx.logAuditoria.create.mock.callCount(), 3);
  tx.logAuditoria.create = async () => {
    throw new Error('Falha de auditoria');
  };
  await assert.rejects(
    atualizar(42, { nome: 'Outro', caracteristicas: [] }, req),
    /Falha de auditoria/,
  );
  await assert.rejects(mudarSituacao(42, 'arquivar', req), /Falha de auditoria/);
  await assert.rejects(mudarSituacao(42, 'restaurar', req), /Falha de auditoria/);
});

test('versão alterada depois da leitura impede edição e restauração com 409', async () => {
  for (const executar of [
    () =>
      atualizar(42, { nome: 'Novo', caracteristicas: [] }, { admin: { id: 1 } }, 'versão antiga'),
    () => mudarSituacao(42, 'restaurar', { admin: { id: 1 } }, 'versão antiga'),
  ])
    await assert.rejects(executar(), { status: 409 });
  assert.equal(tx.local.update.mock.callCount(), 0);
});

test('JSON numérico válido continua aceito e FK inválida na edição retorna 400', async () => {
  const admin = await logar(app, 'admin@teste.test');
  const dados = {
    nome: 'Local Fictício',
    categoriaId: 1,
    logradouro: 'Rua Fictícia',
    cidade: 'Porto Alegre',
    uf: 'RS',
    latitude: -30.03,
    longitude: -51.22,
  };
  assert.equal(
    (await admin.post('/painel/locais/42').set('Origin', env.siteUrl).send(dados)).status,
    302,
  );
  tx.local.update = async () => {
    throw Object.assign(new Error('Categoria inexistente'), { code: 'P2003' });
  };
  assert.equal(
    (await admin.post('/painel/locais/42').set('Origin', env.siteUrl).send(dados)).status,
    400,
  );
});

test('IDs inválidos, corpo ausente e tipos malformados retornam 400 antes do banco', async () => {
  const admin = await logar(app, 'admin@teste.test');
  for (const id of ['0', '-1', 'abc', '2147483648', '999999999999999999999999999']) {
    assert.equal((await admin.get(`/painel/locais/${id}/excluir`)).status, 400);
    assert.equal((await admin.get(`/painel/envios/${id}`)).status, 400);
  }
  const headers = { Origin: env.siteUrl };
  assert.equal((await admin.post('/painel/locais/42').set(headers)).status, 400);
  assert.equal((await enviar(admin, '/painel/locais/42', { nome: ['A', 'B'] })).status, 400);
  assert.equal((await enviar(admin, '/painel/locais/42', { categoriaId: ['1', '2'] })).status, 400);
  assert.equal(tx.local.update.mock.callCount(), 0);
});

test('ações herdadas são rejeitadas sem atualização ou auditoria', async () => {
  const admin = await logar(app, 'admin@teste.test');
  for (const acao of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal((await enviar(admin, `/painel/locais/42/${acao}`, {})).status, 404);
    assert.throws(() => mudarSituacao(42, acao, { admin: { id: 1 } }), { status: 404 });
  }
  assert.equal(tx.local.update.mock.callCount(), 0);
  assert.equal(tx.logAuditoria.create.mock.callCount(), 0);
});

test('IDs de categoria e características fora do intervalo retornam 400', async () => {
  mockPrisma(prisma.categoria, 'findMany', async () => []);
  mockPrisma(prisma.caracteristica, 'findMany', async () => []);
  const admin = await logar(app, 'admin@teste.test');
  const dados = {
    nome: 'Local Fictício',
    categoriaId: '1',
    logradouro: 'Rua Fictícia',
    cidade: 'Porto Alegre',
    uf: 'RS',
    latitude: '-30.03',
    longitude: '-51.22',
  };
  for (const entrada of [
    { categoriaId: '2147483648' },
    { caracteristicas: '2147483648' },
    { caracteristicas: 'não numérico' },
  ])
    assert.equal((await enviar(admin, '/painel/locais/42', { ...dados, ...entrada })).status, 400);
  assert.equal(tx.local.update.mock.callCount(), 0);
});

test('consulta de envios exige equipe e preserva nome sem expor contato ou HTML executável', async () => {
  const envio = {
    id: 5,
    tipo: 'RECLAMACAO',
    status: 'NOVO',
    criadoEm: new Date(),
    mensagem: '<script>alert(1)</script>',
    local: null,
    nomeLocalRelato: 'Nome preservado',
  };
  const list = mockPrisma(prisma.envio, 'findMany', async () => [envio]);
  mockPrisma(prisma.envio, 'findUnique', async ({ where }) => (where.id === 5 ? envio : null));
  for (const path of ['/painel/envios', '/painel/envios/5']) {
    assert.equal((await request(app).get(path)).status, 302);
    for (const email of ['admin@teste.test', 'editor@teste.test']) {
      const agente = await logar(app, email);
      const res = await agente.get(path);
      assert.equal(res.status, 200);
      assert.match(res.text, /Nome preservado/);
      assert.ok(!res.text.includes('<script>alert(1)</script>'));
    }
  }
  assert.ok(!Object.hasOwn(list.mock.calls[0].arguments[0].select, 'emailContato'));
  const editor = await logar(app, 'editor@teste.test');
  assert.equal((await editor.get('/painel/envios/999')).status, 404);
  assert.equal((await enviar(editor, '/painel/envios/5', {})).status, 404);
});
