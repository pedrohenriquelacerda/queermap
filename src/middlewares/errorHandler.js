export function errorHandler(err, req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);

  // Detalhes de erros internos nunca vão para o usuário.
  const mensagem = status >= 500 ? 'Algo deu errado. Tente novamente mais tarde.' : err.message;

  res.status(status);
  if (req.accepts('html')) {
    return res.render('erro', { title: 'Erro', status, mensagem });
  }
  res.json({ erro: mensagem });
}
