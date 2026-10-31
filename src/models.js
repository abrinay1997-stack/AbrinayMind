// Abrinay Mind — los modelos de lenguaje: el catálogo (Claude de Anthropic y Muse Spark de Meta), qué modelo hace cada tarea,
// la llamada en sí y lo que cuesta. El destino de cada proveedor es FIJO (o lo pone el dueño del Worker con una variable): nunca viene de la interfaz.
//
// Muse Spark «Contributor» es el mismo modelo a una fracción del precio A CAMBIO de que Meta use tus prompts y respuestas para entrenar sus modelos.
// Por eso: (1) viene apagado y solo se puede elegir si lo permites a propósito en Ajustes; (2) nunca recibe una nota marcada `privado: true`.
import { HttpError, bad, recortar } from './http.js';
import { leerAjuste, guardarAjuste } from './db.js';

export const PROVEEDORES = {
  anthropic: { id: 'anthropic', nombre: 'Anthropic (Claude)', llave: 'ANTHROPIC_API_KEY', base: 'https://api.anthropic.com', baseVar: 'ANTHROPIC_BASE_URL', ruta: '/v1/messages', streaming: true },
  meta: { id: 'meta', nombre: 'Meta (Muse Spark)', llave: 'META_API_KEY', llaveAlt: 'MODEL_API_KEY', base: 'https://api.meta.ai', baseVar: 'META_BASE_URL', ruta: '/v1/messages', streaming: false },
};

/** Precios en US$ por millón de tokens. Los de Claude, de la tabla de costos de Agents Office (2026-09-25); los de Muse, de fuentes secundarias (verifícalos en tu factura). */
export const CATALOGO = [
  { id: 'claude-fable-5-1', proveedor: 'anthropic', nombre: 'Claude Fable 5.1', in: 10, out: 50, cacheR: 0.25, cacheW: 12.5, nota: 'El más capaz y el más caro.' },
  { id: 'claude-opus-5-5', proveedor: 'anthropic', nombre: 'Claude Opus 5.5', in: 4, out: 20, cacheR: 0.2, cacheW: 5, nota: 'Mucho criterio para letras delicadas.' },
  { id: 'claude-sonnet-5-5', proveedor: 'anthropic', nombre: 'Claude Sonnet 5.5', in: 2, out: 10, cacheR: 0.2, cacheW: 2.5, nota: 'El equilibrio: calidad de letra y costo. Recomendado para escribir.' },
  { id: 'claude-haiku-5-5', proveedor: 'anthropic', nombre: 'Claude Haiku 5.5', in: 1, out: 5, cacheR: 0.1, cacheW: 1.25, nota: 'Rápido y barato: críticas, reglas, enlaces.' },
  { id: 'muse-spark-1.3', proveedor: 'meta', nombre: 'Muse Spark 1.3', in: 1.25, out: 4.25, cacheR: 0.15, cacheW: 1.25, nota: 'Meta. Sus términos estándar no usan tus datos para entrenar.' },
  { id: 'muse-spark-1.3-contributor', proveedor: 'meta', nombre: 'Muse Spark 1.3 · Contributor', in: 0.1, out: 0.2, cacheR: 0.1, cacheW: 0.1, entrena: true, nota: 'Casi gratis, pero Meta entrena con tus prompts y respuestas. No recibe notas privadas.' },
  { id: 'muse-spark-1.2', proveedor: 'meta', nombre: 'Muse Spark 1.2', in: 1.25, out: 4.25, cacheR: 0.15, cacheW: 1.25, nota: 'Versión anterior de Muse Spark.' },
  { id: 'muse-spark-1.2-contributor', proveedor: 'meta', nombre: 'Muse Spark 1.2 · Contributor', in: 0.1, out: 0.2, cacheR: 0.1, cacheW: 0.1, entrena: true, nota: 'Versión anterior, con entrenamiento de Meta.' },
];
export const modeloPorId = (id) => CATALOGO.find((m) => m.id === id) || null;

