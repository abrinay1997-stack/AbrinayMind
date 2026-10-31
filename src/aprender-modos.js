// Abrinay Mind — que los modos aprendan de las elecciones del artista. Cuando el cerebro dudaba del modo y el artista tocó uno,
// las palabras DISTINTIVAS de ese encargo pasan a las `palabras:` de ese modo (cabecera de su nota): la próxima vez se detecta solo.
import { fold, leerCabecera, ponerCabecera } from '../public/core/text.js';
import * as notas from './notes.js';
import { una } from './db.js';

const MAX_NUEVAS = 3, MAX_PALABRAS = 40;
// palabras demasiado comunes o de «petición» (no dicen nada del modo)
const COMUNES = new Set(`algo ahora aquel aquella aquello aunque cada como cuando cuanto desde donde entre esta estas este estos hacer hacia hasta letra letras cancion canciones quiero quisiera necesito escribe escribeme escribir componer compon sobre tema temas tengo tiene tienen toda todo todos todas unos unas puedes puede quieres haz hazme dame para pero porque otra otro otros ideas idea musica mucho mucha muchos muchas mismo misma poco poca bien mejor muy tambien tanto cosas cosa quien cual cuales dentro fuera siempre nunca estilo modo version versiones nueva nuevo`.split(/\s+/));

/** Las palabras de un texto que valen para reconocer un modo: ≥5 letras, no comunes, que ningún modo tenga ya. → hasta 3, las más largas primero. */
export function palabrasDistintivas(texto, modos) {
  const ya = new Set(modos.flatMap((m) => m.palabras));
  const vistas = new Map();
  for (const p of fold(texto).split(/[^a-z0-9]+/)) if (p.length >= 5 && !COMUNES.has(p) && !/^\d+$/.test(p)) vistas.set(p, (vistas.get(p) || 0) + 1);
  return [...vistas].filter(([p]) => !ya.has(p) && !ya.has(p.replace(/(es|s)$/, ''))).sort((a, b) => b[0].length - a[0].length).slice(0, MAX_NUEVAS).map(([p]) => p);
}

/** Añade esas palabras a la cabecera del modo. → las palabras aprendidas ([] si no había nada que aprender). */
export async function aprenderPalabras(db, brain, modo, texto, modos) {
  const nuevas = palabrasDistintivas(texto, modos);
  if (!nuevas.length) return [];
  const fila = await una(db, 'select text from notes where brain_id = ? and name = ?', brain.id, modo.nota);
  if (!fila) return [];
  const actuales = typeof leerCabecera(fila.text).fm.palabras === 'string' ? leerCabecera(fila.text).fm.palabras.split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (actuales.length >= MAX_PALABRAS) return [];
  await notas.guardar(db, brain, { nombre: modo.nota, texto: ponerCabecera(fila.text, { palabras: [...actuales, ...nuevas].join(', ') }), por: 'aprender-modo' });
  return nuevas;
}
