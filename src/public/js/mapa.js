const PORTO_ALEGRE = [-30.0346, -51.2177];

const elemento = document.getElementById('mapa');

if (elemento) {
  const mapa = L.map(elemento).setView(PORTO_ALEGRE, 13);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);
}
