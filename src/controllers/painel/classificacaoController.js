import { prisma } from '../../db/prisma.js';
import * as auditoria from '../../services/auditoriaService.js';
import { slugUnico } from '../../utils/slug.js';
import { validar, texto, caixa, z } from '../../utils/validacao.js';

// Cores disponíveis para os marcadores (definidas em src/public/css/mapa.css: variáveis --cat-* e
// --bandeira-*, e uma classe .marcador--<valor> para cada uma). Há dois grupos: cores lisas e
// bandeiras do orgulho. Cada chave é o nome da cor ou da bandeira (ex.: "lesbica", "cor-azul");
// as chaves antigas gravadas no banco foram convertidas pela migration
// 20261124130000_renomear_cores_dos_marcadores. Para criar uma opção nova,
// acrescente a classe no CSS e uma linha aqui (o teste confere que as duas existem).
const LISAS = 'Cores lisas';
const BANDEIRAS = 'Bandeiras do orgulho';

export const CORES = [
  { valor: 'cor-roxo', texto: 'Roxo (ONG Somos)', grupo: LISAS },
  { valor: 'cor-rosa', texto: 'Rosa (ONG Somos)', grupo: LISAS },
  { valor: 'cor-turquesa', texto: 'Turquesa (ONG Somos)', grupo: LISAS },
  { valor: 'cor-vermelho', texto: 'Vermelho', grupo: LISAS },
  { valor: 'cor-vinho', texto: 'Vinho', grupo: LISAS },
  { valor: 'cor-coral', texto: 'Coral', grupo: LISAS },
  { valor: 'cor-laranja', texto: 'Laranja', grupo: LISAS },
  { valor: 'cor-mostarda', texto: 'Mostarda', grupo: LISAS },
  { valor: 'cor-amarelo', texto: 'Amarelo', grupo: LISAS },
  { valor: 'cor-verde-limao', texto: 'Verde-limão', grupo: LISAS },
  { valor: 'cor-verde', texto: 'Verde', grupo: LISAS },
  { valor: 'cor-esmeralda', texto: 'Esmeralda', grupo: LISAS },
  { valor: 'cor-verde-agua', texto: 'Verde-água', grupo: LISAS },
  { valor: 'cor-azul-claro', texto: 'Azul-claro', grupo: LISAS },
  { valor: 'cor-azul', texto: 'Azul', grupo: LISAS },
  { valor: 'cor-azul-marinho', texto: 'Azul-marinho', grupo: LISAS },
  { valor: 'cor-indigo', texto: 'Índigo', grupo: LISAS },
  { valor: 'cor-violeta', texto: 'Violeta', grupo: LISAS },
  { valor: 'cor-lilas', texto: 'Lilás', grupo: LISAS },
  { valor: 'cor-magenta', texto: 'Magenta', grupo: LISAS },
  { valor: 'cor-marrom', texto: 'Marrom', grupo: LISAS },
  { valor: 'cor-areia', texto: 'Areia', grupo: LISAS },
  { valor: 'cor-grafite', texto: 'Grafite', grupo: LISAS },
  { valor: 'cor-preto', texto: 'Preto', grupo: LISAS },
  { valor: 'cor-cinza', texto: 'Cinza', grupo: LISAS },

  { valor: 'arco-iris', texto: 'Arco-íris (LGBTQIA+)', grupo: BANDEIRAS },
  { valor: 'progresso', texto: 'Orgulho progresso', grupo: BANDEIRAS },
  { valor: 'trans', texto: 'Trans', grupo: BANDEIRAS },
  { valor: 'lesbica', texto: 'Lésbica', grupo: BANDEIRAS },
  { valor: 'gay', texto: 'Gay', grupo: BANDEIRAS },
  { valor: 'bissexual', texto: 'Bissexual', grupo: BANDEIRAS },
  { valor: 'pansexual', texto: 'Pansexual', grupo: BANDEIRAS },
  { valor: 'polissexual', texto: 'Polissexual', grupo: BANDEIRAS },
  { valor: 'omnissexual', texto: 'Omnissexual', grupo: BANDEIRAS },
  { valor: 'assexual', texto: 'Assexual', grupo: BANDEIRAS },
  { valor: 'aromantica', texto: 'Aromântica', grupo: BANDEIRAS },
  { valor: 'nao-binaria', texto: 'Não-binária', grupo: BANDEIRAS },
  { valor: 'genero-fluido', texto: 'Gênero fluido', grupo: BANDEIRAS },
  { valor: 'agenero', texto: 'Agênero', grupo: BANDEIRAS },
  { valor: 'genero-queer', texto: 'Gênero queer', grupo: BANDEIRAS },
  { valor: 'intersexo', texto: 'Intersexo', grupo: BANDEIRAS },
];

const cor = z.enum(
  CORES.map((c) => c.valor),
  { error: 'Escolha uma cor.' },
);

const esquemas = {
  categoria: z.object({
    nome: texto('o nome', 80),
    icone: cor,
    ordem: z.coerce.number().int().min(0).max(99).optional(),
    ativa: caixa(),
  }),
  caracteristica: z.object({
    nome: texto('o nome', 80),
    descricao: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    ativa: caixa(),
  }),
};

const modelos = { categoria: prisma.categoria, caracteristica: prisma.caracteristica };
const nomes = { categoria: 'Tipo de serviço', caracteristica: 'Característica' };

export async function listar(req, res) {
  await renderizar(res, {});
}

