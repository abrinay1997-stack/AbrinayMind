// Abrinay Mind — cuánto cuesta escribir: cada llamada a un modelo queda anotada, y el artista puede poner un tope mensual.
import { HttpError, ahora } from './http.js';
import { una, todas, correr } from './db.js';
import { costo } from './models.js';

const inicioDeMes = (t = ahora()) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

export async function anotar(db, { brainId = null, fn, modelo, uso = {}, ms = 0 }) {
  const usd = costo(modelo, uso);
  try { await correr(db, 'insert into usage (at, brain_id, fn, model, provider, tin, tout, usd, ms) values (?,?,?,?,?,?,?,?,?)', ahora(), brainId, fn, modelo.id, modelo.proveedor, (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0), uso.output_tokens || 0, usd, ms); } catch { /* el libro nunca tumba una respuesta */ }
  return usd;
}

export async function gastoDelMes(db) {
  const r = await una(db, 'select coalesce(sum(usd), 0) usd, count(*) llamadas from usage where at >= ?', inicioDeMes());
  return { usd: +(r?.usd ?? 0).toFixed(4), llamadas: r?.llamadas ?? 0 };
}

export async function porModelo(db) {
  return todas(db, 'select model, provider, count(*) llamadas, coalesce(sum(usd),0) usd, coalesce(sum(tin),0) tin, coalesce(sum(tout),0) tout from usage where at >= ? group by model order by usd desc', inicioDeMes());
}

/** Antes de cada llamada: si el artista puso un tope y ya se pasó, no se gasta más. */
export async function vigilarTope(db, ajustes) {
  if (ajustes.tope_mensual_usd == null) return;
  const { usd } = await gastoDelMes(db);
  if (usd >= ajustes.tope_mensual_usd) throw new HttpError(402, `Llegaste al tope del mes (US$${ajustes.tope_mensual_usd}). Súbelo en Ajustes para seguir escribiendo.`, { codigo: 'tope' });
}
