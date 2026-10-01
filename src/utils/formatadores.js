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

export function linkWhatsapp(whatsapp) {
  const digitos = String(whatsapp ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  return `https://wa.me/${digitos.startsWith('55') ? digitos : `55${digitos}`}`;
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

// JSON seguro para colocar dentro de <script type="application/json">.
export function jsonSeguro(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}
