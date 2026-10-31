// Abrinay Mind — corregir una letra y que el cerebro aprenda de lo que cambió el artista.
//   corregirMensaje → la letra del chat queda como la dejó el artista (y el siguiente turno parte de ESA letra); se guarda el original.
//   proponer        → compara antes y después y le pide a un modelo barato 1–3 reglas generales; el artista las revisa.
//   aplicar         → las reglas aceptadas pasan a «Reglas aprendidas» y los cambios quedan como ejemplos de su estilo en «Correcciones del artista».
import { HttpError, bad, noEsta, ahora, recortar } from './http.js';
import { una, correr, auditar } from './db.js';
import { NOTAS, CARPETAS } from './names.js';
import * as notas from './notes.js';
import { cambiosDeLetra } from '../public/core/diferencias.js';
import { leerAjustes, elegirModelo, llamar } from './models.js';
import * as uso from './usage.js';
import { aceptarRegla, asegurarNota } from './songs.js';

const MAX_LETRA = 60_000;
const hoy = () => new Date().toISOString().slice(0, 10);

/** La respuesta del cerebro pasa a ser el texto que dejó el artista. El primer original se conserva en `meta.original`. */
export async function corregirMensaje(db, brain, chatId, mensajeId, { texto } = {}) {
  const x = String(texto ?? '');
  if (!x.trim()) throw bad('La letra no puede quedar vacía.');
  if (x.length > MAX_LETRA) throw new HttpError(413, 'La letra es demasiado larga.');
  const m = await una(db, "select m.id, m.content, m.meta from chat_messages m join chats c on c.id = m.chat_id where m.id = ? and c.id = ? and c.brain_id = ? and m.role = 'assistant'", Number(mensajeId), String(chatId), brain.id);
  if (!m) throw noEsta('Ese mensaje no existe.');
  const meta = JSON.parse(m.meta || '{}');
  if (meta.original == null) meta.original = m.content;
  meta.editada = ahora(); meta.correcciones = (meta.correcciones || 0) + 1;
  await correr(db, 'update chat_messages set content = ?, meta = ? where id = ?', x, JSON.stringify(meta), m.id);
  await correr(db, 'update chats set updated = ? where id = ?', ahora(), String(chatId));
  await auditar(db, brain.id, 'mensaje.corregir', 'artista', `mensaje ${m.id}`);
  return { id: m.id, content: x, meta };
}

const SISTEMA = `Eres el editor de la memoria de un compositor. El artista corrigió una letra que escribió su cerebro de escritura. Te paso los cambios (antes → después). Deduce qué preferencias reveló y redacta de 1 a 3 reglas GENERALES y reutilizables para futuras letras (no sobre esta canción en concreto): qué NUNCA debe hacer el cerebro y qué SIEMPRE debe hacer en su lugar. Si un cambio es solo un gusto puntual o corrige un dato de esta canción, no lo conviertas en regla. Contesta SOLO un JSON: {"reglas":[{"nunca":"…","siempre":"…"}]}. Cada campo, una oración concreta de máximo 25 palabras, en español, en imperativo; uno de los dos puede ir vacío. No copies versos enteros del artista.`;

async function pedirReglas(env, db, brain, cambios, { titulo, modo }, opciones) {
  const ajustes = await leerAjustes(db);
  const { modelo } = elegirModelo(env, ajustes, { fn: 'reglas' });
  await uso.vigilarTope(db, ajustes);
  const lista = cambios.slice(0, 12).map((c, i) => `${i + 1}. ${c.seccion ? `[${c.seccion}] ` : ''}\nAntes: ${c.antes.map((l) => recortar(l, 200)).join(' / ') || '(nada)'}\nDespués: ${c.despues.map((l) => recortar(l, 200)).join(' / ') || '(lo quitó)'}`).join('\n\n');
  const t0 = ahora();
  const r = await llamar(env, modelo, { sistema: SISTEMA, mensajes: [{ role: 'user', content: `Canción: ${recortar(titulo, 80) || 'sin título'}${modo ? ` · modo: ${recortar(modo, 60)}` : ''}\n\nCambios del artista:\n\n${lista}` }], maxTokens: 700 }, opciones);
  await uso.anotar(db, { brainId: brain.id, fn: 'reglas', modelo, uso: r.uso, ms: ahora() - t0 });
  const m = /\{[\s\S]*\}/.exec(r.texto); if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const reglas = (Array.isArray(o.reglas) ? o.reglas : []).map((x) => ({ nunca: recortar(x?.nunca, 400), siempre: recortar(x?.siempre, 400) })).filter((x) => x.nunca || x.siempre).slice(0, 3);
    return reglas;
  } catch { return null; }
}

