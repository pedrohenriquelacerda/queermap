// Locais FICTÍCIOS só para desenvolvimento: nomes começam com "[Exemplo]".
// Não são serviços reais. Rode depois do seed principal: npm run db:seed:exemplos
// Para removê-los: npm run db:seed:exemplos -- --remover

import { prisma } from '../src/db/prisma.js';
import { gerarHash } from '../src/utils/senha.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Dados de exemplo não podem ser inseridos em produção.');
  process.exit(1);
}

const PREFIXO = 'exemplo-';

// Contas FICTÍCIAS do painel para desenvolvimento (domínio .test nunca existe de verdade).
const CONTAS_TESTE = [
  {
    nome: 'Admin de Teste',
    email: 'admin@queermap.test',
    papel: 'ADMIN',
    senha: 'admin-desenvolvimento',
  },
  {
    nome: 'Editor de Teste',
    email: 'editor@queermap.test',
    papel: 'EDITOR',
    senha: 'editor-desenvolvimento',
  },
];

const exemplos = [
  {
    nome: '[Exemplo] Ambulatório Trans Centro',
    categoria: 'ambulatorio-trans',
    bairro: 'Centro Histórico',
    coords: [-30.0318, -51.2301],
    horario: 'Seg a sex, 8h às 17h',
    caracteristicas: ['nome-social', 'hormonizacao', 'gratuito-sus', 'atendimento-psicologico'],
  },
  {
    nome: '[Exemplo] Coletivo Bom Fim',
    categoria: 'ong',
    bairro: 'Bom Fim',
    coords: [-30.033, -51.211],
    horario: 'Ter e qui, 14h às 20h',
    caracteristicas: ['nome-social', 'atendimento-psicologico', 'sem-agendamento'],
  },
  {
    nome: '[Exemplo] Centro de Testagem Cidade Baixa',
    categoria: 'saude-sexual',
    bairro: 'Cidade Baixa',
    coords: [-30.04, -51.221],
    horario: 'Seg a sex, 9h às 18h',
    caracteristicas: [
      'oferece-prep',
      'oferece-pep',
      'testagem-ist',
      'sem-agendamento',
      'gratuito-sus',
    ],
  },
  {
    nome: '[Exemplo] SAE Partenon',
    categoria: 'saude-sexual',
    bairro: 'Partenon',
    coords: [-30.06, -51.175],
    horario: 'Seg a sex, 7h às 19h',
    caracteristicas: ['oferece-prep', 'testagem-ist', 'gratuito-sus', 'acessivel'],
  },
  {
    nome: '[Exemplo] Albergue Santana',
    categoria: 'abrigo',
    bairro: 'Santana',
    coords: [-30.048, -51.208],
    horario: 'Acolhimento das 18h às 8h',
    caracteristicas: ['nome-social', 'gratuito-sus', 'acessivel'],
  },
  {
    nome: '[Exemplo] Casa de Acolhimento Menino Deus',
    categoria: 'casa-acolhimento',
    bairro: 'Menino Deus',
    coords: [-30.056, -51.225],
    horario: 'Todos os dias, 24h',
    caracteristicas: ['nome-social', 'atendimento-psicologico'],
  },
  {
    nome: '[Exemplo] Coletivo Restinga',
    categoria: 'ong',
    bairro: 'Restinga',
    coords: [-30.15, -51.14],
    horario: 'Sáb, 9h às 13h',
    caracteristicas: ['nome-social', 'testagem-ist'],
  },
  // Estes dois NÃO devem aparecer no mapa:
  {
    nome: '[Exemplo] Local aguardando validação',
    categoria: 'ong',
    bairro: 'Petrópolis',
    coords: [-30.04, -51.185],
    publicado: false,
    caracteristicas: [],
  },
  {
    nome: '[Exemplo] Local arquivado',
    categoria: 'abrigo',
    bairro: 'Sarandi',
    coords: [-29.995, -51.13],
    arquivado: true,
    caracteristicas: [],
  },
];

function slugify(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function remover() {
  const { count } = await prisma.local.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
  console.log(`${count} locais de exemplo removidos.`);
}

async function inserir() {
  for (const [i, e] of exemplos.entries()) {
    const slug = PREFIXO + slugify(e.nome.replace('[Exemplo]', ''));
    const publicado = e.publicado ?? true;
    const dados = {
      nome: e.nome,
      descricao: 'Local fictício usado para testar o mapa durante o desenvolvimento.',
      logradouro: 'Endereço fictício',
      numero: String(100 + i * 10),
      bairro: e.bairro,
      latitude: e.coords[0],
      longitude: e.coords[1],
      telefone: '(51) 3000-0000',
      whatsapp: '(51) 90000-0000',
      horarioFuncionamento: e.horario ?? null,
      publicado,
      publicadoEm: publicado ? new Date() : null,
      arquivadoEm: e.arquivado ? new Date() : null,
      categoria: { connect: { slug: e.categoria } },
      caracteristicas: { set: e.caracteristicas.map((s) => ({ slug: s })) },
    };
    await prisma.local.upsert({
      where: { slug },
      update: dados,
      create: {
        ...dados,
        slug,
        caracteristicas: { connect: e.caracteristicas.map((s) => ({ slug: s })) },
      },
    });
  }
  console.log(`${exemplos.length} locais de exemplo inseridos/atualizados.`);

  // Contas de teste do painel (só desenvolvimento).
  for (const conta of CONTAS_TESTE) {
    const { senha, ...dados } = conta;
    const senhaHash = await gerarHash(senha);
    await prisma.admin.upsert({
      where: { email: conta.email },
      update: { ...dados, senhaHash, precisaTrocarSenha: false, ativo: true },
      create: { ...dados, senhaHash },
    });
  }
  console.log(
    `Contas de teste: ${CONTAS_TESTE.map((c) => c.email).join(', ')} (senhas neste arquivo).`,
  );
}

try {
  await (process.argv.includes('--remover') ? remover() : inserir());
} finally {
  await prisma.$disconnect();
}
