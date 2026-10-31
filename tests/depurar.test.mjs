import test from 'node:test';
import assert from 'node:assert/strict';
import { carpetasDe, depurar, pareceCancionesOReferentes, RAIZ } from '../public/js/depurar.js';

// una bóveda INVENTADA (ninguna letra real)
const nota = (nombre, carpeta, texto = `# ${nombre}\n`) => ({ nombre, carpeta, texto, actualizado: 1 });
const BOVEDA = {
  formato: 'abrinay-mind/boveda@1', cerebro: { slug: 'demo', nombre: 'Demo', color: '#94a3b8' },
  notas: [
    nota('Reglas de oro', '00-Meta', '---\ntipo: regla\nsiempre: true\n---\n# Reglas de oro\n\nVer [[Técnica de rima]] y [[Canción uno|esa canción]] y [[Referente Delta#Rima]].'),
    nota('Modo íntimo', '30-Modos', '---\ntipo: modo\n---\n# Modo íntimo\n'),
    nota('Técnica de rima', '20-Estilo/Recursos', '# Técnica de rima\n\nEjemplo en [[Canción uno]] y en [[cancion uno]].'),
    nota('Canción uno', '40-Canciones', '# Canción uno\n\n[VERSO 1]\nlínea inventada'),
    nota('Canción dos', '40-Canciones/Generadas', '# Canción dos\n'),
    nota('Referente Delta', '50-Referentes', '# Referente Delta\n\nAnálisis, sin letra. Ver [[Técnica de rima]].'),
    nota('Suelta', '', '# Suelta\n\n[[Referente Delta]]'),
  ],
  sinapsis: [{ a: 'Técnica de rima', b: 'Modo íntimo', peso: 0.5 }, { a: 'Técnica de rima', b: 'Canción uno', peso: 0.9 }],
  pesos: [{ nombre: 'Técnica de rima', peso: 0.1 }, { nombre: 'Canción dos', peso: -0.1 }],
};

test('carpetas: primer nivel, con conteo, ejemplos y cuántas son reglas fijas o modos', () => {
  const c = carpetasDe(BOVEDA.notas);
  assert.deepEqual(c.map((x) => [x.nombre, x.n]), [[RAIZ, 1], ['00-Meta', 1], ['20-Estilo', 1], ['30-Modos', 1], ['40-Canciones', 2], ['50-Referentes', 1]]);
  assert.equal(c.find((x) => x.nombre === '00-Meta').siempre, 1);
  assert.equal(c.find((x) => x.nombre === '30-Modos').modos, 1);
  assert.deepEqual(c.find((x) => x.nombre === '40-Canciones').ejemplos, ['Canción uno', 'Canción dos']);
});

test('atajo: reconoce carpetas de canciones y referentes por su nombre', () => {
  for (const s of ['40-Canciones', '50-Referentes', '60-Letras', 'Catálogo']) assert.equal(pareceCancionesOReferentes(s), true, s);
  for (const s of ['00-Meta', '20-Estilo', '30-Modos', '10-Identidad', '70-Aprendizaje']) assert.equal(pareceCancionesOReferentes(s), false, s);
});

test('depurar: se quitan las carpetas elegidas (con sus subcarpetas) y se cuenta lo que queda', () => {
  const r = depurar(BOVEDA, { quitar: new Set(['40-Canciones', '50-Referentes']) });
  assert.deepEqual(r.datos.notas.map((n) => n.nombre), ['Reglas de oro', 'Modo íntimo', 'Técnica de rima', 'Suelta']);
  assert.deepEqual([r.total, r.quedan, r.quitadas], [7, 4, 3]);
  assert.equal(BOVEDA.notas.length, 7, 'el original no se toca');
});

test('depurar: los [[enlaces]] a notas quitadas pasan a texto normal (alias, sección y sin tildes incluidos); los demás se conservan', () => {
  const r = depurar(BOVEDA, { quitar: ['40-Canciones', '50-Referentes'] });
  const t = (n) => r.datos.notas.find((x) => x.nombre === n).texto;
  assert.match(t('Reglas de oro'), /Ver \[\[Técnica de rima\]\] y esa canción y Referente Delta\./);
  assert.match(t('Técnica de rima'), /Ejemplo en Canción uno y en cancion uno\./);
  assert.match(t('Suelta'), /^# Suelta\n\nReferente Delta$/);
  assert.equal(r.enlaces, 5);
  const sin = depurar(BOVEDA, { quitar: ['40-Canciones'], limpiarEnlaces: false });
  assert.match(sin.datos.notas[0].texto, /\[\[Canción uno\|esa canción\]\]/); assert.equal(sin.enlaces, 0);
});

test('depurar: las sinapsis y los pesos aprendidos de notas quitadas se van; los de notas que quedan, no', () => {
  const r = depurar(BOVEDA, { quitar: ['40-Canciones'] });
  assert.deepEqual(r.datos.sinapsis.map((s) => `${s.a}|${s.b}`), ['Técnica de rima|Modo íntimo']);
  assert.deepEqual(r.datos.pesos.map((p) => p.nombre), ['Técnica de rima']);
});

test('depurar: sin quitar nada, queda igual; quitando la raíz, se va la nota suelta', () => {
  const igual = depurar(BOVEDA);
  assert.equal(igual.quitadas, 0); assert.deepEqual(igual.datos.notas, BOVEDA.notas); assert.equal(igual.enlaces, 0);
  assert.ok(!depurar(BOVEDA, { quitar: [RAIZ] }).datos.notas.some((n) => n.nombre === 'Suelta'));
});

test('depurar: una nota que se llama igual que una quitada pero sigue viva no se «desenlaza»', () => {
  const b = { notas: [nota('Rima', '20-Estilo', 'Ver [[Rima]]'), nota('Rima', '40-Canciones')], sinapsis: [], pesos: [] };
  // mismo nombre en dos carpetas: la que queda sigue siendo destino válido
  const r = depurar(b, { quitar: ['40-Canciones'] });
  assert.equal(r.datos.notas[0].texto, 'Ver [[Rima]]'); assert.equal(r.enlaces, 0);
});
