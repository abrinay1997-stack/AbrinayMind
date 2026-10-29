// Abrinay Mind — lo mínimo de HTTP: respuestas JSON, errores con estado y lectura del cuerpo con tope.

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (m, extra) => new HttpError(400, m, extra);
export const noEsta = (m = 'No existe.') => new HttpError(404, m);
export const choque = (m, extra) => new HttpError(409, m, extra);

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

/** El cuerpo JSON de una petición (tope de letras; objeto vacío si no hay cuerpo). */
export async function cuerpo(request, max = 1_500_000) {
  const t = await request.text();
  if (t.length > max) throw new HttpError(413, 'El mensaje es demasiado grande.');
  if (!t.trim()) return {};
  try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : {}; } catch { throw bad('El cuerpo no es JSON válido.'); }
}

/** Una cookie por nombre. */
export function cookie(request, nombre) {
  const c = request.headers.get('cookie') || '';
  for (const p of c.split(/;\s*/)) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i) === nombre) return p.slice(i + 1); }
  return null;
}

export const ahora = () => Date.now();
export const idCorto = () => crypto.randomUUID().replace(/-/g, '').slice(0, 14);

/** Un texto siempre corto y sin saltos peligrosos (para registros y errores). */
export const recortar = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
