import test from 'node:test';
import assert from 'node:assert/strict';
import { parsear, primeraLinea } from '../public/js/lyric.js';

test('una letra con secciones, idea central y notas técnicas', () => {
  const r = parsear('Idea central: el silencio es una elección.\n\n[INTRO]\nHablo bajo\n\n[VERSO 1]\nUna línea\nOtra línea\n\n[CORO]\nElegí el silencio\n\n## Notas técnicas\nRima en -ar.\nNotas que pesaron: Anáfora.');
  assert.equal(r.esLetra, true);
  assert.equal(r.versiones.length, 1);
  const v = r.versiones[0];
  assert.match(v.idea, /silencio es una elección/);
  assert.deepEqual(v.secciones.map((s) => s.nombre), ['INTRO', 'VERSO 1', 'CORO']);
  assert.deepEqual(v.secciones[1].lineas, ['Una línea', 'Otra línea']);
  assert.match(v.notas, /Notas que pesaron/);
  assert.equal(primeraLinea(v), 'Hablo bajo');
});

test('varias versiones se separan en cada «## VERSIÓN»', () => {
  const r = parsear('Aquí van dos.\n\n## VERSIÓN A\n[CORO]\nuno\n## Notas técnicas\nnota a\n\n## VERSIÓN B\n[CORO]\ndos\n## Notas técnicas\nnota b');
  assert.equal(r.intro, 'Aquí van dos.');
  assert.deepEqual(r.versiones.map((v) => v.etiqueta), ['A', 'B']);
  assert.equal(r.versiones[1].secciones[0].lineas[0], 'dos');
  assert.equal(r.versiones[0].notas, 'nota a');
});

test('si el cerebro solo pregunta o conversa, no es una letra', () => {
  const r = parsear('¿Qué modo prefieres: Introspectivo, Técnico, Emocional o Comercial?');
  assert.equal(r.esLetra, false);
});

test('tolera corchetes en negrita, con dos puntos o con almohadillas', () => {
  const r = parsear('**[VERSO 1]**\nlínea\n## [CORO]:\notra');
  assert.deepEqual(r.versiones[0].secciones.map((s) => s.nombre), ['VERSO 1', 'CORO']);
});

test('una letra a medias (en streaming) se lee sin romperse', () => {
  const r = parsear('[VERSO 1]\nuna lín');
  assert.equal(r.esLetra, true);
  assert.equal(r.versiones[0].secciones[0].lineas[0], 'una lín');
});
