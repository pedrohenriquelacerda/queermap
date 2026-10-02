// Mapa SerQueer · mapa da página inicial (com busca/filtros) e mapa da página do local.
// Os dados e a lista vêm prontos do servidor; aqui só filtramos e desenhamos marcadores.

const PORTO_ALEGRE = [-30.0346, -51.2177];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const celular = window.matchMedia('(max-width: 47.99rem)');

// Localização de quem usa o mapa
const GRANDE_POA = [
  [-30.45, -51.6],
  [-29.55, -50.7],
];
const ZOOM_PESSOA = 15;
const ICONE_LOCALIZAR =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
const AVISOS = {
  semSuporte: 'Seu navegador não informa a localização. Digite seu endereço, bairro ou cidade:',
  negada:
    'Sem acesso à sua localização. Digite seu endereço, bairro ou cidade para ver os locais perto de você:',
  bloqueada:
    'A localização está bloqueada para este site. Para liberar, toque no cadeado ao lado do endereço do site. Ou digite seu endereço:',
  indisponivel:
    'Não foi possível descobrir sua localização agora. Digite seu endereço, bairro ou cidade:',
  foraDaRegiao:
    'Você está fora da região de Porto Alegre, então o mapa mostra todos os locais. Para ver os locais perto de um endereço, digite abaixo:',
};

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

  // Depois que o mapa centraliza na pessoa, é essa a visão que volta ao redimensionar.
  let centroPessoa = null;
  const visaoInicial = () => (centroPessoa ? centralizar(mapa, centroPessoa) : enquadrar());
  const { marcarInteracao, interagiu } = reajustarAoRedimensionar(mapa, visaoInicial);
  configurarLocalizacao(mapa, {
    interagiu,
    aoCentralizar: (posicao) => (centroPessoa = posicao),
  });

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
  const avisosVazio = document.querySelectorAll('[data-aviso-vazio]');
  const limpar = document.getElementById('limpar');
  const atalhos = document.querySelectorAll('[data-atalho-tipo]');
  const caixaDoTipo = (slug) => form.querySelector(`input[name=tipo][value="${slug}"]`);

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
    const mensagem = mensagemVazio({ termos, tipos, caracteristicas });
    for (const aviso of avisosVazio) {
      aviso.textContent = mensagem;
      aviso.hidden = visiveis > 0;
    }
    for (const atalho of atalhos) {
      atalho.setAttribute('aria-pressed', String(tipos.includes(atalho.dataset.atalhoTipo)));
    }
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
  // Atalhos sobre o mapa (celular): marcam/desmarcam a caixa correspondente do filtro.
  for (const atalho of atalhos) {
    atalho.addEventListener('click', () => {
      const caixa = caixaDoTipo(atalho.dataset.atalhoTipo);
      caixa.checked = !caixa.checked;
      aplicar();
    });
  }
  const barraAtalhos = document.getElementById('atalhos-tipo');
  if (barraAtalhos) {
    barraAtalhos.hidden = false; // só funcionam com JavaScript
    faixaRolavel(barraAtalhos.querySelector('.atalhos-tipo__botoes'));
  }

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

