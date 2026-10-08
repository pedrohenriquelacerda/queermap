import * as adminsService from '../services/adminsService.js';
import { marcaDaSenha } from '../utils/hash.js';

export const DURACAO_MAXIMA_LOGIN_MS = 8 * 60 * 60 * 1000;

export function iniciarSessaoAdmin(req, admin) {
  req.session.adminId = admin.id;
  req.session.marcaSenha = marcaDaSenha(admin.senhaHash);
  req.session.loginEm ??= Date.now();
}

// Carrega a pessoa logada (se houver) em req.admin e res.locals.admin.
// Encerra a sessão do painel na hora se a conta foi desativada ou removida, se a senha
// mudou depois do login (outra sessão trocou ou um admin redefiniu) ou se passou de 8 h.
export async function carregarAdmin(req, res, next) {
  const id = req.session.adminId;
  if (!id) return next();

  const conta = await adminsService.buscarParaSessao(id);
  const valida =
    conta?.ativo &&
    req.session.marcaSenha === marcaDaSenha(conta.senhaHash) &&
    Date.now() - (req.session.loginEm ?? 0) < DURACAO_MAXIMA_LOGIN_MS;
  if (!valida) {
    delete req.session.adminId;
    delete req.session.marcaSenha;
    delete req.session.loginEm;
    return next();
  }
  const admin = { ...conta };
  delete admin.senhaHash;
  req.admin = admin;
  res.locals.admin = admin;
  next();
}

export function exigirLogin(req, res, next) {
  if (!req.admin) {
    return res.redirect(`/painel/entrar?volta=${encodeURIComponent(req.originalUrl)}`);
  }
  // Senha provisória: só libera a tela de troca de senha (e sair).
  if (req.admin.precisaTrocarSenha && !['/conta', '/sair'].includes(req.path)) {
    return res.redirect('/painel/conta');
  }
  next();
}

export function exigirPapelAdmin(req, res, next) {
  if (req.admin?.papel === 'ADMIN') return next();
  const erro = new Error('Esta área é só para quem administra o painel.');
  erro.status = 403;
  next(erro);
}

// Evita redirecionar para outro site depois do login (open redirect).
export function destinoSeguro(volta) {
  return typeof volta === 'string' && volta.startsWith('/painel') && !volta.startsWith('//')
    ? volta
    : '/painel';
}
