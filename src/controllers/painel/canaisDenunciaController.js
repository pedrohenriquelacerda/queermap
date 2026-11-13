import * as canaisDenuncia from '../../services/canaisDenunciaService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { urlSegura } from '../../utils/formatadores.js';
import { validar, texto, textoOpcional, caixa, z } from '../../utils/validacao.js';

const esquema = z.object({
  nome: texto('o nome', 120),
  descricao: texto('a descrição', 500),
  telefone: texto('o telefone', 40).refine(
    (v) => (v.match(/\d/g) ?? []).length >= 3,
    'Informe um telefone válido.',
  ),
  link: texto('o link', 500)
    .transform((v) => urlSegura(v))
    .refine(Boolean, 'Use um link http:// ou https:// válido.'),
  // Onde o canal atende: ajuda quando o mapa chegar a outros municípios.
  abrangencia: textoOpcional(80),
  ordem: z.coerce
    .number({ error: 'Use um número de 0 a 99.' })
    .int('Use um número de 0 a 99.')
    .min(0, 'Use um número de 0 a 99.')
    .max(99, 'Use um número de 0 a 99.'),
  ativo: caixa(),
});

const dadosAuditoria = ({ nome, descricao, telefone, link, abrangencia, ordem, ativo }) => ({
  nome,
  descricao,
  telefone,
  link,
  abrangencia: abrangencia ?? null,
  ordem,
  ativo,
});

export async function listar(req, res) {
  renderizar(res, await canaisDenuncia.listarTodos());
}

export async function salvar(req, res, next) {
  const id = Number(req.params.id);
  const atual = await canaisDenuncia.buscar(id);
  if (!atual) return next();

  const { dados, erros } = validar(esquema, req.body);
  if (erros) {
    return renderizar(res.status(400), await canaisDenuncia.listarTodos(), {
      emEdicao: { id, valores: { ...req.body, ativo: req.body.ativo === 'on' }, erros },
    });
  }

  await canaisDenuncia.atualizar(id, dados);
  await auditoria.registrar(req, 'canal_denuncia.atualizar', 'CanalDenuncia', id, {
    antes: dadosAuditoria(atual),
    depois: dadosAuditoria(dados),
  });
  req.flash('sucesso', `“${dados.nome}” salvo.`);
  res.redirect('/painel/canais-denuncia');
}

// Novo canal (ex.: o 156 de outro município quando o mapa se expandir).
export async function criar(req, res) {
  const { dados, erros } = validar(esquema, req.body);
  if (erros) {
    return renderizar(res.status(400), await canaisDenuncia.listarTodos(), {
      novo: { valores: { ...req.body, ativo: req.body.ativo === 'on' }, erros },
    });
  }

  const canal = await canaisDenuncia.criar(dados);
  await auditoria.registrar(req, 'canal_denuncia.criar', 'CanalDenuncia', canal.id, {
    depois: dadosAuditoria(dados),
  });
  req.flash('sucesso', `“${dados.nome}” adicionado.`);
  res.redirect('/painel/canais-denuncia');
}

function renderizar(res, canais, { emEdicao = null, novo = null } = {}) {
  const proximaOrdem = Math.min(99, Math.max(0, ...canais.map((c) => c.ordem)) + 1);
  res.render('painel/canais-denuncia', {
    title: 'Canais de denúncia',
    canais,
    emEdicao,
    novo: novo ?? { valores: { ordem: proximaOrdem, ativo: true }, erros: {} },
    novoComErro: Boolean(novo),
  });
}
