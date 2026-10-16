# Orientações do projeto — EngSW II / Mapa SerQueer

Estas convenções foram solicitadas por Gustavo para os próximos commits e PRs
no repositório `pedrohenriquelacerda/queermap`.

## Commits

Usar Conventional Commits 1.0.0:
https://www.conventionalcommits.org/en/v1.0.0/

Formato: `tipo(escopo opcional): descrição no imperativo, em minúscula`.

Tipos mais usados: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.
Escrever descrições em português e separar mudanças de propósitos diferentes
em commits apropriados.

| Evitar                                                     | Usar                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `Reforça autenticação e privacidade do painel`             | `test(painel): reforça testes de autenticação e privacidade` |
| `Adição de um botão no mapa para acesso ao administrativo` | `feat(topo): adiciona acesso ao painel administrativo`       |

## Branches

Usar `tipo/descricao`, em minúsculas, com palavras separadas por hífen e sem
acentos. Exemplo: `feat/autenticacao-equipe`.
Evitar maiúsculas e revisar erros de digitação antes de criar a branch.
Essa é uma convenção do projeto; Conventional Commits especifica mensagens
de commit, não nomes de branch.

## Descrições de PR

Usar Markdown bem estruturado, com os seguintes títulos:

```markdown
## O que muda

Resumo em 1 ou 2 frases e lista dos critérios atendidos.

## Detalhes

- Mudanças agrupadas por assunto: servidor, telas e testes.

## Como testar

1. Passos numerados, com comandos em `código` e URLs.

## Observações

Migrations, variáveis novas no `.env` e efeitos no deploy.
```

Usar títulos `##`, listas, tabelas para comparações e código entre crases
para comandos e arquivos. Informar validações efetivamente realizadas e suas
limitações.

## Orientação específica para o PR anterior de autenticação

Para o PR referido pelo usuário como "Autenticao-da-Equipe-da-ONG", preservar o
histórico existente e usar "Squash and merge" com o título:

`feat(painel): reforça autenticação da equipe e privacidade dos envios`

Essa orientação é específica daquele PR; não constitui autorização para executar
merge nem determina squash em todos os próximos PRs.
