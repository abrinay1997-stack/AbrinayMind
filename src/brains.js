// Abrinay Mind — los cerebros: uno por artista. Crear, listar, cambiar, borrar y arrancar uno nuevo con una plantilla.
import { fold } from '../public/core/text.js';
import { HttpError, bad, noEsta, choque, ahora } from './http.js';
import { todas, una, correr, lotes, auditar } from './db.js';
import { NOTAS, CARPETAS } from './names.js';
import * as notas from './notes.js';

const COLOR = /^#[0-9a-f]{6}$/i;
export const slugDe = (t) => fold(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const publico = (b) => ({ slug: b.slug, name: b.name, subtitle: b.subtitle, color: b.color, created: b.created, updated: b.updated, notes: b.notes ?? undefined, songs: b.songs ?? undefined });

export async function listar(db) {
  const filas = await todas(db, `select b.*, (select count(*) from notes n where n.brain_id = b.id) as notes, (select count(*) from songs s where s.brain_id = b.id) as songs from brains b order by b.created`);
  return filas.map(publico);
}

export async function porSlug(db, slug) {
  const b = await una(db, 'select * from brains where slug = ?', String(slug ?? ''));
  if (!b) throw noEsta('Ese cerebro no existe.');
  return b;
}

export async function crear(db, { name, slug, subtitle = '', color = '#8b5cf6', plantilla = true, por = '' }) {
  const nombre = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!nombre || nombre.length > 60) throw bad('El cerebro necesita un nombre (hasta 60 letras).');
  const s = slugDe(slug || nombre);
  if (!s) throw bad('No pude sacar un identificador de ese nombre.');
  if (await una(db, 'select 1 x from brains where slug = ?', s)) throw choque(`Ya hay un cerebro con el identificador «${s}».`);
  if (!COLOR.test(color)) throw bad('El color debe ser como #8b5cf6.');
  const t = ahora();
  const r = await db.prepare('insert into brains (slug, name, subtitle, color, created, updated) values (?,?,?,?,?,?)').bind(s, nombre, String(subtitle).slice(0, 120), color, t, t).run();
  const brain = await una(db, 'select * from brains where id = ?', r.meta.last_row_id);
  if (plantilla) for (const n of plantillaDe(nombre)) await notas.crear(db, brain, { ...n, por });
  await auditar(db, brain.id, 'cerebro.crear', por, nombre);
  return brain;
}

export async function cambiar(db, brain, { name, subtitle, color, por = '' }) {
  const nombre = name == null ? brain.name : String(name).replace(/\s+/g, ' ').trim();
  if (!nombre || nombre.length > 60) throw bad('El cerebro necesita un nombre (hasta 60 letras).');
  const c = color == null ? brain.color : color;
  if (!COLOR.test(c)) throw bad('El color debe ser como #8b5cf6.');
  await correr(db, 'update brains set name = ?, subtitle = ?, color = ?, updated = ? where id = ?', nombre, subtitle == null ? brain.subtitle : String(subtitle).slice(0, 120), c, ahora(), brain.id);
  await auditar(db, brain.id, 'cerebro.cambiar', por, nombre);
  return await una(db, 'select * from brains where id = ?', brain.id);
}

/** Borrar un cerebro es definitivo: hay que escribir su identificador. */
export async function borrar(db, brain, { confirm, por = '' }) {
  if (String(confirm ?? '') !== brain.slug) throw bad(`Para borrar este cerebro escribe su identificador: ${brain.slug}`);
  const id = brain.id;
  await lotes(db, [
    db.prepare("insert into passages_fts(passages_fts, rowid, stem) select 'delete', id, stem from passages where brain_id = ?").bind(id),
    ...['passages', 'notes', 'notes_trash', 'links', 'synapses', 'note_weights', 'vectors', 'songs', 'usage'].map((t) => db.prepare(`delete from ${t} where brain_id = ?`).bind(id)),
    db.prepare('delete from chat_messages where chat_id in (select id from chats where brain_id = ?)').bind(id),
    db.prepare('delete from chats where brain_id = ?').bind(id),
    db.prepare('delete from brains where id = ?').bind(id),
  ]);
  await auditar(db, null, 'cerebro.borrar', por, brain.slug);
  return { ok: true };
}

