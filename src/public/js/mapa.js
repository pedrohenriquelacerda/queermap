const PORTO_ALEGRE = [-30.0346, -51.2177];

const elemento = document.getElementById('mapa');

if (elemento) {
  const mapa = L.map(elemento).setView(PORTO_ALEGRE, 13);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  carregarLocais(mapa);
}

async function carregarLocais(mapa) {
  let locais;
  try {
    const resposta = await fetch('/api/locais', { headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    ({ locais } = await resposta.json());
  } catch (err) {
    console.error('Não foi possível carregar os locais:', err);
    avisar(mapa, 'Não foi possível carregar os locais. Tente recarregar a página.');
    return;
  }

  if (locais.length === 0) {
    avisar(mapa, 'Nenhum local cadastrado ainda.');
    return;
  }

  // Um grupo de marcadores por categoria, para a legenda poder ligar/desligar.
  const grupos = new Map();
  for (const local of locais) {
    const { slug } = local.categoria;
    if (!grupos.has(slug)) {
      grupos.set(slug, { categoria: local.categoria, camada: L.featureGroup().addTo(mapa) });
    }
    L.marker([local.latitude, local.longitude], {
      icon: iconeDaCategoria(local.categoria),
      title: local.nome,
      alt: `${local.nome} (${local.categoria.nome})`,
    })
      .bindPopup(() => montarPopup(local), { maxWidth: 300 })
      .addTo(grupos.get(slug).camada);
  }

  const todos = L.featureGroup([...grupos.values()].map((g) => g.camada));
  // Sem animação: em aba de fundo o navegador pausa animações e o zoom ficaria pela metade.
  const enquadrar = () =>
    mapa.fitBounds(todos.getBounds(), { padding: [40, 40], maxZoom: 15, animate: false });
  enquadrar();
  reajustarAoRedimensionar(mapa, enquadrar);

  adicionarLegenda(mapa, grupos);
}

// Se a área do mapa muda de tamanho (girar o celular, barra do navegador, janela),
// o Leaflet precisa recalcular. Reenquadra só enquanto a pessoa não mexeu no mapa.
function reajustarAoRedimensionar(mapa, enquadrar) {
  let pessoaInteragiu = false;
  const container = mapa.getContainer();
  for (const evento of ['pointerdown', 'wheel', 'keydown']) {
    container.addEventListener(evento, () => (pessoaInteragiu = true), { once: true });
  }

  new ResizeObserver(() => {
    mapa.invalidateSize();
    if (!pessoaInteragiu) enquadrar();
  }).observe(container);
}

// Só letras minúsculas, números e hífen viram classe CSS.
function classeSegura(texto) {
  return String(texto ?? '').replace(/[^a-z0-9-]/g, '');
}

function iconeDaCategoria(categoria) {
  const classe = classeSegura(categoria.icone || categoria.slug);
  return L.divIcon({
    className: `marcador marcador--${classe}`,
    html: '<span class="marcador__pino" aria-hidden="true"></span>',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  });
}

// Monta o popup com DOM + textContent: nenhum dado do banco vira HTML.
function montarPopup(local) {
  const classe = classeSegura(local.categoria.icone || local.categoria.slug);
  const raiz = criar('div', `popup marcador--${classe}`);

  raiz.append(criar('p', 'popup__categoria', local.categoria.nome));
  raiz.append(criar('h2', 'popup__titulo', local.nome));
  if (local.descricao) raiz.append(criar('p', 'popup__descricao', local.descricao));

  raiz.append(criar('p', 'popup__endereco', formatarEndereco(local)));
  if (local.horarioFuncionamento) {
    raiz.append(criar('p', 'popup__horario', local.horarioFuncionamento));
  }

  if (local.caracteristicas.length > 0) {
    const lista = criar('ul', 'etiquetas');
    for (const c of local.caracteristicas) lista.append(criar('li', 'etiqueta', c.nome));
    raiz.append(lista);
  }

  const contatos = criar('p', 'popup__contatos');
  const telefone = apenasDigitos(local.telefone);
  if (telefone) contatos.append(link(`tel:${telefone}`, local.telefone));
  const whatsapp = apenasDigitos(local.whatsapp);
  if (whatsapp) {
    const numero = whatsapp.startsWith('55') ? whatsapp : `55${whatsapp}`;
    contatos.append(link(`https://wa.me/${numero}`, 'WhatsApp', true));
  }
  if (local.email) contatos.append(link(`mailto:${local.email}`, local.email));
  if (urlSegura(local.site)) contatos.append(link(local.site, 'Site', true));
  const destino = `${local.latitude},${local.longitude}`;
  contatos.append(
    link(
      `https://www.openstreetmap.org/directions?to=${encodeURIComponent(destino)}`,
      'Como chegar',
      true,
    ),
  );
  raiz.append(contatos);

  return raiz;
}

function formatarEndereco(l) {
  const rua = [l.logradouro, l.numero].filter(Boolean).join(', ');
  const complemento = l.complemento ? ` – ${l.complemento}` : '';
  const bairro = l.bairro ? `, ${l.bairro}` : '';
  return `${rua}${complemento}${bairro} – ${l.cidade}/${l.uf}`;
}

function adicionarLegenda(mapa, grupos) {
  const legenda = L.control({ position: 'bottomleft' });
  legenda.onAdd = () => {
    // <details> para poder recolher; em telas pequenas começa fechada.
    const caixa = criar('details', 'legenda leaflet-bar');
    caixa.open = window.matchMedia('(min-width: 640px)').matches;
    caixa.append(criar('summary', 'legenda__titulo', 'Tipos de serviço'));
    for (const [slug, { categoria, camada }] of grupos) {
      const rotulo = criar('label', 'legenda__item');
      const caixaSelecao = document.createElement('input');
      caixaSelecao.type = 'checkbox';
      caixaSelecao.checked = true;
      caixaSelecao.name = 'categoria';
      caixaSelecao.value = slug;
      caixaSelecao.addEventListener('change', () => {
        if (caixaSelecao.checked) camada.addTo(mapa);
        else camada.remove();
      });
      const cor = criar('span', `legenda__cor marcador--${classeSegura(categoria.icone || slug)}`);
      cor.setAttribute('aria-hidden', 'true');
      rotulo.append(caixaSelecao, cor, document.createTextNode(categoria.nome));
      caixa.append(rotulo);
    }
    // Evita que cliques e rolagem na legenda movam o mapa.
    L.DomEvent.disableClickPropagation(caixa);
    L.DomEvent.disableScrollPropagation(caixa);
    return caixa;
  };
  legenda.addTo(mapa);
}

function avisar(mapa, mensagem) {
  const aviso = L.control({ position: 'topright' });
  aviso.onAdd = () => {
    const caixa = criar('div', 'aviso-mapa leaflet-bar', mensagem);
    caixa.setAttribute('role', 'status');
    return caixa;
  };
  aviso.addTo(mapa);
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

function apenasDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function urlSegura(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
