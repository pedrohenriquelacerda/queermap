import { prisma } from '../db/prisma.js';

// Usado para monitoramento e para a rotina que mantém a hospedagem acordada.
export async function check(req, res) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    // Só o código: a mensagem do Prisma traz o endereço do servidor do banco.
    console.error('Health check falhou:', err.code ?? err.name);
    res.status(503).json({ status: 'erro', db: 'indisponível' });
  }
}
