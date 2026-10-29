// Abrinay Mind — cómo se ve una letra: tarjeta con secciones, idea central y notas técnicas. La usan el Estudio y Canciones.
import { h } from './ui.js';
import { md } from './md.js';
import { parsear } from './lyric.js';

/** Markdown ya saneado como elemento; los [[enlaces]] llaman a alAbrir(nombre). */
export function mdEl(texto, { existe, alAbrir } = {}) {
  const d = h('div.md'); d.innerHTML = md(texto, { existe });
  if (alAbrir) d.addEventListener('click', (e) => { const a = e.target.closest('a.wiki'); if (a) { e.preventDefault(); alAbrir(a.dataset.note); } });
  return d;
}

/** Una versión ya parseada → los bloques que se ven (idea, letra, notas técnicas). */
export function bloquesDeVersion(v, opciones) {
  return [
    v.idea ? h('div.lyric.idea', v.idea) : null,
    v.esLetra ? h('div.lyric', v.secciones.map((s) => h('div.sec', h('span.sec-name', s.nombre), s.lineas.map((l) => (l == null ? h('span.line', { style: { height: '.6em' } }) : h('span.line', l)))))) : null,
    v.notas ? h('details.notes-tech', h('summary', 'Notas técnicas'), h('div', { style: { marginTop: '8px' } }, mdEl(v.notas, opciones))) : null,
  ];
}

/**
 * Un texto de respuesta → letra (una o varias versiones) o prosa.
 * pie(v, p): nodo con acciones por versión (o null). enVivo: sin acciones mientras llega el texto.
 */
export function vistaDeLetra(texto, { pie = null, enVivo = false, ...opciones } = {}) {
  const p = parsear(texto);
  if (!p.esLetra) return h('div.prose', mdEl(texto, opciones));
  return h('div.stack', { style: { gap: '14px' } }, p.intro ? h('div.prose', mdEl(p.intro, opciones)) : null,
    p.versiones.map((v) => h('div.stack', { style: { gap: '10px' } }, v.etiqueta ? h('div.section-title', { style: { margin: '4px 0 0' } }, `Versión ${v.etiqueta}`) : null, bloquesDeVersion(v, opciones), !enVivo && pie ? pie(v, p) : null)));
}
