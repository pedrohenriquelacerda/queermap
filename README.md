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
npm run db:seed           # categorias e características iniciais
npm run db:seed:exemplos  # opcional: locais fictícios + contas de teste do painel
npm run dev               # http://localhost:3000
```

### Sem Docker

Se o Docker não estiver disponível, o Prisma tem um Postgres embutido que roda em segundo plano:

```bash
npm run db:local          # no lugar de npm run db:up
```

No `.env`, troque o `DATABASE_URL` e descomente o `SHADOW_DATABASE_URL` da **Opção B** do `.env.example`, depois siga com `npm run db:migrate` e `npm run dev`. Para parar: `npm run db:local:stop`.

Ele serve para desenvolvimento, mas é uma versão simplificada do Postgres. Antes de entregar, teste também no Postgres real (Docker).

## Painel da ONG

O painel fica em `/painel`. Não há cadastro público: a primeira conta é criada pelo terminal.

```bash
npm run admin:criar -- --nome "Nome da Pessoa" --email pessoa@exemplo.org
```

O comando mostra uma senha provisória; no primeiro acesso o painel pede uma senha nova. Depois disso, quem tem papel de **administração** cadastra as outras pessoas pelo próprio painel (em _Pessoas_).

Em desenvolvimento, `npm run db:seed:exemplos` cria duas contas de teste (`admin@queermap.test` e `editor@queermap.test`); as senhas estão em `prisma/seed-exemplos.js`.

Segurança do painel: senhas com hash `scrypt`, sessão nova a cada login, bloqueio após 5 tentativas erradas (15 min), envios de formulário aceitos só a partir do próprio site (proteção CSRF pelo cabeçalho `Origin`), páginas sem cache e fora dos buscadores, e registro de cada ação na auditoria.

## Scripts

| Comando                    | O que faz                                               |
| -------------------------- | ------------------------------------------------------- |
| `npm run dev`              | Servidor com recarga automática ao salvar               |
| `npm start`                | Servidor sem recarga (produção)                         |
| `npm test`                 | Roda os testes (não precisa do banco)                   |
| `npm run lint`             | Verifica o código com ESLint                            |
| `npm run format`           | Formata o código com Prettier                           |
| `npm run db:up`            | Sobe o Postgres no Docker                               |
| `npm run db:down`          | Para o Postgres (os dados ficam salvos no volume)       |
| `npm run db:local`         | Sobe o Postgres embutido do Prisma (sem Docker)         |
| `npm run db:local:stop`    | Para o Postgres embutido                                |
| `npm run db:migrate`       | Cria/aplica migrations depois de alterar o schema       |
| `npm run db:seed`          | Insere categorias e características (pode repetir)      |
| `npm run db:seed:exemplos` | Insere locais fictícios de teste (`-- --remover` apaga) |
| `npm run admin:criar`      | Cria uma conta do painel (veja acima)                   |
| `npm run db:deploy`        | Aplica migrations existentes (produção)                 |
| `npm run db:studio`        | Abre o Prisma Studio para ver e editar os dados         |

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
  public/              # CSS (base.css = tokens e componentes; mapa.css), JS do navegador
  generated/           # Prisma Client gerado (não versionado)
test/                  # testes automatizados
```

## Banco de dados

Para mudar o banco, edite `prisma/schema.prisma` e rode `npm run db:migrate`. O comando pede um nome para a migration (ex.: `cria-tabela-locais`) e gera o SQL em `prisma/migrations/`. **Sempre faça commit das migrations.**

Ao puxar alterações de colegas que incluam migrations novas, rode `npm run db:migrate` de novo.

Para apagar tudo e recomeçar do zero: `npx prisma migrate reset` (roda o seed no final).

### Modelo de dados

- **Local**: serviço no mapa, com uma **Categoria** (ambulatório trans, ONG, saúde sexual, abrigo, casa de acolhimento) e várias **Características** ("respeita o nome social", "oferece PrEP"...). Só aparece no mapa com `publicado = true`; exclusão é lógica (`arquivadoEm`).
- **Envio**: sugestão de local ou relato (elogio, reclamação, discriminação) enviado pelo público. Vai só para o painel. O e-mail só é salvo se a pessoa pedir contato.
- **VerificacaoEmail** / **RegistroEnvio**: código de confirmação e limite de envios por pessoa, guardando apenas o hash do e-mail. Os registros são apagados após 30 dias e não têm ligação com os envios.
- **Admin** / **LogAuditoria**: pessoas da ONG com acesso ao painel e registro de cada ação feita nele.

## Observações

- O `.env` nunca vai para o git. Variáveis novas devem ser adicionadas também ao `.env.example`.
- O Prisma 7 gera o client em TypeScript (`src/generated/prisma`). O Node 24 executa esses arquivos direto, sem etapa de build.
- O Leaflet é servido pelo próprio servidor (`/vendor/leaflet`), sem CDN, por causa da política de segurança de conteúdo (CSP).
- Visual: cores, espaços e fontes ficam em variáveis no topo de `src/public/css/base.css`. Em desenvolvimento, `/dev/componentes` mostra todos os componentes.
- `GET /health` verifica se o servidor e o banco estão respondendo.
- A página inicial já vem com a lista de locais pronta do servidor (funciona sem JavaScript); o `mapa.js` só filtra e desenha os marcadores. Os filtros ficam na URL, então dá para compartilhar um link como `/?car=oferece-prep`.
- Cada local publicado tem sua página em `/locais/<slug>`.
- Os locais de exemplo começam com "[Exemplo]" e não podem ser inseridos com `NODE_ENV=production`.
