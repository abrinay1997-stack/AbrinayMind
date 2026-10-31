import test from 'node:test';
import assert from 'node:assert/strict';
import { cambiosDeLetra, resumenDeCambios, lineasConSeccion } from '../public/core/diferencias.js';

// letras INVENTADAS
const ANTES = `[VERSO 1]
La lluvia dibuja un mapa
Cada gota es una calle
Sigo el trazo sin saber

[CORO]
Que el reloj responda
Que la noche guarde la hora`;

test('sin cambios (aunque cambien espacios y renglones vacíos): nada que enseñar', () => {
  assert.deepEqual(cambiosDeLetra(ANTES, ANTES.replace(/\n/g, '\n\n').replace(/ /g, '  ')), []);
  assert.equal(resumenDeCambios([]), 'Sin cambios en la letra.');
});

test('una línea cambiada: aparece antes y después, con su sección', () => {
  const d = ANTES.replace('Cada gota es una calle', 'Cada gota es una puerta');
  assert.deepEqual(cambiosDeLetra(ANTES, d), [{ seccion: 'VERSO 1', antes: ['Cada gota es una calle'], despues: ['Cada gota es una puerta'] }]);
});

test('una línea quitada y otra añadida, en cambios separados y en orden', () => {
  const d = ANTES.replace('Sigo el trazo sin saber\n', '').replace('Que la noche guarde la hora', 'Que la noche guarde la hora\nQue nadie lo apague');
  const c = cambiosDeLetra(ANTES, d);
  assert.deepEqual(c, [
    { seccion: 'VERSO 1', antes: ['Sigo el trazo sin saber'], despues: [] },
    { seccion: 'CORO', antes: [], despues: ['Que nadie lo apague'] },
  ]);
  assert.equal(resumenDeCambios(c), '2 cambios · 1 línea quitada · 1 nueva');
});

test('varias líneas seguidas reemplazadas forman un solo cambio', () => {
  const d = ANTES.replace('La lluvia dibuja un mapa\nCada gota es una calle', 'Hoy llueve sobre el barrio\nY nadie sale a mirar');
  const c = cambiosDeLetra(ANTES, d);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].antes, ['La lluvia dibuja un mapa', 'Cada gota es una calle']);
  assert.deepEqual(c[0].despues, ['Hoy llueve sobre el barrio', 'Y nadie sale a mirar']);
});

test('las etiquetas de sección no cuentan como líneas, pero sí dicen dónde está cada una', () => {
  assert.deepEqual(lineasConSeccion('[CORO]\nuno\n\n## [PUENTE]\ndos'), [{ l: 'uno', seccion: 'CORO' }, { l: 'dos', seccion: 'PUENTE' }]);
  assert.deepEqual(cambiosDeLetra('[CORO]\nuno', '[ESTRIBILLO]\nuno'), []);
});

test('una letra enorme no se cuelga', () => {
  const a = Array.from({ length: 900 }, (_, i) => `línea ${i}`).join('\n'), b = a.replace('línea 5\n', '');
  const t0 = performance.now(); const c = cambiosDeLetra(a, b); assert.ok(performance.now() - t0 < 1500);
  assert.ok(c.length >= 1 && c.length <= 2, `cambios: ${c.length}`);   // se comparan las primeras 400 líneas
});
