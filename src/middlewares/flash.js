// Mensagem de uma vez só, mostrada depois de um redirecionamento (ex.: "Senha alterada.").
export function flash(req, res, next) {
  res.locals.flash = req.session.flash ?? null;
  delete req.session.flash;
  req.flash = (tipo, texto) => {
    req.session.flash = { tipo, texto };
  };
  next();
}