function faixaRolavel(faixa) {
  const atualizarFim = () =>
    faixa.toggleAttribute(
      'data-no-fim',
      faixa.scrollLeft + faixa.clientWidth >= faixa.scrollWidth - 2,
    );
  faixa.addEventListener('scroll', atualizarFim, { passive: true });
  new ResizeObserver(atualizarFim).observe(faixa);

  faixa.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      faixa.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );

  let inicio = null;
  let arrastou = false;
  faixa.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    inicio = { x: e.clientX, scroll: faixa.scrollLeft };
    arrastou = false;
  });
  faixa.addEventListener('pointermove', (e) => {
    if (!inicio) return;
    const dx = e.clientX - inicio.x;
    if (!arrastou && Math.abs(dx) < 5) return; // ainda é um clique
    if (!arrastou) {
      arrastou = true;
      faixa.setPointerCapture(e.pointerId);
      faixa.toggleAttribute('data-arrastando', true);
    }
    faixa.scrollLeft = inicio.scroll - dx;
  });
  const soltar = () => {
    inicio = null;
    faixa.removeAttribute('data-arrastando');
  };
  faixa.addEventListener('pointerup', soltar);
  faixa.addEventListener('pointercancel', soltar);
  faixa.addEventListener(
    'click',
    (e) => {
      if (!arrastou) return;
      arrastou = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

// Quando só o tipo de serviço está filtrando, a mensagem fala da categoria.
function mensagemVazio({ termos, tipos, caracteristicas }) {
  if (tipos.length > 0 && termos.length === 0 && caracteristicas.length === 0) {
    return tipos.length === 1
      ? 'Nenhum local encontrado para esta categoria.'
      : 'Nenhum local encontrado para estas categorias.';
  }
  return 'Nenhum local encontrado com esses filtros.';
}

// Pode haver mais de um contador por filtro (lateral e menu do celular).
function atualizarContador(nome, quantidade) {
  for (const el of document.querySelectorAll(`[data-contador="${nome}"]`)) {
    el.textContent = quantidade > 0 ? `(${quantidade})` : '';
  }
}

function atualizarUrl(q, tipos, caracteristicas) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  for (const t of tipos) params.append('tipo', t);
  for (const c of caracteristicas) params.append('car', c);
  const busca = params.toString();
  history.replaceState(null, '', busca ? `?${busca}` : location.pathname);
}

// ─── Localização de quem usa o mapa ─────────────────────────────────────────
// A posição do GPS fica só no navegador: nunca é enviada ao servidor. Só o endereço
// digitado (quando a pessoa não libera o GPS) passa pelo servidor, a caminho do Nominatim.

function configurarLocalizacao(mapa, { interagiu, aoCentralizar }) {
  const regiao = L.latLngBounds(GRANDE_POA);
  const painel = configurarPainelEndereco(mapa, (posicao) => {
    mostrarPessoa(posicao, 'Endereço informado');
    irPara(posicao);
  });
  let marcador = null;
  let precisao = null;
  let ultimaPosicao = null;

  const irPara = (posicao) => {
    ultimaPosicao = posicao;
    aoCentralizar(posicao);
    centralizar(mapa, posicao);
  };

  function mostrarPessoa(posicao, rotulo, raio) {
    marcador?.remove();
    precisao?.remove();
    // Círculo de precisão só quando ajuda (com Wi-Fi/rede ele pode ter quilômetros).
    if (raio && raio < 2000) {
      precisao = L.circle(posicao, {
        radius: raio,
        className: 'precisao-pessoa',
        interactive: false,
      }).addTo(mapa);
    }
    marcador = L.marker(posicao, {
      icon: L.divIcon({
        className: 'marcador-pessoa',
        html: '<span class="marcador-pessoa__ponto" aria-hidden="true"></span>',
        iconSize: [22, 22],
      }),
      title: rotulo,
      alt: rotulo,
      keyboard: false,
      zIndexOffset: 1000,
    })
      .bindTooltip(rotulo)
      .addTo(mapa);
  }

  // automatico = pedido ao abrir o mapa; senão, a pessoa clicou no botão.
  function localizar({ automatico }) {
    if (!('geolocation' in navigator)) return painel.abrir(AVISOS.semSuporte);
    botao.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        botao.removeAttribute('aria-busy');
        const posicao = L.latLng(coords.latitude, coords.longitude);
        mostrarPessoa(posicao, 'Você está aqui', coords.accuracy);
        if (!automatico) {
          painel.fechar();
          return irPara(posicao);
        }
        if (!regiao.contains(posicao)) return painel.abrir(AVISOS.foraDaRegiao);
        if (!interagiu()) irPara(posicao);
      },
      (erro) => {
        botao.removeAttribute('aria-busy');
        if (erro.code !== erro.PERMISSION_DENIED) return painel.abrir(AVISOS.indisponivel);
        // Recusada antes: o navegador não pergunta de novo, só a pessoa pode liberar.
        if (!automatico && ultimaPosicao) centralizar(mapa, ultimaPosicao);
        painel.abrir(automatico ? AVISOS.negada : AVISOS.bloqueada);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  const botao = criar('button', 'localizar__botao');
  botao.type = 'button';
  botao.title = 'Centralizar na minha localização';
  botao.setAttribute('aria-label', botao.title);
  botao.innerHTML = ICONE_LOCALIZAR;
  botao.addEventListener('click', () => localizar({ automatico: false }));
  const barra = criar('div', 'leaflet-bar localizar');
  barra.append(botao);
  adicionarControle(mapa, barra, 'topleft');

  localizar({ automatico: true });
}

// Campo para digitar o endereço, sobre o mapa. aoEscolher recebe um L.LatLng.
function configurarPainelEndereco(mapa, aoEscolher) {
  const painel = document.getElementById('painel-localizacao');
  const aviso = painel.querySelector('.painel-localizacao__aviso');
  const form = painel.querySelector('form');
  const campo = form.elements.q;
  const enviar = form.querySelector('[type=submit]');
  const opcoes = painel.querySelector('.painel-localizacao__opcoes');
  adicionarControle(mapa, painel, 'topright');

  const abrir = (texto) => {
    aviso.textContent = texto;
    opcoes.replaceChildren();
    painel.hidden = false;
  };
  const fechar = () => (painel.hidden = true);
  const escolher = (resultado) => {
    aoEscolher(L.latLng(resultado));
    fechar();
  };

  painel.querySelector('.painel-localizacao__fechar').addEventListener('click', fechar);
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    enviar.disabled = true;
    aviso.textContent = 'Buscando…';
    opcoes.replaceChildren();
    try {
      const resposta = await fetch(`/buscar-endereco?q=${encodeURIComponent(campo.value)}`, {
        headers: { Accept: 'application/json' },
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        aviso.textContent = dados.erro ?? 'Não foi possível buscar.';
      } else if (dados.resultados.length === 0) {
        aviso.textContent =
          'Não encontramos esse endereço no Rio Grande do Sul. Tente incluir o bairro ou a cidade.';
      } else if (dados.resultados.length === 1) {
        escolher(dados.resultados[0]);
      } else {
        aviso.textContent = 'Escolha o endereço certo:';
        mostrarOpcoes(dados.resultados);
      }
    } catch {
      aviso.textContent = 'Não foi possível buscar agora. Tente de novo em instantes.';
    } finally {
      enviar.disabled = false;
    }
  });

  function mostrarOpcoes(resultados) {
    const lista = criar('ul');
    for (const resultado of resultados) {
      const opcao = criar('button', 'painel-localizacao__opcao', resultado.descricao);
      opcao.type = 'button';
      opcao.addEventListener('click', () => escolher(resultado));
      const item = criar('li');
      item.append(opcao);
      lista.append(item);
    }
    opcoes.replaceChildren(lista);
  }

  return { abrir, fechar };
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

function centralizar(mapa, posicao) {
  mapa.setView(posicao, Math.max(mapa.getZoom(), ZOOM_PESSOA), { animate: false });
}

// Coloca um elemento nosso como controle do Leaflet, sem que cliques e rolagem
// dentro dele mexam no mapa.
function adicionarControle(mapa, elemento, position) {
  const controle = L.control({ position });
  controle.onAdd = () => {
    L.DomEvent.disableClickPropagation(elemento);
    L.DomEvent.disableScrollPropagation(elemento);
    return elemento;
  };
  controle.addTo(mapa);
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
  return {
    marcarInteracao: () => (pessoaInteragiu = true),
    interagiu: () => pessoaInteragiu,
  };
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
