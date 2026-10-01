// Mapa SerQueer · mapa da página inicial (com busca/filtros) e mapa da página do local.
// Os dados e a lista vêm prontos do servidor; aqui só filtramos e desenhamos marcadores.

const PORTO_ALEGRE = [-30.0346, -51.2177];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const celular = window.matchMedia('(max-width: 47.99rem)');

const dados = document.getElementById('dados-mapa');
if (dados) iniciarExplorar(JSON.parse(dados.textContent));

const mapaLocal = document.getElementById('mapa-local');
if (mapaLocal) iniciarMapaLocal(mapaLocal);

// ─── Página inicial ─────────────────────────────────────────────────────────

function iniciarExplorar(locais) {
  const mapa = criarMapa('mapa');
  const camada = L.featureGroup().addTo(mapa);

  const marcadores = new Map();
  for (const local of locais) {
    const marcador = L.marker([local.lat, local.lng], {
      icon: icone(local.categoria.classe),
      title: local.nome,
      alt: `${local.nome} (${local.categoria.nome})`,
    }).bindPopup(() => montarPopup(local), { maxWidth: 280 });
    marcadores.set(String(local.id), marcador);
    marcador.addTo(camada);
  }

  const enquadrar = () => {
    if (camada.getLayers().length === 0) return;
    // Sem animação: em aba de fundo o navegador pausa animações e o zoom ficaria pela metade.
    mapa.fitBounds(camada.getBounds(), { padding: [40, 40], maxZoom: 15, animate: false });
  };
  enquadrar();
  const marcarInteracao = reajustarAoRedimensionar(mapa, enquadrar);

  const alternarModo = configurarModos();
  configurarFiltros({ marcadores, camada, enquadrar });

  // "Ver no mapa": abre o popup do local (no celular, troca para o modo mapa antes).
  document.getElementById('lista-locais')?.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-mostrar]');
    if (!botao) return;
    const marcador = marcadores.get(botao.dataset.mostrar);
    marcarInteracao(); // senão o reenquadramento automático tiraria o local de vista
    if (celular.matches) {
      alternarModo('mapa');
      mapa.invalidateSize(); // o mapa estava escondido: recalcula o tamanho antes de centralizar
    }
    mapa.setView(marcador.getLatLng(), Math.max(mapa.getZoom(), 15), { animate: false });
    marcador.openPopup();
  });
}

function configurarModos() {
  const principal = document.querySelector('.explorar');
  const botoes = document.querySelectorAll('[data-ir-para]');
  const alternar = (modo) => {
    principal.dataset.modo = modo;
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.irPara === modo));
  };
  for (const b of botoes) b.addEventListener('click', () => alternar(b.dataset.irPara));
  return alternar;
}

function configurarFiltros({ marcadores, camada, enquadrar }) {
  const form = document.getElementById('filtros');
  if (!form) return;
  const busca = form.elements.q;
  const itens = [...document.querySelectorAll('.cartao-local')];
  const contagem = document.getElementById('contagem');
  const vazio = document.getElementById('lista-vazia');
  const limpar = document.getElementById('limpar');

  // Restaura filtros da URL (link compartilhável).
  const params = new URLSearchParams(location.search);
  busca.value = params.get('q') ?? '';
  for (const caixa of form.querySelectorAll('input[type=checkbox]')) {
    caixa.checked = params.getAll(caixa.name).includes(caixa.value);
  }

  const aplicar = ({ reenquadrar = true } = {}) => {
    const termos = normalizar(busca.value).split(/\s+/).filter(Boolean);
    const tipos = marcados('tipo');
    const caracteristicas = marcados('car');

    let visiveis = 0;
    for (const item of itens) {
      const { id, tipo, car, busca: texto } = item.dataset;
      const lista = car.split(' ');
      const mostra =
        termos.every((t) => texto.includes(t)) &&
        (tipos.length === 0 || tipos.includes(tipo)) &&
        caracteristicas.every((c) => lista.includes(c));

      item.hidden = !mostra;
      const marcador = marcadores.get(id);
      if (mostra) {
        visiveis++;
        camada.addLayer(marcador);
      } else {
        camada.removeLayer(marcador);
      }
    }

    contagem.textContent = `${visiveis} ${visiveis === 1 ? 'local' : 'locais'}`;
    vazio.hidden = visiveis > 0;
    const temFiltro = termos.length > 0 || tipos.length > 0 || caracteristicas.length > 0;
    limpar.hidden = !temFiltro;
    atualizarContador('tipo', tipos.length);
    atualizarContador('car', caracteristicas.length);
    atualizarUrl(busca.value.trim(), tipos, caracteristicas);
    if (reenquadrar) enquadrar();
  };

  const marcados = (nome) =>
    [...form.querySelectorAll(`input[name=${nome}]:checked`)].map((c) => c.value);

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => aplicar());
  // Na digitação, não reenquadra a cada letra (o mapa ficaria pulando).
  busca.addEventListener('input', () => aplicar({ reenquadrar: false }));
  busca.addEventListener('search', () => aplicar());
  limpar.addEventListener('click', () => {
    form.reset();
    busca.value = '';
    for (const caixa of form.querySelectorAll('input[type=checkbox]')) caixa.checked = false;
    aplicar();
    busca.focus();
  });

  // Abre os grupos que já vêm com filtro marcado pela URL.
  for (const grupo of form.querySelectorAll('details')) {
    if (grupo.querySelector('input:checked')) grupo.open = true;
  }
  aplicar({ reenquadrar: params.size > 0 });
}

