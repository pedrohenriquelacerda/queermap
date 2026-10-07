import { prisma } from '../../db/prisma.js';
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
  link: texto('o link', 500).refine((v) => urlSegura(v), 'Use um link http:// ou https:// válido.'),
  ordem: z.coerce.number().int().min(0).max(99).catch(0),
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
  const canais = await prisma.canalDenuncia.findMany({
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  });
  res.render('painel/canais-denuncia', { title: 'Canais de denúncia', canais });
}

export async function salvar(req, res, next) {
  const id = Number(req.params.id);
  const atual = await prisma.canalDenuncia.findUnique({ where: { id } });
  if (!atual) return next();

  const { dados, erros } = validar(esquema, req.body);
  if (erros) {
    req.flash('erro', `Não foi possível salvar “${atual.nome}”: ${Object.values(erros)[0]}`);
    return res.redirect('/painel/canais-denuncia');
  }

  const link = urlSegura(dados.link);
  if (!link) {
    req.flash(
      'erro',
      `Não foi possível salvar “${atual.nome}”: informe um link http:// ou https:// válido.`,
    );
    return res.redirect('/painel/canais-denuncia');
  }

  await prisma.canalDenuncia.update({
    where: { id },
    data: { ...dados, link },
  });
  await auditoria.registrar(req, 'canal_denuncia.atualizar', 'CanalDenuncia', id, {
    antes: dadosAuditoria(atual),
    depois: dadosAuditoria({ ...dados, link }),
  });
  req.flash('sucesso', `“${dados.nome}” salvo.`);
  res.redirect('/painel/canais-denuncia');
}
