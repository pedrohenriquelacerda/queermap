import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Opt-in: nunca lê .env ou usa um banco implícito. Execute em processo próprio:
// DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=<URL isolada> QUEERMAP_CT_DATABASE_URL=<mesma URL>
// node --test test/exclusao-postgres.test.js
test(
  'PostgreSQL real: locks correlacionados, exclusão e rollback',
  {
    skip: !process.env.QUEERMAP_CT_DATABASE_URL,
    timeout: 30000,
  },
  async (t) => {
    const connectionString = process.env.QUEERMAP_CT_DATABASE_URL;
    assert.equal(process.env.DOTENV_CONFIG_PATH, '/dev/null');
    assert.ok(
      process.env.DATABASE_URL === connectionString,
      'As duas URLs isoladas devem ser iguais; valores omitidos',
    );
    const url = new URL(connectionString);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '55434');
    assert.equal(url.pathname, '/queermap_ct_piloto');
    const { prisma } = await import('../src/db/prisma.js');
    const service = await import('../src/services/locaisPainelService.js');
    const { Client } = await import('pg');
    const observer = new Client({ connectionString, connectionTimeoutMillis: 1500 });
    const run = randomUUID();
    try {
      await observer.connect();
      const identity = await observer.query(
        'SELECT current_database() AS db, pg_backend_pid() AS pid',
      );
      assert.equal(identity.rows[0].db, 'queermap_ct_piloto');
      const category = await prisma.categoria.findFirst({ where: { ativa: true } });
      assert.ok(category, 'O banco isolado precisa de categorias fictícias previamente preparadas');
      const admin = await prisma.admin.create({
        data: {
          nome: 'Fixture de integração',
          email: `${run}@integracao.test`,
          senhaHash: 'fixture-sem-login',
          papel: 'ADMIN',
        },
      });
      const req = { admin: { id: admin.id } };
      const novo = (archived = true) =>
        prisma.local.create({
          data: {
            nome: `Fixture ${run}`,
            slug: randomUUID(),
            categoriaId: category.id,
            logradouro: 'Rua Fictícia',
            cidade: 'Porto Alegre',
            uf: 'RS',
            latitude: -30.03,
            longitude: -51.22,
            publicado: !archived,
            arquivadoEm: archived ? new Date() : null,
          },
        });
      const control = await novo();

      for (const action of ['editar', 'arquivar', 'restaurar']) {
        await t.test(`lock real de ${action}: PID, bloqueador e SELECT FOR UPDATE`, async () => {
          const local = await novo(action === 'restaurar');
          const original = prisma.$transaction;
          let targetPid, pending;
          prisma.$transaction = (fn, options) =>
            original.call(
              prisma,
              async (tx) => {
                const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                targetPid = row.pid;
                return fn(tx);
              },
              options,
            );
          try {
            await observer.query('BEGIN');
            await observer.query('SELECT id FROM local WHERE id=$1 FOR UPDATE', [local.id]);
            pending = (
              action === 'editar'
                ? service.atualizar(
                    local.id,
                    { nome: 'Nome alterado', caracteristicas: [] },
                    req,
                    local.atualizadoEm.toISOString(),
                  )
                : service.mudarSituacao(local.id, action, req, local.atualizadoEm.toISOString())
            ).then(
              () => ({ ok: true }),
              (err) => ({ err }),
            );
            let locked = false;
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              if (targetPid) {
                const result = await observer.query(
                  'SELECT query, wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',
                  [targetPid],
                );
                const row = result.rows[0];
                if (row?.wait_event_type === 'Lock') {
                  assert.ok(row.blockers.includes(identity.rows[0].pid));
                  assert.match(row.query, /SELECT id FROM local WHERE id = \$1 FOR UPDATE/);
                  locked = true;
                  break;
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.equal(
              locked,
              true,
              'A operação precisa aguardar no SELECT FOR UPDATE, não apenas no UPDATE',
            );
            await observer.query('COMMIT');
            const outcome = await pending;
            assert.equal(outcome.ok, true, outcome.err?.message);
            const after = await prisma.local.findUnique({ where: { id: local.id } });
            if (action === 'editar') assert.equal(after.nome, 'Nome alterado');
            if (action === 'arquivar') {
              assert.ok(after.arquivadoEm);
              assert.equal(after.publicado, false);
            }
            if (action === 'restaurar') {
              assert.equal(after.arquivadoEm, null);
              assert.equal(after.publicado, false);
            }
            assert.equal(
              await prisma.logAuditoria.count({
                where: {
                  entidade: 'Local',
                  entidadeId: local.id,
                  acao: action === 'editar' ? 'local.atualizar' : `local.${action}`,
                  adminId: admin.id,
                },
              }),
              1,
            );
            assert.deepEqual(await prisma.local.findUnique({ where: { id: control.id } }), control);
          } finally {
            await observer.query('ROLLBACK');
            prisma.$transaction = original;
            if (pending) await pending;
          }
        });
      }

      for (const action of ['editar', 'arquivar', 'restaurar', 'apagar']) {
        await t.test(`rollback real de ${action}: P2003 depois da mutação`, async () => {
          const local = await novo(action !== 'arquivar');
          const relato = await prisma.envio.create({
            data: {
              tipo: 'RECLAMACAO',
              localId: local.id,
              mensagem: 'Relato fictício da integração',
            },
          });
          let auditReached = false,
            mutationObserved = false;
          const original = prisma.$transaction;
          prisma.$transaction = (fn, options) =>
            original.call(
              prisma,
              async (tx) => {
                const create = tx.logAuditoria.create;
                tx.logAuditoria.create = async (args) => {
                  auditReached = true;
                  const changed = await tx.local.findUnique({ where: { id: local.id } });
                  if (action === 'apagar') {
                    const changedRelato = await tx.envio.findUnique({ where: { id: relato.id } });
                    mutationObserved =
                      changed === null &&
                      changedRelato.localId === null &&
                      changedRelato.nomeLocalRelato === local.nome;
                  } else if (action === 'editar')
                    mutationObserved = changed.nome === 'Alteração a reverter';
                  else if (action === 'arquivar')
                    mutationObserved = changed.arquivadoEm !== null && changed.publicado === false;
                  else mutationObserved = changed.arquivadoEm === null;
                  assert.equal(mutationObserved, true);
                  return create.call(tx.logAuditoria, {
                    ...args,
                    data: { ...args.data, adminId: -2147483647 },
                  });
                };
                try {
                  return await fn(tx);
                } finally {
                  tx.logAuditoria.create = create;
                }
              },
              options,
            );
          try {
            await assert.rejects(
              action === 'apagar'
                ? service.apagar(local.id, local.atualizadoEm.toISOString(), req)
                : action === 'editar'
                  ? service.atualizar(
                      local.id,
                      { nome: 'Alteração a reverter', caracteristicas: [] },
                      req,
                      local.atualizadoEm.toISOString(),
                    )
                  : service.mudarSituacao(local.id, action, req, local.atualizadoEm.toISOString()),
              { code: 'P2003' },
            );
            assert.equal(auditReached, true);
            assert.equal(mutationObserved, true);
            assert.deepEqual(await prisma.local.findUnique({ where: { id: local.id } }), local);
            assert.deepEqual(await prisma.envio.findUnique({ where: { id: relato.id } }), relato);
            assert.equal(
              await prisma.logAuditoria.count({
                where: { entidade: 'Local', entidadeId: local.id },
              }),
              0,
            );
            assert.deepEqual(await prisma.local.findUnique({ where: { id: control.id } }), control);
          } finally {
            prisma.$transaction = original;
          }
        });
      }

      await t.test('exclusão real remove apenas o alvo e preserva controle e relato', async () => {
        const local = await novo();
        const relato = await prisma.envio.create({
          data: { tipo: 'ELOGIO', localId: local.id, mensagem: 'Relato fictício' },
        });
        await service.apagar(local.id, local.atualizadoEm.toISOString(), req);
        assert.equal(await prisma.local.findUnique({ where: { id: local.id } }), null);
        assert.deepEqual(await prisma.local.findUnique({ where: { id: control.id } }), control);
        const after = await prisma.envio.findUnique({ where: { id: relato.id } });
        assert.equal(after.localId, null);
        assert.equal(after.nomeLocalRelato, local.nome);
      });
    } finally {
      await observer.query('ROLLBACK').catch(() => {});
      await observer.end();
      await prisma.$disconnect();
    }
  },
);
