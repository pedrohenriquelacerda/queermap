export function errorHandler(err, req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(resumoDoErro(err, req));

  // Detalhes de erros internos nunca vão para o usuário.
  const mensagem = status >= 500 ? 'Algo deu errado. Tente novamente mais tarde.' : err.message;

  res.status(status);
  if (req.accepts('html')) {
    return res.render('erro', { title: 'Erro', status, mensagem });
  }
  res.json({ erro: mensagem });
}

// Sem a mensagem nem a query string: podem conter dados de relatos ou e-mails.
export function resumoDoErro(err, req) {
  const codigo = err?.code ? ` ${err.code}` : '';
  const rota = `${req.method} ${req.originalUrl.split('?')[0]}`;
  const onde = String(err?.stack ?? '')
    .split('\n')
    .filter((linha) => linha.trimStart().startsWith('at '))
    .slice(0, 8)
    .join('\n');
  return `Erro interno: ${err?.name ?? typeof err}${codigo} em ${rota}\n${onde}`.trimEnd();
}