/** Las tareas a las que se les asigna un modelo. */
export const FUNCIONES = [
  { id: 'letra', nombre: 'Escribir letras', ayuda: 'El constructor de canciones y sus refinamientos. Aquí importa la calidad.', defecto: 'claude-sonnet-5-5' },
  { id: 'chat', nombre: 'Conversar con el cerebro', ayuda: 'Preguntas, ideas, correcciones y charla sobre las letras.', defecto: 'claude-sonnet-5-5' },
  { id: 'borrador', nombre: 'Borradores y lluvia de ideas', ayuda: 'Muchas versiones baratas para explorar. Buen sitio para un modelo económico.', defecto: 'claude-haiku-5-5' },
  { id: 'critica', nombre: 'Criticar y puntuar', ayuda: 'Una segunda lectura de una letra contra las reglas del cerebro.', defecto: 'claude-haiku-5-5' },
  { id: 'reglas', nombre: 'Proponer reglas aprendidas', ayuda: 'Tras un rechazo, redacta la regla NUNCA/SIEMPRE.', defecto: 'claude-haiku-5-5' },
  { id: 'conectar', nombre: 'Sugerir enlaces', ayuda: 'Propone con qué notas conectar una nota suelta.', defecto: 'claude-haiku-5-5' },
];
const IDS_FUNCION = new Set(FUNCIONES.map((f) => f.id));
export const PROFUNDIDADES = ['ligera', 'normal', 'profunda'];
export const PENSAMIENTOS = ['apagado', 'normal', 'profundo'];
/** Tokens que el modelo puede gastar pensando antes de contestar (0 = sin pensamiento extendido). Solo letras y conversación: críticas y enlaces no lo necesitan. */
export const PRESUPUESTO_PENSAR = { normal: { letra: 4000, chat: 2000, borrador: 0, critica: 0 }, profundo: { letra: 10000, chat: 5000, borrador: 2000, critica: 0 } };
export const presupuestoPensar = (nivel, fn) => PRESUPUESTO_PENSAR[nivel]?.[fn] || 0;

export const AJUSTES_VACIOS = () => ({ funciones: {}, entrena: false, profundidad: 'normal', pensamiento: 'normal', escritura_ia: true, tope_mensual_usd: null });

export async function leerAjustes(db) {
  const a = await leerAjuste(db, 'models', null);
  return { ...AJUSTES_VACIOS(), ...(a && typeof a === 'object' ? a : {}) };
}

/** Valida lo que guarda el artista. Lo desconocido se rechaza (no se ignora). */
export function validarAjustes(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}; const v = AJUSTES_VACIOS(); const errores = [];
  for (const k of Object.keys(o)) if (!(k in v)) errores.push(`Ajuste desconocido «${recortar(k, 30)}».`);
  for (const [f, id] of Object.entries(o.funciones && typeof o.funciones === 'object' ? o.funciones : {})) {
    if (!IDS_FUNCION.has(f)) { errores.push(`Función desconocida «${recortar(f, 30)}».`); continue; }
    if (id === '' || id == null) continue;
    if (!modeloPorId(id)) { errores.push(`El modelo «${recortar(id, 40)}» no está en el catálogo.`); continue; }
    v.funciones[f] = id;
  }
  if (o.entrena !== undefined) v.entrena = o.entrena === true;
  if (o.profundidad !== undefined) { if (!PROFUNDIDADES.includes(o.profundidad)) errores.push('La profundidad es ligera, normal o profunda.'); else v.profundidad = o.profundidad; }
  if (o.escritura_ia !== undefined) v.escritura_ia = o.escritura_ia === true;
  if (o.pensamiento !== undefined) { if (!PENSAMIENTOS.includes(o.pensamiento)) errores.push('El pensamiento es apagado, normal o profundo.'); else v.pensamiento = o.pensamiento; }
  if (o.tope_mensual_usd !== undefined && o.tope_mensual_usd !== null && o.tope_mensual_usd !== '') {
    const t = Number(o.tope_mensual_usd); if (!(t >= 0 && t <= 10000)) errores.push('El tope mensual es un número de dólares entre 0 y 10.000.'); else v.tope_mensual_usd = t;
  }
  if (!v.entrena) for (const [f, id] of Object.entries(v.funciones)) if (modeloPorId(id)?.entrena) errores.push(`«${modeloPorId(id).nombre}» entrena con tus datos: primero permite los modelos que entrenan.`);
  return errores.length ? { ok: false, errores } : { ok: true, valor: v };
}
export const guardarAjustes = (db, valor) => guardarAjuste(db, 'models', valor);

export const llaveDe = (env, proveedor) => { const p = PROVEEDORES[proveedor]; return (env[p.llave] || (p.llaveAlt && env[p.llaveAlt]) || '').toString(); };
export const tieneLlave = (env, proveedor) => !!llaveDe(env, proveedor);

/**
 * Qué modelo hace una tarea. `pedido`: el que el artista eligió a mano para esta petición (gana sobre los ajustes).
 * Un modelo que entrena solo se usa si el artista lo permitió; una llave que falta se dice con todas las letras.
 * → { modelo, de, avisos:[] }
 */
