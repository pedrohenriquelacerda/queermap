import { env } from '../config/env.js';

// Proteção contra CSRF: todo envio (POST etc.) precisa vir de uma página do próprio site.
// Navegadores sempre mandam o cabeçalho Origin em envios de formulário; somado ao cookie
// SameSite=Lax, isso impede que outro site faça ações em nome de quem está logado.

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const origemDoSite = new URL(env.siteUrl).origin;

export function verificarOrigem(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const origem = req.get('origin') ?? origemDe(req.get('referer'));
  const origemDaRequisicao = `${req.protocol}://${req.get('host')}`;
  if (origem && (origem === origemDoSite || origem === origemDaRequisicao)) return next();

  const erro = new Error('Envio bloqueado por segurança. Recarregue a página e tente de novo.');
  erro.status = 403;
  next(erro);
}

function origemDe(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
