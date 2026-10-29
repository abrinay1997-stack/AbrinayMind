// Abrinay Mind — acceso. Una sola contraseña (APP_PASSWORD) y una cookie firmada (SESSION_SECRET); nada más puede leer tus letras.
// Defensas: comparación en tiempo constante, tope de intentos por IP, cookie HttpOnly+Secure+SameSite=Strict y cabecera `x-am` en toda
// petición que cambia algo (un sitio ajeno no puede añadirla sin permiso del navegador) más la comprobación de `Origin`.
import { HttpError, cookie, json, ahora } from './http.js';

const NOMBRE = 'am_session';
const DURA_MS = 30 * 24 * 3600 * 1000;
const INTENTOS = 8, VENTANA_MS = 15 * 60 * 1000;
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function llave(secreto) { return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function firmar(secreto, texto) { return b64u(await crypto.subtle.sign('HMAC', await llave(secreto), enc.encode(texto))); }

/** Igualdad en tiempo constante (se comparan los SHA-256, que miden lo mismo siempre). */
export async function iguales(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export const configurado = (env) => !!(env.APP_PASSWORD && env.SESSION_SECRET && String(env.SESSION_SECRET).length >= 16);

export async function crearSesion(env, { t = ahora() } = {}) {
  const carga = b64u(enc.encode(JSON.stringify({ exp: t + DURA_MS, n: crypto.randomUUID() })));
  return `${carga}.${await firmar(env.SESSION_SECRET, carga)}`;
}

export async function sesionValida(request, env) {
  if (!configurado(env)) return false;
  const v = cookie(request, NOMBRE); if (!v) return false;
  const [carga, firma] = v.split('.'); if (!carga || !firma) return false;
  if (!(await iguales(firma, await firmar(env.SESSION_SECRET, carga)))) return false;
  try { return JSON.parse(new TextDecoder().decode(deB64u(carga))).exp > ahora(); } catch { return false; }
}

const galleta = (valor, maxAge, request) => {
  const seguro = new URL(request.url).protocol === 'https:';
  return `${NOMBRE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
};

const ipDe = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';

/** POST /api/login {password} */
export async function entrar(request, env, db, datos) {
  if (!configurado(env)) throw new HttpError(503, 'Falta configurar APP_PASSWORD y SESSION_SECRET (≥ 16 letras) como secretos del Worker.');
  const ip = ipDe(request), desde = ahora() - VENTANA_MS;
  const { n } = (await db.prepare('select count(*) n from login_attempts where ip = ? and at > ?').bind(ip, desde).first()) || { n: 0 };
  if (n >= INTENTOS) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
  const ok = await iguales(String(datos.password ?? ''), env.APP_PASSWORD);
  if (!ok) {
    await db.prepare('insert into login_attempts (ip, at) values (?, ?)').bind(ip, ahora()).run();
    throw new HttpError(401, 'Contraseña incorrecta.');
  }
  await db.prepare('delete from login_attempts where ip = ? or at < ?').bind(ip, desde).run();
  return json({ ok: true }, 200, { 'set-cookie': galleta(await crearSesion(env), DURA_MS / 1000, request) });
}

export const salir = (request) => json({ ok: true }, 200, { 'set-cookie': galleta('', 0, request) });

/** Toda petición que cambia algo: misma procedencia y cabecera x-am. */
export function exigirOrigen(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (request.headers.get('x-am') !== '1') throw new HttpError(403, 'Petición no permitida.');
  const origen = request.headers.get('origin');
  if (origen && origen !== new URL(request.url).origin) throw new HttpError(403, 'Origen no permitido.');
}
