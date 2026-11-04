import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanciaKm, localCorresponde } from '../src/public/js/filtrosLocais.js';

const local = {
  busca: 'ambulatorio centro prep',
  tipo: 'ambulatorio',
  caracteristicas: ['prep', 'nome-social'],
  nota: 4.5,
  lat: -30.03,
  lng: -51.23,
};

test('cada filtro e a combinação usam a mesma regra', () => {
  assert.equal(localCorresponde(local, { termos: ['centro'] }), true);
  assert.equal(localCorresponde(local, { tipos: ['ambulatorio'] }), true);
  assert.equal(localCorresponde(local, { caracteristicas: ['prep'] }), true);
  assert.equal(localCorresponde(local, { nota: 4 }), true);
  assert.equal(localCorresponde(local, { distancia: 0, origem: [-30.03, -51.23] }), true);
  assert.equal(
    localCorresponde(local, {
      termos: ['centro'],
      tipos: ['ambulatorio'],
      caracteristicas: ['prep'],
      nota: 4,
      distancia: 1,
      origem: [-30.03, -51.23],
    }),
    true,
  );
});

test('exclusões, ausência de resultado e redefinição', () => {
  assert.equal(localCorresponde(local, { tipos: ['abrigo'] }), false);
  assert.equal(localCorresponde(local, { caracteristicas: ['abrigo'] }), false);
  assert.equal(localCorresponde(local, { nota: 5 }), false);
  assert.equal(localCorresponde({ ...local, nota: null }, { nota: 1 }), false);
  assert.equal(localCorresponde(local, { distancia: 1, origem: null }), false);
  assert.equal(localCorresponde(local, { distancia: 1, origem: [-30.1, -51.23] }), false);
  assert.equal(localCorresponde(local, { nota: NaN }), false);
  assert.equal(localCorresponde(local, { distancia: -1, origem: [-30.03, -51.23] }), false);
  assert.equal(localCorresponde(local, {}), true);
});

test('distância em km rejeita coordenadas ausentes e respeita o limite', () => {
  assert.equal(distanciaKm([-30.03, -51.23], [-30.03, -51.23]), 0);
  assert.equal(distanciaKm([-30.03, -51.23], [NaN, -51.23]), Infinity);
  assert.equal(distanciaKm([-30.03, -51.23], [91, -51.23]), Infinity);
  assert.ok(distanciaKm([-30.03, -51.23], [-30.04, -51.23]) > 1);
});
