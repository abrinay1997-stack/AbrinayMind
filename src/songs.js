// Abrinay Mind — las canciones: lo que el cerebro escribió o el artista guardó, y el veredicto que le enseña al cerebro.
//   aprobar  → la letra queda como una neurona nueva (enlazada a lo que se leyó para escribirla), se anota la puntuación y se refuerzan las sinapsis.
//   rechazar → nace una entrada en la bitácora de errores con el diagnóstico, se debilitan las sinapsis y el cerebro propone una regla que el artista puede aceptar.
import { nombreValido, fold, leerCabecera } from '../public/core/text.js';
import { aprender } from '../public/core/hebb.js';
import { desvanecido } from '../public/core/graph.js';
import { HttpError, bad, noEsta, ahora, idCorto, recortar } from './http.js';
import { todas, una, correr, lotes, auditar } from './db.js';
import { NOTAS, CARPETAS } from './names.js';
import * as notas from './notes.js';
import { leerAjustes, elegirModelo, llamar } from './models.js';
import * as uso from './usage.js';

const publica = (s) => ({ id: s.id, title: s.title, mode: s.mode, genre: s.genre, bpm: s.bpm, brief: JSON.parse(s.brief || '{}'), text: s.text, status: s.status, score: s.score, feedback: s.feedback, model: s.model, used: JSON.parse(s.used || '[]'), parent_id: s.parent_id, note_name: s.note_name, created: s.created, updated: s.updated });

export async function listar(db, brainId) {
  return (await todas(db, 'select id, title, mode, genre, bpm, status, score, model, parent_id, note_name, created, updated, substr(text, 1, 160) as extracto from songs where brain_id = ? order by updated desc', brainId));
}
export async function leer(db, brain, id) {
  const s = await una(db, 'select * from songs where id = ? and brain_id = ?', String(id ?? ''), brain.id);
  if (!s) throw noEsta('Esa canción no existe.');
  return publica(s);
}

