import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORES } from '../src/controllers/painel/classificacaoController.js';

const css = readFileSync(new URL('../src/public/css/mapa.css', import.meta.url), 'utf8');

test('toda cor ou bandeira oferecida no painel tem estilo no CSS do mapa', () => {
  for (const { valor } of CORES) {
    assert.match(css, new RegExp(`\\.marcador--${valor} \\{`), `falta .marcador--${valor}`);
  }
});

test('as opções de cor não se repetem e vêm em dois grupos', () => {
  const valores = CORES.map((c) => c.valor);
  assert.equal(new Set(valores).size, valores.length);

  const grupos = new Set(CORES.map((c) => c.grupo));
  assert.deepEqual([...grupos].sort(), ['Bandeiras do orgulho', 'Cores lisas']);
  assert.ok(CORES.filter((c) => c.grupo === 'Cores lisas').length >= 25);
  assert.ok(CORES.filter((c) => c.grupo === 'Bandeiras do orgulho').length >= 15);
});

test('as três cores da ONG Somos estão entre as cores lisas', () => {
  const lisas = CORES.filter((c) => c.grupo === 'Cores lisas').map((c) => c.valor);
  for (const valor of ['cor-roxo', 'cor-rosa', 'cor-turquesa']) assert.ok(lisas.includes(valor));
  assert.match(css, /--cat-cor-roxo: #7d4c98/);
  assert.match(css, /--cat-cor-rosa: #e63087/);
  assert.match(css, /--cat-cor-turquesa: #5ac0d0/);
});

const slug = (texto) =>
  texto
    .replace(/\s*\(.*\)/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');

test('a chave de cada opção é o nome que aparece no painel', () => {
  for (const { valor, texto, grupo } of CORES) {
    const esperado = grupo === 'Cores lisas' ? `cor-${slug(texto)}` : slug(texto);
    // Única exceção: a bandeira "Orgulho progresso" se chama "progresso" na chave.
    const chave = valor === 'progresso' ? 'orgulho-progresso' : valor;
    assert.equal(chave, esperado, `"${texto}" está com a chave "${valor}"`);
  }
});

test('a migration converte as chaves antigas gravadas no banco para chaves que existem', () => {
  const sql = readFileSync(
    new URL(
      '../prisma/migrations/20261124130000_renomear_cores_dos_marcadores/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const conversoes = [...sql.matchAll(/WHEN '([^']+)' THEN '([^']+)'/g)].map((m) => [m[1], m[2]]);
  const valores = CORES.map((c) => c.valor);

  // As nove chaves que já podiam estar gravadas no banco precisam estar cobertas.
  for (const antiga of [
    'ambulatorio',
    'ong',
    'saude-sexual',
    'abrigo',
    'albergue',
    'centro-pop',
    'casa-cidadania',
    'acolhimento',
    'padrao',
  ]) {
    assert.ok(
      conversoes.some(([velha]) => velha === antiga),
      `a migration não converte "${antiga}"`,
    );
  }
  for (const [velha, nova] of conversoes) {
    assert.ok(valores.includes(nova), `"${velha}" vira "${nova}", que não existe`);
    assert.ok(!valores.includes(velha), `"${velha}" ainda é uma opção válida`);
  }
});
