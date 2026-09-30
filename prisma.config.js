import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Só necessário com o Postgres embutido (npm run db:local); no Docker fica vazio.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
