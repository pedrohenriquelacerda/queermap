import * as locaisService from '../services/locaisService.js';
import * as fmt from '../utils/formatadores.js';

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
    dadosMapa,
  });
}

function unicos(itens) {
  return [...new Map(itens.map((i) => [i.slug, i])).values()];
}
