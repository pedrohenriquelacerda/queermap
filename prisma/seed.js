// Dados iniciais: categorias de serviço e características.
// Idempotente (upsert por slug): pode rodar quantas vezes quiser.
// Rode com: npm run db:seed

import { prisma } from '../src/db/prisma.js';

const categorias = [
  { slug: 'ambulatorio-trans', nome: 'Ambulatório trans', icone: 'ambulatorio' },
  { slug: 'ong', nome: 'ONG / coletivo LGBTQIA+', icone: 'ong' },
  {
    slug: 'saude-sexual',
    nome: 'Saúde sexual e prevenção (SAE, PEP, PrEP)',
    icone: 'saude-sexual',
  },
  { slug: 'abrigo', nome: 'Abrigo / albergue', icone: 'abrigo' },
  { slug: 'casa-acolhimento', nome: 'Casa de acolhimento', icone: 'acolhimento' },
];

// Lista provisória: a definitiva será combinada com a ONG.
const caracteristicas = [
  { slug: 'nome-social', nome: 'Respeita o nome social' },
  { slug: 'oferece-prep', nome: 'Oferece PrEP' },
  { slug: 'oferece-pep', nome: 'Oferece PEP' },
  { slug: 'testagem-ist', nome: 'Testagem rápida de IST' },
  { slug: 'hormonizacao', nome: 'Acompanhamento de hormonização' },
  { slug: 'atendimento-psicologico', nome: 'Atendimento psicológico' },
  { slug: 'gratuito-sus', nome: 'Gratuito / SUS' },
  { slug: 'sem-agendamento', nome: 'Atende sem agendamento' },
  { slug: 'acessivel', nome: 'Acessível para pessoas com deficiência' },
];

async function main() {
  for (const [ordem, c] of categorias.entries()) {
    await prisma.categoria.upsert({
      where: { slug: c.slug },
      update: { nome: c.nome, icone: c.icone, ordem },
      create: { ...c, ordem },
    });
  }

  for (const c of caracteristicas) {
    await prisma.caracteristica.upsert({
      where: { slug: c.slug },
      update: { nome: c.nome },
      create: c,
    });
  }

  console.log(
    `Seed ok: ${categorias.length} categorias, ${caracteristicas.length} características.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
