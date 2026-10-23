# Registro para a revisão do PR — caixa de entrada

## O que muda

Correções dos problemas introduzidos nas stories da caixa de entrada, identificados
por sondagens adversariais. Os problemas herdados do cadastro original ficam
registrados para tratamento posterior, conforme decisão de Gustavo.

## Detalhes

### Corrigidos nesta branch

Foi necessário corrigir problemas identificados durante a validação das novas
features. As correções foram incorporadas aos dois commits `feat` das stories.

- **Situação sobrescrita por formulário antigo:** exige `versaoSituacao`; versões
  antigas retornam `409`, mostram a situação atual e preservam a escolha enviada.
- **Notas com acentos e emojis rejeitadas:** o parser da rota de notas aceita
  64 KB para comportar 5.000 caracteres no formulário. As outras rotas mantêm 20 KB.
- **IDs fora do intervalo do PostgreSQL:** os novos fluxos de envios validam
  inteiros positivos até 2147483647 antes de consultar o Prisma.
- **Sugestão perdida após erro de validação:** o cadastro mantém a referência e
  recupera os dados originais da sugestão no servidor.

- **Notas sobrescritas por formulário antigo:** o formulário e o detalhe JSON
  carregam uma versão opaca das notas. Ao salvar, o servidor compara a versão com
  as notas atuais dentro da transação. Se estiver desatualizada, retorna `409`, não
  altera as notas nem cria auditoria de alteração, preserva o texto digitado e
  mostra a versão atual para revisão manual. Leitura e mudança de situação não
  invalidam a versão das notas.
- **HEAD marcando leitura:** consultas HEAD retornam a existência do envio sem
  gravar `lidoEm` ou auditoria de leitura. O GET HTML continua marcando leitura
  automaticamente, conforme o critério de aceitação.

### Herdados do repositório original — não corrigidos

Registrar estes itens em **Observações** no futuro PR, sem afirmar que foram
introduzidos por esta branch:

| Problema                                            | Reprodução                                                          | Efeito                                                                                                                                  | Estado                        |
| --------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Criação de local e auditoria em operações separadas | Fazer a auditoria falhar depois da criação do local                 | A resposta pode ser 500 com local já salvo; repetir pode criar outro cadastro                                                           | Pendente, fora desta correção |
| Cadastro sem corpo não tratado                      | POST autenticado em `/painel/locais`, com Origin válido e sem corpo | Retorna 500 em vez de erro de entrada; a nova leitura de `envioId` apenas antecipa uma falha que já existia na reexibição do formulário | Pendente, fora desta correção |

A falha de auditoria acima refere-se ao **cadastro de locais**. As alterações de
situação e notas dos **envios** usam transação com auditoria. O rollback de situação
de envio já foi aprovado no PostgreSQL 17.11 no teste executado por Gustavo.

## Como testar

1. Rodar `npm test` com o ambiente local de teste configurado. Há testes para HEAD,
   formulário antigo, preservação do texto, versão ausente/forjada e comparação
   segura de conteúdo no HTML e JSON.
2. Rodar `node review/adversarial-envios.js`, se o pacote de ferramentas estiver
   disponível. Usa HTTP real e Prisma simulado. Os dois cenários corrigidos devem
   aparecer como `CORRIGIDO`; os dois herdados continuam reproduzíveis.
3. Rodar a versão atualizada de `review/testar-postgres.js` em PostgreSQL real.
   Ela inclui HEAD, notas e situações desatualizadas, Unicode e limites de IDs. Não foi executada em PostgreSQL neste
   ambiente; não reutilizar a aprovação da versão anterior para estas correções.
4. No navegador, abrir o mesmo envio em duas sessões. Salvar notas na primeira e
   depois tentar salvar o formulário antigo na segunda. Conferir o aviso, os dois
   textos e a ausência de sobrescrita; revisar e salvar novamente de forma explícita.

## Observações

- Nenhuma migration, dependência ou variável de ambiente nova.
- Reutiliza o HMAC e o segredo já existentes. A versão não expõe o texto das notas.
- Clientes das rotas JSON devem obter `versaoSituacao` e `versaoNotas` no detalhe.
  Para notas, enviar `versaoNotas`
  com `notasInternas`; versão ausente/inválida retorna 400 e desatualizada retorna 409.
- No controller de locais, ajusta apenas o novo fluxo de sugestão; as duas
  pendências originais acima permanecem.
- Validação local: 104 testes aprovados. PostgreSQL real não executado nesta rodada.
- Sem push ou abertura de PR nesta etapa.
