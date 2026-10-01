// Painel · posicionar o local no mapa (busca de endereço + pino arrastável).
// Sem JavaScript, os campos de latitude/longitude continuam editáveis à mão.

const PORTO_ALEGRE = [-30.0346, -51.2177];
const elementoMapa = document.getElementById('mapa-form');

if (elementoMapa) {
  const form = document.getElementById('form-local');
  const lat = form.elements.latitude;
  const lng = form.elements.longitude;
  const resultados = document.getElementById('resultados-endereco');
  const botaoBuscar = document.getElementById('buscar-endereco');

  const posicaoInicial = () => {
    const a = Number.parseFloat(lat.value);
    const b = Number.parseFloat(lng.value);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  };

  const inicial = posicaoInicial();
  const mapa = L.map(elementoMapa, { scrollWheelZoom: false }).setView(
    inicial ?? PORTO_ALEGRE,
    inicial ? 17 : 12,
  );
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  const icone = L.divIcon({
    className: 'marcador marcador--ambulatorio',
    html: '<span class="marcador__pino" aria-hidden="true"></span>',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
  });
  const pino = L.marker(inicial ?? PORTO_ALEGRE, {
    draggable: true,
    icon: icone,
    title: 'Arraste para ajustar',
  });
  if (inicial) pino.addTo(mapa);

  const posicionar = (latlng, { centralizar = false } = {}) => {
    pino.setLatLng(latlng);
    if (!mapa.hasLayer(pino)) pino.addTo(mapa);
    lat.value = latlng.lat.toFixed(6);
    lng.value = latlng.lng.toFixed(6);
    if (centralizar) mapa.setView(latlng, 17, { animate: false });
  };

  pino.on('dragend', () => posicionar(pino.getLatLng()));
  mapa.on('click', (e) => posicionar(e.latlng));

  // Edição manual das coordenadas move o pino.
  for (const campo of [lat, lng]) {
    campo.addEventListener('change', () => {
      const p = posicaoInicial();
      if (p) posicionar(L.latLng(p), { centralizar: true });
    });
  }

  new ResizeObserver(() => mapa.invalidateSize()).observe(elementoMapa);

  botaoBuscar.hidden = false;
  botaoBuscar.addEventListener('click', async () => {
    const campos = ['logradouro', 'numero', 'bairro', 'cidade', 'uf'].map((n) =>
      form.elements[n].value.trim(),
    );
    const [rua, numero, bairro, cidade, uf] = campos;
    if (!rua) {
      mostrar('Preencha a rua ou avenida antes de buscar.');
      form.elements.logradouro.focus();
      return;
    }
    const consulta = [[rua, numero].filter(Boolean).join(', '), bairro, cidade, uf]
      .filter(Boolean)
      .join(', ');

    botaoBuscar.disabled = true;
    mostrar('Buscando…');
    try {
      const resposta = await fetch(
        `/painel/locais/geocodificar?q=${encodeURIComponent(consulta)}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      const dados = await resposta.json();
      if (!resposta.ok) return mostrar(dados.erro ?? 'Não foi possível buscar.');
      if (dados.resultados.length === 0) {
        return mostrar(
          'Endereço não encontrado. Confira os dados ou clique no mapa para posicionar.',
        );
      }
      if (dados.resultados.length === 1) {
        posicionar(L.latLng(dados.resultados[0]), { centralizar: true });
        return mostrar('Pino posicionado. Confira e arraste para ajustar, se precisar.');
      }
      mostrarOpcoes(dados.resultados);
    } catch {
      mostrar('Não foi possível buscar agora. Clique no mapa para posicionar.');
    } finally {
      botaoBuscar.disabled = false;
    }
  });

  function mostrar(texto) {
    resultados.replaceChildren(
      texto ? Object.assign(document.createElement('p'), { textContent: texto }) : '',
    );
  }

  function mostrarOpcoes(lista) {
    const titulo = Object.assign(document.createElement('p'), {
      textContent: 'Escolha o endereço certo:',
    });
    const ul = document.createElement('ul');
    for (const r of lista) {
      const botao = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'resultados-endereco__opcao',
        textContent: r.descricao,
      });
      botao.addEventListener('click', () => {
        posicionar(L.latLng(r), { centralizar: true });
        mostrar('Pino posicionado. Confira e arraste para ajustar, se precisar.');
      });
      const li = document.createElement('li');
      li.append(botao);
      ul.append(li);
    }
    resultados.replaceChildren(titulo, ul);
  }
}
