// TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s), compatível com Google Authenticator, Authy etc.
// Sem dependências: só o node:crypto.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from 'node:crypto';
import { env } from '../config/env.js';

const PASSO_S = 30;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)

export function gerarSegredo() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)
    .map((g) => ALFABETO[parseInt(g, 2)])
    .join('');
}

function decodificar(base32) {
  let bits = '';
  for (const c of base32) bits += ALFABETO.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

export function passoAtual(agora = Date.now()) {
  return Math.floor(agora / 1000 / PASSO_S);
}

export function codigoDoPasso(segredo, passo) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', decodificar(segredo)).update(contador).digest();
  const i = h[h.length - 1] & 0x0f;
  const n = (h.readUInt32BE(i) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

// Aceita o passo anterior e o seguinte (relógio do celular um pouco fora).
// Retorna o passo que bateu, ou null.
export function passoValido(segredo, codigo, agora = Date.now()) {
  if (!/^\d{6}$/.test(codigo)) return null;
  const atual = passoAtual(agora);
  for (const passo of [atual, atual - 1, atual + 1]) {
    if (codigoDoPasso(segredo, passo) === codigo) return passo;
  }
  return null;
}

export function urlOtpauth(segredo, email) {
  const conta = encodeURIComponent(`Mapa SerQueer:${email}`);
  return `otpauth://totp/${conta}?secret=${segredo}&issuer=${encodeURIComponent('Mapa SerQueer')}`;
}

// O segredo TOTP precisa ser recuperável, então fica cifrado (AES-256-GCM) no banco.
const chave = () => createHash('sha256').update(env.totpKey).digest();

export function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(armazenado) {
  const [iv, tag, dados] = armazenado.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

// Códigos de recuperação: 10 de uso único, guardados só como HMAC.
export function gerarCodigosRecuperacao(qtd = 10) {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const parte = () => Array.from({ length: 5 }, () => letras[randomInt(letras.length)]).join('');
  return Array.from({ length: qtd }, () => `${parte()}-${parte()}`);
}

export const normalizarCodigo = (texto) =>
  String(texto ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function hashCodigoRecuperacao(adminId, codigo) {
  return createHmac('sha256', env.hashSecret)
    .update(`recuperacao:${adminId}:${normalizarCodigo(codigo)}`)
    .digest('hex');
}
