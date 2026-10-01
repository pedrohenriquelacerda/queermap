import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// Em desenvolvimento e testes usamos valores padrão; em produção tudo precisa vir do ambiente.
function required(name, devFallback) {
  const value = process.env[name] || (isProduction ? undefined : devFallback);
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL', 'postgresql://queermap:queermap@localhost:5432/queermap'),
  sessionSecret: required('SESSION_SECRET', 'dev-secret-nao-use-em-producao'),
  // Endereço público do site, sem barra no final (links de compartilhamento e e-mails).
  siteUrl: (process.env.SITE_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(
    /\/$/,
    '',
  ),
  // Ative quando o app rodar atrás de proxy (Cloudflare Tunnel, Render etc.) para
  // que IPs do rate limit e cookies "secure" funcionem corretamente.
  trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,

  // Segredo do hash (HMAC) dos e-mails e códigos. Trocar invalida os limites em andamento.
  hashSecret: required('HASH_SECRET', 'dev-hash-nao-use-em-producao'),

  // Cloudflare Turnstile (anti-robô). Em desenvolvimento, as chaves de teste públicas da
  // Cloudflare, que sempre aprovam: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  turnstile: {
    siteKey: required('TURNSTILE_SITE_KEY', '1x00000000000000000000AA'),
    secretKey: required('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA'),
  },

  // E-mail (SMTP). Sem SMTP_HOST em desenvolvimento, os e-mails aparecem no terminal.
  smtp: {
    host: isProduction ? required('SMTP_HOST') : process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
  },
  emailRemetente: required('EMAIL_REMETENTE', 'Mapa SerQueer <nao-responda@queermap.test>'),
};
