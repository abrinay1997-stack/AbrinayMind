// Abrinay Mind — «Revisión» de cada versión de una letra: lo que la prosodia puede MEDIR (sílabas, rima, anáforas, finales repetidos) frente a las canciones del propio artista.
// Son estimaciones: sirven para ver lo que se sale de lo normal, no como verdad métrica.
import { h, icono } from './ui.js';
import { analizarLetra } from '/core/prosodia.js';

const pct = (x) => `${Math.round(x * 100)} %`;
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Qué hallazgos merecen corregirse (texto para el modelo y para el artista). */
export function hallazgos(a, medidas = []) {
  const r = a.resumen, out = [];
  const medEj = media(medidas.map((m) => m.mediana)), rimaEj = media(medidas.map((m) => m.densidadRima));
  if (medEj != null && Math.abs(r.mediana - medEj) >= 3) out.push(`La mediana de la letra es ${r.mediana} sílabas por verso y la de sus canciones de ejemplo ${Math.round(medEj * 10) / 10}: ${r.mediana > medEj ? 'los versos son más largos' : 'los versos son más cortos'} que lo suyo.`);
  if (rimaEj != null && r.densidadRima < rimaEj - 0.25) out.push(`Rima en el ${pct(r.densidadRima)} de los versos; en sus ejemplos, en el ${pct(rimaEj)}.`);
  for (const x of r.atipicos.slice(0, 5)) out.push(`[${x.seccion}, verso ${x.verso}] «${x.texto}» tiene ${x.metricas} sílabas y su sección va por ${x.mediana}.`);
  for (const f of r.finalesRepetidos.slice(0, 3)) out.push(`El final «${f.palabra}» se repite ${f.veces} veces.`);
  return out;
}

/** → un <details> con la revisión de la versión, o null si hay muy pocos versos para decir algo. */
export function tarjetaRevision(version, { medidas = [], alCorregir = null } = {}) {
  const a = analizarLetra(version.crudo || '');
  if (a.resumen.versos < 4) return null;
  const r = a.resumen, medEj = media(medidas.map((m) => m.mediana)), marcas = hallazgos(a, medidas);
  const resumen = `Revisión · ${r.versos} versos · ${r.mediana} sílabas de mediana${medEj != null ? ` (sus ejemplos: ${Math.round(medEj * 10) / 10})` : ''} · rima en ${pct(r.densidadRima)}`;
  const filas = a.secciones.map((s) => h('li', h('b', s.nombre), ` — ${s.versos.length} versos · esquema `, h('code', s.esquema), ` · ${s.mediana} sílabas${s.anaforas.length ? ` · anáfora «${s.anaforas.map((x) => `${x.inicio} ×${x.versos}`).join('», «')}»` : ''}`));
  return h('details.revision', h('summary', icono('check', 14), resumen, marcas.length ? h('span.tag.warn', `${marcas.length} ${marcas.length === 1 ? 'aviso' : 'avisos'}`) : h('span.tag.good', 'sin avisos')),
    h('ul', filas),
    marcas.length ? h('div', h('b', 'Lo que se sale de lo normal'), h('ul', marcas.map((m) => h('li', m)))) : h('p.faint', 'Nada se sale mucho de su sección ni de tus ejemplos.'),
    h('p.faint', { style: { margin: '6px 0 0', fontSize: '12px' } }, 'Estimaciones por máquina (sinalefa y acento): el rap rompe esas reglas. Úsalo para comparar, no como verdad.'),
    marcas.length && alCorregir ? h('button.btn.small', { type: 'button', onclick: () => alCorregir(marcas) }, icono('sparkle'), 'Corregir lo marcado') : null);
}