/** → { cambios, propuestas } · propuestas es null si no se pudo pedir (sin llave, sin saldo…): el artista puede escribir la regla a mano. */
export async function proponer(env, db, brain, { antes, despues, titulo = '', modo = '' } = {}, opciones = {}) {
  const cambios = cambiosDeLetra(String(antes ?? '').slice(0, MAX_LETRA), String(despues ?? '').slice(0, MAX_LETRA));
  if (!cambios.length) return { cambios: [], propuestas: [] };
  let propuestas = null;
  try { propuestas = await pedirReglas(env, db, brain, cambios, { titulo, modo }, opciones); }
  catch (e) { if (e instanceof HttpError && e.status === 402) throw e; /* sin llave o proveedor caído: se escribe a mano */ }
  return { cambios, propuestas };
}

/** Guarda las reglas aceptadas y, si se pide, los cambios como ejemplos del estilo del artista. Los cambios se recalculan aquí: no se confía en la lista del navegador. */
export async function aplicar(db, brain, { reglas = [], ejemplo = null } = {}) {
  const out = { reglas: 0, ejemplo: false };
  for (const r of (Array.isArray(reglas) ? reglas : []).slice(0, 5)) {
    if (!String(r?.nunca ?? '').trim() && !String(r?.siempre ?? '').trim()) continue;
    await aceptarRegla(db, brain, { nunca: r.nunca, siempre: r.siempre });
    out.reglas++;
  }
  if (ejemplo && typeof ejemplo === 'object') {
    const cambios = cambiosDeLetra(String(ejemplo.antes ?? '').slice(0, MAX_LETRA), String(ejemplo.despues ?? '').slice(0, MAX_LETRA)).slice(0, 8);
    if (cambios.length) {
      const modoNota = ejemplo.modo && await una(db, 'select name from notes where brain_id = ? and name = ?', brain.id, String(ejemplo.modo));
      const linea = (c) => `  - ${c.seccion ? `${c.seccion}: ` : ''}«${c.antes.map((l) => recortar(l, 200)).join(' / ') || '—'}» → «${c.despues.map((l) => recortar(l, 200)).join(' / ') || 'lo quitó'}»`;
      const bloque = `- **${hoy()} · ${recortar(ejemplo.titulo, 80) || 'sin título'}**${modoNota ? ` · [[${modoNota.name}]]` : ''}\n${cambios.map(linea).join('\n')}`;
      // es material inédito del artista: «privado» para que nunca llegue a un modelo que entrena con lo que recibe
      await asegurarNota(db, brain, NOTAS.correcciones, CARPETAS.aprendizaje, `---\ntipo: aprendizaje\nprivado: true\n---\n# ${NOTAS.correcciones}\n\nLo que el artista cambió de lo que escribió el cerebro (antes → después). Lo suyo es lo que vale: de aquí se aprende su oído.\n\n## Correcciones\n\n`);
      try { await notas.agregar(db, brain, { nombre: NOTAS.correcciones, texto: bloque, seccion: 'Correcciones', por: 'correccion' }); out.ejemplo = true; }
      catch (e) { if (!(e instanceof HttpError && e.status === 413)) throw e; /* la nota está llena: las reglas ya quedaron */ }
    }
  }
  await auditar(db, brain.id, 'correccion.aprender', 'artista', `${out.reglas} reglas${out.ejemplo ? ' + ejemplo' : ''}`);
  return { ok: true, ...out };
}
