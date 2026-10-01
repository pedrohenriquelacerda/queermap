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

export async function enviarEmail({ para, assunto, texto }) {
  if (!transporte) {
    console.info(`\n[e-mail de desenvolvimento]\nPara: ${para}\nAssunto: ${assunto}\n\n${texto}\n`);
    return;
  }
  await transporte.sendMail({ from: env.emailRemetente, to: para, subject: assunto, text: texto });
}
