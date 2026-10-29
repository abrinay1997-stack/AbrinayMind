import test from 'node:test';
import assert from 'node:assert/strict';
import { derivarAcento, contraste, normalizar, MUESTRAS, ACENTO_POR_DEFECTO } from '../public/js/color.js';

const SUPERFICIE = '#22262c', FONDO = '#0a0b0d';

test('normalizar acepta #rgb y #rrggbb y rechaza lo demás', () => {
  assert.equal(normalizar('#ABC'), '#aabbcc');
  assert.equal(normalizar(' #8B5CF6 '), '#8b5cf6');
  for (const malo of ['', null, 'rojo', '#12', '#12345', '#gggggg', 'javascript:alert(1)']) assert.equal(normalizar(malo), null);
});

test('un valor inválido cae al acento por defecto', () => {
  assert.equal(derivarAcento('nada').acento, ACENTO_POR_DEFECTO);
});

test('para cualquier acento, el texto encima del relleno y el texto de acento cumplen AA', () => {
  const casos = [...MUESTRAS, '#facc15', '#1e3a8a', '#000000', '#ffffff', '#8b5cf6', '#ec4899', '#808080', '#0000ff', '#ffff00'];
  for (const c of casos) {
    const r = derivarAcento(c);
    assert.ok(contraste(r.sobre, r.acento) >= 4.5, `${c}: texto sobre el relleno ${contraste(r.sobre, r.acento).toFixed(2)}`);
    assert.ok(contraste(r.texto, SUPERFICIE) >= 4.5, `${c}: texto de acento ${contraste(r.texto, SUPERFICIE).toFixed(2)}`);
    assert.ok(contraste(r.ui, FONDO) >= 3, `${c}: trazos de acento ${contraste(r.ui, FONDO).toFixed(2)}`);
  }
});

test('un acento claro usa texto oscuro y uno oscuro usa texto claro', () => {
  assert.equal(derivarAcento('#facc15').sobre, '#0b0c0f');
  assert.equal(derivarAcento('#1e3a8a').sobre, '#ffffff');
});

test('un acento que ya se lee no se modifica', () => {
  assert.equal(derivarAcento('#22d3ee').texto, '#22d3ee');
});
