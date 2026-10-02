# Plano de desenvolvimento — Mapa SerQueer

Objetivo: o mais simples possível, mas completo, com visual agradável e objetivo.
Cada fase termina com testes, verificação no navegador, commit e push.

## Decisões tomadas

| Tema               | Decisão                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| E-mail             | Nodemailer + SMTP genérico configurável no `.env`. Em desenvolvimento, o código aparece no terminal. |
| Anti-robô          | Cloudflare Turnstile. Em desenvolvimento, usa as chaves de teste da Cloudflare.                      |
| Endereço do local  | Busca no Nominatim (OpenStreetMap) + ajuste do pino arrastando no minimapa.                          |
| Papéis             | **Admin**: tudo, incluindo pessoas, categorias e características. **Editor**: locais e envios.       |
| Identidade visual  | Própria: pino + nome, roxo como cor principal, faixa arco-íris discreta. Cores em variáveis CSS.     |
| Fonte              | Atkinson Hyperlegible, servida pelo próprio site (sem Google Fonts).                                 |
| Filtro de conteúdo | Marca como "sinalizado" e entrega; nunca bloqueia.                                                   |
| Aviso à ONG        | Resumo diário por e-mail, só se houver envios novos, sem o conteúdo dos relatos.                     |

## Valores padrão (ajustáveis)

- Limite de **5 envios por e-mail a cada 30 dias**.
- Código de confirmação: 6 dígitos, válido por 15 min, até 5 tentativas.
- Login: bloqueio de 15 min após 5 tentativas erradas.
- Rotinas diárias (limpeza e resumo) rodam dentro do próprio servidor, sem cron externo.
- Textos de Sobre, Privacidade e Canais: rascunho marcado como **[revisar com a ONG]**.

## Fases

### F1 · Visual e páginas fixas ✅

- Tokens de design (cores, espaçamento, tipografia) e componentes CSS: botão, campo, tabela, etiqueta, alerta, cartão.
- Layout público e layout do painel.
- Páginas: Sobre, Canais de denúncia, Privacidade (LGPD).
- Metadados para compartilhamento (Open Graph) e páginas de erro no mesmo visual.

### F2 · Mapa público completo ✅

- Computador: lateral com busca (nome/bairro), filtro por característica e lista de locais.
- Celular: alternância Mapa / Lista.
- Página de cada local (`/locais/:slug`) com "Informações conferidas em [data]".

### F3 · Login do painel ✅

- Login/logout com senha em `scrypt` (nativo do Node).
- Bloqueio por tentativas e proteção CSRF.
- `npm run admin:criar` para a primeira conta.
- Trocar a própria senha; admins gerenciam pessoas.

### F4 · Cadastro de locais ✅

- Lista com filtros (rascunho / publicado / arquivado).
- Formulário com minimapa, busca de endereço e pino arrastável.
- Publicar, despublicar e arquivar.
- CRUD de categorias e características (só admin).

### F5 · Envios do público ✅

- Formulário: sugestão de local, elogio, reclamação ou discriminação (opcionalmente sobre um local).
- Confirmação por código no e-mail + Turnstile.
- Limite por pessoa (hash do e-mail, 30 dias) e filtro de conteúdo.
- Opção "quero ser contatada" (só então o e-mail é salvo).
- Após um relato de discriminação: Ouvidoria do SUS, Disque 100 e Delegacia de Combate à Intolerância.

### F6 · Caixa de envios no painel

- Lista por situação/tipo com contador de novos.
- Detalhe, troca de situação e anotações internas.
- "Criar local a partir desta sugestão" (formulário pré-preenchido).
- Tela do registro de auditoria.

### F7 · Operação e entrega

- Rotina diária: limpeza de hashes > 30 dias e códigos vencidos; resumo diário para a ONG.
- Manual do painel para a ONG.
- Script de backup (`pg_dump`) e guia de deploy para as três opções de hospedagem.

## Dependências novas

Apenas `zod` (validação de formulários) e `nodemailer` (e-mail).

## Fora do escopo

Agrupamento de marcadores, fotos dos locais, outros idiomas, app de celular,
estatísticas de acesso, avaliações/comentários públicos e cobertura estadual.
