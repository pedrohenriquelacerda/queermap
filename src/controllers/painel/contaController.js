import * as adminsService from '../../services/adminsService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { gerarHash, verificarSenha, SENHA_MINIMO } from '../../utils/senha.js';
import { validar, z } from '../../utils/validacao.js';

const esquema = z
  .object({
    atual: z.string({ error: 'Informe a senha atual.' }).min(1, 'Informe a senha atual.'),
    nova: z
      .string({ error: 'Informe a nova senha.' })
      .min(SENHA_MINIMO, `Use pelo menos ${SENHA_MINIMO} caracteres.`)
      .max(200, 'Use no máximo 200 caracteres.'),
    confirmacao: z.string().optional(),
  })
  .refine((d) => d.nova === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem.',
  })
  .refine((d) => d.nova !== d.atual, {
    path: ['nova'],
    message: 'A nova senha precisa ser diferente da atual.',
  });

export function formulario(req, res) {
  renderizar(res, {});
}

export async function trocarSenha(req, res) {
  const { dados, erros } = validar(esquema, req.body);
  if (erros) return renderizar(res.status(400), { erros });

  const admin = await adminsService.buscarPorId(req.admin.id);
  if (!(await verificarSenha(dados.atual, admin.senhaHash))) {
    return renderizar(res.status(400), { erros: { atual: 'Senha atual incorreta.' } });
  }

  await adminsService.atualizar(admin.id, {
    senhaHash: await gerarHash(dados.nova),
    precisaTrocarSenha: false,
  });
  await auditoria.registrar(req, 'conta.trocar_senha', 'Admin', admin.id);
  req.flash('sucesso', 'Senha alterada.');
  res.redirect('/painel');
}

function renderizar(res, { erros = {} }) {
  res.render('painel/conta', { title: 'Minha conta', erros, minimo: SENHA_MINIMO });
}
