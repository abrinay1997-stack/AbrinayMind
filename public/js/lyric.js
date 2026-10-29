// Abrinay Mind — lee la respuesta del cerebro y separa la letra (secciones entre corchetes) de la idea central y las notas técnicas.
// Puro y sin dependencias: se prueba en Node. Si no hay secciones, no es una letra y se muestra como prosa.

const RE_SECCION = /^\s*#{0,3}\s*(?:\*\*)?\[([^\]\n]{1,48})\](?:\*\*)?\s*:?\s*$/;
const RE_VERSION = /^[ \t]*#{1,3}[ \t]*(?:\*\*)?VERSI[ÓO]N[ \t]+([A-Z0-9]+)\b[^\n]*$/gim;
const RE_NOTAS = /(^|\n)[ \t]*#{1,3}[ \t]*(?:\*\*)?Notas t[ée]cnicas[^\n]*\n?/i;

function version(texto, etiqueta) {
  const mi = RE_NOTAS.exec(texto);
  const cuerpo = mi ? texto.slice(0, mi.index) : texto, notas = mi ? texto.slice(mi.index + mi[0].length).trim() : '';
  const idea = []; const secciones = []; let actual = null;
  for (const linea of cuerpo.split('\n')) {
    const m = RE_SECCION.exec(linea);
    if (m) { actual = { nombre: m[1].trim(), lineas: [] }; secciones.push(actual); continue; }
    if (!actual) { if (linea.trim()) idea.push(linea.trim()); continue; }
    actual.lineas.push(linea.trim() ? linea.trimEnd() : null);
  }
  for (const s of secciones) { while (s.lineas.length && s.lineas[s.lineas.length - 1] === null) s.lineas.pop(); while (s.lineas.length && s.lineas[0] === null) s.lineas.shift(); }
  return { etiqueta, idea: idea.join('\n'), secciones, notas, esLetra: secciones.some((s) => s.lineas.length), crudo: texto.trim() };
}

/** → { intro, versiones:[{ etiqueta, idea, secciones:[{nombre, lineas:[texto|null]}], notas, esLetra, crudo }], esLetra } */
export function parsear(texto) {
  const t = String(texto ?? '').replace(/\r\n?/g, '\n');
  const marcas = []; let m; RE_VERSION.lastIndex = 0;
  while ((m = RE_VERSION.exec(t))) marcas.push({ i: m.index, fin: m.index + m[0].length, etiqueta: m[1] });
  if (!marcas.length) { const v = version(t, null); return { intro: '', versiones: [v], esLetra: v.esLetra }; }
  const versiones = marcas.map((x, k) => version(t.slice(x.fin, k + 1 < marcas.length ? marcas[k + 1].i : t.length), x.etiqueta));
  return { intro: t.slice(0, marcas[0].i).trim(), versiones, esLetra: versiones.some((v) => v.esLetra) };
}

/** La primera línea con letra, para titular una canción guardada sin título. */
export const primeraLinea = (v) => { for (const s of v.secciones) for (const l of s.lineas) if (l) return l.replace(/[*_]/g, '').slice(0, 60); return ''; };
