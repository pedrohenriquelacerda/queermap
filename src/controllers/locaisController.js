import * as locaisService from '../services/locaisService.js';
import * as geocodificacao from '../services/geocodificacaoService.js';
import * as fmt from '../utils/formatadores.js';
import { env } from '../config/env.js';
import { verificarHumano } from '../services/turnstileService.js';

export async function mostrar(req, res, next) {
  const local = await locaisService.buscarPublicadoPorSlug(req.params.slug);
  if (!local) return next(); // cai no 404

  res.render('locais/mostrar', {
    title: local.nome,
    descricao: `${local.categoria.nome} em ${local.bairro || local.cidade}. ${fmt.endereco(local)}.`,
    usaLeaflet: true,
    local,
    notaMedia: locaisService.notaMedia(local),
    totalAvaliacoes: local.avaliacoes?.length ?? 0,
    turnstileSiteKey: env.turnstile.siteKey,
    avaliacaoEnviada: req.query.avaliacao === 'enviada',
  });
}

export async function avaliar(req, res, next) {
  const nota = Number(req.body.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).send('Escolha uma nota de 1 a 5.');
  }
  if (!(await verificarHumano(req.body['cf-turnstile-response'], req.ip))) {
    return res.status(400).send('Confirme que você não é um robô.');
  }
  if (!(await locaisService.avaliarPublicado(req.params.slug, nota))) return next();
  res.redirect(303, `/locais/${encodeURIComponent(req.params.slug)}?avaliacao=enviada`);
}

// Endereço digitado no mapa quando a pessoa não libera a localização (Nominatim).
export async function buscarEndereco(req, res) {
  const consulta = String(req.query.q ?? '')
    .trim()
    .slice(0, 300);
  if (consulta.length < 3) {
    return res.status(400).json({ erro: 'Digite um endereço, bairro ou cidade.' });
  }
  try {
    const resultados = await geocodificacao.buscarEndereco(consulta, {
      regiao: geocodificacao.REGIAO_RS,
    });
    res.json({ resultados });
  } catch (err) {
    console.error('Busca de endereço falhou:', err.message);
    res
      .status(502)
      .json({ erro: 'A busca de endereço não respondeu. Tente de novo em instantes.' });
  }
}
