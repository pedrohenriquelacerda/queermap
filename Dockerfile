# Mapa SerQueer · imagem do servidor (usada no Render; veja docs/DEPLOY.md)

FROM node:24-slim

# O Prisma (migrate deploy) precisa do OpenSSL, que não vem na imagem slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro (cache do Docker). O schema entra antes porque o postinstall
# roda o "prisma generate". As de desenvolvimento também são instaladas: o CLI do
# Prisma (devDependency) aplica as migrations a cada início. HUSKY=0: sem git hooks.
COPY package.json package-lock.json prisma.config.js ./
COPY prisma ./prisma
RUN HUSKY=0 npm ci && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
# Sem o aviso de "nova versão do npm" nos logs a cada início.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
USER node
EXPOSE 3000

# Aplica as migrations pendentes e só então sobe o servidor. Se a migration falhar,
# o servidor não sobe e o Render mantém a versão anterior no ar.
CMD ["sh", "-c", "npm run db:deploy && npm start"]