/** Guarda una letra. Si viene `mensajeId`, lo leído para escribirla se toma del propio mensaje. */
export async function crear(db, brain, { titulo, texto, brief = {}, mensajeId = null, modo = null, genero = null, bpm = null, modelo = null, usadas = null, parentId = null }) {
  const t = recortar(titulo, 80); if (!t) throw bad('La canción necesita un título.');
  let cuerpo = String(texto ?? ''), leidas = Array.isArray(usadas) ? usadas : [];
  if (mensajeId) {
    const m = await una(db, "select m.content, m.meta from chat_messages m join chats c on c.id = m.chat_id where m.id = ? and c.brain_id = ? and m.role = 'assistant'", Number(mensajeId), brain.id);
    if (!m) throw noEsta('Ese mensaje no existe.');
    const meta = JSON.parse(m.meta || '{}'); cuerpo = cuerpo || m.content; leidas = leidas.length ? leidas : (meta.leidas || []); modelo = modelo || meta.modelo || null; modo = modo || meta.modo?.nota || meta.modo?.nombre || null;
    brief = Object.keys(brief).length ? brief : (meta.brief || {});
  }
  if (!cuerpo.trim()) throw bad('La letra está vacía.');
  if (cuerpo.length > 60_000) throw new HttpError(413, 'La letra es demasiado larga.');
  const id = idCorto(), n = ahora();
  await correr(db, 'insert into songs (id, brain_id, title, mode, genre, bpm, brief, text, status, model, used, parent_id, created, updated) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, brain.id, t, modo, genero ?? brief.genero ?? null, Number(bpm ?? brief.bpm) || null, JSON.stringify(brief), cuerpo, 'borrador', modelo, JSON.stringify(leidas.slice(0, 40)), parentId, n, n);
  return leer(db, brain, id);
}

export async function cambiar(db, brain, id, { titulo, texto }) {
  const s = await leer(db, brain, id);
  const t = titulo == null ? s.title : recortar(titulo, 80); if (!t) throw bad('La canción necesita un título.');
  const x = texto == null ? s.text : String(texto); if (!x.trim()) throw bad('La letra está vacía.');
  await correr(db, 'update songs set title = ?, text = ?, updated = ? where id = ?', t, x, ahora(), s.id);
  return leer(db, brain, id);
}
export async function borrar(db, brain, id) { const s = await leer(db, brain, id); await correr(db, 'delete from songs where id = ?', s.id); return { ok: true }; }

/* ---------- aprender ---------- */

async function mapasAprendidos(db, brainId, nombres) {
  const pesos = new Map((await todas(db, 'select name, weight, updated from note_weights where brain_id = ?', brainId)).map((p) => [p.name, { peso: p.weight, actualizado: p.updated }]));
  const sin = new Map((await todas(db, 'select a, b, weight, uses, updated from synapses where brain_id = ?', brainId)).filter((s) => nombres.has(s.a) && nombres.has(s.b)).map((s) => [`${s.a}|${s.b}`, { peso: s.weight, usos: s.uses, actualizado: s.updated }]));
  return { pesos, sin };
}
async function reforzar(db, brain, cancion, { resultado, puntuacion }) {
  const usadas = cancion.used.filter((u) => u?.nombre && u.motivo !== 'siempre').map((u) => ({ nombre: String(u.nombre), energia: Math.max(0, Math.min(1, Number(u.energia) || 0.3)) }));
  if (!usadas.length) return { pesos: 0, sinapsis: 0 };
  const existentes = new Set((await todas(db, 'select name from notes where brain_id = ?', brain.id)).map((r) => r.name));
  const vivas = usadas.filter((u) => existentes.has(u.nombre));
  const { pesos, sin } = await mapasAprendidos(db, brain.id, new Set(vivas.map((u) => u.nombre)));
  const r = aprender({ usadas: vivas, pesos, sinapsis: sin, resultado, puntuacion });
  const t = ahora(), s = [];
  for (const p of r.pesos) s.push(db.prepare('insert into note_weights (brain_id, name, weight, uses, updated) values (?,?,?,1,?) on conflict (brain_id, name) do update set weight = excluded.weight, uses = uses + 1, updated = excluded.updated').bind(brain.id, p.nombre, p.peso, t));
  for (const x of r.sinapsis) s.push(db.prepare('insert into synapses (brain_id, a, b, weight, uses, updated) values (?,?,?,?,?,?) on conflict (brain_id, a, b) do update set weight = excluded.weight, uses = excluded.uses, updated = excluded.updated').bind(brain.id, x.a, x.b, x.peso, x.usos, t));
  await lotes(db, s);
  return { pesos: r.pesos.length, sinapsis: r.sinapsis.length };
}

export async function aprendido(db, brainId) {
  const sin = (await todas(db, 'select a, b, weight, uses, updated from synapses where brain_id = ? order by weight desc limit 120', brainId)).map((s) => ({ a: s.a, b: s.b, peso: +desvanecido(s.weight, s.updated).toFixed(3), usos: s.uses })).filter((s) => s.peso >= 0.03);
  const pesos = (await todas(db, 'select name, weight, uses, updated from note_weights where brain_id = ? order by abs(weight) desc limit 60', brainId)).map((p) => ({ nombre: p.name, peso: +desvanecido(p.weight, p.updated).toFixed(3), usos: p.uses }));
  return { sinapsis: sin, pesos };
}
export async function olvidar(db, brain) {
  await db.batch([db.prepare('delete from synapses where brain_id = ?').bind(brain.id), db.prepare('delete from note_weights where brain_id = ?').bind(brain.id)]);
  await auditar(db, brain.id, 'aprendido.olvidar', 'artista', 'todo');
  return { ok: true };
}

/* ---------- el veredicto ---------- */

const hoy = () => new Date().toISOString().slice(0, 10);
async function asegurarNota(db, brain, nombre, carpeta, texto) {
  const f = await una(db, 'select name from notes where brain_id = ? and name = ?', brain.id, nombre);
  if (!f) await notas.crear(db, brain, { nombre, carpeta, texto });
}
const sinNotasTecnicas = (t) => t.split(/\n#{1,3}\s*Notas t[ée]cnicas/i)[0].trim();

async function nombreLibre(db, brain, base) {
  const n = nombreValido(base).nombre || 'Canción sin título';
  let nombre = n.slice(0, 74);
  for (let k = 2; await una(db, 'select 1 x from notes where brain_id = ? and lower(name) = lower(?)', brain.id, nombre); k++) nombre = `${n.slice(0, 72)} (${k})`;
  return nombre;
}

export async function veredicto(env, db, brain, id, datos, { fetchFn = fetch } = {}) {
  const s = await leer(db, brain, id);
  const resultado = datos.resultado === 'aprobada' ? 'aprobada' : datos.resultado === 'rechazada' ? 'rechazada' : null;
  if (!resultado) throw bad('El veredicto es «aprobada» o «rechazada».');
  const puntuacion = datos.puntuacion == null || datos.puntuacion === '' ? null : Number(datos.puntuacion);
  if (puntuacion != null && !(puntuacion >= 0 && puntuacion <= 10)) throw bad('La puntuación va de 0 a 10.');
  const comentario = String(datos.comentario ?? '').slice(0, 1500);
  const fecha = hoy();
  const aprendio = await reforzar(db, brain, s, { resultado, puntuacion });
  const modos = await todas(db, "select name from notes where brain_id = ? and tipo = 'modo'", brain.id);
  const modoNota = modos.find((m) => m.name === s.mode || fold(m.name) === fold(s.mode ?? ''))?.name;

  if (resultado === 'aprobada') {
    let nombreNota = s.note_name;
    const vivo = nombreNota && await una(db, 'select 1 x from notes where brain_id = ? and name = ?', brain.id, nombreNota);
    const leidas = (s.used || []).filter((u) => u.motivo !== 'siempre').sort((a, b) => b.energia - a.energia).slice(0, 8).map((u) => u.nombre);
    const reales = new Set((await todas(db, 'select name from notes where brain_id = ?', brain.id)).map((r) => r.name));
    const cuerpo = `---\ntipo: cancion\nautoria: ${brain.name} + Abrinay Mind\n${modoNota ? `modo: [[${modoNota}]]\n` : ''}${s.genre ? `genero: ${s.genre}\n` : ''}estado: aprobada\n${puntuacion != null ? `puntuacion: ${puntuacion}\n` : ''}aprobada: ${fecha}\n${s.model ? `modelo: ${s.model}\n` : ''}---\n# ${s.title}\n\n## Letra\n\n${sinNotasTecnicas(s.text)}\n\n## Notas técnicas\n\n${(s.text.split(/\n#{1,3}\s*Notas t[ée]cnicas/i)[1] || '_(sin notas técnicas)_').trim()}\n\n## Se escribió leyendo\n\n${leidas.filter((n) => reales.has(n)).map((n) => `- [[${n}]]`).join('\n') || '_(sin notas)_'}\n\nPuntuaciones: [[${NOTAS.puntuaciones}]].\n`;
    if (!vivo) { nombreNota = await nombreLibre(db, brain, s.title); await notas.crear(db, brain, { nombre: nombreNota, carpeta: CARPETAS.generadas, texto: cuerpo, por: 'veredicto' }); }
    await asegurarNota(db, brain, NOTAS.puntuaciones, CARPETAS.aprendizaje, `---\ntipo: aprendizaje\n---\n# ${NOTAS.puntuaciones}\n\n## Nuevas puntuaciones\n\n`);
    await notas.agregar(db, brain, { nombre: NOTAS.puntuaciones, texto: `- ${fecha} · [[${nombreNota}]] · ${puntuacion != null ? `${puntuacion}/10` : 'aprobada'}${comentario ? ` — ${recortar(comentario, 200)}` : ''}`, seccion: 'Nuevas puntuaciones', por: 'veredicto' });
    await correr(db, "update songs set status = 'aprobada', score = ?, feedback = ?, note_name = ?, updated = ? where id = ?", puntuacion, comentario || null, nombreNota, ahora(), s.id);
    await auditar(db, brain.id, 'veredicto.aprobada', 'artista', `${s.title} ${puntuacion ?? ''}`);
    return { ok: true, resultado, nota: nombreNota, aprendio };
  }

  // rechazada: una entrada en la bitácora, con el diagnóstico del formulario
  const f = datos.formulario && typeof datos.formulario === 'object' ? datos.formulario : {};
  const lista = (v) => (Array.isArray(v) ? v.map((x) => recortar(x, 120)).filter(Boolean) : []);
  const secciones = f.secciones && typeof f.secciones === 'object' ? Object.entries(f.secciones).slice(0, 8).map(([k, v]) => `- **${recortar(k, 30)}:** ${recortar(v?.estado, 12) || '—'}${v?.queMal ? ` — ${recortar(v.queMal, 240)}` : ''}`) : [];
  const nMax = (await todas(db, "select name from notes where brain_id = ? and name like 'Error % — %'", brain.id)).map((r) => Number(/^Error (\d+) —/.exec(r.name)?.[1] || 0)).reduce((a, b) => Math.max(a, b), 0);
  const titulo = nombreValido(`Error ${nMax + 1} — ${s.title}${puntuacion != null ? ` (${puntuacion} de 10)` : ''}`).nombre || `Error ${nMax + 1}`;
  const extracto = s.text.split('\n').filter((l) => l.trim() && !/^\[|^#/.test(l.trim())).slice(0, 4).map((l) => `> ${l.trim()}`).join('\n');
  let propuesta = null;
  try { propuesta = await proponerRegla(env, db, { brainId: brain.id, cancion: s, comentario, diagnostico: lista(f.diagnostico), instruccion: String(f.instruccion ?? ''), fetchFn }); } catch { /* sin llave o sin saldo: la regla se escribe a mano */ }
  const cuerpo = `---\ntipo: error\ncancion: ${s.title}\n${puntuacion != null ? `puntuacion: ${puntuacion}\n` : ''}fecha: ${fecha}\n${modoNota ? `modo: [[${modoNota}]]\n` : ''}---\n# ${titulo}\n\n**Canción:** ${s.title} (${s.genre || 'sin género'}${s.mode ? ` · ${s.mode}` : ''})\n**Fecha:** ${fecha}${puntuacion != null ? ` · **Puntuación:** ${puntuacion}/10` : ''}\n**Categoría del error:** ${lista(f.diagnostico).join('; ') || '—'}\n\n**Qué generó la IA:**\n${extracto || '> (letra no disponible)'}\n\n**Por qué no funcionó (palabras del artista):**\n${comentario ? `"${comentario}"` : '—'}\n${secciones.length ? `\n**Por sección:**\n${secciones.join('\n')}\n` : ''}\n**Línea que sí gustó:** ${recortar(f.gusto, 300) || '—'}\n**Línea que nunca escribiría:** ${recortar(f.nunca, 300) || '—'}\n**Cómo debería ser:** ${recortar(f.perfecta, 300) || '—'}\n**Para la próxima versión:** ${recortar(f.instruccion, 400) || '—'}${f.mantener ? `\n**Mantener:** ${recortar(f.mantener, 300)}` : ''}\n\n**Regla aprendida (propuesta):**\n${propuesta ? `> 🔴 NUNCA: ${propuesta.nunca}\n> 🟢 SIEMPRE: ${propuesta.siempre}` : '_Sin propuesta automática: escríbela y acéptala desde la canción._'}\n\nBitácora: [[${NOTAS.bitacora}]].\n`;
  await notas.crear(db, brain, { nombre: titulo, carpeta: CARPETAS.errores, texto: cuerpo, por: 'veredicto' });
  await asegurarNota(db, brain, NOTAS.bitacora, CARPETAS.aprendizaje, `---\ntipo: bitacora\n---\n# ${NOTAS.bitacora}\n\n## Entradas\n\n`);
  await notas.agregar(db, brain, { nombre: NOTAS.bitacora, texto: `- [[${titulo}]]`, seccion: 'Entradas', por: 'veredicto' });
  await correr(db, "update songs set status = 'rechazada', score = ?, feedback = ?, note_name = ?, updated = ? where id = ?", puntuacion, comentario || null, titulo, ahora(), s.id);
  await auditar(db, brain.id, 'veredicto.rechazada', 'artista', `${s.title} ${puntuacion ?? ''}`);
  return { ok: true, resultado, nota: titulo, propuesta, aprendio };
}

/** Pide a un modelo barato que convierta el rechazo en una regla NUNCA / SIEMPRE. null si no se pudo. */
export async function proponerRegla(env, db, { brainId = null, cancion, comentario, diagnostico, instruccion, fetchFn = fetch }) {
  const ajustes = await leerAjustes(db);
  const { modelo } = elegirModelo(env, ajustes, { fn: 'reglas' });
  await uso.vigilarTope(db, ajustes);
  const t0 = ahora();
  const r = await llamar(env, modelo, {
    sistema: 'Eres el editor de la memoria de un compositor. A partir de una letra rechazada y de lo que dijo el artista, redactas UNA regla para que no vuelva a pasar. Contesta SOLO un JSON: {"nunca":"…","siempre":"…"}. Cada una, una oración concreta y aplicable a futuras letras de este artista (no a esta canción), sin nombrar la canción.',
    mensajes: [{ role: 'user', content: `Letra (extracto):\n${cancion.text.slice(0, 1400)}\n\nDiagnóstico marcado: ${diagnostico.join('; ') || '—'}\nLo que dijo el artista: ${comentario || '—'}\nPara la próxima versión: ${instruccion || '—'}` }], maxTokens: 400,
  }, { fetchFn });
  await uso.anotar(db, { brainId, fn: 'reglas', modelo, uso: r.uso, ms: ahora() - t0 });
  const m = /\{[\s\S]*\}/.exec(r.texto); if (!m) return null;
  try { const o = JSON.parse(m[0]); const nunca = recortar(o.nunca, 400), siempre = recortar(o.siempre, 400); return nunca || siempre ? { nunca, siempre } : null; } catch { return null; }
}

/** El artista acepta (o escribe) una regla: pasa a «Reglas aprendidas», que el cerebro lee antes de cada letra. */
export async function aceptarRegla(db, brain, { nunca = '', siempre = '', error = '' }) {
  const n = recortar(nunca, 400), s = recortar(siempre, 400);
  if (!n && !s) throw bad('La regla está vacía.');
  await asegurarNota(db, brain, NOTAS.aprendidas, CARPETAS.meta, `---\ntipo: regla\nsiempre: true\n---\n# ${NOTAS.aprendidas}\n\n## Reglas\n\n`);
  const origen = error && await una(db, 'select 1 x from notes where brain_id = ? and name = ?', brain.id, error) ? ` · [[${error}]]` : '';
  const linea = `- *(${hoy()}${origen})* ${n ? `🔴 NUNCA: ${n}` : ''}${n && s ? ' ' : ''}${s ? `🟢 SIEMPRE: ${s}` : ''}`;
  await notas.agregar(db, brain, { nombre: NOTAS.aprendidas, texto: linea, seccion: 'Reglas', por: 'regla' });
  await auditar(db, brain.id, 'regla.aceptar', 'artista', linea);
  return { ok: true };
}

export { leerCabecera };
