# Teste de carga e de sobrecarga

Mede quantos acessos simultâneos o servidor aguenta, onde ele fica lento e se volta ao normal depois de um pico. Usa o [autocannon](https://github.com/mcollina/autocannon).

## Como rodar

Com o Postgres no ar (`npm run db:up`) e os dados de exemplo (`npm run db:seed:exemplos`):

```bash
npm run teste:carga        # 20 conexões, 15 s em cada página; reprova se houver falha ou p99 > 1 s
npm run teste:sobrecarga   # rampa 10 → 50 → 100 → 200 → 400 conexões na página inicial e confere a recuperação
```

Opções depois de `--`: `--duracao=15`, `--conexoes=20`, `--porta=3100`, `--p99=1000`, `--url=https://...`.

O script sobe o próprio servidor numa porta separada com `TESTE_DE_CARGA=true`. Essa chave só vale fora de produção e faz duas coisas: desliga o limite global de 300 pedidos por IP a cada 15 min (senão o teste mediria o limite, não a capacidade) e liga o cache de views do Express, que em produção já vem ligado.

Só são testadas rotas que não chamam serviços de terceiros. Ficam de fora `/enviar` (Turnstile e e-mail) e `/buscar-endereco` (Nominatim, que pede no máximo 1 consulta por segundo).

## Resultado (24/11/2026)

Máquina de desenvolvimento, Node 24, Postgres 17 em Docker na mesma máquina, 7 locais publicados.

**Carga realista: 20 conexões por 15 s**

| Página                             | req/s | p50 ms | p99 ms | Falhas |
| ---------------------------------- | ----: | -----: | -----: | -----: |
| Início (mapa + lista, 2 consultas) |   956 |     20 |     27 |      0 |
| Página de um local                 | 1.289 |     15 |     21 |      0 |
| Sobre (estática)                   | 2.590 |      7 |      9 |      0 |
| `/health` (1 consulta)             | 4.636 |      4 |      6 |      0 |

**Sobrecarga na página inicial, 10 s por degrau**

|         Conexões | req/s | p50 ms | p99 ms | Máx ms | Falhas |
| ---------------: | ----: | -----: | -----: | -----: | -----: |
|               10 |   959 |     10 |     15 |     61 |      0 |
|               50 |   968 |     51 |     60 |     69 |      0 |
|              100 |   960 |    102 |    120 |    159 |      0 |
|              200 |   962 |    204 |    234 |    306 |      0 |
|              400 |   966 |    405 |    535 |    614 |      0 |
| 10 (recuperação) |   906 |      9 |     14 |    561 |      0 |

## O que isso mostra

- **Estável:** nenhuma falha, nenhum timeout e nenhum erro até 400 conexões simultâneas. Depois do pico, a latência voltou ao normal (p99 de 14 ms).
- **Gargalo: a CPU do processo Node.** A vazão da página inicial fica travada em cerca de 960 req/s não importa quantas conexões entrem, e a latência cresce em linha reta com a fila (cerca de 1 ms por conexão na fila). Ou seja, o servidor não quebra, ele enfileira.
- **A página inicial é a mais cara** (2,7 a 4,8 vezes mais lenta que as outras páginas) porque renderiza a lista de locais no servidor, com 2 consultas ao banco. O custo cresce com o número de locais publicados. Vale repetir o teste quando o cadastro real crescer.
- **O banco não apareceu como gargalo:** `/health` faz uma consulta e passou de 4.600 req/s.

## O que este teste não diz

- **Não é a hospedagem real.** A demonstração roda no Render gratuito, com uma fração de CPU e hibernação depois de 15 min sem tráfego. Os números acima são de uma máquina de desenvolvimento e servem como comparação entre versões, não como promessa de capacidade em produção.
- **Contra um servidor publicado, o teste mede o limite por IP.** Em produção a chave `TESTE_DE_CARGA` é ignorada de propósito, então depois de 300 pedidos o servidor responde 429. Para medir a hospedagem seria preciso um deploy de teste separado, com o limite global levantado.
- **Não foram testados** o envio de relatos (depende de Turnstile e e-mail), a busca de endereço (Nominatim) e o login do painel. O login usa `scrypt`, que consome CPU, e tem limite de 5 tentativas por conta; vale medir com cuidado antes de uma campanha.
- **Os tiles do mapa não passam pelo servidor.** O navegador busca o mapa direto no OpenFreeMap, então o tráfego dele não conta aqui.

## Como interpretar um resultado ruim

- **p99 alto com poucas conexões:** o servidor está lento por conta própria (consulta pesada, render lento).
- **Falhas só nos degraus altos:** o servidor atingiu o limite de conexões ou de memória. Confira os logs do Render.
- **`non2xx` com 429:** é o limitador por IP funcionando, não um defeito.
