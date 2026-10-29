// Abrinay Mind — las notas: crear, leer, editar, añadir, mover, renombrar, tirar y recuperar.
// Cada escritura deja al día lo que depende de la nota: sus pasajes en la búsqueda (FTS5), sus enlaces [[explícitos]] y sus menciones.
// Reglas: `base` (la revisión que leíste) evita pisar lo que otra pestaña cambió; nada se borra de verdad (papelera 30 días).
import { nombreValido, carpetaValida, MAX_NOTA, leerCabecera, hechosDe, pasajes, ftsStem, enlaces, fold, agregarTexto, renombrarEnlaces, blancosDe, mencionesDeUna, resumen } from '../public/core/text.js';
import { HttpError, bad, noEsta, choque, ahora } from './http.js';
import { todas, una, correr, lotes, auditar, marcas } from './db.js';

const bytesDe = (t) => new TextEncoder().encode(t).length;

/** Las columnas que salen de la cabecera de la nota. */
export const cols = (texto) => { const h = hechosDe(texto); return { always: h.siempre, private: h.privado, tipo: h.tipo, alias: h.alias.join(', '), nomention: h.sinMencion ? 1 : 0 }; };

/** nombre sin tildes → nombre real, de todas las notas del cerebro. */
export async function indiceDeNombres(db, brainId) {
  return new Map((await todas(db, 'select name from notes where brain_id = ?', brainId)).map((r) => [fold(r.name), r.name]));
}

/** Sentencias que reconstruyen el índice de búsqueda y los enlaces [[…]] de una nota. */
function sentenciasDeIndice(db, brainId, nombre, texto, existentes) {
  const s = [
    db.prepare("insert into passages_fts(passages_fts, rowid, stem) select 'delete', id, stem from passages where brain_id = ? and note = ?").bind(brainId, nombre),
    db.prepare('delete from passages where brain_id = ? and note = ?').bind(brainId, nombre),
  ];
  for (const p of pasajes(nombre, texto)) {
    s.push(db.prepare('insert into passages (brain_id, note, idx, head, text, stem, hash) values (?,?,?,?,?,?,?)').bind(brainId, nombre, p.i, p.titulo, p.texto, ftsStem(`${nombre.replace(/[-_]/g, ' ')} ${p.titulo} ${p.texto}`), p.hash));
  }
  s.push(db.prepare('insert into passages_fts(rowid, stem) select id, stem from passages where brain_id = ? and note = ?').bind(brainId, nombre));
  s.push(db.prepare("delete from links where brain_id = ? and src = ? and kind = 'link'").bind(brainId, nombre));
  for (const t of enlaces(texto)) {
    const real = existentes.get(fold(t));
    if (real === nombre) continue;
    s.push(db.prepare("insert or replace into links (brain_id, src, tfold, target, dst, kind, weight) values (?,?,?,?,?, 'link', 1)").bind(brainId, nombre, fold(t), t, real ?? null));
  }
  return s;
}

/** Las menciones que salen de UNA nota (contra los nombres y alias de todas las demás). */
export async function recalcularMencionesDe(db, brainId, nombre, texto, blancos = null) {
  const b = blancos ?? await blancosDelCerebro(db, brainId);
  const encontradas = mencionesDeUna(nombre, texto, b);
  const s = [db.prepare("delete from links where brain_id = ? and src = ? and kind = 'mention'").bind(brainId, nombre)];
  for (const [dst, veces] of encontradas) s.push(db.prepare("insert or replace into links (brain_id, src, tfold, target, dst, kind, weight) values (?,?,?,?,?, 'mention', ?)").bind(brainId, nombre, fold(dst), dst, dst, Math.min(1, veces / 3)));
  await lotes(db, s);
  return encontradas.length;
}
export async function blancosDelCerebro(db, brainId) {
  const filas = await todas(db, 'select name, alias, nomention from notes where brain_id = ?', brainId);
  return blancosDe(filas.map((f) => ({ nombre: f.name, texto: '', alias: f.alias, sinMencion: !!f.nomention })));
}

