// Abrinay Mind — la letra en otros formatos: texto limpio para pegar donde sea y formato para Suno (etiquetas [Verse], [Chorus]… y el estilo aparte).
// Puro y sin dependencias (se prueba en Node). Recibe una versión ya parseada por lyric.js: { secciones:[{ nombre, lineas:[texto|null] }], … }.

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Quita lo que sobra al pegar fuera de la app: énfasis de Markdown, enlaces [[…]], espacios al final. */
export function limpiarLinea(l) {
  return String(l ?? '')
    .replace(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(\*|_)(.+?)\1/g, '$2').replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*>\s?/, '').replace(/\s+$/, '');
}

// nombre en español (sin tildes, sin número) → etiqueta que Suno entiende
const TAGS = [
  [/^(intro|introduccion|apertura)$/, 'Intro'],
  [/^(pre[\s-]?coro|precoro|pre[\s-]?estribillo)$/, 'Pre-Chorus'],
  [/^(post[\s-]?coro|poscoro)$/, 'Post-Chorus'],
  [/^(coro|estribillo|chorus|hook)$/, 'Chorus'],
  [/^(verso|estrofa|verse|rap)$/, 'Verse'],
  [/^(puente|bridge|break|quiebre)$/, 'Bridge'],
  [/^(interludio|interlude)$/, 'Interlude'],
  [/^(solo|instrumental|solo instrumental)$/, 'Instrumental'],
  [/^(outro|final|cierre|salida|coda)$/, 'Outro'],
  [/^(drop)$/, 'Drop'],
];

/** «VERSO 2», «Coro», «Puente (susurrado)», «Verso 1 - rap» → «[Verse 2]», «[Chorus]», «[Bridge: susurrado]», «[Verse 1: rap]». Lo que no conoce lo deja como está. */
export function etiquetaSuno(nombre) {
  const original = String(nombre ?? '').trim();
  // el descriptor va entre paréntesis, tras «:» o tras un guion CON espacios (el guion de «PRE-CORO» no cuenta)
  const m = /^(.*?)(?:\s*\(\s*(.+?)\s*\)|\s*:\s*(.+)|\s+[-–—]\s+(.+))?$/.exec(original) || [];
  const base = (m[1] || original).trim(), nota = (m[2] || m[3] || m[4] || '').trim();
  const num = /\s(\d+)$/.exec(base); const sinNum = sinTildes(base.replace(/\s+\d+$/, ''));
  const hallado = TAGS.find(([re]) => re.test(sinNum));
  if (!hallado) return `[${original}]`;
  const nombreSuno = hallado[1] + (num && hallado[1] !== 'Chorus' ? ` ${num[1]}` : '');
  return `[${nombreSuno}${nota ? `: ${nota}` : ''}]`;
}

const secciones = (v) => (v?.secciones || []).filter((s) => s.lineas.some((l) => l));

/** Las líneas de una sección sin renglones vacíos repetidos ni al principio o al final. */
function lineasDe(s) {
  const out = [];
  for (const l of s.lineas) { if (l == null || !String(l).trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); } else out.push(limpiarLinea(l)); }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * La letra lista para pegar en el cuadro «Lyrics» de Suno: cada sección con su etiqueta en inglés, una línea por barra, una línea en blanco entre secciones.
 * Sin título, sin idea central y sin notas técnicas. opciones.etiquetasSuno = false deja los nombres como los escribió el cerebro.
 */
export function letraParaSuno(v, { etiquetasSuno = true } = {}) {
  return secciones(v).map((s) => [etiquetasSuno ? etiquetaSuno(s.nombre) : `[${s.nombre}]`, ...lineasDe(s)].join('\n')).join('\n\n');
}

/** La letra como texto normal y ordenado: título, y cada sección con su nombre y sus líneas. Sin Markdown, sin idea central ni notas técnicas. */
export function textoLimpio(v, { titulo = '', conIdea = false } = {}) {
  const partes = [];
  if (titulo && String(titulo).trim()) partes.push(String(titulo).trim());
  if (conIdea && v?.idea) partes.push(limpiarLinea(v.idea));
  for (const s of secciones(v)) partes.push([`[${String(s.nombre).trim()}]`, ...lineasDe(s)].join('\n'));
  return partes.join('\n\n');
}

/** Un punto de partida para el cuadro «Style of Music»: género, mood y BPM del encargo. Los nombres de artistas NO van (Suno los rechaza). */
export function estiloSuno({ genero, mood, bpm, modo } = {}) {
  const t = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
  const partes = [t(genero), t(mood), bpm && Number(bpm) > 0 ? `${Math.round(Number(bpm))} BPM` : ''].filter(Boolean);
  return partes.join(', ');
}
