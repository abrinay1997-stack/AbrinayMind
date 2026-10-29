// Abrinay Mind — texto puro: normalización, enlaces [[wiki]], cabecera de la nota, pasajes y menciones.
// Sin Worker, sin DOM, sin Node: lo importan el Worker, el navegador y los scripts. Todo lo que hace el cerebro con el texto sale de aquí.

/** Minúsculas y sin tildes: «Canción» y «cancion» son la misma cosa para el cerebro. */
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre ' +
  'tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos unos yo otro otras otra tanto esa ' +
  'estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros es son fue ser tu te tus mis vez cada the of and to in is for on that with as are ' +
  'be this it by or at from an your you we our can will not have has its was were if what how when which who').split(' '));

/** Raíz ligera (plurales y -ciones): suficiente para que «rimas» encuentre «rima». */
const stem = (w) => (w.length > 5 && w.endsWith('ciones') ? w.slice(0, -2) : w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

/** Palabras con significado, ya sin tildes y con su raíz. */
export const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

/** El texto con el que se indexa un pasaje en FTS5 (las raíces separadas por espacio). */
export const ftsStem = (s) => tokens(s).join(' ');

/** La consulta FTS5 de una frase: cada raíz entre comillas y unidas con OR (≈ BM25 de palabras sueltas). null si no queda ninguna. */
export function ftsQuery(s, max = 24) {
  const ws = [...new Set(tokens(s))].slice(0, max);
  return ws.length ? ws.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ') : null;
}

/** Hash corto y rápido (cyrb53), igual en el Worker y en el navegador. */
export function hash(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ---------- nombres ---------- */

const MALOS = /[\\/:*?"<>|#^\[\]\u0000-\u001f]/;
export const MAX_NOMBRE = 80;
export const MAX_NOTA = 200_000;

/** Nombre de nota válido: ni caracteres de ruta ni de enlace, ≤ 80, sin punto inicial. → { ok, nombre } | { ok:false, error } */
export function nombreValido(n) {
  const nombre = String(n ?? '').replace(/\s+/g, ' ').trim();
  if (!nombre) return { ok: false, error: 'La nota necesita un nombre.' };
  if (nombre.length > MAX_NOMBRE) return { ok: false, error: `El nombre es muy largo (máximo ${MAX_NOMBRE} letras).` };
  if (MALOS.test(nombre)) return { ok: false, error: 'El nombre no puede llevar \\ / : * ? " < > | # ^ [ ].' };
  if (nombre.startsWith('.')) return { ok: false, error: 'El nombre no puede empezar con punto.' };
  return { ok: true, nombre };
}

/** Carpeta válida: hasta 3 niveles separados por «/», cada uno ≤ 60. Vacía = sin carpeta. */
export function carpetaValida(c) {
  const partes = String(c ?? '').split('/').map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (partes.length > 3) return { ok: false, error: 'Como mucho tres niveles de carpeta.' };
  for (const p of partes) { if (p.length > 60 || MALOS.test(p) || p.startsWith('.')) return { ok: false, error: `La carpeta «${p.slice(0, 30)}» no es válida.` }; }
  return { ok: true, carpeta: partes.join('/') };
}

/** El primer nivel de una carpeta (el «lóbulo» del cerebro). */
export const lobulo = (carpeta) => String(carpeta || '').split('/')[0] || 'Sin carpeta';

/* ---------- cabecera de la nota (--- clave: valor ---) ---------- */

const RE_CAB = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** { fm, cuerpo, cabecera }: fm son las claves de la cabecera (true/false ya convertidos). */
export function leerCabecera(texto) {
  const t = String(texto ?? '');
  const m = RE_CAB.exec(t);
  if (!m) return { fm: {}, cuerpo: t, cabecera: '' };
  const fm = {};
  for (const l of m[1].split(/\r?\n/)) {
    const k = /^([A-Za-zÁÉÍÓÚáéíóúñÑ_][\wÁÉÍÓÚáéíóúñÑ_-]*)\s*:\s*(.*)$/.exec(l);
    if (!k) continue;
    let v = k[2].trim();
    if (/^(true|sí|si)$/i.test(v)) v = true; else if (/^(false|no)$/i.test(v)) v = false;
    fm[fold(k[1]).replace(/-/g, '_')] = v;
  }
  return { fm, cuerpo: t.slice(m[0].length), cabecera: m[1] };
}

/** Pone o quita claves de la cabecera sin tocar el resto. valor null/undefined = quitar. */
export function ponerCabecera(texto, cambios) {
  const t = String(texto ?? '');
  const m = RE_CAB.exec(t);
  const lineas = m ? m[1].split(/\r?\n/) : [];
  const cuerpo = m ? t.slice(m[0].length) : t;
  for (const [k, v] of Object.entries(cambios)) {
    const i = lineas.findIndex((l) => fold(l.split(':')[0]).trim().replace(/-/g, '_') === fold(k).replace(/-/g, '_'));
    if (v === null || v === undefined) { if (i >= 0) lineas.splice(i, 1); continue; }
    const linea = `${k}: ${v}`;
    if (i >= 0) lineas[i] = linea; else lineas.push(linea);
  }
  return lineas.length ? `---\n${lineas.join('\n')}\n---\n${cuerpo.replace(/^\r?\n/, '')}` : cuerpo;
}

/** Lo que el cerebro necesita saber de una nota de un vistazo. */
export function hechosDe(texto) {
  const { fm } = leerCabecera(texto);
  const lista = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    siempre: fm.siempre === true ? 1 : 0,
    privado: fm.privado === true ? 1 : 0,
    tipo: typeof fm.tipo === 'string' ? fm.tipo : '',
    alias: lista(fm.alias),
    revisar: typeof fm.revisar === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fm.revisar) ? fm.revisar : '',
    sinMencion: fm.mencion === false,
  };
}

/* ---------- enlaces [[wiki]] ---------- */

const RE_BLOQUES = /```[\s\S]*?```/g;
const RE_ENLACE = /\[\[([^\]\n|#^]{1,120})(?:[#^][^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;

/** Los nombres a los que enlaza un texto (sin alias, sin apartado, sin repetir, sin los de bloques ni de código en línea). */
export function enlaces(texto) {
  const limpio = String(texto ?? '').replace(RE_BLOQUES, ' ').replace(/`[^`\n]*`/g, ' ');
  const out = []; let m;
  RE_ENLACE.lastIndex = 0;
  while ((m = RE_ENLACE.exec(limpio))) out.push(m[1].trim());
  return [...new Set(out.filter(Boolean))];
}

/** Mapa «nombre sin tildes ni mayúsculas» → nombre real, para resolver enlaces escritos a mano. */
export const indiceNombres = (nombres) => new Map(nombres.map((n) => [fold(n), n]));

/** Reescribe [[Viejo]] → [[Nuevo]] en un texto, conservando alias y apartado. Devuelve { texto, cambios }. */
export function renombrarEnlaces(texto, viejo, nuevo) {
  const fv = fold(viejo); let cambios = 0;
  const salida = String(texto ?? '').replace(/\[\[([^\]\n|#^]{1,120})([#^][^\]\n|]*)?(\|[^\]\n]*)?\]\]/g, (todo, nombre, apartado = '', alias = '') => {
    if (fold(nombre.trim()) !== fv) return todo;
    cambios++;
    return `[[${nuevo}${apartado}${alias}]]`;
  });
  return { texto: salida, cambios };
}

/* ---------- pasajes: lo que se busca ---------- */

/** Una nota cortada en pasajes de ~`tam` letras, por títulos y párrafos; cada pasaje conserva su título. */
export function pasajes(nombre, texto, tam = 900) {
  const cuerpo = leerCabecera(texto).cuerpo;
  const out = []; let titulo = '', buf = '';
  const cerrar = () => { const t = buf.trim(); if (t) out.push({ nota: nombre, titulo, texto: t }); buf = ''; };
  for (const bloque of cuerpo.split(/\n\s*\n/)) {
    const h = /^#{1,4}\s+(.+)$/m.exec(bloque);
    if (h && bloque.trim().startsWith('#')) { cerrar(); titulo = h[1].trim(); }
    if ((buf + '\n\n' + bloque).length > tam && buf) cerrar();
    buf += (buf ? '\n\n' : '') + bloque;
  }
  cerrar();
  return out.map((p, i) => ({ ...p, i, id: `${nombre}#${i}`, hash: hash(p.texto) }));
}

/** Un resumen corto de la nota: sus primeras frases con sentido, sin marcas. */
export function resumen(texto, n = 300) {
  const c = leerCabecera(texto).cuerpo
    .replace(RE_BLOQUES, ' ').replace(/^#{1,6}\s.*$/gm, ' ').replace(/\[\[([^\]|#^]+)[^\]]*\]\]/g, '$1')
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, ' ').replace(/[*_`>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return c.length > n ? c.slice(0, n).replace(/\s+\S*$/, '') + '…' : c;
}

/* ---------- menciones: una nota que nombra a otra sin enlazarla ---------- */

/** ¿Merece una nota ser detectada por su nombre? Dos palabras o una de 7+ letras; con `alias:` en la cabecera, siempre. */
function aliasesDe(nombre, texto, extra) {
  const limpio = (x) => fold(x).replace(/\s+/g, ' ').trim();
  const propios = (Array.isArray(extra) ? extra : typeof extra === 'string' && extra ? extra.split(',') : hechosDe(texto).alias).map(limpio).filter((a) => a.length >= 2);
  const n = limpio(nombre);
  const delNombre = n.split(' ').length >= 2 || n.length >= 7 ? [n] : []; // un nombre corto solo se detecta si el artista lo declara en `alias:`
  return [...new Set([...delNombre, ...propios])];
}

/** Los nombres que pueden ser nombrados: [{ nombre, alias:[…] }] (alias ya sin tildes). Ignora las notas con `mencion: false`. */
export function blancosDe(notas) {
  return notas.filter((n) => !hechosDe(n.texto ?? '').sinMencion && !n.sinMencion)
    .map((n) => ({ nombre: n.nombre, alias: aliasesDe(n.nombre, n.texto ?? '', n.alias) })).filter((b) => b.alias.length);
}

/** A quiénes nombra UN texto, sin haberlos enlazado. → [[nombre, veces]] de más a menos (hasta `tope`). */
export function mencionesDeUna(nombre, texto, blancos, { tope = 12 } = {}) {
  const f = fold(leerCabecera(texto).cuerpo);
  const yaEnlazados = new Set(enlaces(texto).map(fold));
  const aqui = [];
  for (const b of blancos) {
    if (b.nombre === nombre || yaEnlazados.has(fold(b.nombre))) continue;
    let veces = 0;
    for (const a of b.alias) {
      let desde = 0, i;
      while ((i = f.indexOf(a, desde)) !== -1) {
        const antes = f[i - 1], despues = f[i + a.length];
        if (!(antes && /[a-z0-9]/.test(antes)) && !(despues && /[a-z0-9]/.test(despues))) veces++;
        desde = i + a.length;
        if (veces >= 5) break;
      }
    }
    if (veces) aqui.push([b.nombre, veces]);
  }
  return aqui.sort((x, y) => y[1] - x[1]).slice(0, tope);
}

/**
 * Pares [origen, destino] donde el texto del origen nombra al destino (por nombre o alias) sin [[enlazarlo]].
 * notas: [{ nombre, texto }]. Un destino con muchas menciones no se ahoga: se queda con las `tope` mejores por origen.
 */
export function menciones(notas, { tope = 12 } = {}) {
  const blancos = blancosDe(notas);
  const pares = [];
  for (const n of notas) for (const [dst] of mencionesDeUna(n.nombre, n.texto, blancos, { tope })) pares.push([n.nombre, dst]);
  return pares;
}

/** Añade `texto` al final de una sección «## título» (la crea si falta) sin tocar lo que decía. */
export function agregarTexto(nota, texto, { seccion = '' } = {}) {
  const base = String(nota ?? '').replace(/\s+$/, '');
  const nuevo = String(texto ?? '').trim();
  if (!nuevo) return base + '\n';
  if (!seccion) return `${base}\n\n${nuevo}\n`;
  const lineas = base.split('\n');
  const re = new RegExp(`^##\\s+${seccion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const i = lineas.findIndex((l) => re.test(l));
  if (i < 0) return `${base}\n\n## ${seccion}\n\n${nuevo}\n`;
  let j = i + 1; while (j < lineas.length && !/^#{1,2}\s/.test(lineas[j])) j++;
  const antes = lineas.slice(0, j).join('\n').replace(/\s+$/, ''), despues = lineas.slice(j).join('\n');
  return `${antes}\n\n${nuevo}\n${despues ? '\n' + despues : ''}`.replace(/\n{4,}/g, '\n\n\n');
}