function atualizarContador(nome, quantidade) {
  const el = document.querySelector(`[data-contador="${nome}"]`);
  if (el) el.textContent = quantidade > 0 ? `(${quantidade})` : '';
}

function atualizarUrl(q, tipos, caracteristicas) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  for (const t of tipos) params.append('tipo', t);
  for (const c of caracteristicas) params.append('car', c);
  const busca = params.toString();
  history.replaceState(null, '', busca ? `?${busca}` : location.pathname);
}

// ─── Página do local ────────────────────────────────────────────────────────

function iniciarMapaLocal(el) {
  const posicao = [Number(el.dataset.lat), Number(el.dataset.lng)];
  const mapa = criarMapa(el, { scrollWheelZoom: false });
  mapa.setView(posicao, 16);
  L.marker(posicao, { icon: icone(el.dataset.classe), keyboard: false, interactive: false }).addTo(
    mapa,
  );
  reajustarAoRedimensionar(mapa, () => mapa.setView(posicao, 16, { animate: false }));
}

// ─── Comum ──────────────────────────────────────────────────────────────────

function criarMapa(elemento, opcoes = {}) {
  const mapa = L.map(elemento, opcoes).setView(PORTO_ALEGRE, 13);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATRIBUICAO }).addTo(mapa);
  return mapa;
}

// Se a área do mapa muda de tamanho (girar o celular, trocar Mapa/Lista, janela),
// o Leaflet precisa recalcular. Reenquadra só enquanto a pessoa não mexeu no mapa.
function reajustarAoRedimensionar(mapa, enquadrar) {
  let pessoaInteragiu = false;
  const container = mapa.getContainer();
  for (const evento of ['pointerdown', 'wheel', 'keydown']) {
    container.addEventListener(evento, () => (pessoaInteragiu = true), { once: true });
  }
  new ResizeObserver(() => {
    if (container.offsetWidth === 0) return; // escondido (modo lista no celular)
    mapa.invalidateSize();
    if (!pessoaInteragiu) enquadrar();
  }).observe(container);
  return () => (pessoaInteragiu = true);
}

function icone(classe) {
  return L.divIcon({
    className: `marcador ${classe}`,
    html: '<span class="marcador__pino" aria-hidden="true"></span>',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  });
}

// Monta o popup com DOM + textContent: nenhum dado do banco vira HTML.
function montarPopup(local) {
  const raiz = criar('div', 'popup');
  raiz.append(criar('p', `rotulo-categoria ${local.categoria.classe}`, local.categoria.nome));
  raiz.append(criar('h2', 'popup__titulo', local.nome));
  raiz.append(criar('p', 'popup__endereco', local.endereco));

  if (local.caracteristicas.length > 0) {
    const lista = criar('ul', 'etiquetas');
    for (const nome of local.caracteristicas) lista.append(criar('li', 'etiqueta', nome));
    raiz.append(lista);
  }

  const acoes = criar('p', 'popup__acoes');
  acoes.append(link(local.url, 'Ver detalhes'));
  acoes.append(link(local.comoChegar, 'Como chegar', true));
  raiz.append(acoes);
  return raiz;
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto) el.textContent = texto;
  return el;
}

function link(href, texto, externo = false) {
  const a = criar('a', null, texto);
  a.href = href;
  if (externo) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
