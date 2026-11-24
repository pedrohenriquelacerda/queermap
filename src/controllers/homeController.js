import * as locaisService from '../services/locaisService.js';
import * as fmt from '../utils/formatadores.js';

// Características que viram atalhos (chips) no topo dos filtros: as que mais pesam na hora de
// decidir ir a um local. Para mudar, troque os slugs aqui; as demais ficam em "Mais características".
export const CARACTERISTICAS_EM_DESTAQUE = [
  'nome-social',
  'gratuito-sus',
  'oferece-prep',
  'sem-agendamento',
];

export async function index(req, res) {
  const [locais, todasCategorias] = await Promise.all([
    locaisService.listarPublicados(),
    locaisService.listarCategoriasAtivas(),
  ]);

  // Tipos de serviço: todos, com quantos locais cada um tem (pode ser zero).
  const categorias = todasCategorias.map((c) => ({
    ...c,
    total: locais.filter((l) => l.categoria.slug === c.slug).length,
  }));
  // Características: só as que têm pelo menos um local.
  const caracteristicas = unicos(locais.flatMap((l) => l.caracteristicas)).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  const destaque = CARACTERISTICAS_EM_DESTAQUE.map((slug) =>
    caracteristicas.find((c) => c.slug === slug),
  ).filter(Boolean);
  const outras = caracteristicas.filter((c) => !CARACTERISTICAS_EM_DESTAQUE.includes(c.slug));

  // Só o que o mapa precisa, já formatado.
  const dadosMapa = locais.map((l) => ({
    id: l.id,
    nome: l.nome,
    url: `/locais/${l.slug}`,
    lat: l.latitude,
    lng: l.longitude,
    categoria: { nome: l.categoria.nome, classe: fmt.classeCategoria(l.categoria) },
    endereco: fmt.endereco(l),
    caracteristicas: l.caracteristicas.map((c) => c.nome),
    comoChegar: fmt.linkComoChegar(l),
  }));

  res.render('home', {
    title: 'Mapa',
    usaMapa: true,
    locais,
    categorias,
    caracteristicas,
    destaque,
    outras,
    dadosMapa,
  });
}

function unicos(itens) {
  return [...new Map(itens.map((i) => [i.slug, i])).values()];
}
