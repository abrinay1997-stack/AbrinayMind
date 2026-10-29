// Abrinay Mind — el enrutador. Solo /api/* llega aquí (la interfaz la sirven los Static Assets de Cloudflare sin gastar CPU del Worker).
import { HttpError, bad, json, cuerpo } from './http.js';
import { configurado, sesionValida, entrar, salir, exigirOrigen } from './auth.js';
import { una, todas } from './db.js';
import * as cerebros from './brains.js';
import * as notas from './notes.js';
import * as buscador from './search.js';
import * as significado from './meaning.js';
import * as conexion from './connect.js';
import * as canciones from './songs.js';
import * as chat from './chat.js';
import * as traslado from './transfer.js';
import * as uso from './usage.js';
import { grafoDe } from './graph.js';
import { modosDelCerebro } from './context.js';
import { CATALOGO, FUNCIONES, PROVEEDORES, leerAjustes, validarAjustes, guardarAjustes, tieneLlave } from './models.js';

const VERSION = '0.1.0';

/** Tabla de rutas: [método, patrón, manejador]. `:x` captura un tramo. */
const RUTAS = [];
const r = (metodo, patron, fn, opciones = {}) => RUTAS.push({ metodo, re: new RegExp('^' + patron.replace(/:([a-z]+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opciones });

/* ---- cerebros ---- */
r('GET', '/api/brains', async (c) => ({ cerebros: await cerebros.listar(c.db) }));
r('POST', '/api/brains', async (c) => { const d = await c.cuerpo(); const b = await cerebros.crear(c.db, { name: d.name, slug: d.slug, subtitle: d.subtitle, color: d.color || undefined, plantilla: d.plantilla !== false }); return { cerebro: cerebros.publico(b) }; });
r('POST', '/api/brains/import', async (c) => { const d = await c.cuerpo(); const b = await traslado.empezar(c.db, { cerebro: d.cerebro, reemplazar: d.reemplazar === true }); return { cerebro: cerebros.publico(b) }; });
r('PATCH', '/api/brains/:slug', async (c) => { const b = await cerebros.porSlug(c.db, c.p.slug); const d = await c.cuerpo(); return { cerebro: cerebros.publico(await cerebros.cambiar(c.db, b, d)) }; });
r('DELETE', '/api/brains/:slug', async (c) => cerebros.borrar(c.db, await cerebros.porSlug(c.db, c.p.slug), await c.cuerpo()));

/* ---- ajustes y modelos ---- */
r('GET', '/api/models', async (c) => {
  const ajustes = await leerAjustes(c.db);
  return {
    ajustes, proveedores: Object.values(PROVEEDORES).map((p) => ({ id: p.id, nombre: p.nombre, llave: p.llave, configurada: tieneLlave(c.env, p.id) })),
    catalogo: CATALOGO.map((m) => ({ ...m, disponible: tieneLlave(c.env, m.proveedor) })), funciones: FUNCIONES.map((f) => ({ ...f, actual: ajustes.funciones[f.id] || f.defecto, personalizada: !!ajustes.funciones[f.id] })),
    significado: { disponible: significado.disponible(c.env), modelo: significado.MODELO }, acceso: { configurado: configurado(c.env) },
    gasto: { mes: await uso.gastoDelMes(c.db), porModelo: await uso.porModelo(c.db) },
  };
});
r('PUT', '/api/settings', async (c) => { const v = validarAjustes(await c.cuerpo()); if (!v.ok) throw bad(v.errores.join(' ')); await guardarAjustes(c.db, v.valor); return { ajustes: v.valor }; });

/* ---- un cerebro ---- */
const B = (fn) => async (c) => fn(c, await cerebros.porSlug(c.db, c.p.slug));

r('GET', '/api/b/:slug/meta', B(async (c, b) => {
  const [modos, siempre, carpetas, cuenta, canc, chats] = await Promise.all([
    modosDelCerebro(c.db, b.id), todas(c.db, 'select name from notes where brain_id = ? and always = 1 order by name', b.id), todas(c.db, 'select folder, count(*) n from notes where brain_id = ? group by folder order by folder', b.id),
    una(c.db, 'select count(*) n from notes where brain_id = ?', b.id), una(c.db, 'select count(*) n, sum(status = ?) aprobadas from songs where brain_id = ?', 'aprobada', b.id), una(c.db, 'select count(*) n from chats where brain_id = ?', b.id)]);
  return { cerebro: cerebros.publico(b), modos, siempre: siempre.map((s) => s.name), carpetas: carpetas.map((x) => ({ carpeta: x.folder, notas: x.n })), stats: { notas: cuenta.n, canciones: canc.n, aprobadas: canc.aprobadas || 0, conversaciones: chats.n }, significado: await significado.estado(c.env, c.db, b.id) };
}));
r('GET', '/api/b/:slug/graph', B(async (c, b) => grafoDe(c.db, b.id)));
r('GET', '/api/b/:slug/quality', B(async (c, b) => notas.salud(c.db, b.id)));
r('GET', '/api/b/:slug/search', B(async (c, b) => {
  const q = c.url.searchParams.get('q') || ''; if (q.trim().length < 2) return { resultados: [], significado: false };
  const { resultados, significado: sig } = await buscador.buscar(c.env, c.db, b, q, { n: Math.min(30, Number(c.url.searchParams.get('n')) || 12) });
  return { resultados, significado: sig };
}));

/* ---- notas ---- */
r('GET', '/api/b/:slug/notes', B(async (c, b) => ({ notas: await notas.listar(c.db, b.id, { carpeta: c.url.searchParams.get('carpeta') || '', q: c.url.searchParams.get('q') || '' }) })));
r('GET', '/api/b/:slug/note', B(async (c, b) => notas.leer(c.db, b.id, c.url.searchParams.get('name') || '')));
r('POST', '/api/b/:slug/note', B(async (c, b) => { const d = await c.cuerpo(); return notas.crear(c.db, b, { nombre: d.name, carpeta: d.carpeta ?? d.folder ?? '', texto: d.text ?? '' }); }));
r('PUT', '/api/b/:slug/note', B(async (c, b) => { const d = await c.cuerpo(); return notas.guardar(c.db, b, { nombre: d.name, texto: d.text, base: d.base ?? null, carpeta: d.carpeta ?? d.folder ?? null }); }));
r('POST', '/api/b/:slug/note/append', B(async (c, b) => { const d = await c.cuerpo(); return notas.agregar(c.db, b, { nombre: d.name, texto: d.text, seccion: d.seccion || '' }); }));
r('POST', '/api/b/:slug/note/move', B(async (c, b) => { const d = await c.cuerpo(); return notas.mover(c.db, b, { nombre: d.name, carpeta: d.carpeta ?? '' }); }));
r('POST', '/api/b/:slug/note/rename', B(async (c, b) => { const d = await c.cuerpo(); return notas.renombrar(c.db, b, { nombre: d.name, nuevo: d.nuevo, reescribir: d.reescribir !== false }); }));
r('POST', '/api/b/:slug/note/trash', B(async (c, b) => { const d = await c.cuerpo(); return notas.tirar(c.db, b, { nombre: d.name, base: d.base ?? null }); }));
r('GET', '/api/b/:slug/trash', B(async (c, b) => ({ papelera: await notas.papelera(c.db, b.id) })));
r('POST', '/api/b/:slug/note/restore', B(async (c, b) => { const d = await c.cuerpo(); return notas.restaurar(c.db, b, { id: d.id }); }));
r('POST', '/api/b/:slug/menciones', B(async (c, b) => { const d = await c.cuerpo(); return notas.recalcularMenciones(c.db, b, { desde: Number(d.desde) || 0, cuantas: Math.min(60, Number(d.cuantas) || 30) }); }));

/* ---- significado y conexiones ---- */
r('GET', '/api/b/:slug/meaning', B(async (c, b) => significado.estado(c.env, c.db, b.id)));
r('POST', '/api/b/:slug/meaning/index', B(async (c, b) => { const d = await c.cuerpo(); return significado.indexar(c.env, c.db, b, { cuantas: Number(d.cuantas) || 8 }); }));
r('POST', '/api/b/:slug/meaning/neighbors', B(async (c, b) => { const d = await c.cuerpo(); return significado.vecinas(c.db, b, { desde: Number(d.desde) || 0, cuantas: Number(d.cuantas) || 6, k: Number(d.k) || 4, umbral: Number(d.umbral) || 0.55 }); }));
r('POST', '/api/b/:slug/connect/suggest', B(async (c, b) => { const d = await c.cuerpo(); return conexion.sugerir(c.env, c.db, b, { limite: Number(d.limite) || 3, desde: Number(d.desde) || 0, fetchFn: c.fetchFn }); }));
r('POST', '/api/b/:slug/connect/apply', B(async (c, b) => conexion.aplicar(c.db, b, await c.cuerpo())));
r('GET', '/api/b/:slug/learned', B(async (c, b) => canciones.aprendido(c.db, b.id)));
r('POST', '/api/b/:slug/learned/reset', B(async (c, b) => canciones.olvidar(c.db, b)));

/* ---- traslado ---- */
r('GET', '/api/b/:slug/export', B(async (c, b) => { const x = await traslado.exportar(c.db, b); return json(x, 200, { 'content-disposition': `attachment; filename="${b.slug}.vault.json"` }); }));
r('POST', '/api/b/:slug/import/notas', B(async (c, b) => { const d = await c.cuerpo(); return notas.importarLote(c.db, b, d.notas, { sobrescribir: d.sobrescribir !== false }); }), { max: 600_000 });
r('POST', '/api/b/:slug/import/fin', B(async (c, b) => traslado.terminar(c.db, b, await c.cuerpo())));

/* ---- canciones ---- */
r('GET', '/api/b/:slug/songs', B(async (c, b) => ({ canciones: await canciones.listar(c.db, b.id) })));
r('POST', '/api/b/:slug/songs', B(async (c, b) => ({ cancion: await canciones.crear(c.db, b, await c.cuerpo()) })));
r('GET', '/api/b/:slug/songs/:id', B(async (c, b) => ({ cancion: await canciones.leer(c.db, b, c.p.id) })));
r('PATCH', '/api/b/:slug/songs/:id', B(async (c, b) => ({ cancion: await canciones.cambiar(c.db, b, c.p.id, await c.cuerpo()) })));
r('DELETE', '/api/b/:slug/songs/:id', B(async (c, b) => canciones.borrar(c.db, b, c.p.id)));
r('POST', '/api/b/:slug/songs/:id/verdict', B(async (c, b) => canciones.veredicto(c.env, c.db, b, c.p.id, await c.cuerpo(), { fetchFn: c.fetchFn })));
r('POST', '/api/b/:slug/rules', B(async (c, b) => canciones.aceptarRegla(c.db, b, await c.cuerpo())));

/* ---- conversaciones (y el constructor de canciones, que es un mensaje con encargo) ---- */
r('GET', '/api/b/:slug/chats', B(async (c, b) => ({ conversaciones: await chat.listar(c.db, b.id) })));
r('POST', '/api/b/:slug/chats', B(async (c, b) => ({ conversacion: await chat.crear(c.db, b, await c.cuerpo()) })));
r('GET', '/api/b/:slug/chats/:id', B(async (c, b) => chat.leer(c.db, b, c.p.id)));
r('PATCH', '/api/b/:slug/chats/:id', B(async (c, b) => chat.renombrar(c.db, b, c.p.id, (await c.cuerpo()).title)));
r('DELETE', '/api/b/:slug/chats/:id', B(async (c, b) => chat.borrar(c.db, b, c.p.id)));
r('POST', '/api/b/:slug/chats/:id/message', B(async (c, b) => chat.mensaje(c.env, c.ec, c.db, b, c.p.id, await c.cuerpo(), { fetchFn: c.fetchFn })));

/** Atiende una petición. `opciones.fetchFn` permite probar sin red; `ec` es el contexto de ejecución (waitUntil). */
export async function handle(request, env, ec, { fetchFn } = {}) {
  const url = new URL(request.url);
  try {
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'No existe.' }, 404);
    exigirOrigen(request);
    const db = env.DB;
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, nombre: 'Abrinay Mind', version: VERSION, acceso: configurado(env), db: !!db, significado: significado.disponible(env), sesion: await sesionValida(request, env) });
    if (url.pathname === '/api/login' && request.method === 'POST') return await entrar(request, env, db, await cuerpo(request, 2000));
    if (url.pathname === '/api/logout' && request.method === 'POST') return salir(request);
    if (!(await sesionValida(request, env))) throw new HttpError(401, 'Entra con tu contraseña.');
    for (const ruta of RUTAS) {
      if (ruta.metodo !== request.method) continue;
      const m = ruta.re.exec(url.pathname); if (!m) continue;
      const c = { request, env, ec: ec ?? { waitUntil: () => {} }, db, url, p: Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])), cuerpo: () => cuerpo(request, ruta.max), fetchFn: fetchFn ?? fetch };
      const out = await ruta.fn(c);
      return out instanceof Response ? out : json(out ?? { ok: true });
    }
    throw new HttpError(404, 'Esa ruta no existe.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('[abrinay-mind]', e?.stack || e);
    return json({ error: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500);
  }
}
