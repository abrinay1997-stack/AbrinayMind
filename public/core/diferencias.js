// Abrinay Mind — qué cambió el artista en una letra. Puro: lo usan el Worker (para pedir reglas y guardar el ejemplo) y el navegador (para enseñarle el cambio).
// Se comparan las LÍNEAS de la letra (no las etiquetas [CORO]), ignorando espacios y renglones vacíos; los bloques de líneas quitadas y puestas en su lugar forman un «cambio».

const norm = (l) => String(l ?? '').replace(/\s+/g, ' ').trim();
const MAX_LINEAS = 400;

/** Las líneas con letra de un texto, cada una con la sección en la que está. */
export function lineasConSeccion(texto) {
  const out = []; let seccion = '';
  for (const raw of String(texto ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const l = norm(raw); if (!l) continue;
    const m = /^#{0,3}\s*(?:\*\*)?\[([^\]]{1,48})\](?:\*\*)?\s*:?$/.exec(l);
    if (m) { seccion = m[1].trim(); continue; }
    out.push({ l, seccion });
  }
  return out.slice(0, MAX_LINEAS);
}

/**
 * → [{ seccion, antes:[líneas que había], despues:[líneas que puso] }] en el orden de la letra. Vacío si no cambió nada.
 * Una línea cambiada aparece en antes y en despues; una quitada solo en antes; una añadida solo en despues.
 */
export function cambiosDeLetra(antes, despues) {
  const A = lineasConSeccion(antes), B = lineasConSeccion(despues);
  const n = A.length, m = B.length;
  // subsecuencia común más larga
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].l === B[j].l ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const cambios = []; let actual = null;
  const cerrar = () => { if (actual) { cambios.push(actual); actual = null; } };
  const abrir = (seccion) => { if (!actual) actual = { seccion, antes: [], despues: [] }; else if (!actual.seccion) actual.seccion = seccion; return actual; };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i].l === B[j].l) { cerrar(); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { abrir(B[j].seccion).despues.push(B[j].l); j++; }
    else { abrir(A[i].seccion).antes.push(A[i].l); i++; }
  }
  cerrar();
  return cambios;
}

/** Un resumen corto: «3 cambios · 5 líneas quitadas · 6 nuevas». */
export function resumenDeCambios(cambios) {
  const q = cambios.reduce((s, c) => s + c.antes.length, 0), p = cambios.reduce((s, c) => s + c.despues.length, 0);
  if (!cambios.length) return 'Sin cambios en la letra.';
  return `${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'} · ${q} ${q === 1 ? 'línea quitada' : 'líneas quitadas'} · ${p} ${p === 1 ? 'nueva' : 'nuevas'}`;
}
