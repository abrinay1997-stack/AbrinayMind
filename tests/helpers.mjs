// Ayudantes de prueba: una D1 de mentira sobre node:sqlite (con FTS5 de verdad), un Workers AI de mentira y un proveedor de IA de mentira.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handle } from '../src/app.js';

const MIGRACION = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

export function crearD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('pragma foreign_keys = on');
  raw.exec(MIGRACION);
  const preparar = (sql) => {
    let params = [];
    const s = {
      // D1 real rechaza más de 100 valores por consulta; la base simulada también, para que esto no pase desapercibido en local
      bind(...p) { if (p.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${p.length} > 100)`); params = p; return s; },
      async all() { return { results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }; },
      async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
      async run() { const i = raw.prepare(sql).run(...params); return { meta: { changes: Number(i.changes), last_row_id: Number(i.lastInsertRowid) } }; },
      _ejecutar() { const i = raw.prepare(sql).run(...params); return { meta: { changes: Number(i.changes), last_row_id: Number(i.lastInsertRowid) } }; },
    };
    return s;
  };
  return {
    raw, prepare: preparar,
    async batch(sentencias) {
      raw.exec('begin');
      try { const out = sentencias.map((s) => s._ejecutar()); raw.exec('commit'); return out; } catch (e) { raw.exec('rollback'); throw e; }
    },
  };
}

/** Vectores de mentira: cada palabra clave enciende una dimensión, así las notas con las mismas palabras «se parecen». */
export function aiFalsa() {
  const claves = ['rima', 'anafora', 'soledad', 'amor', 'batalla', 'madre', 'mar', 'ciudad'];
  const vec = (t) => { const f = String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); const v = claves.map((c) => (f.includes(c) ? 1 : 0)); v.push(0.05); return v; };
  return { llamadas: [], async run(modelo, { text }) { this.llamadas.push(text.length); return { data: text.map(vec), shape: [text.length, claves.length + 1] }; } };
}

const enc = new TextEncoder();
/** Un «Anthropic» de mentira: contesta en SSE (stream) o en JSON, y guarda lo que le pidieron. */
export function proveedorFalso({ respuesta = 'Respuesta de prueba.', uso = { input_tokens: 1000, output_tokens: 200 }, estado = 200 } = {}) {
  const peticiones = [];
  const fn = async (url, init) => {
    const cuerpo = JSON.parse(init.body); peticiones.push({ url: String(url), cabeceras: init.headers, cuerpo });
    if (estado !== 200) return new Response(JSON.stringify({ error: { message: 'boom sk-secreto123' } }), { status: estado });
    const texto = typeof respuesta === 'function' ? respuesta(cuerpo) : respuesta;
    if (cuerpo.stream) {
      const trozos = texto.match(/[\s\S]{1,18}/g) || [];
      const partes = [`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: uso.input_tokens, output_tokens: 1 } } })}\n\n`,
        ...trozos.map((t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })}\n\n`),
        `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: uso.output_tokens } })}\n\n`, `event: message_stop\ndata: {"type":"message_stop"}\n\n`];
      return new Response(new ReadableStream({ start(c) { for (const p of partes) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify({ id: 'msg_1', model: cuerpo.model, content: [{ type: 'text', text: texto }], usage: uso, stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  fn.peticiones = peticiones;
  return fn;
}

/** Un entorno de prueba con su cliente HTTP (cookie incluida). */
export async function entorno({ extra = {}, proveedor = proveedorFalso(), conAI = false, entrar = true } = {}) {
  const db = crearD1(), pendientes = [];
  const env = { DB: db, APP_PASSWORD: 'clave-de-prueba', SESSION_SECRET: 'secreto-de-sesion-de-prueba-123456', ANTHROPIC_API_KEY: 'sk-ant-prueba', ...(conAI ? { AI: aiFalsa() } : {}), ...extra };
  const ec = { waitUntil: (p) => pendientes.push(p) };
  let galleta = '';
  const api = async (metodo, ruta, cuerpo, { cabeceras = {}, sinX = false } = {}) => {
    const init = { method: metodo, headers: { ...(sinX ? {} : { 'x-am': '1' }), ...(galleta ? { cookie: galleta } : {}), ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}), ...cabeceras }, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined };
    const res = await handle(new Request('https://abrinay.test' + ruta, init), env, ec, { fetchFn: proveedor });
    const sc = res.headers.get('set-cookie'); if (sc) galleta = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    return res;
  };
  const j = async (metodo, ruta, cuerpo, op) => { const r = await api(metodo, ruta, cuerpo, op); const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, datos: d, res: r }; };
  /** Lee una respuesta SSE hasta el final y devuelve los eventos. */
  const flujo = async (ruta, cuerpo) => {
    const r = await api('POST', ruta, cuerpo);
    if (r.status !== 200) return { status: r.status, datos: await r.json() };
    const texto = await r.text(); await Promise.all(pendientes.splice(0));
    const eventos = []; for (const bloque of texto.split('\n\n')) { const m = /^event: (.+)\ndata: (.*)$/s.exec(bloque.trim()); if (m) eventos.push({ evento: m[1], datos: JSON.parse(m[2]) }); }
    return { status: 200, eventos, texto: eventos.filter((e) => e.evento === 'content_block_delta').map((e) => e.datos.delta.text).join(''), contexto: eventos.find((e) => e.evento === 'am_context')?.datos, fin: eventos.find((e) => e.evento === 'am_done')?.datos, error: eventos.find((e) => e.evento === 'am_error')?.datos };
  };
  if (entrar) { const r = await j('POST', '/api/login', { password: 'clave-de-prueba' }); if (r.status !== 200) throw new Error('no se pudo entrar en la prueba'); }
  return { db, env, api, j, flujo, proveedor, pendientes, esperar: () => Promise.all(pendientes.splice(0)) };
}

/** Una bóveda pequeña pero con todo: modo, reglas siempre, canciones, técnicas, privada, enlaces rotos y menciones. */
export const BOVEDA_CHICA = [
  { nombre: 'Índice', carpeta: '00-Meta', texto: '---\ntipo: moc\n---\n# Índice\n\n- [[Reglas de oro]]\n- [[Modo 1 — Introspectivo]]\n- [[Modo 2 — Batalla]]\n- [[Niebla]]\n- [[Anáfora]]\n' },
  { nombre: 'Reglas de oro', carpeta: '00-Meta', texto: '---\ntipo: regla\nsiempre: true\n---\n# Reglas de oro\n\n1. Cerrar sin resolver.\n2. La dualidad manda.\n\nVer [[Índice]].' },
  { nombre: 'Reglas aprendidas', carpeta: '00-Meta', texto: '---\ntipo: regla\nsiempre: true\n---\n# Reglas aprendidas\n\n## Reglas\n\n- (semilla) nunca explicar de más.\n' },
  { nombre: 'Modo 1 — Introspectivo', carpeta: '30-Modos', texto: '---\ntipo: modo\nmodo_id: introspectivo\nmodo_nombre: Introspectivo-Psicológico\norden: 1\npalabras: profundo, capas, identidad, soledad\n---\n# Modo 1\n\nFrío y lúcido. Usa [[Anáfora]] y rima de la soledad. Ejemplo: [[Niebla]].' },
  { nombre: 'Modo 2 — Batalla', carpeta: '30-Modos', texto: '---\ntipo: modo\nmodo_id: batalla\nmodo_nombre: Técnico-Batalla\norden: 2\npalabras: batalla, diss, tirarla, freestyle\n---\n# Modo 2\n\nDenso y agresivo. Rima multisílaba. Ejemplo: [[Marea]].' },
  { nombre: 'Anáfora', carpeta: '60-Técnicas', texto: '---\ntipo: tecnica\nalias: anáforas\n---\n# Anáfora\n\nRepetir una estructura de arranque ocho veces o más, como un martillo. Ver [[Niebla]] y [[Nota que no existe]].' },
  { nombre: 'Niebla', carpeta: '40-Canciones', texto: '---\ntipo: cancion\nmencion: false\n---\n# Niebla\n\nEn la estación cuando nadie llega el silencio me abraza.\n\n## Letra\n\nCamino por la estación cuando nadie llega\nEl silencio que me abraza\n\nRecursos: [[Anáfora]].' },
  { nombre: 'Marea', carpeta: '40-Canciones', texto: '---\ntipo: cancion\nmencion: false\nprivado: true\n---\n# Marea\n\nBatalla con nombres reales de gente. Barras de batalla densas y rima multisílaba.\n\nUsa [[Modo 2 — Batalla]].' },
  { nombre: 'Eminem', carpeta: '50-Referentes', texto: '---\ntipo: referente\nalias: Eminem, Slim Shady\n---\n# Eminem\n\nReferente técnico número uno. Habla de la batalla y de la rima multisílaba.' },
  { nombre: 'Nota suelta larga', carpeta: '90-Proyectos', texto: '---\ntipo: proyecto\n---\n# Nota suelta larga\n\nEsta nota habla de Eminem y de la anáfora pero no enlaza con nada.' },
];
