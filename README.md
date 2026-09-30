# Mapa SerQueer (queermap)

Mapa de espaços de cuidado em saúde para a população LGBTQIA+ de Porto Alegre, desenvolvido com a ONG Somos na disciplina de Engenharia de Software II (UFCSPA).

## Stack

- **Node.js 24** + **Express 5**, páginas renderizadas com **EJS**
- **Leaflet** + tiles do OpenStreetMap para o mapa
- **PostgreSQL 17** (via Docker) com **Prisma 7**
- Segurança: helmet (CSP), express-rate-limit, sessões salvas no Postgres
- Qualidade: ESLint, Prettier, testes com `node:test` + supertest

## Pré-requisitos

- [Node.js 24 LTS](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (aberto)
- Git

> No Windows, clone o projeto **fora do OneDrive** (ex.: `C:\dev\queermap`). A sincronização trava com a pasta `node_modules`.

## Como rodar

```bash
git clone https://github.com/pedrohenriquelacerda/queermap.git
cd queermap
cp .env.example .env      # no PowerShell: Copy-Item .env.example .env
npm install               # também gera o Prisma Client
npm run db:up             # sobe o Postgres no Docker
npm run db:migrate        # aplica as migrations
npm run dev               # http://localhost:3000
```

### Sem Docker

Se o Docker não estiver disponível, o Prisma tem um Postgres embutido que roda em segundo plano:

```bash
npm run db:local          # no lugar de npm run db:up
```

No `.env`, troque o `DATABASE_URL` pela linha da **Opção B** do `.env.example`, depois siga com `npm run db:migrate` e `npm run dev`. Para parar: `npm run db:local:stop`.

Ele serve para desenvolvimento, mas é uma versão simplificada do Postgres. Antes de entregar, teste também no Postgres real (Docker).

## Scripts

| Comando                 | O que faz                                         |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Servidor com recarga automática ao salvar         |
| `npm start`             | Servidor sem recarga (produção)                   |
| `npm test`              | Roda os testes (não precisa do banco)             |
| `npm run lint`          | Verifica o código com ESLint                      |
| `npm run format`        | Formata o código com Prettier                     |
| `npm run db:up`         | Sobe o Postgres no Docker                         |
| `npm run db:down`       | Para o Postgres (os dados ficam salvos no volume) |
| `npm run db:local`      | Sobe o Postgres embutido do Prisma (sem Docker)   |
| `npm run db:local:stop` | Para o Postgres embutido                          |
| `npm run db:migrate`    | Cria/aplica migrations depois de alterar o schema |
| `npm run db:deploy`     | Aplica migrations existentes (produção)           |
| `npm run db:studio`     | Abre o Prisma Studio para ver e editar os dados   |

## Estrutura

```
prisma/
  schema.prisma        # modelos do banco
  migrations/          # histórico de alterações do banco (versionado)
src/
  server.js            # inicia o servidor HTTP
  app.js               # monta o Express (middlewares, rotas, views)
  config/env.js        # leitura e validação das variáveis de ambiente
  db/prisma.js         # conexão com o banco (Prisma Client)
  routes/              # definição das URLs
  controllers/         # lógica de cada rota
  middlewares/         # 404, tratamento de erros etc.
  views/               # templates EJS (partials/ = cabeçalho e rodapé)
  public/              # CSS, JS do navegador e imagens
  generated/           # Prisma Client gerado (não versionado)
test/                  # testes automatizados
```

## Banco de dados

Para mudar o banco, edite `prisma/schema.prisma` e rode `npm run db:migrate`. O comando pede um nome para a migration (ex.: `cria-tabela-locais`) e gera o SQL em `prisma/migrations/`. **Sempre faça commit das migrations.**

Ao puxar alterações de colegas que incluam migrations novas, rode `npm run db:migrate` de novo.

Para apagar tudo e recomeçar do zero: `npx prisma migrate reset`.

## Observações

- O `.env` nunca vai para o git. Variáveis novas devem ser adicionadas também ao `.env.example`.
- O Prisma 7 gera o client em TypeScript (`src/generated/prisma`). O Node 24 executa esses arquivos direto, sem etapa de build.
- O Leaflet é servido pelo próprio servidor (`/vendor/leaflet`), sem CDN, por causa da política de segurança de conteúdo (CSP).
- `GET /health` verifica se o servidor e o banco estão respondendo.
