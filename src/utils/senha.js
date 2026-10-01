// Hash de senha com scrypt (nativo do Node, sem dependências).
// Formato salvo: scrypt$N$r$p$sal$hash (sal e hash em base64).

import { scrypt, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAMANHO_HASH = 64;

export const SENHA_MINIMO = 10;

export async function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha.normalize('NFKC'), sal, TAMANHO_HASH, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarSenha(senha, armazenado) {
  const [algoritmo, N, r, p, sal, hash] = String(armazenado ?? '').split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scryptAsync(
    senha.normalize('NFKC'),
    Buffer.from(sal, 'base64'),
    esperado.length,
    {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMETROS.maxmem,
    },
  );
  return timingSafeEqual(calculado, esperado);
}

// Usado quando o e-mail não existe: o login demora o mesmo tempo, sem revelar quais e-mails existem.
let hashFicticio;
export async function verificarSenhaFicticia(senha) {
  hashFicticio ??= await gerarHash('senha-ficticia-para-tempo-constante');
  await verificarSenha(senha, hashFicticio);
  return false;
}

// Senha provisória legível, sem caracteres ambíguos (0/O, 1/l/I). Ex.: "kq7m-x4pz-9tnc".
export function gerarSenhaProvisoria() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bloco = () =>
    Array.from({ length: 4 }, () => alfabeto[randomInt(alfabeto.length)]).join('');
  return [bloco(), bloco(), bloco()].join('-');
}
