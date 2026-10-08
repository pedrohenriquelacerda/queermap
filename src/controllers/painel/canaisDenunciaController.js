import * as canaisDenuncia from '../../services/canaisDenunciaService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { urlSegura } from '../../utils/formatadores.js';
import { validar, texto, caixa, z } from '../../utils/validacao.js';

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
  ordem: z.coerce
    .number({ error: 'Use um número de 0 a 99.' })
    .int('Use um número de 0 a 99.')
    .min(0, 'Use um número de 0 a 99.')
    .max(99, 'Use um número de 0 a 99.'),
  ativo: caixa(),
});

const dadosAuditoria = ({ nome, descricao, telefone, link, ordem, ativo }) => ({
  nome,
  descricao,
  telefone,
  link,
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

function renderizar(res, canais, { emEdicao = null } = {}) {
  res.render('painel/canais-denuncia', { title: 'Canais de denúncia', canais, emEdicao });
}
