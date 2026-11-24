// Mapa SerQueer · mapa base compartilhado (mapa público e painel).
//
// Usa os tiles vetoriais do OpenFreeMap (estilo "positron", sem chave de API), desenhados
// pelo MapLibre dentro do Leaflet. Esse estilo não tem a camada de comércios (POI), então
// nenhum ícone comercial aparece no mapa: só ruas, nomes e os pinos do Mapa SerQueer.
//
// Se o navegador não tiver WebGL, ou o estilo não carregar, voltamos para os tiles raster
// do OpenStreetMap (que mostram ícones de comércio, mas mantêm o mapa funcionando).

const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
const TILES_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const ATRIBUICAO_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ATRIBUICAO_VETORIAL =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  'Dados do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

let bibliotecas;

function temWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function carregarScript(src) {
  return new Promise((resolver, rejeitar) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolver;
    script.onerror = () => rejeitar(new Error(`Não foi possível carregar ${src}`));
    document.head.append(script);
  });
}

// O MapLibre (~1 MB) só é baixado quando um mapa é aberto, nunca nas outras páginas.
function carregarMapLibre() {
  bibliotecas ??= (async () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/maplibre/maplibre-gl.css';
    document.head.append(css);

    // O plugin do Leaflet procura o MapLibre em window.maplibregl.
    window.maplibregl = await import('/vendor/maplibre/maplibre-gl.mjs');
    await carregarScript('/vendor/maplibre-leaflet/leaflet-maplibre-gl.js');
  })();
  return bibliotecas;
}

function adicionarRaster(mapa) {
  return L.tileLayer(TILES_OSM, { maxZoom: 19, attribution: ATRIBUICAO_OSM }).addTo(mapa);
}

export function adicionarMapaBase(mapa) {
  if (!temWebGL()) {
    adicionarRaster(mapa);
    return;
  }

  carregarMapLibre()
    .then(() => {
      // O plugin ignora "attribution" e só monta a atribuição do estilo no evento "load" do MapLibre,
      // que pode demorar ou não vir. Com customAttribution ela aparece assim que a camada entra
      // (a licença do OpenFreeMap exige a atribuição visível).
      const camada = L.maplibreGL({
        style: ESTILO,
        attributionControl: { customAttribution: ATRIBUICAO_VETORIAL },
      }).addTo(mapa);
      const gl = camada.getMaplibreMap();
      let estiloCarregou = false;
      let usouReserva = false;

      gl.once('styledata', () => {
        estiloCarregou = true;
      });
      // Erro antes de o estilo chegar (estilo fora do ar, bloqueio de rede...): usa a reserva.
      // Depois que o estilo carregou, um tile ou uma fonte que falha uma vez não troca o mapa.
      gl.on('error', () => {
        if (estiloCarregou || usouReserva) return;
        usouReserva = true;
        mapa.removeLayer(camada);
        adicionarRaster(mapa);
      });
    })
    .catch(() => adicionarRaster(mapa));
}
