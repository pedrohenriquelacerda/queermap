import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkComoChegar } from '../src/utils/formatadores.js';

test('"Como chegar" abre o Google Maps com as coordenadas do local como destino', () => {
  const url = new URL(linkComoChegar({ latitude: -30.0346, longitude: -51.2177 }));

  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), '-30.0346,-51.2177');
  // A origem fica por conta da pessoa, dentro do Google Maps.
  assert.equal(url.searchParams.has('origin'), false);
});

test('"Como chegar" não aponta mais para o OpenStreetMap', () => {
  assert.doesNotMatch(linkComoChegar({ latitude: 1, longitude: 2 }), /openstreetmap/);
});
