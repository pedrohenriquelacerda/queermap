import * as locaisService from '../../services/locaisService.js';

export async function listar(req, res) {
  const locais = await locaisService.listarPublicados();
  // Cache curto: o mapa muda pouco e isso alivia o banco na hospedagem gratuita.
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ locais });
}
