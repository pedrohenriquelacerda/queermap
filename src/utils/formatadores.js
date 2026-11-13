// Funções de apresentação usadas nas views (expostas em app.locals.fmt).

export function endereco(l) {
  const rua = [l.logradouro, l.numero].filter(Boolean).join(', ');
  const complemento = l.complemento ? ` – ${l.complemento}` : '';
  const bairro = l.bairro ? `, ${l.bairro}` : '';
  return `${rua}${complemento}${bairro} – ${l.cidade}/${l.uf}`;
}

export function linkTelefone(telefone) {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  return digitos ? `tel:${digitos}` : null;
}

// Número brasileiro: com DDD (10 ou 11 dígitos) ganha o 55 do país; já com o 55 (12 ou 13
// dígitos) fica como está. Olhar só o "começa com 55" erraria o DDD 55 (Santa Maria e região).
export function linkWhatsapp(whatsapp) {
  const digitos = String(whatsapp ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (digitos.length === 10 || digitos.length === 11) return `https://wa.me/55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return `https://wa.me/${digitos}`;
  }
  return null;
}

// Só aceita http(s): impede links "javascript:" cadastrados por engano ou má-fé.
export function urlSegura(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// Endereço do site para mostrar: sem "https://", "www." e barra final.
export function siteLegivel(url) {
  return String(url ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

export function linkComoChegar(l) {
  return `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${l.latitude},${l.longitude}`)}`;
}

const formatoData = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

export function data(valor) {
  return valor ? formatoData.format(new Date(valor)) : '';
}

// Para usar como classe CSS: só letras minúsculas, números e hífen.
export function classeSegura(texto) {
  return String(texto ?? '').replace(/[^a-z0-9-]/g, '');
}

export function classeCategoria(categoria) {
  return `marcador--${classeSegura(categoria.icone || categoria.slug)}`;
}

// Texto em minúsculas e sem acentos, para busca.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Texto em que a busca da lista procura: nome, endereço completo (com e sem abreviações
// comuns, para "av" achar "Avenida"), CEP, tipo de serviço e características.
export function textoBusca(l) {
  const endereco = [l.logradouro, l.numero, l.complemento, l.bairro, l.cidade, l.cep];
  const texto = normalizar(
    [l.nome, ...endereco, l.categoria.nome, ...l.caracteristicas.map((c) => c.nome)]
      .filter(Boolean)
      .join(' '),
  ).replace(/[^a-z0-9]+/g, ' ');
  const abreviado = texto.replace(
    /\b(avenida|rua|travessa|praca|estrada|largo)\b/g,
    (p) => ABREVIACOES[p],
  );
  const cepSemTraco = String(l.cep ?? '').replace(/\D/g, '');
  return [texto, abreviado !== texto ? abreviado : '', cepSemTraco].filter(Boolean).join(' ');
}

const ABREVIACOES = {
  avenida: 'av',
  rua: 'r',
  travessa: 'tv',
  praca: 'pc',
  estrada: 'estr',
  largo: 'lgo',
};

// JSON seguro para colocar dentro de <script type="application/json">.
export function jsonSeguro(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}
