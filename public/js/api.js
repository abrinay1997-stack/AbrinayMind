// Abrinay Mind — la conversación con el Worker: peticiones JSON y el lector de eventos en vivo (SSE) del Estudio.

export class ErrorApi extends Error {
  constructor(mensaje, status, extra = {}) { super(mensaje); this.status = status; this.extra = extra; this.codigo = extra.codigo || null; }
}
export const alSalir = new EventTarget(); // se dispara con 401: la sesión caducó

async function leerError(res) {
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) alSalir.dispatchEvent(new Event('sesion'));
  return new ErrorApi((d.error || `Error ${res.status}`) + (d.id ? ` (código ${d.id.slice(0, 6)})` : ''), res.status, d);
}

export async function api(metodo, ruta, cuerpo, { senal } = {}) {
  const init = { method: metodo, headers: { 'x-am': '1' }, credentials: 'same-origin', signal: senal };
  if (cuerpo !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(cuerpo); }
  let res;
  try { res = await fetch(ruta, init); } catch (e) { if (e.name === 'AbortError') throw e; throw new ErrorApi('Sin conexión con el servidor. Revisa tu internet.', 0); }
  if (!res.ok) throw await leerError(res);
  return res.status === 204 ? {} : res.json();
}
export const GET = (r, o) => api('GET', r, undefined, o);
export const POST = (r, c, o) => api('POST', r, c ?? {}, o);
export const PUT = (r, c, o) => api('PUT', r, c ?? {}, o);
export const PATCH = (r, c, o) => api('PATCH', r, c ?? {}, o);
export const DELETE = (r, c, o) => api('DELETE', r, c ?? {}, o);

/** Atajos de un cerebro: B('abrinay').get('note?name=…') */
export const cerebro = (slug) => {
  const base = `/api/b/${encodeURIComponent(slug)}/`;
  return { get: (r, o) => GET(base + r, o), post: (r, c, o) => POST(base + r, c, o), put: (r, c, o) => PUT(base + r, c, o), patch: (r, c, o) => PATCH(base + r, c, o), del: (r, c, o) => DELETE(base + r, c, o), base };
};

/** Descarga un archivo de la API (exportar bóveda) como texto. */
export async function descargarTexto(ruta) {
  const res = await fetch(ruta, { headers: { 'x-am': '1' }, credentials: 'same-origin' });
  if (!res.ok) throw await leerError(res);
  return res.text();
}

/**
 * POST que responde con eventos en vivo. manejadores: { contexto(info), texto(trozo), hecho(info), error(msg) }.
 * Si el servidor rechaza antes de empezar (sin llave, tope, modelo que entrena…), lanza ErrorApi con su mensaje.
 */
export async function flujo(ruta, cuerpo, manejadores, { senal } = {}) {
  let res;
  try { res = await fetch(ruta, { method: 'POST', headers: { 'x-am': '1', 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(cuerpo), signal: senal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ErrorApi('Sin conexión con el servidor.', 0); }
  if (!res.ok) throw await leerError(res);
  const lector = res.body.getReader(), dec = new TextDecoder();
  let resto = '';
  const despachar = (bloque) => {
    let evento = 'message', datos = '';
    for (const l of bloque.split('\n')) {
      if (l.startsWith('event:')) evento = l.slice(6).trim();
      else if (l.startsWith('data:')) datos += l.slice(5).trim();
    }
    if (!datos) return;
    let d; try { d = JSON.parse(datos); } catch { return; }
    if (evento === 'am_context') manejadores.contexto?.(d);
    else if (evento === 'am_paso') manejadores.paso?.(d);
    else if (evento === 'am_cambios') manejadores.cambios?.(d);
    else if (evento === 'am_done') manejadores.hecho?.(d);
    else if (evento === 'am_error') manejadores.error?.(d.error || 'Se cortó la respuesta.');
    else if (evento === 'error' || d.type === 'error') manejadores.error?.(d.error?.message || 'El proveedor devolvió un error.');
    else if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') manejadores.texto?.(d.delta.text);
  };
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    let i;
    while ((i = resto.indexOf('\n\n')) !== -1) { despachar(resto.slice(0, i)); resto = resto.slice(i + 2); }
  }
  if (resto.trim()) despachar(resto);
}
