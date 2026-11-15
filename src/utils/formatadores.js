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

const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function dataHora(valor) {
  return valor ? formatoDataHora.format(new Date(valor)) : '';
}

// Histórico de ações: o código gravado na auditoria vira um texto para a equipe da ONG.
// Ação nova sem rótulo aparece com o próprio código (nunca some do histórico).
const ROTULOS_ACAO = {
  'sessao.entrar': 'Entrou no painel',
  'sessao.sair': 'Saiu do painel',
  'sessao.falha_2fa': 'Errou o código da verificação em duas etapas',
  '2fa.ativar': 'Ativou a verificação em duas etapas',
  'conta.trocar_senha': 'Trocou a própria senha',
  'admin.criar': 'Criou uma conta da equipe',
  'admin.atualizar': 'Editou uma conta da equipe',
  'admin.redefinir_senha': 'Redefiniu a senha de uma conta',
  'admin.redefinir_2fa': 'Redefiniu a verificação em duas etapas de uma conta',
  'local.criar': 'Cadastrou um local',
  'local.atualizar': 'Editou um local',
  'local.publicar': 'Publicou um local',
  'local.despublicar': 'Tirou um local do mapa',
  'local.arquivar': 'Arquivou um local',
  'local.restaurar': 'Restaurou um local arquivado',
  'local.apagar': 'Excluiu um local',
  'categoria.criar': 'Criou um tipo de serviço',
  'categoria.atualizar': 'Editou um tipo de serviço',
  'categoria.reordenar': 'Reordenou os tipos de serviço',
  'caracteristica.criar': 'Criou uma característica',
  'caracteristica.atualizar': 'Editou uma característica',
  'canal_denuncia.atualizar': 'Editou um canal de denúncia',
  'envio.ler': 'Abriu um envio pela primeira vez',
  'envio.situacao': 'Mudou a situação de um envio',
  'envio.anotar': 'Editou as anotações de um envio',
};

export function acaoAuditoria(codigo) {
  return ROTULOS_ACAO[codigo] ?? codigo;
}

const ROTULOS_ENTIDADE = {
  Admin: 'Conta',
  Local: 'Local',
  Envio: 'Envio',
  categoria: 'Tipo de serviço',
  caracteristica: 'Característica',
  CanalDenuncia: 'Canal de denúncia',
};

export function entidadeAuditoria(entidade) {
  return ROTULOS_ENTIDADE[entidade] ?? entidade;
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
