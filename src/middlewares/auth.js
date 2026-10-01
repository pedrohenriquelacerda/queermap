import * as adminsService from '../services/adminsService.js';

// Carrega a pessoa logada (se houver) em req.admin e res.locals.admin.
// Conta desativada ou removida encerra a sessão na hora.
export async function carregarAdmin(req, res, next) {
  const id = req.session.adminId;
  if (!id) return next();

  const admin = await adminsService.buscarParaSessao(id);
  if (!admin?.ativo) {
    delete req.session.adminId; // sai do painel, mas mantém a sessão para os próximos middlewares
    return next();
  }
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
