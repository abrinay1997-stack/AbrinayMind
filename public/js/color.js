// Abrinay Mind — color: deriva, a partir del acento de un cerebro (cualquier #rrggbb), los colores que sí se leen sobre el fondo oscuro.
// Lógica pura, sin DOM: la usan la interfaz y las pruebas.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const ACENTO_POR_DEFECTO = '#94a3b8';
// Superficies sobre las que se pinta texto de acento (las más claras de app.css: tags, chips, tarjetas).
const SOBRE = '#22262c';
const NEGRO_TEXTO = '#0b0c0f';

export function normalizar(hex) {
  const t = String(hex || '').trim();
  if (!HEX.test(t)) return null;
  return t.length === 4 ? '#' + [...t.slice(1)].map((c) => c + c).join('').toLowerCase() : t.toLowerCase();
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const aHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Mezcla `a` hacia `b` (t de 0 a 1). */
export function mezclar(a, b, t) { const A = rgb(a), B = rgb(b); return aHex(A.map((v, i) => v + (B[i] - v) * t)); }

/** Aclara el color hacia el blanco hasta que se lea con `min` de contraste sobre `fondo`. */
function aclararHasta(hex, fondo, min) {
  let c = hex;
  for (let t = 0; t <= 1.0001 && contraste(c, fondo) < min; t += 0.04) c = mezclar(hex, '#ffffff', t);
  return c;
}

/**
 * → { acento, sobre, texto, ui }
 *  acento: el color tal cual (relleno de botones, anillos decorativos).
 *  sobre:  color del texto/iconos encima del relleno de acento (blanco o casi negro, el que más contraste dé; ≥ 4.5:1).
 *  texto:  el acento aclarado si hace falta para leerse como texto sobre las superficies oscuras (≥ 4.5:1).
 *  ui:     el acento para bordes, foco y trazos (≥ 3:1 sobre el fondo; ≥ 4.5:1 con `texto`, que es lo que usamos).
 */
export function derivarAcento(entrada) {
  const acento = normalizar(entrada) || ACENTO_POR_DEFECTO;
  const sobre = contraste('#ffffff', acento) >= contraste(NEGRO_TEXTO, acento) ? '#ffffff' : NEGRO_TEXTO;
  const texto = aclararHasta(acento, SOBRE, 4.5);
  return { acento, sobre, texto, ui: texto };
}

export const MUESTRAS = ['#94a3b8', '#a78bfa', '#f472b6', '#22d3ee', '#fbbf24', '#34d399', '#fb7185', '#60a5fa'];
