import { prisma } from '../../db/prisma.js';
import * as auditoria from '../../services/auditoriaService.js';
import { slugUnico } from '../../utils/slug.js';
import { validar, texto, caixa, z } from '../../utils/validacao.js';

// Cores disponíveis para os marcadores (definidas em mapa.css).
export const CORES = [
  { valor: 'ambulatorio', texto: 'Roxo' },
  { valor: 'ong', texto: 'Rosa' },
  { valor: 'saude-sexual', texto: 'Verde-azulado' },
  { valor: 'abrigo', texto: 'Laranja' },
  { valor: 'acolhimento', texto: 'Azul' },
  { valor: 'padrao', texto: 'Cinza' },
];

const cor = z.enum(
  CORES.map((c) => c.valor),
  { error: 'Escolha uma cor.' },
);

const esquemas = {
  categoria: z.object({
    nome: texto('o nome', 80),
    icone: cor,
    ordem: z.coerce.number().int().min(0).max(99).catch(0),
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
    novo_categoria: { icone: 'padrao' },
    novo_caracteristica: {},
    ...extras,
  });
}
