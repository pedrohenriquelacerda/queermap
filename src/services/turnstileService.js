import { env } from '../config/env.js';

// Confere no servidor o token do Cloudflare Turnstile (anti-robô).
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
export async function verificarHumano(token, ip) {
  if (!token) return false;
  try {
    const resposta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.turnstile.secretKey,
        response: token,
        remoteip: ip ?? '',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const resultado = await resposta.json();
    return resultado.success === true;
  } catch (err) {
    console.error('Turnstile não respondeu:', err.message);
    return false;
  }
}
