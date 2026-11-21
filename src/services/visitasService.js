import { prisma } from '../db/prisma.js';

// Um visualizador novo no mês: soma 1 no contador (atômico, sem corrida entre acessos).
export function registrar({ ano, mes }) {
  return prisma.visitaMensal.upsert({
    where: { ano_mes: { ano, mes } },
    create: { ano, mes, total: 1 },
    update: { total: { increment: 1 } },
  });
}

// Os 12 meses do ano (zero nos meses sem registro) e o total do ano.
export async function porMes(ano) {
  const linhas = await prisma.visitaMensal.findMany({
    where: { ano },
    select: { mes: true, total: true },
  });
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    total: linhas.find((l) => l.mes === i + 1)?.total ?? 0,
  }));
  return { meses, total: meses.reduce((soma, m) => soma + m.total, 0) };
}

// Anos com registro, do mais novo ao mais antigo; o ano atual sempre aparece.
export async function anosComRegistro(anoAtual) {
  const linhas = await prisma.visitaMensal.findMany({
    distinct: ['ano'],
    select: { ano: true },
  });
  return [...new Set([anoAtual, ...linhas.map((l) => l.ano)])].sort((a, b) => b - a);
}