export function elegirModelo(env, ajustes, { fn = 'letra', pedido = null } = {}) {
  const avisos = [];
  let modelo, de;
  if (pedido) {
    modelo = modeloPorId(pedido); if (!modelo) throw bad(`El modelo «${recortar(pedido, 40)}» no existe.`);
    de = 'elegido a mano para esta petición';
  } else {
    const f = FUNCIONES.find((x) => x.id === fn); if (!f) throw bad(`La tarea «${recortar(fn, 20)}» no existe.`);
    const id = ajustes.funciones[fn] || f.defecto;
    modelo = modeloPorId(id); de = ajustes.funciones[fn] ? `Ajustes → ${f.nombre}` : 'el valor por defecto';
    if (!tieneLlave(env, modelo.proveedor)) {
      // el que toca no tiene llave: se cae a otro que sí, y se dice (nunca a uno que entrene sin permiso)
      const alterno = CATALOGO.find((m) => !m.entrena && tieneLlave(env, m.proveedor));
      if (alterno) { avisos.push(`Falta ${PROVEEDORES[modelo.proveedor].llave}; se usó ${alterno.nombre}.`); modelo = alterno; de += ' (con otra llave)'; }
    }
  }
  if (modelo.entrena && !ajustes.entrena) throw new HttpError(409, `${modelo.nombre} entrena con tus prompts y respuestas. Para usarlo, permítelo antes en Ajustes → «Permitir modelos que entrenan con mis datos».`, { codigo: 'entrena' });
  if (!tieneLlave(env, modelo.proveedor)) throw new HttpError(503, `Falta el secreto ${PROVEEDORES[modelo.proveedor].llave} en Cloudflare para usar ${modelo.nombre}.`, { codigo: 'sin_llave' });
  return { modelo, de, avisos };
}

/** US$ de una llamada con el uso que informó el proveedor. */
export function costo(modelo, uso = {}) {
  const ent = uso.input_tokens || 0, sal = uso.output_tokens || 0, cr = uso.cache_read_input_tokens || 0, cw = uso.cache_creation_input_tokens || 0;
  return ((ent * modelo.in) + (sal * modelo.out) + (cr * (modelo.cacheR ?? modelo.in)) + (cw * (modelo.cacheW ?? modelo.in))) / 1e6;
}

/** Mensaje en español para un error del proveedor, sin llaves ni cuerpos crudos. */
export function errorDeApi(status, datos, modelo) {
  const m = recortar(datos?.error?.message || datos?.message || '', 160).replace(/(sk-|key-)[\w-]+/gi, '«llave»');
  if (status === 401 || status === 403) return `${modelo.nombre}: el proveedor rechazó la llave. Revisa ${PROVEEDORES[modelo.proveedor].llave}.`;
  if (status === 404) return `${modelo.nombre}: el proveedor no reconoce ese modelo (${modelo.id}).`;
  if (status === 429) return `${modelo.nombre}: demasiadas peticiones o sin saldo. Espera un momento.`;
  if (status >= 500) return `${modelo.nombre}: el proveedor está caído o saturado (${status}).`;
  return `${modelo.nombre}: ${m || 'error ' + status}`;
}

const baseDe = (env, p) => String(env[p.baseVar] || p.base).replace(/\/+$/, '');

