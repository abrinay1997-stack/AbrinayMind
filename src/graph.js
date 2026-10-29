// Abrinay Mind — el grafo que ve la interfaz: neuronas (notas) y sinapsis (enlaces, menciones, significado, aprendidas).
import { armarGrafo } from '../public/core/graph.js';
import { todas } from './db.js';

export async function grafoDe(db, brainId) {
  const notas = await todas(db, 'select name, folder, bytes, updated, always, private from notes where brain_id = ?', brainId);
  const enlaces = await todas(db, "select src, dst from links where brain_id = ? and kind = 'link' and dst is not null", brainId);
  const menciones = await todas(db, "select src, dst from links where brain_id = ? and kind = 'mention' and dst is not null", brainId);
  const significado = await todas(db, "select src, dst, weight from links where brain_id = ? and kind = 'meaning' and dst is not null", brainId);
  const sinapsis = await todas(db, 'select a, b, weight, updated from synapses where brain_id = ?', brainId);
  const pesos = await todas(db, 'select name, weight, updated from note_weights where brain_id = ?', brainId);
  return armarGrafo({
    notas: notas.map((n) => ({ nombre: n.name, carpeta: n.folder, actualizado: n.updated, siempre: n.always, privado: n.private, bytes: n.bytes })),
    enlaces: enlaces.map((l) => [l.src, l.dst]), menciones: menciones.map((l) => [l.src, l.dst]), significado: significado.map((l) => [l.src, l.dst, l.weight]),
    sinapsis: sinapsis.map((s) => ({ a: s.a, b: s.b, peso: s.weight, actualizado: s.updated })), pesos: pesos.map((p) => ({ nombre: p.name, peso: p.weight, actualizado: p.updated })),
  });
}
