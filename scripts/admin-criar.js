// Cria uma pessoa com acesso ao painel e mostra a senha provisória.
// Uso: npm run admin:criar -- --nome "Fulane de Tal" --email fulane@exemplo.org [--editor]

import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';
import { gerarHash, gerarSenhaProvisoria } from '../src/utils/senha.js';
import { validar, texto, email, z } from '../src/utils/validacao.js';

const { values } = parseArgs({
  options: {
    nome: { type: 'string' },
    email: { type: 'string' },
    editor: { type: 'boolean', default: false },
  },
});

const { dados, erros } = validar(z.object({ nome: texto('o nome', 120), email: email() }), values);
if (erros) {
  console.error('Uso: npm run admin:criar -- --nome "Nome" --email email@exemplo.org [--editor]');
  for (const [campo, msg] of Object.entries(erros)) console.error(`  --${campo}: ${msg}`);
  process.exit(1);
}

try {
  if (await prisma.admin.findUnique({ where: { email: dados.email } })) {
    console.error(`Já existe uma pessoa com o e-mail ${dados.email}.`);
    process.exitCode = 1;
  } else {
    const senha = gerarSenhaProvisoria();
    const admin = await prisma.admin.create({
      data: {
        ...dados,
        papel: values.editor ? 'EDITOR' : 'ADMIN',
        senhaHash: await gerarHash(senha),
        precisaTrocarSenha: true,
      },
    });
    await prisma.logAuditoria.create({
      data: {
        acao: 'admin.criar',
        entidade: 'Admin',
        entidadeId: admin.id,
        detalhes: { via: 'cli' },
      },
    });
    console.log(`\nPessoa criada: ${admin.nome} <${admin.email}> (${admin.papel})`);
    console.log(`Senha provisória: ${senha}`);
    console.log('No primeiro acesso a /painel será pedida uma senha nova.\n');
  }
} finally {
  await prisma.$disconnect();
}
