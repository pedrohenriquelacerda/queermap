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
  // Ative quando o app rodar atrás de proxy (Cloudflare Tunnel, Render etc.) para
  // que IPs do rate limit e cookies "secure" funcionem corretamente.
  trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
};
