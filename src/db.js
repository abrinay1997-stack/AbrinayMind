// Abrinay Mind — pequeños ayudantes de D1 y el registro de auditoría.
import { ahora, recortar } from './http.js';

export const todas = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results ?? [];
export const una = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).first()) ?? null;
export const correr = (db, sql, ...p) => db.prepare(sql).bind(...p).run();

/** Ejecuta sentencias ya preparadas en lotes (D1 las trata como una transacción por lote). */
export async function lotes(db, sentencias, tam = 80) {
  for (let i = 0; i < sentencias.length; i += tam) await db.batch(sentencias.slice(i, i + tam));
}

export const marcas = (n) => Array.from({ length: n }, () => '?').join(',');

/**
 * Filas de `notes` cuyo nombre está en `nombres`, pedidas por lotes: D1 admite como máximo 100 valores por consulta
 * (la base simulada de las pruebas también lo exige). `columnas` es una lista fija nuestra, nunca texto del usuario.
 */
export async function notasPorNombre(db, brainId, nombres, columnas, tam = 80) {
  const lista = [...new Set(nombres)], filas = [];
  for (let i = 0; i < lista.length; i += tam) {
    const trozo = lista.slice(i, i + tam);
    filas.push(...await todas(db, `select ${columnas} from notes where brain_id = ? and name in (${marcas(trozo.length)})`, brainId, ...trozo));
  }
  return filas;
}

export async function auditar(db, brainId, kind, who, detail) {
  try { await db.prepare('insert into audit (at, brain_id, kind, who, detail) values (?,?,?,?,?)').bind(ahora(), brainId ?? null, kind, who || 'artista', recortar(typeof detail === 'string' ? detail : JSON.stringify(detail), 600)).run(); } catch { /* el registro nunca tumba una acción */ }
}

export async function leerAjuste(db, clave, vacio = null) {
  const f = await una(db, 'select json from settings where key = ?', clave);
  if (!f) return vacio;
  try { return JSON.parse(f.json); } catch { return vacio; }
}
export const guardarAjuste = (db, clave, valor) => correr(db, 'insert into settings (key, json, updated) values (?,?,?) on conflict (key) do update set json = excluded.json, updated = excluded.updated', clave, JSON.stringify(valor), ahora());
