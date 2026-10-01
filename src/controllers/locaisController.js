import * as locaisService from '../services/locaisService.js';
import * as fmt from '../utils/formatadores.js';

export async function mostrar(req, res, next) {
  const local = await locaisService.buscarPublicadoPorSlug(req.params.slug);
  if (!local) return next(); // cai no 404

  res.render('locais/mostrar', {
    title: local.nome,
    descricao: `${local.categoria.nome} em ${local.bairro || local.cidade}. ${fmt.endereco(local)}.`,
    usaLeaflet: true,
    local,
  });
}
