import { env } from '../config/env.js';
import * as visitas from '../services/visitasService.js';
import { anoMesBrasilia, inicioDoProximoMes } from '../utils/periodo.js';

const COOKIE = 'sq_v';
// Robôs e pré-carregamento não são pessoas visitando.
const ROBO = /bot|crawl|spider|slurp|preview|monitor|headless|curl|wget|python|node-fetch|axios/i;

function cookieDoMes(req) {
  const m = /(?:^|;\s*)sq_v=([^;]*)/.exec(req.headers.cookie ?? '');
  return m ? m[1] : null;
}

// Conta quem chega pela primeira vez no mês. O cookie guarda só "AAAA-MM" (nenhum
// identificador) e vale até o fim do mês; o banco guarda só o total do mês.
export function registrarVisita(req, res) {
  try {
    if (req.method !== 'GET' || req.admin) return;
    const ua = req.get('user-agent') ?? '';
    if (!ua || ROBO.test(ua)) return;
    if (/prefetch|prerender/i.test(req.get('sec-purpose') ?? req.get('purpose') ?? '')) return;

    const agora = anoMesBrasilia();
    const marca = `${agora.ano}-${String(agora.mes).padStart(2, '0')}`;
    if (cookieDoMes(req) === marca) return;

    res.cookie(COOKIE, marca, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      expires: inicioDoProximoMes(agora),
    });
    // Contar nunca pode derrubar a página; o log não leva dados de quem acessou.
    visitas.registrar(agora).catch(() => console.error('Falha ao contar visualizador.'));
  } catch {
    console.error('Falha ao contar visualizador.');
  }
}

export function contarVisita(req, res, next) {
  registrarVisita(req, res);
  next();
}
