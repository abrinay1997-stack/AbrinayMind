// Abrinay Mind — los modos de escritura de un artista.
// Un modo es una nota del cerebro con `tipo: modo` y, en su cabecera, `palabras:` (lo que el artista dice cuando lo quiere).
// Abrinay tiene cuatro registros distintos y la regla de oro es PREGUNTAR el modo antes de escribir si no se sabe
// (una letra técnicamente perfecta puede ser emocionalmente equivocada para esa canción). Aquí vive esa decisión.
import { fold, hechosDe, leerCabecera } from './text.js';

/** Los modos de un cerebro, leídos de sus notas: [{ id, nombre, nota, palabras:[...], resumen }]. */
export function modosDe(notas) {
  return notas
    .filter((n) => hechosDe(n.texto).tipo === 'modo')
    .map((n) => {
      const { fm } = leerCabecera(n.texto);
      const palabras = typeof fm.palabras === 'string' ? fm.palabras.split(',').map((x) => fold(x).trim()).filter(Boolean) : [];
      return { id: String(fm.modo_id || fold(n.nombre).replace(/[^a-z0-9]+/g, '-')), nombre: String(fm.modo_nombre || n.nombre), nota: n.nombre, palabras, orden: Number(fm.orden) || 99 };
    })
    .sort((a, b) => a.orden - b.orden);
}

/** ¿Está la palabra (o frase) entera en el texto? «rap» no debe despertar con «trampa»; sí admite plural simple («calle» → «calles»). */
function esta(f, p) {
  const q = p.replace(/[^a-z0-9ñ]+/g, ' ').trim();
  return !!q && (f.includes(` ${q} `) || f.includes(` ${q}s `) || f.includes(` ${q}es `));
}

/**
 * Qué modo parece pedir un texto, por las palabras que cada modo declara.
 * → { modo, confianza (0–1), motivo } | { modo: null, confianza: 0, motivo } — con confianza baja el cerebro pregunta, no adivina.
 */
export function detectarModo(texto, modos) {
  const f = ` ${fold(texto).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  const puntos = modos.map((m) => {
    const aciertos = m.palabras.filter((p) => p && esta(f, p));
    return { m, n: aciertos.length, aciertos };
  }).sort((a, b) => b.n - a.n);
  const [primero, segundo] = puntos;
  if (!primero || !primero.n) return { modo: null, confianza: 0, motivo: 'Nada en el texto señala un modo.' };
  const confianza = +(primero.n / (primero.n + (segundo?.n || 0) + 1)).toFixed(2);
  return { modo: primero.m, confianza, motivo: `Palabras: ${primero.aciertos.slice(0, 4).join(', ')}` };
}

/** Todos los modos que el texto señala, del que más al que menos: [{ modo, n, aciertos }]. Sirve para mezclar cuando dos modos pesan parecido. */
export function modosSenalados(texto, modos) {
  const f = ` ${fold(texto).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  return modos.map((m) => { const aciertos = m.palabras.filter((p) => p && esta(f, p)); return { modo: m, n: aciertos.length, aciertos }; }).filter((x) => x.n).sort((a, b) => b.n - a.n);
}

/** ¿Hay que preguntar? Sí si no hay modo claro (menos de 0.5 de confianza) y el artista no lo eligió. */
export const hayQuePreguntar = (elegido, deteccion) => !elegido && !(deteccion?.modo && deteccion.confianza >= 0.5);