/** Arma la petición al proveedor (puro: se prueba sin red). `sistema`: texto, o bloques [{ text, cache }] para el prefijo con caché. */
export function armarLlamada(env, modelo, { sistema, mensajes, maxTokens = 4096, stream = false, temperatura = null, pensar = 0, herramientas = null, sinHerramientas = false }) {
  const p = PROVEEDORES[modelo.proveedor];
  const bloques = typeof sistema === 'string' ? [{ text: sistema }] : sistema;
  const cuerpo = { model: modelo.id, max_tokens: maxTokens, messages: mensajes };
  if (modelo.proveedor === 'anthropic' && pensar >= 1024) {
    // pensamiento extendido: el modelo razona antes de escribir. Exige max_tokens > presupuesto y no admite temperature.
    cuerpo.thinking = { type: 'enabled', budget_tokens: pensar }; cuerpo.max_tokens = maxTokens + pensar;
  } else if (temperatura != null) cuerpo.temperature = temperatura;
  if (modelo.proveedor === 'anthropic') {
    cuerpo.system = bloques.map((b) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
    if (stream) cuerpo.stream = true;
    if (herramientas?.length) { cuerpo.tools = herramientas; if (sinHerramientas) cuerpo.tool_choice = { type: 'none' }; }   // «none»: las declara (la API lo exige si el historial trae herramientas) pero obliga a contestar en texto
  } else {
    cuerpo.system = bloques.map((b) => b.text).join('\n\n');
  }
  const cab = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
  if (modelo.proveedor === 'meta') cab.authorization = `Bearer ${llaveDe(env, 'meta')}`; else cab['x-api-key'] = llaveDe(env, 'anthropic');
  return { url: baseDe(env, p) + p.ruta, cabeceras: cab, cuerpo, pensado: cuerpo.thinking ? pensar : 0 };
}

const REINTENTABLES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
export const ESPERAS = [800, 2500];                   // ms antes del 2.º y del 3.er intento
export const TIEMPOS = { primerByte: 30_000 };        // ms hasta que el proveedor empieza a contestar
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La petición al proveedor con reintentos: un error de red, un tiempo agotado o un 429/5xx/529 («saturado») se reintentan hasta 2 veces con espera creciente
 * (respetando `retry-after` hasta 5 s). Solo se reintenta ANTES de recibir una respuesta válida: nunca se repite un texto ya empezado.
 * → la Response ok del proveedor, o lanza HttpError con un mensaje en español.
 */
async function pedirConReintentos(modelo, r, { fetchFn, senal, esperas = ESPERAS, tiempos = TIEMPOS }) {
  let ultimo = null;
  for (let intento = 0; intento <= esperas.length; intento++) {
    const ctl = new AbortController(), aborto = () => ctl.abort();
    senal?.addEventListener?.('abort', aborto, { once: true });
    const reloj = setTimeout(aborto, tiempos.primerByte ?? TIEMPOS.primerByte);
    let espera = esperas[intento] ?? 0;
    try {
      const res = await fetchFn(r.url, { method: 'POST', headers: r.cabeceras, body: JSON.stringify(r.cuerpo), signal: ctl.signal });
      clearTimeout(reloj);
      if (res.ok) return res;
      const datos = await res.json().catch(() => null);
      if (res.status === 400 && r.cuerpo.thinking && /thinking/i.test(JSON.stringify(datos?.error || datos || ''))) {
        // este modelo no acepta ese pensamiento extendido: se escribe igual, sin él (no cuenta como intento)
        delete r.cuerpo.thinking; r.cuerpo.max_tokens = Math.max(1024, r.cuerpo.max_tokens - (r.pensado || 0)); intento--; continue;
      }
      ultimo = new HttpError(res.status === 429 ? 429 : 502, errorDeApi(res.status, datos, modelo));
      if (!REINTENTABLES.has(res.status)) throw ultimo;
      const ra = Number(res.headers?.get?.('retry-after')); if (ra > 0) espera = Math.min(5000, Math.max(espera, ra * 1000));
    } catch (e) {
      clearTimeout(reloj);
      if (e === ultimo && ultimo) throw e;
      if (senal?.aborted) throw new HttpError(499, 'Se detuvo la petición.');
      ultimo = new HttpError(502, ctl.signal.aborted ? `${modelo.nombre} tardó demasiado en empezar a contestar.` : `No se pudo llamar a ${modelo.nombre}: ${recortar(e?.message, 100)}`);
    } finally { senal?.removeEventListener?.('abort', aborto); }
    if (intento < esperas.length) await dormir(espera); else throw ultimo;
  }
  throw ultimo;
}

/** Una llamada completa (sin streaming). → { texto, uso, modelo, parada } */
export async function llamar(env, modelo, args, { fetchFn = fetch, senal, esperas, tiempos } = {}) {
  const r = armarLlamada(env, modelo, { ...args, stream: false });
  const res = await pedirConReintentos(modelo, r, { fetchFn, senal, esperas, tiempos });
  const datos = await res.json().catch(() => null);
  const texto = (Array.isArray(datos?.content) ? datos.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { texto, uso: datos?.usage || {}, modelo: datos?.model || modelo.id, parada: datos?.stop_reason || 'end_turn' };
}

/** Una llamada con streaming (solo Anthropic). Devuelve la Response del proveedor para reenviarla tal cual. */
export async function llamarEnFlujo(env, modelo, args, { fetchFn = fetch, senal, esperas, tiempos } = {}) {
  const r = armarLlamada(env, modelo, { ...args, stream: true });
  return pedirConReintentos(modelo, r, { fetchFn, senal, esperas, tiempos });
}
