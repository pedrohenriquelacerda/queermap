import * as adminsService from '../../services/adminsService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { gerarHash, gerarSenhaProvisoria } from '../../utils/senha.js';
import { validar, texto, email, caixa, z } from '../../utils/validacao.js';

const papel = z.enum(['ADMIN', 'EDITOR'], { error: 'Escolha um papel.' });
const esquemaNova = z.object({ nome: texto('o nome', 120), email: email(), papel });
const esquemaEdicao = z.object({ nome: texto('o nome', 120), papel, ativo: caixa() });

export async function listar(req, res) {
  const pessoas = await adminsService.listar();
  res.render('painel/pessoas/lista', { title: 'Pessoas', pessoas });
}

export function nova(req, res) {
  renderizarFormulario(res, { pessoa: { papel: 'EDITOR' } });
}

export async function criar(req, res) {
  const { dados, erros } = validar(esquemaNova, req.body);
  if (erros) return renderizarFormulario(res.status(400), { pessoa: req.body, erros });

  if (await adminsService.buscarPorEmail(dados.email)) {
    return renderizarFormulario(res.status(400), {
      pessoa: req.body,
      erros: { email: 'Já existe uma pessoa com este e-mail.' },
    });
  }

  const senha = gerarSenhaProvisoria();
  const pessoa = await adminsService.criar({
    ...dados,
    senhaHash: await gerarHash(senha),
    precisaTrocarSenha: true,
  });
  await auditoria.registrar(req, 'admin.criar', 'Admin', pessoa.id, {
    email: pessoa.email,
    papel: pessoa.papel,
  });
  mostrarSenha(res, pessoa, senha, 'Pessoa cadastrada');
}

export async function editar(req, res, next) {
  const pessoa = await adminsService.buscarParaSessao(Number(req.params.id));
  if (!pessoa) return next();
  renderizarFormulario(res, { pessoa });
}

export async function salvar(req, res, next) {
  const id = Number(req.params.id);
  const pessoa = await adminsService.buscarParaSessao(id);
  if (!pessoa) return next();

  const { dados, erros } = validar(esquemaEdicao, req.body);
  if (erros)
    return renderizarFormulario(res.status(400), { pessoa: { ...pessoa, ...req.body }, erros });

  const perdeAdmin = pessoa.papel === 'ADMIN' && (dados.papel !== 'ADMIN' || !dados.ativo);
  if (perdeAdmin && id === req.admin.id) {
    return renderizarFormulario(res.status(400), {
      pessoa: { ...pessoa, ...dados },
      erroGeral: 'Você não pode tirar o seu próprio acesso de administração.',
    });
  }
  if (perdeAdmin && (await adminsService.contarOutrosAdminsAtivos(id)) === 0) {
    return renderizarFormulario(res.status(400), {
      pessoa: { ...pessoa, ...dados },
      erroGeral: 'O painel precisa ter pelo menos uma pessoa administradora ativa.',
    });
  }

  await adminsService.atualizar(id, dados);
  await auditoria.registrar(req, 'admin.atualizar', 'Admin', id, {
    antes: { nome: pessoa.nome, papel: pessoa.papel, ativo: pessoa.ativo },
    depois: dados,
  });
  req.flash('sucesso', `Dados de ${dados.nome} salvos.`);
  res.redirect('/painel/pessoas');
}

export async function redefinirSenha(req, res, next) {
  const id = Number(req.params.id);
  const pessoa = await adminsService.buscarParaSessao(id);
  if (!pessoa) return next();

  const senha = gerarSenhaProvisoria();
  await adminsService.atualizar(id, {
    senhaHash: await gerarHash(senha),
    precisaTrocarSenha: true,
  });
  await auditoria.registrar(req, 'admin.redefinir_senha', 'Admin', id);
  mostrarSenha(res, pessoa, senha, 'Senha redefinida');
}

// A senha provisória aparece uma única vez; não fica salva em lugar nenhum.
function mostrarSenha(res, pessoa, senha, titulo) {
  res.set('Cache-Control', 'no-store');
  res.render('painel/pessoas/senha', { title: titulo, pessoa, senha });
}

function renderizarFormulario(res, { pessoa, erros = {}, erroGeral = null }) {
  const editando = Boolean(pessoa.id);
  res.render('painel/pessoas/form', {
    title: editando ? `Editar ${pessoa.nome}` : 'Nova pessoa',
    pessoa,
    editando,
    erros,
    erroGeral,
  });
}
