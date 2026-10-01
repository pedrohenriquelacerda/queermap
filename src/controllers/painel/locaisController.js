import * as service from '../../services/locaisPainelService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { buscarEndereco } from '../../services/geocodificacaoService.js';
import { urlSegura } from '../../utils/formatadores.js';
import { validar, texto, textoOpcional as opcional, z } from '../../utils/validacao.js';

// Limites aproximados do Rio Grande do Sul, para pegar coordenadas trocadas ou vazias.
const coordenada = (min, max) =>
  z.coerce
    .number({ error: 'Posicione o local no mapa.' })
    .refine((v) => v >= min && v <= max, 'Posicione o local no mapa (dentro do RS).');

const esquema = z.object({
  nome: texto('o nome', 150),
  categoriaId: z.coerce
    .number({ error: 'Escolha o tipo de serviço.' })
    .int()
    .positive('Escolha o tipo de serviço.'),
  descricao: opcional(1000),
  logradouro: texto('a rua ou avenida', 200),
  numero: opcional(20),
  complemento: opcional(100),
  bairro: opcional(100),
  cidade: texto('a cidade', 100),
  uf: z.string().trim().toUpperCase().length(2, 'Use a sigla do estado (ex.: RS).'),
  cep: opcional(9).refine((v) => !v || /^\d{5}-?\d{3}$/.test(v), 'CEP inválido (ex.: 90000-000).'),
  latitude: coordenada(-33.8, -27),
  longitude: coordenada(-57.7, -49.6),
  telefone: opcional(30),
  whatsapp: opcional(30),
  email: opcional(200).refine(
    (v) => !v || z.email().safeParse(v).success,
    'Informe um e-mail válido.',
  ),
  site: opcional(300).refine((v) => !v || urlSegura(v), 'Use um endereço que comece com https://'),
  horarioFuncionamento: opcional(300),
  caracteristicas: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => [v ?? []].flat().map(Number).filter(Number.isInteger)),
});

const ROTULOS_ACAO = {
  publicar: 'publicado',
  despublicar: 'voltou para rascunho',
  arquivar: 'arquivado',
  restaurar: 'restaurado (como rascunho)',
};

export async function listar(req, res) {
  const filtro = service.SITUACOES[req.query.situacao] ? req.query.situacao : 'ativos';
  const busca = String(req.query.q ?? '')
    .trim()
    .slice(0, 100);
  const [locais, contagens] = await Promise.all([
    service.listar({ situacao: filtro, busca }),
    service.contarPorSituacao(),
  ]);
  res.render('painel/locais/lista', {
    title: 'Locais',
    locais: locais.map((l) => ({ ...l, situacao: service.situacao(l) })),
    contagens,
    filtro,
    busca,
  });
}

export async function novo(req, res) {
  await renderizarFormulario(res, {
    local: { cidade: 'Porto Alegre', uf: 'RS', caracteristicas: [] },
  });
}

export async function criar(req, res) {
  const { dados, erros } = validar(esquema, req.body);
  if (erros)
    return renderizarFormulario(res.status(400), { local: corpoParaLocal(req.body), erros });

  const local = await service.criar(dados, req.admin.id);
  await auditoria.registrar(req, 'local.criar', 'Local', local.id, { nome: local.nome });
  req.flash(
    'sucesso',
    `“${local.nome}” salvo como rascunho. Revise e publique quando estiver pronto.`,
  );
  res.redirect(`/painel/locais/${local.id}`);
}

export async function editar(req, res, next) {
  const local = await service.buscar(Number(req.params.id));
  if (!local) return next();
  await renderizarFormulario(res, {
    local: { ...local, caracteristicas: local.caracteristicas.map((c) => c.id) },
  });
}

export async function salvar(req, res, next) {
  const id = Number(req.params.id);
  const atual = await service.buscar(id);
  if (!atual) return next();

  const { dados, erros } = validar(esquema, req.body);
  if (erros) {
    return renderizarFormulario(res.status(400), {
      local: { ...atual, ...corpoParaLocal(req.body) },
      erros,
    });
  }

  await service.atualizar(id, dados, req.admin.id);
  await auditoria.registrar(req, 'local.atualizar', 'Local', id, {
    alterados: camposAlterados(atual, dados),
  });
  req.flash('sucesso', 'Alterações salvas.');
  res.redirect(`/painel/locais/${id}`);
}

export async function mudarSituacao(req, res, next) {
  const id = Number(req.params.id);
  const acao = req.params.acao;
  const local = await service.buscar(id);
  if (!local || !service.ACOES[acao]) return next();

  await service.mudarSituacao(id, acao, req.admin.id);
  await auditoria.registrar(req, `local.${acao}`, 'Local', id, { nome: local.nome });
  req.flash('sucesso', `“${local.nome}” ${ROTULOS_ACAO[acao]}.`);
  res.redirect(`/painel/locais/${id}`);
}

export async function geocodificar(req, res) {
  const consulta = String(req.query.q ?? '')
    .trim()
    .slice(0, 300);
  if (consulta.length < 3) return res.status(400).json({ erro: 'Digite o endereço.' });
  try {
    res.json({ resultados: await buscarEndereco(consulta) });
  } catch (err) {
    console.error('Busca de endereço falhou:', err.message);
    res.status(502).json({ erro: 'A busca de endereço não respondeu. Posicione o pino no mapa.' });
  }
}

async function renderizarFormulario(res, { local, erros = {} }) {
  const opcoes = await service.opcoesFormulario();
  const editando = Boolean(local.id);
  res.render('painel/locais/form', {
    title: editando ? local.nome : 'Novo local',
    usaLeaflet: true,
    scripts: ['/js/painel-local.js'],
    local,
    editando,
    situacao: editando ? service.situacao(local) : 'rascunho',
    erros,
    ...opcoes,
  });
}

// Corpo do formulário de volta para o formato do local (para reexibir com os erros).
function corpoParaLocal(corpo) {
  const caracteristicas = [corpo.caracteristicas ?? []].flat().map(Number);
  return { ...corpo, categoriaId: Number(corpo.categoriaId) || null, caracteristicas };
}

function camposAlterados(antes, depois) {
  const ids = antes.caracteristicas
    .map((c) => c.id)
    .sort()
    .join(',');
  return Object.keys(depois).filter((campo) =>
    campo === 'caracteristicas'
      ? [...depois.caracteristicas].sort().join(',') !== ids
      : String(antes[campo] ?? '') !== String(depois[campo] ?? ''),
  );
}