/** Los enlaces rotos que esperaban a una nota con este nombre ahora apuntan a ella. */
const resolverPendientes = (db, brainId, nombre) => correr(db, "update links set dst = ? where brain_id = ? and tfold = ? and dst is null and kind = 'link' and src <> ?", nombre, brainId, fold(nombre), nombre);

const filaPublica = (r) => ({ name: r.name, folder: r.folder, bytes: r.bytes, updated: r.updated, tipo: r.tipo, always: !!r.always, private: !!r.private });

export async function listar(db, brainId, { carpeta = '', q = '' } = {}) {
  let sql = 'select name, folder, bytes, updated, tipo, always, private from notes where brain_id = ?'; const p = [brainId];
  if (carpeta) { sql += ' and (folder = ? or folder like ?)'; p.push(carpeta, carpeta + '/%'); }
  if (q) { sql += ' and (name like ? )'; p.push(`%${q}%`); }
  return (await todas(db, sql + ' order by folder, name', ...p)).map(filaPublica);
}

export async function leer(db, brainId, nombre) {
  const n = await una(db, 'select * from notes where brain_id = ? and name = ?', brainId, nombre);
  if (!n) throw noEsta('Esa nota no existe (¿está en la papelera?).');
  const salientes = await todas(db, "select target, dst from links where brain_id = ? and src = ? and kind = 'link' order by target", brainId, nombre);
  const entrantes = await todas(db, "select src from links where brain_id = ? and dst = ? and kind = 'link' order by src", brainId, nombre);
  const mencionada = await todas(db, "select src from links where brain_id = ? and dst = ? and kind = 'mention' order by weight desc limit 30", brainId, nombre);
  const nombra = await todas(db, "select dst from links where brain_id = ? and src = ? and kind = 'mention' order by weight desc limit 30", brainId, nombre);
  const parecidas = await todas(db, "select dst, weight from links where brain_id = ? and src = ? and kind = 'meaning' order by weight desc limit 8", brainId, nombre);
  return {
    name: n.name, folder: n.folder, text: n.text, bytes: n.bytes, updated: n.updated, created: n.created, tipo: n.tipo, always: !!n.always, private: !!n.private,
    salientes: salientes.map((l) => ({ target: l.target, existe: !!l.dst, name: l.dst })), entrantes: entrantes.map((l) => l.src),
    mencionadaPor: mencionada.map((l) => l.src), nombra: nombra.map((l) => l.dst), parecidas: parecidas.map((l) => ({ name: l.dst, sim: l.weight })),
  };
}

function validar({ nombre, carpeta, texto }, { vacio = true } = {}) {
  const n = nombreValido(nombre); if (!n.ok) throw bad(n.error);
  const c = carpetaValida(carpeta ?? ''); if (!c.ok) throw bad(c.error);
  const t = String(texto ?? '');
  if (t.length > MAX_NOTA) throw new HttpError(413, `La nota es demasiado larga (máximo ${MAX_NOTA} letras).`);
  if (!vacio && !t.trim()) throw bad('La nota no puede quedar vacía.');
  return { nombre: n.nombre, carpeta: c.carpeta, texto: t };
}

