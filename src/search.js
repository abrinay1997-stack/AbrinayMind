// Abrinay Mind — buscar en el cerebro: palabras (BM25 de FTS5) y, cuando está activo, significado (vectores). Se mezclan 50/50.
import { ftsQuery, tokens, fold } from '../public/core/text.js';
import { todas, notasPorNombre } from './db.js';
import * as significado from './meaning.js';

/** Pasajes que casan con la consulta por palabras, mejor primero: [{ nota, idx, titulo, texto, s }] (s > 0). */
export async function porPalabras(db, brainId, consulta, { limite = 40 } = {}) {
  const q = ftsQuery(consulta); if (!q) return [];
  try {
    const filas = await todas(db, 'select p.note, p.idx, p.head, p.text, bm25(passages_fts) as s from passages_fts join passages p on p.id = passages_fts.rowid where passages_fts match ? and p.brain_id = ? order by s limit ?', q, brainId, limite);
    return filas.map((f) => ({ nota: f.note, idx: f.idx, titulo: f.head, texto: f.text, s: -f.s }));
  } catch {
    // sin FTS5 (o consulta rara): LIKE por la primera raíz, sin ranking fino
    const ws = [...new Set(tokens(consulta))].slice(0, 3); if (!ws.length) return [];
    const filas = await todas(db, `select note, idx, head, text from passages where brain_id = ? and (${ws.map(() => 'stem like ?').join(' or ')}) limit ?`, brainId, ...ws.map((w) => `%${w}%`), limite);
    return filas.map((f) => ({ nota: f.note, idx: f.idx, titulo: f.head, texto: f.text, s: 1 }));
  }
}

/**
 * Notas que responden a una consulta. → [{ nombre, carpeta, score, pasajes:[texto], via:'palabras'|'significado'|'ambos' }]
 * `energia` es lo que usa el contexto: el score normalizado a 0–1.
 */
export async function buscar(env, db, brain, consulta, { n = 12, pesos = new Map() } = {}) {
  const pal = await porPalabras(db, brain.id, consulta, { limite: 60 });
  const sims = await significado.buscarSimilares(env, db, brain, consulta);
  const lex = new Map(), pasajes = new Map();
  const mejor = pal.length ? pal[0].s : 1;
  for (const p of pal) {
    const v = p.s / mejor;
    if (!pasajes.has(p.nota)) pasajes.set(p.nota, []);
    if (pasajes.get(p.nota).length < 2) pasajes.get(p.nota).push((p.titulo ? `## ${p.titulo}\n` : '') + p.texto);
    lex.set(p.nota, Math.max(lex.get(p.nota) || 0, v) + (lex.has(p.nota) ? 0.15 * v : 0));
  }
  const nombres = new Set([...lex.keys(), ...(sims ? sims.keys() : [])]);
  const q = new Set(tokens(consulta));
  const filas = await notasPorNombre(db, brain.id, nombres, 'name, folder');
  const carpeta = new Map(filas.map((f) => [f.name, f.folder]));
  const medioSim = sims && sims.size ? [...sims.values()].reduce((a, b) => a + b, 0) / sims.size : 0;
  const out = [];
  for (const nombre of nombres) {
    if (!carpeta.has(nombre)) continue;
    const l = Math.min(1, lex.get(nombre) || 0);
    const pista = tokens(nombre.replace(/[-_—]/g, ' ')).some((w) => q.has(w)) ? 0.12 : 0;
    const s = sims ? sims.get(nombre) ?? medioSim * 0.6 : 0;
    const score = (sims ? 0.5 * l + 0.5 * Math.min(1, s / 0.75) : l) + pista;
    const peso = pesos.get(nombre) || 0;
    if (score < 0.12) continue;
    out.push({ nombre, carpeta: carpeta.get(nombre), score: +(score * (1 + Math.max(-0.2, Math.min(0.2, peso)))).toFixed(3), pasajes: pasajes.get(nombre) || [], via: l && s ? 'ambos' : sims && sims.has(nombre) && !l ? 'significado' : 'palabras' });
  }
  out.sort((a, b) => b.score - a.score);
  return { resultados: out.slice(0, n), significado: !!sims };
}

export { fold };
