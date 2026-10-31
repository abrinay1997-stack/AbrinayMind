// Abrinay Mind — «importar solo lo que quieres»: lista las carpetas de una bóveda y la depura (quita carpetas enteras) ANTES de subirla.
// Puro y sin dependencias (se prueba en Node). Trabaja sobre el formato abrinay-mind/boveda@1 y nunca modifica el objeto que recibe.

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const primera = (carpeta) => String(carpeta ?? '').split('/').filter(Boolean)[0] || '';
export const RAIZ = '(sin carpeta)';

const cabecera = (texto) => { const m = /^---\n([\s\S]*?)\n---/.exec(String(texto ?? '').replace(/\r\n?/g, '\n')); return m ? m[1] : ''; };
const esSiempre = (texto) => /^\s*siempre\s*:\s*true\s*$/im.test(cabecera(texto));
const esModo = (texto) => /^\s*tipo\s*:\s*modo\s*$/im.test(cabecera(texto));

/**
 * Las carpetas de primer nivel (los «lóbulos») con cuántas notas tienen, tres nombres de ejemplo y cuántas son reglas fijas («siempre») o modos,
 * para que quien las quite sepa lo que se lleva. → [{ nombre, n, ejemplos, siempre, modos }] ordenadas por nombre.
 */
export function carpetasDe(notas) {
  const m = new Map();
  for (const n of notas || []) {
    const k = primera(n.carpeta) || RAIZ;
    if (!m.has(k)) m.set(k, { nombre: k, n: 0, ejemplos: [], siempre: 0, modos: 0 });
    const c = m.get(k); c.n++; if (c.ejemplos.length < 3) c.ejemplos.push(n.nombre);
    if (esSiempre(n.texto)) c.siempre++; if (esModo(n.texto)) c.modos++;
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

/** Las carpetas que, por su nombre, suelen ser canciones o letras de referentes: un atajo para «empezar de cero con las reglas». */
export const pareceCancionesOReferentes = (nombre) => /canci[oó]n|canciones|referent|letras?\b|cat[aá]logo/i.test(nombre);

/** [[Destino]], [[Destino|alias]], [[Destino#sección]], [[Destino^bloque|alias]] → el texto que se vería. */
const RE_ENLACE = /\[\[([^\]|#^\n]+)((?:[#^][^\]|\n]*)?)(?:\|([^\]\n]*))?\]\]/g;

/**
 * Quita las carpetas de `quitar` (nombres de primer nivel). Con `limpiarEnlaces`, un [[enlace]] a una nota quitada pasa a texto normal
 * (si no, quedaría roto). Las sinapsis y pesos aprendidos que tocan notas quitadas también se van.
 * → { datos, total, quedan, quitadas, enlaces }
 */
export function depurar(datos, { quitar = new Set(), limpiarEnlaces = true } = {}) {
  const fuera = quitar instanceof Set ? quitar : new Set(quitar);
  const notas = datos.notas || [];
  const quitadas = new Set(), quedan = [];
  for (const n of notas) (fuera.has(primera(n.carpeta) || RAIZ) ? quitadas.add(n.nombre) : quedan.push(n));
  const vivos = new Set(quedan.map((n) => n.nombre)), plegados = new Map([...quitadas].filter((x) => !vivos.has(x)).map((x) => [sinTildes(x), x]));
  let enlaces = 0;
  const limpia = (texto) => (limpiarEnlaces && plegados.size ? String(texto).replace(RE_ENLACE, (todo, destino, _p, alias) => {
    if (!plegados.has(sinTildes(destino))) return todo;
    enlaces++; return (alias && alias.trim()) || destino.trim();
  }) : texto);
  const nuevasNotas = quedan.map((n) => ({ ...n, texto: limpia(n.texto) }));
  return {
    datos: { ...datos, notas: nuevasNotas,
      sinapsis: (datos.sinapsis || []).filter((s) => vivos.has(s?.a) && vivos.has(s?.b)),
      pesos: (datos.pesos || []).filter((p) => vivos.has(p?.nombre)) },
    total: notas.length, quedan: nuevasNotas.length, quitadas: notas.length - nuevasNotas.length, enlaces,
  };
}
