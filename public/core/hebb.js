// Abrinay Mind — lo que el cerebro aprende de tus veredictos (regla de Hebb: lo que se usa junto y sale bien, se une).
// Puro. El Worker lo aplica a las tablas `synapses` y `note_weight`; los tests lo prueban sin base de datos.
import { desvanecido } from './graph.js';

export const TOPE_NOTA = 0.2;       // el peso de una nota va de −0.2 a +0.2 (multiplica su rango en la búsqueda × 0.8 … 1.2)
export const MAX_PAREJAS = 8;       // de las notas leídas, solo las N de más energía se emparejan (28 parejas como mucho)

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Qué tan bueno fue el resultado: −1 (rechazada sin matices) … +1 (10/10). Sin nota: aprobada +0.4, rechazada −0.6. */
export function brillo({ resultado, puntuacion }) {
  if (Number.isFinite(puntuacion)) return clamp((puntuacion - 5) / 5, -1, 1);
  return resultado === 'aprobada' ? 0.4 : -0.6;
}

/**
 * Cambios que deja un veredicto.
 * usadas: [{ nombre, energia }] — las notas que se leyeron para escribir esa letra.
 * pesos: Map nombre → { peso, actualizado } · sinapsis: Map "a|b" → { peso, usos, actualizado }
 * → { pesos: [{ nombre, peso }], sinapsis: [{ a, b, peso, usos }] }
 */
export function aprender({ usadas, pesos = new Map(), sinapsis = new Map(), resultado, puntuacion, ahora = Date.now() }) {
  const g = brillo({ resultado, puntuacion });
  const top = [...usadas].sort((x, y) => y.energia - x.energia).slice(0, MAX_PAREJAS);
  const salidaPesos = [], salidaSinapsis = [];
  for (const u of usadas) {
    const previo = pesos.get(u.nombre);
    const actual = previo ? desvanecido(previo.peso, previo.actualizado, ahora) : 0;
    salidaPesos.push({ nombre: u.nombre, peso: +clamp(actual + 0.04 * g * Math.min(1, u.energia + 0.2), -TOPE_NOTA, TOPE_NOTA).toFixed(4) });
  }
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const [a, b] = top[i].nombre < top[j].nombre ? [top[i].nombre, top[j].nombre] : [top[j].nombre, top[i].nombre];
    const previo = sinapsis.get(`${a}|${b}`);
    const actual = previo ? desvanecido(previo.peso, previo.actualizado, ahora) : 0;
    const fuerza = Math.min(top[i].energia, top[j].energia);
    // aprobada: se refuerza; rechazada: se debilita un poco (nunca por debajo de 0)
    const delta = g >= 0 ? 0.1 * Math.max(g, 0.2) * (0.5 + fuerza) : 0.05 * g * (0.5 + fuerza);
    salidaSinapsis.push({ a, b, peso: +clamp(actual + delta, 0, 1).toFixed(4), usos: (previo?.usos || 0) + 1 });
  }
  return { pesos: salidaPesos, sinapsis: salidaSinapsis.filter((s) => s.peso > 0 || s.usos > 1) };
}

/** El multiplicador de búsqueda de una nota: 0.8 … 1.2. */
export const multiplicador = (peso) => 1 + clamp(peso || 0, -TOPE_NOTA, TOPE_NOTA);
