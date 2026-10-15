import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sem SMTP configurado (desenvolvimento), o e-mail é só mostrado no terminal.
const transporte = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

// `via` permite trocar o transporte nos testes.
export async function enviarEmail({ para, assunto, texto }, { via = transporte } = {}) {
  if (!via) {
    console.info(`\n[e-mail de desenvolvimento]\nPara: ${para}\nAssunto: ${assunto}\n\n${texto}\n`);
    return;
  }
  try {
    await via.sendMail({ from: env.emailRemetente, to: para, subject: assunto, text: texto });
  } catch (err) {
    // O erro do nodemailer pode trazer o destinatário e o conteúdo (com o código).
    // No log fica só o tipo da falha: o e-mail de quem envia nunca é guardado.
    console.error('Falha ao enviar e-mail:', err.code ?? err.name ?? 'erro desconhecido');
    // Sem o erro original em `cause`: o errorHandler o imprimiria inteiro no log.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Falha ao enviar e-mail (${err.code ?? 'sem código'})`);
  }
}
