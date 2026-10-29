// Abrinay Mind — qué lee el cerebro antes de escribir. Puro: recibe las notas, el grafo y lo que la búsqueda encontró,
// y decide qué entra, con qué detalle y en qué orden, sin pasarse del presupuesto.
//
//   1 · siempre ... notas con `siempre: true` (reglas de oro, firma, bitácora). Van enteras, en la parte fija del prompt.
//   2 · modo ...... la nota del modo elegido.
//   3 · ancladas .. las que el artista fijó a mano.
//   4 · búsqueda .. lo que las palabras (BM25) y el significado (vectores) encontraron para este encargo.
//   5 · vecinas ... lo que despiertan las anteriores a través de las sinapsis (activación en 2 saltos).
import { activar, adyacencia } from './graph.js';
import { resumen, leerCabecera } from './text.js';
import { multiplicador } from './hebb.js';

export const PROFUNDIDAD = { ligera: 14_000, normal: 30_000, profunda: 60_000 };
const MAX_FIJA = 6_000, MAX_COMPLETA = 3_200, MAX_RESUMEN = 360;
const ORDEN_MOTIVO = { modo: 0, anclada: 1, busqueda: 2, vecina: 3 };

/**
 * notas: Map nombre → { nombre, carpeta, texto, siempre, privado }
 * semillas: Map nombre → energía 0–1 (lo que encontró la búsqueda)
 * pasajes: Map nombre → [texto de los pasajes que casaron] (para citar solo lo que importa de una nota larga)
 * pesos: Map nombre → peso aprendido (−0.2…+0.2)
 * → { fijas:[bloque], recuperadas:[bloque], omitidas:{ privadas, sinSitio }, chars }
 */
export function planear({ notas, grafo, semillas = new Map(), anclas = [], modo = null, pasajes = new Map(), pesos = new Map(), presupuesto = PROFUNDIDAD.normal, entrena = false, adj = null }) {
  const permitido = (n) => !(entrena && n.privado);
  const omitidas = { privadas: [], sinSitio: [] };
  const bloque = (n, motivo, texto, energia = 0) => ({ nombre: n.nombre, carpeta: n.carpeta, motivo, texto, energia: +energia.toFixed(3) });

  // 1 · fijas
  const fijas = [];
  for (const n of notas.values()) {
    if (!n.siempre) continue;
    if (!permitido(n)) { omitidas.privadas.push(n.nombre); continue; }
    fijas.push(bloque(n, 'siempre', recortar(leerCabecera(n.texto).cuerpo.trim(), MAX_FIJA)));
  }
  fijas.sort((a, b) => a.nombre.localeCompare(b.nombre));

  // 2-5 · recuperadas
  const yaEstan = new Set(fijas.map((b) => b.nombre));
  const energia = new Map();
  const sumar = (nombre, e) => { if (notas.has(nombre)) energia.set(nombre, Math.max(energia.get(nombre) || 0, e)); };
  if (modo) sumar(modo, 1);
  for (const a of anclas) sumar(a, 1);
  for (const [nombre, e] of semillas) sumar(nombre, Math.min(1, e));
  const despertadas = activar(grafo, energia, { adj: adj || adyacencia(grafo) });
  const motivos = new Map();
  if (modo) motivos.set(modo, 'modo');
  for (const a of anclas) if (!motivos.has(a)) motivos.set(a, 'anclada');
  for (const nombre of semillas.keys()) if (!motivos.has(nombre)) motivos.set(nombre, 'busqueda');

  const candidatas = [...despertadas]
    .filter(([nombre]) => notas.has(nombre) && !yaEstan.has(nombre))
    .map(([nombre, e]) => ({ nombre, e: e * multiplicador(pesos.get(nombre)), motivo: motivos.get(nombre) || 'vecina' }))
    .sort((a, b) => ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] || b.e - a.e);

  let usado = 0; // el presupuesto es solo para lo recuperado: lo «siempre» va aparte (y con caché)
  const recuperadas = [];
  for (const c of candidatas) {
    const n = notas.get(c.nombre);
    if (n.tipo === 'moc' && c.motivo !== 'anclada') continue; // un índice es un mapa, no contenido
    if (!permitido(n)) { omitidas.privadas.push(n.nombre); continue; }
    const cuerpo = leerCabecera(n.texto).cuerpo.trim();
    const fuerte = c.motivo === 'modo' || c.motivo === 'anclada' || c.e >= 0.5;
    let texto;
    if (fuerte) texto = recortar(cuerpo, c.motivo === 'modo' ? MAX_FIJA : MAX_COMPLETA);
    else if (pasajes.get(c.nombre)?.length) texto = recortar(pasajes.get(c.nombre).join('\n…\n'), MAX_COMPLETA);
    else texto = resumen(n.texto, MAX_RESUMEN);
    const costo = texto.length + n.nombre.length + 40;
    if (usado + costo > presupuesto) { omitidas.sinSitio.push(n.nombre); if (omitidas.sinSitio.length > 40) break; continue; }
    usado += costo;
    recuperadas.push(bloque(n, c.motivo, texto, c.e));
  }
  recuperadas.sort((a, b) => ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] || b.energia - a.energia);
  return { fijas, recuperadas, omitidas, chars: usado, charsFijas: fijas.reduce((s, b) => s + b.texto.length, 0) };
}

function recortar(t, n) { return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '\n[…recortado]' : t; }

/** Un bloque en la forma en que lo ve el modelo: etiqueta con nombre y carpeta, el texto como DATOS. */
export const bloqueXml = (b) => `<nota nombre="${escapar(b.nombre)}" carpeta="${escapar(b.carpeta || '')}">\n${b.texto.replace(/<\/nota>/gi, '<\\/nota>')}\n</nota>`;
const escapar = (s) => String(s).replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
