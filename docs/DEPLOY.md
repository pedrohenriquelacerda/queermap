# Ambiente de demonstração

Versão pública do Mapa SerQueer para a ONG, a professora e o professor testarem, e para a equipe encontrar cedo problemas que só aparecem fora do ambiente local.

```
GitHub (main) ──merge──▶ Render (Docker, plano gratuito, HTTPS)
                              │  ao iniciar: npm run db:deploy && npm start
                              ▼
                         Neon (Postgres, plano gratuito)
```

## 1. Decisão: qual banco gratuito

Comparação feita antes da publicação. **Os limites dos planos gratuitos mudam: confira nas páginas de preço antes de decidir.**

| Critério                     | Neon                                                                                                            | Supabase                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Armazenamento                | ~0,5 GB por projeto                                                                                             | ~500 MB                                                                                                                                                                          |
| Pausa por inatividade        | O banco "dorme" após ~5 min sem uso e **acorda sozinho** na próxima consulta (atraso de menos de 1 s, em geral) | O projeto é **pausado após ~7 dias** sem uso e **só volta se alguém reativar no painel** do Supabase                                                                             |
| Conexão com o Prisma         | String de conexão Postgres comum (direta ou com pooler). Funciona com o `@prisma/adapter-pg` sem ajustes        | A conexão direta usa só IPv6 no plano gratuito; o Render precisa do **pooler** (Supavisor). As migrations exigem o pooler em modo sessão (porta 5432), não o de transação (6543) |
| O que mais oferece           | Só Postgres (o que o projeto usa)                                                                               | Postgres + autenticação, storage, APIs (o projeto não usa)                                                                                                                       |
| Região perto do Render (EUA) | AWS us-east-1                                                                                                   | us-east-1                                                                                                                                                                        |

**Recomendação: Neon.** A diferença decisiva é a pausa. No Supabase, se a demonstração ficar uma semana sem acesso (férias, intervalo entre sprints), o site sai do ar até alguém da equipe reativar o projeto. No Neon, o banco acorda sozinho. A conexão também é mais simples.

> **Decisão da equipe:** \_\_\_\_\_\_\_\_\_\_ · data: \_\_/\_\_/\_\_\_\_ · registrada por: \_\_\_\_\_\_\_\_\_\_

## 2. Banco (Neon)

