// Abrinay Mind — sacar y meter cerebros enteros. La bóveda de un artista viaja como un archivo JSON (nunca por Git):
//   { formato: 'abrinay-mind/boveda@1', cerebro: { slug, nombre, subtitulo, color }, notas: [{ nombre, carpeta, texto, actualizado }], sinapsis?: [...] }
import { bad, choque, ahora } from './http.js';
import { todas } from './db.js';
import * as cerebros from './brains.js';
import { auditar } from './db.js';

export const FORMATO = 'abrinay-mind/boveda@1';

export async function exportar(db, brain) {
  const ns = await todas(db, 'select name, folder, text, updated from notes where brain_id = ? order by folder, name', brain.id);
  const sin = await todas(db, 'select a, b, weight, uses, updated from synapses where brain_id = ?', brain.id);
  const pesos = await todas(db, 'select name, weight, uses, updated from note_weights where brain_id = ?', brain.id);
  return { formato: FORMATO, cerebro: { slug: brain.slug, nombre: brain.name, subtitulo: brain.subtitle, color: brain.color }, creado: new Date(ahora()).toISOString(),
    notas: ns.map((n) => ({ nombre: n.name, carpeta: n.folder, texto: n.text, actualizado: n.updated })),
    sinapsis: sin.map((s) => ({ a: s.a, b: s.b, peso: s.weight, usos: s.uses, actualizado: s.updated })), pesos: pesos.map((p) => ({ nombre: p.name, peso: p.weight, usos: p.uses, actualizado: p.updated })) };
}

/** Empieza una importación: crea el cerebro (vacío, sin plantilla) o, con `reemplazar`, lo vacía. Las notas suben después, de a pocas. */
export async function empezar(db, { cerebro, reemplazar = false, por = '' }) {
  if (!cerebro || typeof cerebro !== 'object') throw bad('El archivo no trae los datos del cerebro.');
  const slug = cerebros.slugDe(cerebro.slug || cerebro.nombre);
  if (!slug) throw bad('El cerebro necesita un nombre.');
  const existe = await db.prepare('select * from brains where slug = ?').bind(slug).first();
  if (existe && !reemplazar) throw choque(`Ya existe un cerebro «${slug}». Marca «reemplazar» para sustituir su contenido.`);
  if (existe) {
    const id = existe.id;
    await db.batch([
      db.prepare("insert into passages_fts(passages_fts, rowid, stem) select 'delete', id, stem from passages where brain_id = ?").bind(id),
      ...['passages', 'notes', 'links', 'synapses', 'note_weights', 'vectors'].map((t) => db.prepare(`delete from ${t} where brain_id = ?`).bind(id)),
    ]);
    await auditar(db, id, 'importar.reemplazar', por, slug);
    return existe;
  }
  const b = await cerebros.crear(db, { name: String(cerebro.nombre || slug), slug, subtitle: cerebro.subtitulo || '', color: /^#[0-9a-f]{6}$/i.test(cerebro.color || '') ? cerebro.color : '#8b5cf6', plantilla: false, por });
  return b;
}

/** Al final: las sinapsis y pesos que traía el archivo (si los traía). */
export async function terminar(db, brain, { sinapsis = [], pesos = [] }) {
  const existentes = new Set((await todas(db, 'select name from notes where brain_id = ?', brain.id)).map((r) => r.name));
  const s = [];
  for (const x of Array.isArray(sinapsis) ? sinapsis.slice(0, 2000) : []) if (existentes.has(x?.a) && existentes.has(x?.b)) s.push(db.prepare('insert or replace into synapses (brain_id, a, b, weight, uses, updated) values (?,?,?,?,?,?)').bind(brain.id, x.a, x.b, Number(x.peso) || 0, Number(x.usos) || 0, Number(x.actualizado) || ahora()));
  for (const x of Array.isArray(pesos) ? pesos.slice(0, 2000) : []) if (existentes.has(x?.nombre)) s.push(db.prepare('insert or replace into note_weights (brain_id, name, weight, uses, updated) values (?,?,?,?,?)').bind(brain.id, x.nombre, Number(x.peso) || 0, Number(x.usos) || 0, Number(x.actualizado) || ahora()));
  for (let i = 0; i < s.length; i += 80) await db.batch(s.slice(i, i + 80));
  return { ok: true, sinapsis: s.length };
}
