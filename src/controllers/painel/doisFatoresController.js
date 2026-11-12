// Segunda etapa do login: código de 6 dígitos do aplicativo autenticador (TOTP) ou um código
// de recuperação. Depois da senha a sessão fica "pendente" (sem adminId): só o código certo
// a transforma em sessão logada, então ninguém passa só com a senha.

import QRCode from 'qrcode';
import * as adminsService from '../../services/adminsService.js';
import * as auditoria from '../../services/auditoriaService.js';
import { destinoSeguro, iniciarSessaoAdmin } from '../../middlewares/auth.js';
import { marcaDaSenha } from '../../utils/hash.js';
import {
  cifrar,
  decifrar,
  gerarCodigosRecuperacao,
  gerarSegredo,
  hashCodigoRecuperacao,
  normalizarCodigo,
  passoValido,
  urlOtpauth,
} from '../../utils/totp.js';

const VALIDADE_PENDENTE_MS = 5 * 60 * 1000;
const VERIFICAR = '/painel/entrar/2fa';
const ATIVAR = '/painel/entrar/2fa/ativar';

// Chamado quando a senha está certa. Nova sessão a cada login: impede reaproveitar um cookie anterior.
export function iniciar(req, res, next, admin, volta) {
  req.session.regenerate((erro) => {
    if (erro) return next(erro);
    req.session.pendente = {
      adminId: admin.id,
      email: admin.email,
      marcaSenha: marcaDaSenha(admin.senhaHash),
      ate: Date.now() + VALIDADE_PENDENTE_MS,
      volta: destinoSeguro(volta),
    };
    res.redirect(admin.totpAtivadoEm ? VERIFICAR : ATIVAR);
  });
}

// A pessoa que passou da senha, ou null (e já redireciona para o login).
async function pendente(req, res) {
  const p = req.session.pendente;
  const admin = p && p.ate > Date.now() ? await adminsService.buscarPorId(p.adminId) : null;
  if (!admin?.ativo || marcaDaSenha(admin.senhaHash) !== p.marcaSenha) {
    delete req.session.pendente;
    res.redirect('/painel/entrar');
    return null;
  }
  return admin;
}

export async function formulario(req, res) {
  if (req.admin) return res.redirect('/painel');
  const admin = await pendente(req, res);
  if (!admin) return;
  if (!admin.totpAtivadoEm) return res.redirect(ATIVAR);
  res.render('painel/dois-fatores', { title: 'Código de verificação', erro: null });
}

export async function verificar(req, res, next) {
  const admin = await pendente(req, res);
  if (!admin) return;
  if (!admin.totpAtivadoEm) return res.redirect(ATIVAR);

  const codigo = normalizarCodigo(req.body?.codigo);
  let via = null;
  if (/^\d{6}$/.test(codigo)) {
    const passo = passoValido(decifrar(admin.totpSegredo), codigo);
    if (passo !== null && (await adminsService.usarPasso(admin.id, passo))) via = 'totp';
  } else if (codigo.length === 10) {
    const hash = hashCodigoRecuperacao(admin.id, codigo);
    if (await adminsService.usarCodigoRecuperacao(admin.id, hash)) via = 'recuperacao';
  }

  if (!via) {
    await auditoria.registrar({ admin }, 'sessao.falha_2fa', 'Admin', admin.id);
    return res.status(401).render('painel/dois-fatores', {
      title: 'Código de verificação',
      erro: 'Código incorreto. Use o código do aplicativo ou um código de recuperação.',
    });
  }
  concluir(req, res, next, admin, { via });
}

async function renderAtivar(res, admin, segredo, erro = null) {
  const qr = await QRCode.toString(urlOtpauth(segredo, admin.email), { type: 'svg', margin: 1 });
  res.render('painel/ativar-2fa', {
    title: 'Ativar a verificação em duas etapas',
    qr,
    segredo,
    erro,
  });
}

export async function ativarFormulario(req, res) {
  if (req.admin) return res.redirect('/painel');
  const admin = await pendente(req, res);
  if (!admin) return;
  if (admin.totpAtivadoEm) return res.redirect(VERIFICAR);
  req.session.pendente.segredo ??= gerarSegredo();
  await renderAtivar(res, admin, req.session.pendente.segredo);
}

export async function ativar(req, res, next) {
  const admin = await pendente(req, res);
  if (!admin) return;
  if (admin.totpAtivadoEm) return res.redirect(VERIFICAR);
  const segredo = req.session.pendente.segredo;
  if (!segredo) return res.redirect(ATIVAR);

  const passo = passoValido(segredo, normalizarCodigo(req.body?.codigo));
  if (passo === null) {
    await auditoria.registrar({ admin }, 'sessao.falha_2fa', 'Admin', admin.id);
    return renderAtivar(
      res.status(401),
      admin,
      segredo,
      'Código incorreto. Confira o aplicativo e tente de novo.',
    );
  }

  const codigos = gerarCodigosRecuperacao();
  await adminsService.ativarDoisFatores(
    admin.id,
    cifrar(segredo),
    passo,
    codigos.map((c) => hashCodigoRecuperacao(admin.id, c)),
  );
  await auditoria.registrar({ admin }, '2fa.ativar', 'Admin', admin.id);
  concluir(req, res, next, admin, { via: 'ativacao', codigos });
}

// Código certo: sessão nova, agora logada. Na ativação, mostra os códigos de recuperação (só uma vez).
function concluir(req, res, next, admin, { via, codigos }) {
  const volta = req.session.pendente.volta;
  req.session.regenerate(async (erro) => {
    try {
      if (erro) throw erro;
      iniciarSessaoAdmin(req, admin);
      req.admin = admin;
      await adminsService.atualizar(admin.id, { ultimoLoginEm: new Date() });
      await auditoria.registrar(req, 'sessao.entrar', 'Admin', admin.id, { via });
      const destino = admin.precisaTrocarSenha ? '/painel/conta' : volta;
      if (codigos) {
        return res.render('painel/codigos-recuperacao', {
          title: 'Guarde seus códigos de recuperação',
          codigos,
          destino,
        });
      }
      res.redirect(destino);
    } catch (err) {
      next(err);
    }
  });
}
