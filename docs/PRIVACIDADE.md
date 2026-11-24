# Revisão de privacidade e proteção de dados

Feita em 24/11/2026 (Sprint 8, cartão "Revisar privacidade e proteção de dados"): a página de Privacidade foi conferida contra o código e o código foi corrigido onde a promessa não se cumpria.

## Resultado por critério do cartão

| Critério                                                    | Situação                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A página de Privacidade foi conferida contra o código       | **Feito.** Estava errada em 4 pontos e incompleta em outros: citava só o OpenStreetMap (o mapa vem do OpenFreeMap), dizia que o IP só existia "durante a requisição" (o limite de requisições o guarda na memória por até 1 h), prometia apagar o hash em 30 dias sem rotina que apagasse, e não citava o serviço de e-mail nem a hospedagem nos EUA. |
| Hashes de e-mail e códigos vencidos são apagados por rotina | **Feito.** Não existia rotina: a promessa estava só no texto. Agora `src/services/limpezaService.js` roda ao iniciar o servidor e a cada 6 h, e `npm run limpar:dados` roda na hora ou por agendador externo.                                                                                                                                         |
| O IP não é gravado no banco nem associado a nenhum envio    | **Confere**, com uma ressalva corrigida. Nenhuma tabela tem campo de IP, a sessão e o log de auditoria não o gravam e os logs não o registram. O IP passa pela memória do servidor (limite de requisições) e vai ao Cloudflare Turnstile.                                                                                                             |
| Prazo de guarda definido com a ONG (resolvidos e e-mails)   | **Pendente da ONG.** Há uma proposta abaixo. A página de Privacidade diz que o prazo está sendo definido, sem prometer um número.                                                                                                                                                                                                                     |

## Ligação entre envio e hash de e-mail (corrigida)

O schema dizia que o registro do limite de envios era "propositalmente sem ligação com Envio", mas os dois eram gravados na mesma transação, com ids sequenciais e o mesmo horário. Quem lesse o banco poderia casar cada envio com o hash do e-mail de quem o mandou.

A migration `20261124120000_registro_envio_sem_vinculo` troca o id de `registro_envio` por um UUID aleatório e deixa só a data (meia-noite UTC) em `criado_em`, inclusive nos registros que já existiam. O limite de 5 envios a cada 30 dias continua funcionando; a janela passa a ser contada por dia.

## O que é guardado, onde e por quanto tempo

| Dado                                          | Onde                                | Prazo                                               | Observação                                                        |
| --------------------------------------------- | ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Hash do e-mail do limite                      | `registro_envio`                    | 30 dias, apagado pela rotina                        | Id aleatório e só a data; sem ligação com o envio                 |
| Hash do e-mail e do código de confirmação     | `verificacao_email`                 | até cerca de 7 h (1 h de margem + intervalo de 6 h) | Apagado pela rotina                                               |
| Texto do envio e e-mail de contato (se pediu) | tabela `session`                    | 30 min sem uso                                      | Em claro, só durante o fluxo de confirmação                       |
| Mensagem, contato e notas internas            | `envio`                             | **indefinido** (decisão da ONG)                     | Só o painel acessa                                                |
| Ações da equipe no painel                     | `log_auditoria`                     | **indefinido**                                      | Liga a pessoa da equipe ao id do envio e ao horário; sem conteúdo |
| Endereço IP                                   | memória do servidor (limite de uso) | até 1 h                                             | Nunca vai ao banco                                                |

Serviços que veem o IP de quem usa o site: hospedagem (Render, região Virgínia), banco (Neon, AWS us-east-1), serviço de e-mail (SMTP), Cloudflare Turnstile, OpenFreeMap e, como reserva, OpenStreetMap. O Google Maps só entra se a pessoa clicar em "Como chegar", e o link abre em outra aba sem enviar o endereço do site. O Nominatim recebe só o texto do endereço, enviado pelo servidor, sem o IP.

## Proposta de prazos de guarda (a validar com a ONG)

São sugestões com base em minimização de dados (LGPD, art. 6º, III). Quem decide é a ONG, justificando a finalidade.

| Dado                               | Prazo sugerido                                  | Motivo                                                                                                       |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| E-mail de contato (`emailContato`) | Apagar 30 dias depois de resolvido ou arquivado | Só serve para responder à pessoa; apagar na hora se ela pedir (art. 18, VI)                                  |
| Envios resolvidos ou arquivados    | 12 meses, depois apagar ou manter só o agregado | Dá tempo de acompanhar o caso; relatos de discriminação podem precisar de mais, se a ONG os usar em denúncia |
| Envios novos ou em análise parados | Revisar a cada 6 meses                          | Evita guarda indefinida sem finalidade                                                                       |
| Log de auditoria                   | 12 a 24 meses, sem conteúdo de relatos          | Segurança                                                                                                    |

Hoje `ARQUIVADO` não tem data própria (`resolvidoEm` volta a nulo fora de `RESOLVIDO`), então aplicar esses prazos exige criar um campo `arquivadoEm` ou usar `atualizadoEm`.

## Pendências que dependem de pessoas

1. **ONG:** decidir os prazos acima. Depois disso, implementar a limpeza dos envios e dos e-mails de contato.
2. **ONG:** preencher o e-mail de contato na página e remover o aviso "Texto provisório" depois da revisão jurídica.
3. **Painel:** não existe ação para apagar ou anonimizar um envio, nem busca por e-mail. A página promete exclusão a pedido, e hoje isso só se faz direto no banco.
4. **Jurídico:** confirmar a base legal para dados sensíveis (art. 11) e a transferência internacional, já que os dados ficam nos EUA (art. 33).
5. **Serviço de e-mail:** o log dele (horário e destinatário do código) pode ser casado com o horário do envio. Restringir o acesso e a retenção desse log.
6. **Opcional:** servir os tiles do mapa por conta própria, para o IP não ir a terceiros; remover `remoteip` da chamada ao Turnstile (ganho pequeno); testar que as páginas públicas nunca enviam `Set-Cookie`.