export async function criar(req, res) {
  const tipo = req.params.tipo;
  const { dados, erros } = validar(esquemas[tipo], { ativa: 'on', ...req.body });
  if (erros)
    return renderizar(res.status(400), { [`erros_${tipo}`]: erros, [`novo_${tipo}`]: req.body });

  if (await modelos[tipo].findUnique({ where: { nome: dados.nome } })) {
    return renderizar(res.status(400), {
      [`erros_${tipo}`]: { nome: 'Já existe um item com este nome.' },
      [`novo_${tipo}`]: req.body,
    });
  }
  const slug = await slugUnico(dados.nome, async (s) =>
    Boolean(await modelos[tipo].findUnique({ where: { slug: s } })),
  );

  // Atribui automaticamente no final da fila se a ordem não foi informada
  if (tipo === 'categoria' && (dados.ordem === undefined || dados.ordem === null)) {
    const maior = await prisma.categoria.aggregate({ _max: { ordem: true } });
    dados.ordem = (maior._max?.ordem ?? -1) + 1;
  }

  const item = await modelos[tipo].create({ data: { ...dados, slug } });
  await auditoria.registrar(req, `${tipo}.criar`, tipo, item.id, { nome: item.nome });
  req.flash('sucesso', `${nomes[tipo]} “${item.nome}” criada.`);
  res.redirect('/painel/classificacao');
}

export async function salvar(req, res, next) {
  const tipo = req.params.tipo;
  const id = Number(req.params.id);
  const atual = await modelos[tipo].findUnique({ where: { id } });
  if (!atual) return next();

  const { dados, erros } = validar(esquemas[tipo], req.body);
  if (erros) {
    req.flash('erro', `Não foi possível salvar “${atual.nome}”: ${Object.values(erros)[0]}`);
    return res.redirect('/painel/classificacao');
  }
  const repetido = await modelos[tipo].findFirst({ where: { nome: dados.nome, id: { not: id } } });
  if (repetido) {
    req.flash('erro', `Já existe um item chamado “${dados.nome}”.`);
    return res.redirect('/painel/classificacao');
  }

  // O slug não muda: ele aparece nos links dos filtros do mapa (/?car=...).
  await modelos[tipo].update({ where: { id }, data: dados });
  await auditoria.registrar(req, `${tipo}.atualizar`, tipo, id, {
    antes: atual.nome,
    depois: dados,
  });
  req.flash('sucesso', `“${dados.nome}” salvo.`);
  res.redirect('/painel/classificacao');
}

export async function mover(req, res, next) {
  const id = Number(req.params.id);
  const direcao = req.body.direcao;
  if (!['subir', 'descer'].includes(direcao)) {
    req.flash('erro', 'Direção inválida.');
    return res.redirect('/painel/classificacao');
  }

  const todas = await prisma.categoria.findMany({
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  });

  const indice = todas.findIndex((c) => c.id === id);
  if (indice === -1) return next();

  const outroIndice = direcao === 'subir' ? indice - 1 : indice + 1;
  if (outroIndice < 0 || outroIndice >= todas.length) {
    return res.redirect('/painel/classificacao');
  }

  const reordenadas = [...todas];
  const item = reordenadas.splice(indice, 1)[0];
  reordenadas.splice(outroIndice, 0, item);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < reordenadas.length; i++) {
      if (reordenadas[i].ordem !== i) {
        await tx.categoria.update({
          where: { id: reordenadas[i].id },
          data: { ordem: i },
        });
      }
    }
  });

  await auditoria.registrar(req, 'categoria.reordenar', 'categoria', id, {
    movido: item.nome,
    direcao,
  });

  req.flash('sucesso', `Ordem de “${item.nome}” alterada.`);
  res.redirect('/painel/classificacao');
}

export async function reordenar(req, res) {
  let ids = req.body.ordem;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = ids.split(',').map((v) => Number(v.trim()));
    }
  }

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(Number(n)))) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(400).json({ erro: 'Lista de IDs inválida.' });
    }
    req.flash('erro', 'Lista de ordenação inválida.');
    return res.redirect('/painel/classificacao');
  }

  const idsNumeros = ids.map(Number);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < idsNumeros.length; i++) {
      await tx.categoria.updateMany({
        where: { id: idsNumeros[i] },
        data: { ordem: i },
      });
    }
  });

  await auditoria.registrar(req, 'categoria.reordenar', 'categoria', null, {
    novaOrdem: idsNumeros,
  });

  if (req.accepts('json') && !req.accepts('html')) {
    return res.json({ ok: true });
  }

  req.flash('sucesso', 'Ordem dos tipos de serviço salva.');
  res.redirect('/painel/classificacao');
}

async function renderizar(res, extras) {
  const [categorias, caracteristicas] = await Promise.all([
    prisma.categoria.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      include: { _count: { select: { locais: true } } },
    }),
    prisma.caracteristica.findMany({
      orderBy: { nome: 'asc' },
      include: { _count: { select: { locais: true } } },
    }),
  ]);
  res.render('painel/classificacao', {
    title: 'Tipos e características',
    categorias,
    caracteristicas,
    cores: CORES,
    erros_categoria: {},
    erros_caracteristica: {},
    novo_categoria: { icone: 'cor-cinza' },
    novo_caracteristica: {},
    scripts: ['/js/reordenar-categorias.js', '/js/classificacao-cores.js'],
    ...extras,
  });
}
