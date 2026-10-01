import * as adminsService from '../../services/adminsService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { destinoSeguro } from '../../middlewares/auth.js';
import { verificarSenha, verificarSenhaFicticia } from '../../utils/senha.js';
import { validar, email, z } from '../../utils/validacao.js';

const esquemaLogin = z.object({
  email: email(),
  senha: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(200),
  volta: z.string().optional(),
});

export function formulario(req, res) {
  if (req.admin) return res.redirect('/painel');
  renderizar(res, { volta: req.query.volta });
}

export async function entrar(req, res, next) {
  const { dados, erros } = validar(esquemaLogin, req.body);
  if (erros) return renderizar(res.status(400), { ...req.body, erros });

  const admin = await adminsService.buscarPorEmail(dados.email);
  const correta = admin?.ativo
    ? await verificarSenha(dados.senha, admin.senhaHash)
    : await verificarSenhaFicticia(dados.senha);

  if (!correta) {
    return renderizar(res.status(401), {
      email: dados.email,
      volta: dados.volta,
      erroGeral: 'E-mail ou senha incorretos.',
    });
  }

  // Nova sessão a cada login: impede que alguém reaproveite um cookie anterior.
  req.session.regenerate(async (erro) => {
    if (erro) return next(erro);
    req.session.adminId = admin.id;
    req.admin = admin;
    await adminsService.atualizar(admin.id, { ultimoLoginEm: new Date() });
    await auditoria.registrar(req, 'sessao.entrar', 'Admin', admin.id);
    res.redirect(admin.precisaTrocarSenha ? '/painel/conta' : destinoSeguro(dados.volta));
  });
}

export async function sair(req, res, next) {
  await auditoria.registrar(req, 'sessao.sair', 'Admin', req.admin.id);
  req.session.destroy((erro) => {
    if (erro) return next(erro);
    res.clearCookie('queermap.sid');
    res.redirect('/painel/entrar');
  });
}

// Resposta do limitador de tentativas (express-rate-limit).
export function muitasTentativas(req, res) {
  renderizar(res.status(429), {
    email: req.body?.email,
    erroGeral: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.',
  });
}

function renderizar(res, { email = '', volta = '', erros = {}, erroGeral = null }) {
  res.render('painel/entrar', { title: 'Entrar no painel', email, volta, erros, erroGeral });
}
