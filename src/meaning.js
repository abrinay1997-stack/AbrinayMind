// Abrinay Mind — «buscar por significado»: un vector por nota (Workers AI, bge-m3, 1024 números), guardado cuantizado a 8 bits.
// Sirve para dos cosas: encontrar notas por lo que quieren decir aunque no compartan palabras, y dibujar las sinapsis de significado
// entre notas parecidas. Todo en pasadas cortas que dirige la interfaz (un Worker no debe hacer 130.000 productos de golpe).
import { leerCabecera, hash, fold } from '../public/core/text.js';
import { HttpError, bad, ahora, recortar } from './http.js';
import { todas, una, correr, lotes } from './db.js';

export const MODELO = '@cf/baai/bge-m3';
export const disponible = (env) => !!(env.AI && typeof env.AI.run === 'function');

const aBase64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
// Un bucle simple: con Uint8Array.from(…, callback) cada consulta gastaba ~25 ms de CPU solo en decodificar los vectores (13 veces más lento).
const deBase64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

/** Un vector (números) → { scale, v } con enteros de 8 bits ya normalizados a longitud 1. */
export function cuantizar(vec) {
  let n = 0; for (const x of vec) n += x * x; n = Math.sqrt(n) || 1;
  let m = 0; for (const x of vec) m = Math.max(m, Math.abs(x / n));
  const scale = m / 127 || 1, q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(vec[i] / n / scale)));
  return { scale, v: aBase64(new Uint8Array(q.buffer)) };
}
export const decodificar = (fila) => ({ nombre: fila.name, scale: fila.scale, q: new Int8Array(deBase64(fila.v).buffer) });
const producto = (a, b) => { let s = 0; const n = Math.min(a.q.length, b.q.length); for (let i = 0; i < n; i++) s += a.q[i] * b.q[i]; return s * a.scale * b.scale; };

/** El texto que representa a una nota ante el modelo: su nombre, su tipo y el principio de su cuerpo. */
export function textoParaVector(nombre, texto, tipo = '') {
  return `${nombre}\n${tipo}\n${leerCabecera(texto).cuerpo.replace(/\[\[([^\]|#^]+)[^\]]*\]\]/g, '$1').slice(0, 5500)}`.trim();
}

async function incrustar(env, textos) {
  let r;
  try { r = await env.AI.run(MODELO, { text: textos }); }
  catch (e) { throw new HttpError(502, `Workers AI no pudo calcular el significado (revisa que tu cuenta de Cloudflare tenga Workers AI disponible y cuota): ${recortar(e?.message, 140)}`); }
  const datos = r?.data;
  if (!Array.isArray(datos) || datos.length !== textos.length) throw new HttpError(502, 'El modelo de significado no contestó como se esperaba. Inténtalo de nuevo.');
  return datos;
}

export async function estado(env, db, brainId) {
  const total = (await una(db, 'select count(*) n from notes where brain_id = ?', brainId)).n;
  const al_dia = (await una(db, 'select count(*) n from notes n join vectors v on v.brain_id = n.brain_id and v.name = n.name and v.model = ? and v.created >= n.updated where n.brain_id = ?', MODELO, brainId)).n;
  const vecinas = (await una(db, "select count(*) n from links where brain_id = ? and kind = 'meaning'", brainId)).n;
  return { disponible: disponible(env), modelo: MODELO, notas: total, indexadas: al_dia, pendientes: total - al_dia, sinapsis: vecinas, activo: disponible(env) && total > 0 && al_dia >= Math.ceil(total * 0.8) };
}

