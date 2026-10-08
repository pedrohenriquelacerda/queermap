import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

// HMAC com segredo do servidor: não dá para descobrir o e-mail a partir do hash,
// nem testar e-mails "na força bruta" sem o segredo.
export function hmac(valor) {
  return createHmac('sha256', env.hashSecret).update(valor).digest('hex');
}

export function hashEmail(email) {
  return hmac(`email:${email.trim().toLowerCase()}`);
}

export function marcaDaSenha(senhaHash) {
  return hmac(`sessao:${senhaHash}`);
}

export function hashCodigo(emailHash, codigo) {
  return hmac(`codigo:${emailHash}:${codigo}`);
}

export function mesmoHash(a, b) {
  const x = Buffer.from(a ?? '', 'hex');
  const y = Buffer.from(b ?? '', 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function gerarCodigo() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// "fulana@gmail.com" -> "fu•••@gmail.com" (para mostrar sem expor o endereço inteiro).
export function mascararEmail(email) {
  const [usuario, dominio] = email.split('@');
  return `${usuario.slice(0, 2)}•••@${dominio}`;
}
