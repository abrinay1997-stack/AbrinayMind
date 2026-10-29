import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entorno } from './helpers.mjs';
import { construirDemo } from '../scripts/dev/boveda-demo.mjs';

test('la bóveda de demostración es válida: se importa entera, es estable y cubre los casos de pantalla', async () => {
  const a = construirDemo(), b = construirDemo();
  assert.deepEqual(a, b, 'misma semilla, misma bóveda');
  assert.ok(a.notas.length >= 200);
  const t = await entorno();
  assert.equal((await t.j('POST', '/api/brains/import', { cerebro: a.cerebro })).status, 200);
  let nuevas = 0;
  for (let i = 0; i < a.notas.length; i += 10) { const r = await t.j('POST', '/api/b/demo/import/notas', { notas: a.notas.slice(i, i + 10) }); assert.equal(r.status, 200, JSON.stringify(r.datos)); nuevas += r.datos.nuevas; }
  assert.equal(nuevas, a.notas.length);
  for (let d = 0; ; ) { const m = (await t.j('POST', '/api/b/demo/menciones', { desde: d, cuantas: 30 })).datos; if (m.siguiente == null) break; d = m.siguiente; }
  const meta = (await t.j('GET', '/api/b/demo/meta')).datos;
  assert.equal(meta.modos.length, 4, 'cuatro modos para probar el selector');
  assert.ok(meta.siempre.length >= 5, 'varias notas «siempre»');
  assert.ok(meta.carpetas.length >= 10, 'varios lóbulos');
  const q = (await t.j('GET', '/api/b/demo/quality')).datos;
  assert.deepEqual(q.rotos.map((x) => x.hacia).sort(), ['Nota inexistente de demostración', 'Una nota que aún no existe'], 'solo los dos enlaces rotos a propósito');
  assert.equal(q.huerfanas.length, 3, 'tres huérfanas a propósito');
  const g = (await t.j('GET', '/api/b/demo/graph')).datos;
  assert.ok(g.links.length > 400 && g.nodes.some((n) => n.p) && g.nodes.some((n) => n.s));
  const larga = (await t.j('GET', '/api/b/demo/note?name=' + encodeURIComponent('Nota larga para probar el scroll'))).datos;
  assert.ok(larga.text.length > 6000);
});