/** Calcula el vector de hasta `cuantas` notas sin vector o con vector viejo. */
export async function indexar(env, db, brain, { cuantas = 8 } = {}) {
  if (!disponible(env)) throw bad('El significado necesita el binding de Workers AI (AI) en el Worker.');
  const pend = await todas(db, 'select n.name, n.text, n.tipo, n.updated from notes n left join vectors v on v.brain_id = n.brain_id and v.name = n.name and v.model = ? where n.brain_id = ? and (v.name is null or v.created < n.updated) order by n.name limit ?', MODELO, brain.id, Math.max(1, Math.min(12, cuantas)));
  if (pend.length) {
    const vecs = await incrustar(env, pend.map((p) => textoParaVector(p.name, p.text, p.tipo)));
    const s = [];
    pend.forEach((p, i) => { const q = cuantizar(vecs[i]); s.push(db.prepare('insert into vectors (brain_id, name, hash, model, dim, scale, v, created) values (?,?,?,?,?,?,?,?) on conflict (brain_id, name, model) do update set hash = excluded.hash, dim = excluded.dim, scale = excluded.scale, v = excluded.v, created = excluded.created').bind(brain.id, p.name, hash(p.text), MODELO, vecs[i].length, q.scale, q.v, p.updated)); });
    await lotes(db, s);
  }
  return { ok: true, hechas: pend.length, ...(await estado(env, db, brain.id)) };
}

// Los vectores ya decodificados se guardan en la memoria del isolate mientras no cambien (cuenta + fecha del último): leerlos y decodificarlos
// de nuevo en cada mensaje era lo que más CPU gastaba. Si el isolate se recicla, simplemente se vuelven a leer.
const CACHE = new Map();
async function todosLosVectores(db, brainId) {
  const sello = await una(db, 'select count(*) n, coalesce(max(created), 0) m from vectors where brain_id = ? and model = ?', brainId, MODELO);
  const clave = `${brainId}:${MODELO}`, ya = CACHE.get(clave);
  if (ya && ya.n === sello.n && ya.m === sello.m) return [...ya.lista];
  const lista = (await todas(db, 'select name, scale, v from vectors where brain_id = ? and model = ?', brainId, MODELO)).map(decodificar);
  if (CACHE.size > 20) CACHE.clear();
  CACHE.set(clave, { n: sello.n, m: sello.m, lista });
  return [...lista];
}
/** Para las pruebas: olvida lo guardado en memoria. */
export const vaciarCacheDeVectores = () => CACHE.clear();

/** Dibuja las sinapsis de significado de un trozo de notas: sus `k` vecinas más cercanas por encima del umbral. */
export async function vecinas(db, brain, { desde = 0, cuantas = 6, k = 4, umbral = 0.55 } = {}) {
  const vs = (await todosLosVectores(db, brain.id)).sort((a, b) => (a.nombre < b.nombre ? -1 : 1));
  const trozo = vs.slice(desde, desde + Math.max(1, Math.min(40, cuantas)));
  const s = [];
  for (const a of trozo) {
    const top = [];
    for (const b of vs) { if (b === a) continue; const sim = producto(a, b); if (sim >= umbral) top.push([b.nombre, sim]); }
    top.sort((x, y) => y[1] - x[1]);
    s.push(db.prepare("delete from links where brain_id = ? and src = ? and kind = 'meaning'").bind(brain.id, a.nombre));
    for (const [dst, sim] of top.slice(0, k)) s.push(db.prepare("insert or replace into links (brain_id, src, tfold, target, dst, kind, weight) values (?,?,?,?,?, 'meaning', ?)").bind(brain.id, a.nombre, fold(dst), dst, dst, +sim.toFixed(3)));
  }
  await lotes(db, s);
  const siguiente = desde + trozo.length < vs.length ? desde + trozo.length : null;
  return { ok: true, desde, hechas: trozo.length, total: vs.length, siguiente };
}

/** Qué notas se parecen en sentido a una consulta. → Map nombre → similitud (0–1), o null si no hay significado activo. */
export async function buscarSimilares(env, db, brain, consulta, { min = 0.3 } = {}) {
  if (!disponible(env)) return null;
  const e = await estado(env, db, brain.id);
  if (!e.activo) return null;
  try {
    const [vec] = await incrustar(env, [String(consulta).slice(0, 2000)]);
    const { scale, v } = cuantizar(vec);
    const q = { scale, q: new Int8Array(deBase64(v).buffer) };
    const out = new Map();
    for (const n of await todosLosVectores(db, brain.id)) { const sim = producto(q, n); if (sim >= min) out.set(n.nombre, sim); }
    return out;
  } catch { return null; } // si el modelo falla, se busca solo por palabras, sin error
}

export const borrarVectoresViejos = (db, brainId) => correr(db, 'delete from vectors where brain_id = ? and model <> ?', brainId, MODELO);
export { ahora };