1. Crie um projeto em [neon.tech](https://neon.tech): Postgres 17, região **AWS US East (N. Virginia)**, a mesma do servidor no Render.
2. Em **Connect**, desligue **Connection pooling** e copie a string de conexão. Ela deve terminar com `?sslmode=require`.
   - Use a conexão **direta** (o host não tem `-pooler`): as migrations do Prisma não funcionam pelo pooler em modo transação, e o app é pequeno o bastante para não precisar dele.
3. Guarde essa string: ela é o `DATABASE_URL` (passo 5). **Nunca** a coloque no repositório.

## 3. Dados de demonstração (só fictícios)

Do seu computador, apontando para o banco do Neon. No PowerShell, a variável de ambiente vale só para esta janela e tem prioridade sobre o `.env`.

O `Read-Host` pede a string colada: **não escreva a string direto no comando**, porque o PowerShell grava cada comando digitado num arquivo de histórico, e a senha do banco ficaria salva no seu computador.

```powershell
$env:DATABASE_URL = Read-Host "Cole a string do Neon"
npx prisma migrate deploy
npm run db:seed
npm run db:seed:exemplos -- --sem-contas
npm run admin:criar -- --nome "Nome da pessoa" --email pessoa@exemplo.org
Remove-Item Env:DATABASE_URL
```

- `db:seed` cria os tipos de serviço e as características. Os canais de denúncia já vêm das migrations.
- `--sem-contas` insere só os locais fictícios (nomes começam com "[Exemplo]"). **Não rode sem essa opção:** as contas de teste têm a senha publicada no repositório, e qualquer pessoa entraria no painel.
- Rode o `admin:criar` para cada pessoa que vai testar o painel (ONG, professora, professor; use `--editor` para quem não administra). Ele mostra uma **senha provisória**, que deve ser enviada à pessoa por um canal privado. No primeiro acesso, o painel pede uma senha nova.
- **Nada de dados reais** neste banco: nem locais de verdade, nem relatos.

## 4. Anti-robô e e-mail

**Cloudflare Turnstile:** no painel da Cloudflare, **Turnstile → Add widget**, com o domínio do Render (ex.: `queermap.onrender.com`). Guarde a _site key_ e a _secret key_.

**SMTP** (código de confirmação dos envios): qualquer serviço SMTP serve. Uma opção gratuita sem domínio próprio é o [Brevo](https://www.brevo.com) (cerca de 300 e-mails por dia):

| Variável          | Valor no Brevo                                          |
| ----------------- | ------------------------------------------------------- |
| `SMTP_HOST`       | `smtp-relay.brevo.com`                                  |
| `SMTP_USER`       | o login SMTP mostrado em **SMTP & API**                 |
| `SMTP_PASS`       | uma **SMTP key** criada na mesma tela                   |
| `EMAIL_REMETENTE` | `Mapa SerQueer <email-verificado-no-brevo@exemplo.org>` |

O remetente precisa ser um e-mail verificado no serviço, senão as mensagens não saem ou caem no spam.

## 5. Servidor (Render)

1. Em [render.com](https://render.com): **New → Blueprint**, conecte o repositório e escolha a **branch**. O Render lê o [`render.yaml`](../render.yaml) dessa branch e cria o serviço `queermap` (Docker, plano gratuito, região Virginia).
   - Para testar antes do merge, escolha a branch da feature (ex.: `feat/ambiente-demonstracao`). Depois do merge, troque para `main` em **Blueprint → Settings → Branch**: a partir daí, cada merge na `main` publica sozinho.
2. Preencha as variáveis pedidas (as marcadas `sync: false`):

| Variável                                      | Valor                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | a string do Neon (passo 2)                                                                   |
| `SITE_URL`                                    | `https://queermap.onrender.com` (o endereço que o Render der; se mudar, ajuste e republique) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | do passo 4                                                                                   |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`       | do passo 4                                                                                   |
| `EMAIL_REMETENTE`                             | do passo 4                                                                                   |

`SESSION_SECRET` e `HASH_SECRET` são gerados pelo próprio Render; `NODE_ENV`, `TRUST_PROXY`, `AMBIENTE_DEMONSTRACAO` e a porta SMTP já vêm no `render.yaml`.

`AMBIENTE_DEMONSTRACAO=true` mostra em todas as páginas a faixa "Ambiente de demonstração: os locais são fictícios. Não envie relatos reais nem dados pessoais", para que ninguém mande um relato verdadeiro a um banco de teste.

3. O primeiro deploy constrói a imagem, aplica as migrations e sobe o servidor. Ele fica pronto quando `https://<endereço>/health` responde `{"status":"ok","db":"ok"}`.

### Publicação automática

- **Cada merge na `main` publica a nova versão** (`autoDeploy: true`, com o Blueprint apontando para a `main`).
- **As migrations rodam automaticamente** antes do servidor subir: o container executa `npm run db:deploy && npm start`. Se uma migration falhar, o servidor não sobe e o Render mantém a versão anterior no ar. (O "pre-deploy command" do Render faria o mesmo, mas não existe no plano gratuito.)
- Recomendado: em **Settings → Auto-Deploy**, escolher publicar só **depois que os checks do CI passarem**, para que código com teste falhando não chegue à demonstração.

### Segredos

Nenhum segredo fica no repositório: o `.env` é ignorado pelo git, os valores de produção ficam só no painel do Render e o gitleaks verifica cada push. A imagem Docker também não leva o `.env` (veja o `.dockerignore`).

- **Deixe desligado "Pull Request Previews"** no Render (já vem desligado). Ligado, o código de qualquer PR rodaria com os segredos e o banco da demonstração.
- Strings de conexão, chaves e senhas provisórias **nunca** vão para chat, Discord, issues ou prints. Para passar uma senha provisória, use uma mensagem privada e peça a troca no primeiro acesso (o painel já obriga).
- Se algum segredo vazar: troque-o na origem (Neon → **Reset password**; Cloudflare/Brevo → gerar outra chave), atualize no Render e republique.

### Testar a imagem no computador

```powershell
wsl docker build -t queermap .
```

## 6. Testes no ambiente publicado

Marque cada fluxo depois de testar **no endereço do Render** (de preferência num celular, fora da rede de casa):

| Fluxo                                                                                                     | OK? | Observações |
| --------------------------------------------------------------------------------------------------------- | --- | ----------- |
| Mapa abre e pede a localização (GPS); com permissão, centraliza na pessoa                                 |     |             |
| Sem permissão de localização, a busca de endereço encontra um bairro de Porto Alegre                      |     |             |
| Filtro por tipo de serviço (computador e celular)                                                         |     |             |
| Envio de relato: anti-robô, código chega por e-mail, confirmação e tela "chegou à ONG"                    |     |             |
| Relato de discriminação mostra o pop-up com os canais oficiais                                            |     |             |
| Login no painel com a senha provisória, troca de senha e cadastro de um local                             |     |             |
| Sair do painel pela faixa "Conta da equipe"                                                               |     |             |
| Faixa "Ambiente de demonstração" aparece em todas as páginas                                              |     |             |
| 6 senhas erradas no painel bloqueiam só quem errou: de outra rede (ex.: 4G), o login continua funcionando |     |             |

O último teste confere se o servidor enxerga o IP real de cada pessoa atrás do proxy do Render (`TRUST_PROXY`). Se o bloqueio atingir todo mundo, os limites de tentativas estão contando todos os acessos como um só IP: avise a equipe antes de liberar a demonstração.

## 7. Limitações observadas (para apresentar à ONG)

Preencha com o que for **medido** no ambiente publicado:

| Limitação                                                                                                           | Medido / observado |
| ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| O servidor gratuito do Render "dorme" após ~15 min sem acesso; o primeiro acesso depois disso demora para responder | \_\_\_ segundos    |
| O banco do Neon dorme após ~5 min sem uso; a primeira consulta depois disso é mais lenta                            | \_\_\_ segundos    |
| Limite de e-mails por dia do serviço SMTP                                                                           | \_\_\_ por dia     |
| Endereço com `onrender.com` (sem domínio próprio)                                                                   |                    |
| Busca de endereço limitada a 1 consulta por segundo (política do Nominatim/OpenStreetMap)                           |                    |
| Outros problemas encontrados                                                                                        |                    |

Para uso real pela ONG, um plano pago no Render (sem "dormir") e um domínio próprio resolvem as principais limitações.
