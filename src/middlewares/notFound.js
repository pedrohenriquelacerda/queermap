export function notFound(req, res) {
  res.status(404).render('404', { title: 'Página não encontrada' });
}