export async function crear(db, brain, { nombre, carpeta = '', texto = '', por = '' }) {
  const v = validar({ nombre, carpeta, texto });
  const existentes = await indiceDeNombres(db, brain.id);
  if (existentes.has(fold(v.nombre))) throw choque(`Ya hay una nota llamada «${existentes.get(fold(v.nombre))}». Ábrela y edítala, o elige otro nombre.`);
  const t = ahora(), c = cols(v.texto);
  existentes.set(fold(v.nombre), v.nombre);
  await db.batch([db.prepare('insert into notes (brain_id, name, folder, text, bytes, always, private, tipo, alias, nomention, created, updated) values (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(brain.id, v.nombre, v.carpeta, v.texto, bytesDe(v.texto), c.always, c.private, c.tipo, c.alias, c.nomention, t, t)]);
  await lotes(db, sentenciasDeIndice(db, brain.id, v.nombre, v.texto, existentes));
  await resolverPendientes(db, brain.id, v.nombre);
  await recalcularMencionesDe(db, brain.id, v.nombre, v.texto);
  await auditar(db, brain.id, 'nota.crear', por, v.nombre);
  return { ok: true, name: v.nombre, updated: t };
}

/** Reemplaza el texto. `base`: la revisión leída; si cambió, 409 (no se pisa). */
export async function guardar(db, brain, { nombre, texto, base = null, carpeta = null, por = '', sinMenciones = false }) {
  const v = validar({ nombre, carpeta: carpeta ?? '', texto }, { vacio: false });
  const ya = await una(db, 'select * from notes where brain_id = ? and name = ?', brain.id, v.nombre);
  if (!ya) throw noEsta('Esa nota ya no existe (¿alguien la mandó a la papelera?).');
  if (base != null && Number(base) !== Number(ya.updated)) throw choque('Otra persona cambió esta nota mientras la editabas. Ábrela de nuevo para ver lo último y repite tu cambio.', { updated: ya.updated });
  const t = Math.max(ahora(), Number(ya.updated) + 1), c = cols(v.texto), nuevaCarpeta = carpeta == null ? ya.folder : v.carpeta;
  const r = await db.prepare('update notes set text = ?, bytes = ?, folder = ?, always = ?, private = ?, tipo = ?, alias = ?, nomention = ?, updated = ? where brain_id = ? and name = ? and updated = ?')
    .bind(v.texto, bytesDe(v.texto), nuevaCarpeta, c.always, c.private, c.tipo, c.alias, c.nomention, t, brain.id, v.nombre, ya.updated).run();
  if (!r.meta?.changes) throw choque('Otra persona cambió esta nota mientras la guardabas. Ábrela de nuevo y repite tu cambio.');
  await lotes(db, sentenciasDeIndice(db, brain.id, v.nombre, v.texto, await indiceDeNombres(db, brain.id)));
  if (!sinMenciones) await recalcularMencionesDe(db, brain.id, v.nombre, v.texto);
  await auditar(db, brain.id, 'nota.editar', por, `${v.nombre} (${ya.text.length}→${v.texto.length})`);
  return { ok: true, name: v.nombre, updated: t, antes: ya.text };
}

export async function agregar(db, brain, { nombre, texto, seccion = '', por = '' }) {
  const ya = await una(db, 'select text, updated from notes where brain_id = ? and name = ?', brain.id, nombre);
  if (!ya) throw noEsta(`No hay una nota llamada «${String(nombre).slice(0, 60)}».`);
  const nuevo = agregarTexto(ya.text, texto, { seccion });
  if (nuevo.length > MAX_NOTA) throw new HttpError(413, 'La nota quedaría demasiado larga.');
  return guardar(db, brain, { nombre, texto: nuevo, base: ya.updated, por });
}

export async function mover(db, brain, { nombre, carpeta, por = '' }) {
  const c = carpetaValida(carpeta ?? ''); if (!c.ok) throw bad(c.error);
  const r = await db.prepare('update notes set folder = ?, updated = ? where brain_id = ? and name = ?').bind(c.carpeta, ahora(), brain.id, nombre).run();
  if (!r.meta?.changes) throw noEsta('Esa nota no existe.');
  await auditar(db, brain.id, 'nota.mover', por, `${nombre} → ${c.carpeta}`);
  return { ok: true, name: nombre, folder: c.carpeta };
}

/** Cambia el nombre y, si se pide, reescribe los [[enlaces]] de las notas que la nombraban. */
export async function renombrar(db, brain, { nombre, nuevo, reescribir = true, por = '' }) {
  const n = nombreValido(nuevo); if (!n.ok) throw bad(n.error);
  const ya = await una(db, 'select * from notes where brain_id = ? and name = ?', brain.id, nombre);
  if (!ya) throw noEsta('Esa nota no existe.');
  const existentes = await indiceDeNombres(db, brain.id);
  const choca = existentes.get(fold(n.nombre));
  if (choca && fold(n.nombre) !== fold(nombre)) throw choque(`Ya hay una nota llamada «${choca}».`);
  const t = ahora();
  await lotes(db, [
    db.prepare("insert into passages_fts(passages_fts, rowid, stem) select 'delete', id, stem from passages where brain_id = ? and note = ?").bind(brain.id, nombre),
    db.prepare('delete from passages where brain_id = ? and note = ?').bind(brain.id, nombre),
    db.prepare('update notes set name = ?, updated = ? where brain_id = ? and name = ?').bind(n.nombre, t, brain.id, nombre),
    db.prepare('update note_weights set name = ? where brain_id = ? and name = ?').bind(n.nombre, brain.id, nombre),
    db.prepare('update vectors set name = ? where brain_id = ? and name = ?').bind(n.nombre, brain.id, nombre),
    db.prepare("delete from links where brain_id = ? and src = ?").bind(brain.id, nombre),
    db.prepare("delete from links where brain_id = ? and dst = ? and kind in ('mention','meaning')").bind(brain.id, nombre),
  ]);
  // sinapsis aprendidas: se reescriben con el orden a < b
  const sin = await todas(db, 'select * from synapses where brain_id = ? and (a = ? or b = ?)', brain.id, nombre, nombre);
  if (sin.length) {
    const s = [db.prepare('delete from synapses where brain_id = ? and (a = ? or b = ?)').bind(brain.id, nombre, nombre)];
    for (const x of sin) { const o = x.a === nombre ? x.b : x.a; const [a, b] = o < n.nombre ? [o, n.nombre] : [n.nombre, o]; s.push(db.prepare('insert into synapses (brain_id, a, b, weight, uses, updated) values (?,?,?,?,?,?)').bind(brain.id, a, b, x.weight, x.uses, x.updated)); }
    await lotes(db, s);
  }
  existentes.delete(fold(nombre)); existentes.set(fold(n.nombre), n.nombre);
  await lotes(db, sentenciasDeIndice(db, brain.id, n.nombre, ya.text, existentes));
  // quienes la enlazaban: se les reescribe el enlace (o se rompe, si el artista lo prefiere)
  const quienes = await todas(db, "select distinct src from links where brain_id = ? and kind = 'link' and (dst = ? or tfold = ?)", brain.id, nombre, fold(nombre));
  let tocadas = 0;
  for (const { src } of quienes) {
    const otra = await una(db, 'select text, updated from notes where brain_id = ? and name = ?', brain.id, src);
    if (!otra) continue;
    if (reescribir) {
      const r = renombrarEnlaces(otra.text, nombre, n.nombre);
      if (r.cambios) { await guardar(db, brain, { nombre: src, texto: r.texto, base: otra.updated, por, sinMenciones: true }); tocadas++; }
    } else {
      await correr(db, "update links set dst = null where brain_id = ? and src = ? and tfold = ? and kind = 'link'", brain.id, src, fold(nombre));
    }
  }
  await resolverPendientes(db, brain.id, n.nombre);
  await recalcularMencionesDe(db, brain.id, n.nombre, ya.text);
  await auditar(db, brain.id, 'nota.renombrar', por, `${nombre} → ${n.nombre} (${tocadas} notas reescritas)`);
  return { ok: true, name: n.nombre, reescritas: tocadas };
}

/** A la papelera: se queda 30 días. Atado a la revisión leída (409 si alguien la cambió justo ahora). */
export async function tirar(db, brain, { nombre, base = null, por = '' }) {
  const n = await una(db, 'select * from notes where brain_id = ? and name = ?', brain.id, nombre);
  if (!n) throw noEsta('Esa nota no existe.');
  if (base != null && Number(base) !== Number(n.updated)) throw choque('Alguien cambió esta nota justo ahora. Ábrela de nuevo para ver lo último.');
  const t = ahora();
  await lotes(db, [
    db.prepare('insert into notes_trash (brain_id, name, folder, text, bytes, updated, deleted, by) values (?,?,?,?,?,?,?,?)').bind(brain.id, n.name, n.folder, n.text, n.bytes, n.updated, t, por || null),
    db.prepare("insert into passages_fts(passages_fts, rowid, stem) select 'delete', id, stem from passages where brain_id = ? and note = ?").bind(brain.id, nombre),
    db.prepare('delete from passages where brain_id = ? and note = ?').bind(brain.id, nombre),
    db.prepare('delete from notes where brain_id = ? and name = ? and updated = ?').bind(brain.id, nombre, n.updated),
    db.prepare('delete from links where brain_id = ? and src = ?').bind(brain.id, nombre),
    db.prepare("delete from links where brain_id = ? and dst = ? and kind in ('mention','meaning')").bind(brain.id, nombre),
    db.prepare("update links set dst = null where brain_id = ? and dst = ? and kind = 'link'").bind(brain.id, nombre),
    db.prepare('delete from vectors where brain_id = ? and name = ?').bind(brain.id, nombre),
    db.prepare('delete from note_weights where brain_id = ? and name = ?').bind(brain.id, nombre),
    db.prepare('delete from synapses where brain_id = ? and (a = ? or b = ?)').bind(brain.id, nombre, nombre),
  ]);
  await auditar(db, brain.id, 'nota.papelera', por, nombre);
  return { ok: true, name: nombre };
}

export async function papelera(db, brainId) {
  return (await todas(db, 'select id, name, folder, deleted from notes_trash where brain_id = ? order by deleted desc, id desc limit 200', brainId)).map((r) => ({ id: r.id, name: r.name, folder: r.folder, deleted: r.deleted }));
}

export async function restaurar(db, brain, { id, por = '' }) {
  const n = await una(db, 'select * from notes_trash where brain_id = ? and id = ?', brain.id, Number(id));
  if (!n) throw noEsta('No está en la papelera.');
  const existentes = await indiceDeNombres(db, brain.id);
  let nombre = n.name;
  for (let k = 2; existentes.has(fold(nombre)); k++) nombre = `${n.name} (${k})`.slice(0, 80);
  const t = ahora(), c = cols(n.text);
  existentes.set(fold(nombre), nombre);
  await db.batch([
    db.prepare('insert into notes (brain_id, name, folder, text, bytes, always, private, tipo, alias, nomention, created, updated) values (?,?,?,?,?,?,?,?,?,?,?,?)').bind(brain.id, nombre, n.folder, n.text, n.bytes, c.always, c.private, c.tipo, c.alias, c.nomention, t, t),
    db.prepare('delete from notes_trash where id = ?').bind(n.id),
  ]);
  await lotes(db, sentenciasDeIndice(db, brain.id, nombre, n.text, existentes));
  await resolverPendientes(db, brain.id, nombre);
  await recalcularMencionesDe(db, brain.id, nombre, n.text);
  await auditar(db, brain.id, 'nota.restaurar', por, nombre);
  return { ok: true, name: nombre };
}

/** Salud del cerebro desde SQL: enlaces rotos, neuronas solas, notas por revisar y sin tipo. */
export async function salud(db, brainId, { hoy = new Date().toISOString().slice(0, 10) } = {}) {
  const rotos = await todas(db, "select src as desde, target as hacia from links where brain_id = ? and kind = 'link' and dst is null order by src", brainId);
  const huerfanas = (await todas(db, "select name from notes n where brain_id = ? and not exists (select 1 from links l where l.brain_id = n.brain_id and l.kind = 'link' and (l.src = n.name or l.dst = n.name)) order by name", brainId)).map((r) => r.name);
  const sinTipo = (await todas(db, "select name from notes where brain_id = ? and tipo = '' order by name", brainId)).map((r) => r.name);
  const porRevisar = [];
  for (const r of await todas(db, "select name, text from notes where brain_id = ? and text like '%revisar:%'", brainId)) { const f = hechosDe(r.text).revisar; if (f && f <= hoy) porRevisar.push({ nombre: r.name, fecha: f }); }
  const total = (await una(db, 'select count(*) n from notes where brain_id = ?', brainId))?.n ?? 0;
  return { rotos, huerfanas, sinTipo, porRevisar, resumen: { notas: total, rotos: rotos.length, huerfanas: huerfanas.length, sinTipo: sinTipo.length, porRevisar: porRevisar.length } };
}

/** Importa un lote de notas (la bóveda entera se sube de a pocas). Sin menciones: se calculan después en pasadas cortas. */
export async function importarLote(db, brain, notas, { sobrescribir = true } = {}) {
  if (!Array.isArray(notas) || !notas.length) throw bad('No hay notas que subir.');
  if (notas.length > 12) throw bad('Demasiadas notas en una subida (máximo 12).');
  const existentes = await indiceDeNombres(db, brain.id);
  for (const x of notas) existentes.set(fold(String(x?.nombre ?? '')), String(x?.nombre ?? ''));
  let nuevas = 0, reemplazadas = 0, saltadas = 0;
  for (const x of notas) {
    const v = validar({ nombre: x?.nombre, carpeta: x?.carpeta, texto: x?.texto });
    const ya = await una(db, 'select updated from notes where brain_id = ? and name = ?', brain.id, v.nombre);
    if (ya && !sobrescribir) { saltadas++; continue; }
    const t = Number.isFinite(+x.actualizado) && +x.actualizado > 0 ? Math.trunc(+x.actualizado) : ahora(), c = cols(v.texto);
    await db.prepare('insert into notes (brain_id, name, folder, text, bytes, always, private, tipo, alias, nomention, created, updated) values (?,?,?,?,?,?,?,?,?,?,?,?) on conflict (brain_id, name) do update set folder = excluded.folder, text = excluded.text, bytes = excluded.bytes, always = excluded.always, private = excluded.private, tipo = excluded.tipo, alias = excluded.alias, nomention = excluded.nomention, updated = excluded.updated')
      .bind(brain.id, v.nombre, v.carpeta, v.texto, bytesDe(v.texto), c.always, c.private, c.tipo, c.alias, c.nomention, t, t).run();
    await lotes(db, sentenciasDeIndice(db, brain.id, v.nombre, v.texto, existentes));
    await resolverPendientes(db, brain.id, v.nombre);
    ya ? reemplazadas++ : nuevas++;
  }
  return { ok: true, nuevas, reemplazadas, saltadas };
}

/** Una pasada de menciones sobre un trozo de notas (para recalcular todo el cerebro sin pasarse del tiempo). */
export async function recalcularMenciones(db, brain, { desde = 0, cuantas = 30 }) {
  const blancos = await blancosDelCerebro(db, brain.id);
  const filas = await todas(db, 'select name, text from notes where brain_id = ? order by name limit ? offset ?', brain.id, cuantas, desde);
  let hechas = 0;
  for (const f of filas) { await recalcularMencionesDe(db, brain.id, f.name, f.text, blancos); hechas++; }
  const total = (await una(db, 'select count(*) n from notes where brain_id = ?', brain.id)).n;
  return { ok: true, desde, hechas, total, siguiente: desde + filas.length < total ? desde + filas.length : null };
}

export { resumen };
