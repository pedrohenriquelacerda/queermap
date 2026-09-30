export function index(req, res) {
  res.render('home', { title: 'Mapa', usaMapa: true });
}
