// Abrinay Mind — qué lee el cerebro antes de escribir. Puro: recibe las notas, el grafo y lo que la búsqueda encontró,
// y decide qué entra, con qué detalle y en qué orden, sin pasarse del presupuesto.
//
//   1 · siempre ... notas con `siempre: true` (reglas de oro, firma, bitácora). Van enteras, en la parte fija del prompt.
//   2 · modo ...... la nota del modo elegido (o las de varios, si se mezclan).
//   3 · ancladas .. las que el artista fijó a mano.
//   4 · búsqueda .. lo que las palabras (BM25) y el significado (vectores) encontraron para este encargo.
//   5 · vecinas ... lo que despiertan las anteriores a través de las sinapsis (activación en 2 saltos).
//
// Las canciones con `origen: generada` (las que escribió un sistema, no el artista) NO son evidencia de su estilo: no se leen como ejemplo
// (salvo que el artista las ancle a mano). Siguen en el cerebro y se pueden consultar por nombre.
import { activar, adyacencia } from './graph.js';
import { resumen, leerCabecera } from './text.js';
import { multiplicador } from './hebb.js';

/** ¿Es una canción generada por un sistema (no escrita por el artista)? Marca `origen: generada` en su cabecera. */
export const esGenerada = (texto) => leerCabecera(texto).fm.origen === 'generada';

export const PROFUNDIDAD = { ligera: 14_000, normal: 30_000, profunda: 60_000 };
const MAX_FIJA = 8_000, MAX_COMPLETA = 3_200, MAX_RESUMEN = 360;
const ORDEN_MOTIVO = { modo: 0, ejemplo: 0.5, anclada: 1, busqueda: 2, vecina: 3 };
export const MAX_EJEMPLO = 7_000;   // letras de ejemplo: completas (con tope), fuera del presupuesto de lo recuperado

/**
 * notas: Map nombre → { nombre, carpeta, texto, siempre, privado }
 * semillas: Map nombre → energía 0–1 (lo que encontró la búsqueda)
 * pasajes: Map nombre → [texto de los pasajes que casaron] (para citar solo lo que importa de una nota larga)
 * pesos: Map nombre → peso aprendido (−0.2…+0.2)
 * → { fijas:[bloque], recuperadas:[bloque], omitidas:{ privadas, sinSitio }, chars }
 */
export function planear({ notas, grafo, semillas = new Map(), anclas = [], modo = null, ejemplos = [], pasajes = new Map(), pesos = new Map(), presupuesto = PROFUNDIDAD.normal, entrena = false, adj = null }) {
  const permitido = (n) => !(entrena && n.privado);
  const omitidas = { privadas: [], sinSitio: [], recortadas: [] };
  const bloque = (n, motivo, texto, energia = 0) => ({ nombre: n.nombre, carpeta: n.carpeta, motivo, texto, energia: +energia.toFixed(3) });

  const modosSel = Array.isArray(modo) ? modo : modo ? [modo] : [];
  // 1 · fijas
  const fijas = [];
  for (const n of notas.values()) {
    if (!n.siempre) continue;
    if (!permitido(n)) { omitidas.privadas.push(n.nombre); continue; }
    const cuerpo = leerCabecera(n.texto).cuerpo.trim();
    if (cuerpo.length > MAX_FIJA) omitidas.recortadas.push({ nombre: n.nombre, caracteres: cuerpo.length, max: MAX_FIJA });
    fijas.push(bloque(n, 'siempre', recortarFija(cuerpo, MAX_FIJA)));
  }
  fijas.sort((a, b) => a.nombre.localeCompare(b.nombre));

  // 2-5 · recuperadas
  const yaEstan = new Set(fijas.map((b) => b.nombre));
  // ejemplos de su voz: canciones suyas COMPLETAS asociadas al modo elegido (las elige quien arma el contexto)
  const bloquesEjemplo = [];
  for (const nombre of ejemplos) {
    const n = notas.get(nombre); if (!n || yaEstan.has(nombre) || !permitido(n)) continue;
    bloquesEjemplo.push(bloque(n, 'ejemplo', recortar(leerCabecera(n.texto).cuerpo.trim(), MAX_EJEMPLO), 1)); yaEstan.add(nombre);
  }
  const energia = new Map();
  const sumar = (nombre, e) => { if (notas.has(nombre)) energia.set(nombre, Math.max(energia.get(nombre) || 0, e)); };
  for (const m of modosSel) sumar(m, 1);
  for (const a of anclas) sumar(a, 1);
  for (const [nombre, e] of semillas) sumar(nombre, Math.min(1, e));
  const despertadas = activar(grafo, energia, { adj: adj || adyacencia(grafo) });
  const motivos = new Map();
  for (const m of modosSel) motivos.set(m, 'modo');
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
    if (esGenerada(n.texto) && c.motivo !== 'anclada') continue;   // no es su voz: no entra como ejemplo
    if (n.tipo === 'modo' && modosSel.length && !modosSel.includes(c.nombre) && c.motivo !== 'anclada') continue;   // los otros modos no se leen: mezclan estilos
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
  recuperadas.push(...bloquesEjemplo);
  recuperadas.sort((a, b) => ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] || b.energia - a.energia);
  return { fijas, recuperadas, omitidas, chars: usado, charsFijas: fijas.reduce((s, b) => s + b.texto.length, 0) };
}

/**
 * Una nota «siempre» demasiado larga se recorta por el MEDIO: se conserva el principio (lo más importante: título, reglas de oro) y el final
 * (lo más nuevo: una nota como «Reglas aprendidas» crece añadiendo líneas al final, y recortar por el final ignoraba justo lo último que se enseñó).
 */
export function recortarFija(t, n) {
  if (t.length <= n) return t;
  const marca = '\n[…recortado en el medio: se conservan el principio y lo más reciente…]\n';
  const cabeza = Math.floor((n - marca.length) * 0.5), cola = n - marca.length - cabeza;
  const a = t.slice(0, cabeza).replace(/[ \t]+\S*$/, '').replace(/\n[^\n]*$/, (m) => (m.length < 300 ? '' : m));
  let b = t.slice(t.length - cola); const nl = b.indexOf('\n'); if (nl >= 0 && nl < 400) b = b.slice(nl + 1);
  return a.trimEnd() + marca + b.trimStart();
}

function recortar(t, n) { return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '\n[…recortado]' : t; }

/** Un bloque en la forma en que lo ve el modelo: etiqueta con nombre y carpeta, el texto como DATOS. */
export const bloqueXml = (b) => `<nota nombre="${escapar(b.nombre)}" carpeta="${escapar(b.carpeta || '')}">\n${b.texto.replace(/<\/nota>/gi, '<\\/nota>')}\n</nota>`;
const escapar = (s) => String(s).replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
