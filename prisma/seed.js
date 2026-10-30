// Dados iniciais: categorias de serviço e características.
// Idempotente e preserva customizações administrativas: só cria categorias ausentes.
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
  { slug: 'abrigo', nome: 'Abrigo', icone: 'abrigo' },
  { slug: 'albergue', nome: 'Albergue', icone: 'albergue' },
  { slug: 'centro-pop', nome: 'Centros POP', icone: 'centro-pop' },
  { slug: 'casa-cidadania', nome: 'Casas de Cidadania', icone: 'casa-cidadania' },
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
    const atual = await prisma.categoria.findUnique({ where: { slug: c.slug } });
    if (!atual) {
      await prisma.categoria.create({ data: { ...c, ordem } });
    }
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
