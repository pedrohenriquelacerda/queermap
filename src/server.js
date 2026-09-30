import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

const PgStore = connectPgSimple(session);
// A tabela "session" é criada pelas migrations do Prisma (model Session).
const sessionStore = new PgStore({ conString: env.databaseUrl, tableName: 'session' });

const app = createApp({ sessionStore });

const server = app.listen(env.port, () => {
  console.log(`Servidor rodando em http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} recebido, encerrando...`);
  server.close(async () => {
    sessionStore.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
