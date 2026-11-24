// Teste de carga e de sobrecarga do Mapa SerQueer (autocannon). Não roda no `npm test`.
//
//   npm run teste:carga        carga realista: 20 conexões, 15 s em cada página
//   npm run teste:sobrecarga   rampa de 10 até 400 conexões na página mais pesada e,
//                              no fim, confere se o servidor volta ao normal
//
// Opções (depois de `--`): --duracao=15  --conexoes=20  --porta=3100  --p99=1000
//                          --url=https://exemplo.org   (mede um servidor que já está no ar)
//
// Por padrão o script sobe o próprio servidor numa porta separada, com TESTE_DE_CARGA=true
// (sem limite de requisições por IP e com cache de views, como em produção). O Postgres
// precisa estar no ar (`npm run db:up`) e com os dados de exemplo para a página ter o que listar.
// Com --url o limite por IP do servidor continua valendo e responde 429: nesse caso o
// resultado mede o limite, não a capacidade.
//
// Só rotas que não chamam serviços de terceiros (nada de /enviar nem /buscar-endereco).

import { spawn } from 'node:child_process';
import autocannon from 'autocannon';

const argumentos = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [chave, valor = 'true'] = a.slice(2).split('=');
      return [chave, valor];
    }),
);

const modo = argumentos.modo ?? 'carga';
const duracao = Number(argumentos.duracao ?? (modo === 'carga' ? 15 : 10));
const conexoes = Number(argumentos.conexoes ?? 20);
const porta = Number(argumentos.porta ?? 3100);
const limiteP99 = Number(argumentos.p99 ?? 1000);
const externo = Boolean(argumentos.url);
const base = (argumentos.url ?? `http://localhost:${porta}`).replace(/\/$/, '');

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const resposta = await fetch(`${base}/health`);
      if (resposta.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  throw new Error(`O servidor não respondeu em ${base}/health`);
}

function subirServidor() {
  const filho = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env,
      PORT: String(porta),
      NODE_ENV: 'development',
      TESTE_DE_CARGA: 'true',
      SITE_URL: base,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return filho;
}

async function primeiroLocal() {
  const html = await (await fetch(`${base}/`)).text();
  return html.match(/\/locais\/([a-z0-9-]+)/)?.[0] ?? null;
}

async function medir(titulo, caminho, numeroConexoes, segundos) {
  const r = await autocannon({
    url: `${base}${caminho}`,
    connections: numeroConexoes,
    duration: segundos,
    timeout: 10,
    title: titulo,
  });
  const falhas = r.non2xx + r.errors + r.timeouts;
  return {
    página: titulo,
    conexões: numeroConexoes,
    'req/s': Math.round(r.requests.average),
    'p50 ms': r.latency.p50,
    'p97,5 ms': r.latency.p97_5,
    'p99 ms': r.latency.p99,
    'máx ms': r.latency.max,
    pedidos: r.requests.total,
    falhas,
    // Detalhe das falhas, para o relatório
    _detalhe: `non2xx=${r.non2xx} erros=${r.errors} timeouts=${r.timeouts}`,
  };
}

function mostrar(linhas) {
  console.table(linhas.map(({ _detalhe, ...resto }) => resto));
}

async function carga() {
  const local = await primeiroLocal();
  const paginas = [
    ['Início (mapa + lista, 2 consultas ao banco)', '/'],
    ['Página estática (Sobre)', '/sobre'],
    ['Verificação de saúde (/health, 1 consulta)', '/health'],
  ];
  if (local) paginas.splice(1, 0, [`Página de um local (${local})`, local]);
  else
    console.warn(
      'Nenhum local publicado: rode `npm run db:seed:exemplos` para testar a página de local.',
    );

  console.log(`\nCarga: ${conexoes} conexões simultâneas por ${duracao} s em cada página\n`);
  const resultados = [];
  for (const [titulo, caminho] of paginas)
    resultados.push(await medir(titulo, caminho, conexoes, duracao));
  mostrar(resultados);

  const reprovadas = resultados.filter((r) => r.falhas > 0 || r['p99 ms'] > limiteP99);
  if (reprovadas.length > 0) {
    console.error(`\nREPROVADO (critério: nenhuma falha e p99 ≤ ${limiteP99} ms):`);
    for (const r of reprovadas)
      console.error(` - ${r.página}: p99 ${r['p99 ms']} ms, ${r._detalhe}`);
    return false;
  }
  console.log(`\nAPROVADO: nenhuma falha e p99 ≤ ${limiteP99} ms em todas as páginas.`);
  return true;
}

async function sobrecarga() {
  const degraus = [10, 50, 100, 200, 400];
  console.log(
    `\nSobrecarga na página inicial: ${degraus.join(' → ')} conexões, ${duracao} s cada\n`,
  );
  const resultados = [];
  for (const n of degraus) resultados.push(await medir('Início', '/', n, duracao));
  const recuperacao = await medir('Início (recuperação)', '/', degraus[0], duracao);
  mostrar([...resultados, recuperacao]);

  const saturou = resultados.find((r) => r.falhas > 0 || r['p99 ms'] > limiteP99);
  console.log(
    saturou
      ? `\nPrimeiro degrau fora do critério (p99 ≤ ${limiteP99} ms, sem falhas): ${saturou.conexões} conexões ` +
          `(p99 ${saturou['p99 ms']} ms, ${saturou._detalhe}).`
      : `\nNenhum degrau passou de p99 ${limiteP99} ms nem teve falhas (até ${degraus.at(-1)} conexões).`,
  );

  const base0 = resultados[0];
  const voltou =
    recuperacao.falhas === 0 && recuperacao['p99 ms'] <= Math.max(base0['p99 ms'] * 2, 50);
  console.log(
    voltou
      ? 'Recuperação: OK, o servidor voltou à latência normal depois da sobrecarga.'
      : `Recuperação: PROBLEMA, p99 ${recuperacao['p99 ms']} ms (antes ${base0['p99 ms']} ms), ${recuperacao._detalhe}.`,
  );
  return voltou;
}

let servidor;
let sucesso = false;
try {
  if (!externo) {
    servidor = subirServidor();
    servidor.on('exit', (codigo) => {
      if (codigo) console.error(`O servidor de teste saiu com código ${codigo}`);
    });
  }
  await esperarServidor();
  sucesso = modo === 'sobrecarga' ? await sobrecarga() : await carga();
} catch (erro) {
  console.error(erro.message);
} finally {
  servidor?.kill();
}
process.exit(sucesso ? 0 : 1);
