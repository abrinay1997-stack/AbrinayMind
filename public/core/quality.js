// Abrinay Mind — la salud del cerebro: qué enlaces están rotos, qué neuronas quedaron solas, qué hay que revisar, qué se repite.
// Puro: recibe notas y enlaces, devuelve avisos. No escribe nada (arreglar es decisión del artista).
import { fold, enlaces as enlacesDe, hechosDe, leerCabecera, tokens, hash } from './text.js';

/** notas: [{ nombre, carpeta, texto, actualizado }] → { rotos, huerfanas, porRevisar, sinTipo, duplicadas, resumen } */
export function revisar(notas, { hoy = new Date().toISOString().slice(0, 10) } = {}) {
  const existe = new Map(notas.map((n) => [fold(n.nombre), n.nombre]));
  const salientes = new Map(notas.map((n) => [n.nombre, new Set()]));
  const entrantes = new Map(notas.map((n) => [n.nombre, new Set()]));
  const rotos = [];
  for (const n of notas) {
    for (const destino of enlacesDe(n.texto)) {
      const real = existe.get(fold(destino));
      if (!real) { rotos.push({ desde: n.nombre, hacia: destino }); continue; }
      if (real !== n.nombre) { salientes.get(n.nombre).add(real); entrantes.get(real).add(n.nombre); }
    }
  }
  const huerfanas = notas.filter((n) => !salientes.get(n.nombre).size && !entrantes.get(n.nombre).size).map((n) => n.nombre);
  const porRevisar = notas.map((n) => ({ nombre: n.nombre, fecha: hechosDe(n.texto).revisar })).filter((x) => x.fecha && x.fecha <= hoy);
  const sinTipo = notas.filter((n) => !hechosDe(n.texto).tipo).map((n) => n.nombre);
  const duplicadas = repetidas(notas);
  return {
    rotos, huerfanas, porRevisar, sinTipo, duplicadas,
    resumen: { notas: notas.length, rotos: rotos.length, huerfanas: huerfanas.length, porRevisar: porRevisar.length, sinTipo: sinTipo.length, duplicadas: duplicadas.length },
  };
}

/** Pares de notas que comparten casi todas sus secuencias de 4 palabras (≥ 70 %). Solo notas con algo de cuerpo. */
export function repetidas(notas, { umbral = 0.7, minimo = 40 } = {}) {
  const huellas = new Map();
  for (const n of notas) {
    const ws = tokens(leerCabecera(n.texto).cuerpo);
    if (ws.length < minimo) continue;
    const set = new Set();
    for (let i = 0; i + 4 <= ws.length; i++) set.add(hash(ws.slice(i, i + 4).join(' ')));
    huellas.set(n.nombre, set);
  }
  const indice = new Map();
  for (const [nombre, set] of huellas) for (const h of set) { if (!indice.has(h)) indice.set(h, []); indice.get(h).push(nombre); }
  const comunes = new Map();
  for (const lista of indice.values()) {
    if (lista.length < 2 || lista.length > 6) continue;
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) { const k = lista[i] < lista[j] ? `${lista[i]}\u0000${lista[j]}` : `${lista[j]}\u0000${lista[i]}`; comunes.set(k, (comunes.get(k) || 0) + 1); }
  }
  const out = [];
  for (const [k, c] of comunes) {
    const [a, b] = k.split('\u0000');
    const parecido = c / Math.min(huellas.get(a).size, huellas.get(b).size);
    if (parecido >= umbral) out.push({ a, b, parecido: +parecido.toFixed(2) });
  }
  return out.sort((x, y) => y.parecido - x.parecido);
}
