import { idValido } from '../../utils/ids.js';
import * as envios from '../../services/enviosPainelService.js';
import * as service from '../../services/locaisPainelService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { buscarEndereco } from '../../services/geocodificacaoService.js';
import { urlSegura } from '../../utils/formatadores.js';
import { validar, texto, textoOpcional as opcional, z } from '../../utils/validacao.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

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
    .positive('Escolha o tipo de serviço.')
    .max(2147483647, 'Escolha um tipo de serviço válido.'),
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
    .transform((v) => [v ?? []].flat().map(Number))
    .pipe(z.array(z.number().int().positive().max(2147483647))),
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
  let local = { cidade: 'Porto Alegre', uf: 'RS', caracteristicas: [] };
  if (req.query.envio !== undefined) {
    const sugestao = await buscarSugestao(req.query.envio);
    if (!sugestao) return res.status(404).send('Sugestão não encontrada.');
    // Preenche contatos reconhecíveis; preserva o texto original para revisão.
    // A ONG confere endereço e coordenadas antes de salvar o rascunho.
    local = {
      ...local,
      nome: sugestao.nomeLocalSugerido,
      categoriaId: sugestao.categoriaSugeridaId,
      logradouro: sugestao.enderecoLocalSugerido,
    };
    const contato = sugestao.contatoLocalSugerido?.trim() || '';
    if (z.email().safeParse(contato).success) local.email = contato;
    else if (urlSegura(contato)) local.site = contato;
    else if (/^[+()\d\s.-]{8,30}$/.test(contato)) local.telefone = contato;
    return renderizarFormulario(res, { local, sugestao });
  }
  await renderizarFormulario(res, { local });
}

export async function criar(req, res) {
  // Só o identificador vem do formulário; o contexto original é relido do banco.
  const temSugestao = req.body.envioId !== undefined;
  const sugestao = temSugestao ? await buscarSugestao(req.body.envioId) : null;
  if (temSugestao && !sugestao) return res.status(404).send('Sugestão não encontrada.');

  const { dados, erros } = validar(esquema, req.body);
  if (erros) {
    return renderizarFormulario(res.status(400), {
      local: corpoParaLocal(req.body),
      erros,
      sugestao,
    });
  }

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

  try {
    await service.atualizar(id, dados, req, atual.atualizadoEm?.toISOString());
  } catch (err) {
    return tratarConcorrencia(err, id, next);
  }
  req.flash('sucesso', 'Alterações salvas.');
  res.redirect(`/painel/locais/${id}`);
}

export async function mudarSituacao(req, res, next) {
  const id = Number(req.params.id);
  const acao = req.params.acao;
  if (!service.ACOES_PERMITIDAS.includes(acao)) return next();
  const local = await service.buscar(id);
  if (!local) return next();

  try {
    await service.mudarSituacao(id, acao, req, local.atualizadoEm?.toISOString());
  } catch (err) {
    return tratarConcorrencia(err, id, next);
  }
  req.flash('sucesso', `“${local.nome}” ${ROTULOS_ACAO[acao]}.`);
  res.redirect(`/painel/locais/${id}`);
}

function assinaturaExclusao(req, local) {
  return createHmac('sha256', env.hashSecret)
    .update(
      JSON.stringify(['excluir-local', req.sessionID, local.id, local.atualizadoEm.toISOString()]),
    )
    .digest('hex');
}

export async function confirmarExclusao(req, res, next) {
  const local = await service.buscar(Number(req.params.id));
  if (!local) return next();
  if (!local.arquivadoEm || local.publicado) {
    return res.status(409).render('erro', {
      title: 'Exclusão indisponível',
      status: 409,
      mensagem: 'Apenas locais arquivados podem ser excluídos definitivamente.',
    });
  }
  res.render('painel/locais/excluir', {
    title: 'Excluir local definitivamente',
    local,
    token: assinaturaExclusao(req, local),
  });
}

export async function apagar(req, res, next) {
  const local = await service.buscar(Number(req.params.id));
  if (!local) return next();
  const token = req.body?.token;
  if (
    req.body?.confirmacao !== 'excluir' ||
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(assinaturaExclusao(req, local)))
  ) {
    throw Object.assign(new Error('Confirme a exclusão na página do local.'), { status: 400 });
  }
  await service.apagar(local.id, local.atualizadoEm.toISOString(), req);
  req.flash('sucesso', 'Local excluído definitivamente. Os relatos foram preservados.');
  res.redirect('/painel/locais?situacao=arquivado');
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

async function buscarSugestao(valor) {
  if (!idValido(valor)) return null;
  const envio = await envios.buscar(Number(valor));
  return envio?.tipo === 'SUGESTAO_LOCAL' ? envio : null;
}

async function renderizarFormulario(res, { local, erros = {}, sugestao = null }) {
  const opcoes = await service.opcoesFormulario();
  const editando = Boolean(local.id);
  res.render('painel/locais/form', {
    title: editando ? local.nome : 'Novo local',
    usaLeaflet: true,
    scripts: ['/js/painel-local.js'],
    local,
    sugestao,
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

async function tratarConcorrencia(err, id, next) {
  if (err.code !== 'P2025') throw err;
  if (!(await service.buscar(id))) return next();
  throw Object.assign(new Error('O local ou seus vínculos mudaram. Recarregue a página.'), {
    status: 409,
  });
}