/** El esqueleto de un cerebro nuevo: lo mínimo para que escribir y aprender funcionen desde el primer día. */
export function plantillaDe(nombre) {
  const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
  return [
    { nombre: `${nombre} Mind — Índice`, carpeta: CARPETAS.meta, texto: `${fm({ tipo: 'moc' })}# ${nombre} Mind — Índice\n\nEl cerebro de **${nombre}**. Cada nota es una neurona y cada enlace, una sinapsis.\n\n## Para empezar\n\n- Cuéntale al cerebro quién es el artista: [[${nombre} — Perfil]]\n- Las reglas que se leen siempre: [[Reglas de oro — SIEMPRE]] y [[Reglas de oro — NUNCA]]\n- Lo que va aprendiendo: [[${NOTAS.aprendidas}]], [[${NOTAS.bitacora}]], [[${NOTAS.puntuaciones}]]\n- Cómo escribe: [[${NOTAS.protocolo}]]\n` },
    { nombre: `${nombre} — Perfil`, carpeta: '10-Identidad', texto: `${fm({ tipo: 'identidad', siempre: true })}# ${nombre} — Perfil\n\n_Completa esta nota con una entrevista: nombre artístico, de dónde viene, géneros, tipo de flow, temas que escribe y los que nunca tocaría, cómo escribe, palabras y frases que son suyas, referentes en orden y qué aporta cada uno, y su sueño._\n\nVolver al [[${nombre} Mind — Índice]].\n` },
    { nombre: 'Reglas de oro — SIEMPRE', carpeta: CARPETAS.meta, texto: `${fm({ tipo: 'regla', siempre: true })}# Reglas de oro — SIEMPRE\n\n_Lo que el cerebro hace SIEMPRE al escribir para ${nombre}. Una regla por línea._\n\n1. \n\nVer [[${NOTAS.aprendidas}]] y [[${nombre} Mind — Índice]].\n` },
    { nombre: 'Reglas de oro — NUNCA', carpeta: CARPETAS.meta, texto: `${fm({ tipo: 'regla', siempre: true })}# Reglas de oro — NUNCA\n\n_Lo que el cerebro NUNCA hace al escribir para ${nombre}. Una regla por línea._\n\n1. \n\nVer [[${NOTAS.aprendidas}]] y [[${nombre} Mind — Índice]].\n` },
    { nombre: NOTAS.aprendidas, carpeta: CARPETAS.meta, texto: `${fm({ tipo: 'regla', siempre: true })}# ${NOTAS.aprendidas}\n\nReglas que el cerebro aprendió de los veredictos de ${nombre}. La app añade aquí cada regla que se acepta tras rechazar una letra ([[${NOTAS.bitacora}]]).\n\n## Reglas\n\n` },
    { nombre: NOTAS.protocolo, carpeta: CARPETAS.meta, texto: `${fm({ tipo: 'protocolo', siempre: true })}# ${NOTAS.protocolo}\n\n1. Leer las reglas de oro y lo aprendido antes de escribir.\n2. Si hay modos de escritura y el artista no dijo cuál, preguntar.\n3. Definir la idea central de la canción antes de escribir.\n4. Escribir con la estructura y la técnica que pide el modo, respetando las líneas del artista.\n5. Entregar con notas técnicas.\n6. El artista aprueba o rechaza; cada veredicto enseña al cerebro ([[${NOTAS.bitacora}]], [[${NOTAS.puntuaciones}]]).\n\nVolver al [[${nombre} Mind — Índice]].\n` },
    { nombre: NOTAS.bitacora, carpeta: CARPETAS.aprendizaje, texto: `${fm({ tipo: 'bitacora' })}# ${NOTAS.bitacora}\n\nCada letra rechazada deja una entrada aquí, con la regla que enseñó.\n\n## Entradas\n\n` },
    { nombre: NOTAS.puntuaciones, carpeta: CARPETAS.aprendizaje, texto: `${fm({ tipo: 'aprendizaje' })}# ${NOTAS.puntuaciones}\n\nLas notas que ${nombre} da a cada letra.\n\n## Nuevas puntuaciones\n\n` },
  ];
}
