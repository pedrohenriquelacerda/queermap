import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test(
  'E2E PostgreSQL: histórico, filtros, paginação e acessos indevidos',
  { skip: !process.env.QUEERMAP_AUDIT_E2E_DATABASE_URL, timeout: 30000 },
  async () => {
    const url = process.env.QUEERMAP_AUDIT_E2E_DATABASE_URL;
    assert.equal(process.env.DOTENV_CONFIG_PATH, '/dev/null');
    assert.equal(process.env.DATABASE_URL, url);
    const destino = new URL(url);
    assert.equal(destino.hostname, '127.0.0.1');
    assert.equal(destino.port, '55434');
    assert.equal(destino.pathname, '/queermap_ct_piloto');

    const [{ default: request }, { createApp }, { prisma }, { gerarHash }, { env }] =
      await Promise.all([
        import('supertest'),
        import('../src/app.js'),
        import('../src/db/prisma.js'),
        import('../src/utils/senha.js'),
        import('../src/config/env.js'),
      ]);
    const app = createApp();
    const sufixo = randomUUID();
    const senha = 'e2e-senha-de-teste-123';
    const ids = [];
    try {
      const senhaHash = await gerarHash(senha);
      const admin = await prisma.admin.create({
        data: { nome: 'Admin E2E', email: `admin-${sufixo}@teste.test`, senhaHash, papel: 'ADMIN' },
      });
      const editor = await prisma.admin.create({
        data: {
          nome: 'Editor E2E',
          email: `editor-${sufixo}@teste.test`,
          senhaHash,
          papel: 'EDITOR',
        },
      });
      ids.push(admin.id, editor.id);
      await prisma.logAuditoria.createMany({
        data: [
          ...Array.from({ length: 55 }, (_, i) => ({
            adminId: admin.id,
            acao: 'local.criar',
            entidade: 'Local',
            entidadeId: 1000 + i,
            criadoEm: new Date(
              `2026-11-05T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
            ),
          })),
          {
            adminId: editor.id,
            acao: 'local.criar',
            entidade: 'Local',
            entidadeId: 2000,
            criadoEm: new Date('2026-11-04T12:00:00Z'),
          },
          {
            adminId: admin.id,
            acao: '<img src=x onerror=alert(1)>',
            entidade: 'Local',
            entidadeId: 3000,
            criadoEm: new Date('2026-11-05T12:00:00Z'),
          },
        ],
      });

      const anonimo = await request(app).get('/painel/auditoria');
      assert.equal(anonimo.status, 302);

      const autenticar = async (pessoa) => {
        const agente = request.agent(app);
        const resposta = await agente
          .post('/painel/entrar')
          .type('form')
          .set('Origin', env.siteUrl)
          .send({ email: pessoa.email, senha });
        assert.equal(resposta.status, 302);
        return agente;
      };
      const agenteEditor = await autenticar(editor);
      assert.equal((await agenteEditor.get('/painel/auditoria')).status, 403);
      const agenteAdmin = await autenticar(admin);
      const base = `/painel/auditoria?pessoa=${admin.id}&acao=local.criar&inicio=2026-11-05&fim=2026-11-05`;
      const primeira = await agenteAdmin.get(base);
      assert.equal(primeira.status, 200);
      assert.match(primeira.text, /55 registros encontrados/);
      assert.match(primeira.text, /Local #1054/);
      assert.doesNotMatch(primeira.text, /Local #2000/);
      assert.match(primeira.text, /Próxima/);
      const segunda = await agenteAdmin.get(`${base}&pagina=2`);
      assert.equal(segunda.status, 200);
      assert.match(segunda.text, /Página 2 de 2/);
      assert.match(segunda.text, /Local #1000/);
      assert.doesNotMatch(segunda.text, /Local #1054/);
      const foraDaPagina = await agenteAdmin.get(`${base}&pagina=999999999`);
      assert.equal(foraDaPagina.status, 200);
      assert.match(foraDaPagina.text, /Página 2 de 2/);

      const xss = await agenteAdmin.get(
        '/painel/auditoria?acao=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E',
      );
      assert.equal(xss.status, 200);
      assert.doesNotMatch(xss.text, /<img src=x onerror=alert\(1\)>/);
      assert.match(xss.text, /&lt;img/);
      const inexistente = await agenteAdmin.get('/painel/auditoria?acao=acao.inexistente');
      assert.equal(inexistente.status, 200);
      assert.match(inexistente.text, /0 registros encontrados/);
      for (const filtro of [
        'pessoa=abc',
        'pessoa=2147483648',
        'pessoa=1%20OR%201%3D1',
        'pessoa=1&pessoa=2',
        'inicio=2026-02-30',
        'fim=2026-13-01',
        'inicio=2026-11-06&fim=2026-11-05',
      ]) {
        const resposta = await agenteAdmin.get(`/painel/auditoria?${filtro}`);
        assert.equal(resposta.status, 400, filtro);
      }

      const antes = await prisma.logAuditoria.count({ where: { adminId: admin.id } });
      assert.ok(
        (await agenteAdmin.post('/painel/auditoria').set('Origin', env.siteUrl).send({})).status >=
          400,
      );
      assert.ok((await agenteAdmin.delete('/painel/auditoria')).status >= 400);
      assert.equal(await prisma.logAuditoria.count({ where: { adminId: admin.id } }), antes);
    } finally {
      await prisma.logAuditoria.deleteMany({ where: { adminId: { in: ids } } });
      await prisma.admin.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  },
);
