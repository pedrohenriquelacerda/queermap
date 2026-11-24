// Roda a limpeza de privacidade uma vez (códigos de confirmação vencidos e registros de limite
// com mais de 30 dias). O servidor já faz isso sozinho ao iniciar e a cada 6 h; este script serve
// para agendar por fora (ex.: Cron Job do Render) ou rodar na hora.
//
//   npm run limpar:dados

import { limparDadosVencidos } from '../src/services/limpezaService.js';
import { prisma } from '../src/db/prisma.js';

try {
  const { verificacoes, registros } = await limparDadosVencidos();
  console.log(
    `Apagados: ${verificacoes} código(s) de confirmação e ${registros} registro(s) de limite.`,
  );
} catch (erro) {
  console.error(`Limpeza falhou (${erro.code ?? erro.name}).`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
