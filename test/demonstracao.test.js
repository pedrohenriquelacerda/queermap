import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { enviarEmail } from '../src/services/emailService.js';

test('ambiente de demonstração avisa em todas as páginas para não enviar relatos reais', async (t) => {
  const normal = await request(createApp()).get('/sobre');
  assert.doesNotMatch(normal.text, /faixa-demonstracao/);

  t.after(() => (env.demonstracao = false));
  env.demonstracao = true;
  const app = createApp();
  for (const caminho of ['/sobre', '/privacidade', '/painel/entrar']) {
    const res = await request(app).get(caminho);
    assert.match(res.text, /class="faixa-demonstracao"/, caminho);
    assert.match(res.text, /Não envie relatos reais/, caminho);
  }
});

test('falha no envio de e-mail não leva o destinatário nem o código para o log', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  const via = {
    sendMail: async () => {
      const err = new Error('550 Mailbox not found: pessoa@teste.test (código 123456)');
      err.code = 'EENVELOPE';
      err.rejected = ['pessoa@teste.test'];
      throw err;
    },
  };

  await assert.rejects(
    enviarEmail({ para: 'pessoa@teste.test', assunto: 'Código', texto: 'é: 123456' }, { via }),
    (err) => {
      assert.equal(err.message, 'Falha ao enviar e-mail (EENVELOPE)');
      assert.equal(err.cause, undefined); // o erro original (com o e-mail) não vai junto
      return true;
    },
  );
  assert.deepEqual(logs, ['Falha ao enviar e-mail: EENVELOPE']);
  mock.restoreAll();
});
