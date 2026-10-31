// Abrinay Mind — cómo se ve una letra: tarjeta con secciones, idea central y notas técnicas. La usan el Estudio y Canciones.
import { h, dialogo, copiar, num, icono } from './ui.js';
import { letraParaSuno, textoLimpio, estiloSuno } from './formato.js';
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

/**
 * «Copiar para Suno»: el estilo y la letra en dos cuadros, cada uno con su botón de copiar, listos para pegar en Suno.
 * version: una versión parseada (lyric.js) · brief: { genero, mood, bpm } del encargo (puede faltar) · titulo: solo para el texto normal.
 */
export function abrirParaSuno({ titulo = '', version, brief = {} }) {
  let conEtiquetas = true, generada = letraParaSuno(version);
  const estilo = h('textarea', { rows: 2, 'aria-label': 'Estilo para Suno', value: estiloSuno(brief), placeholder: 'Ej.: introspective rap, dark piano, 90 BPM' });
  const letra = h('textarea.suno-letra', { rows: 12, 'aria-label': 'Letra para Suno', value: generada, spellcheck: 'false' });
  const cE = h('span.faint'), cL = h('span.faint');
  const contar = () => { cE.textContent = `${num(estilo.value.length)} caracteres`; cL.textContent = `${num(letra.value.length)} caracteres`; };
  estilo.addEventListener('input', contar); letra.addEventListener('input', contar); contar();
  // el botón de copiar va arriba, junto al título: en el móvil el cuadro de la letra es largo y abajo quedaría fuera de la vista
  const campo = (etiqueta, ayuda, area, cuenta, textoBoton) => h('div.field', h('div.row.between', { style: { gap: '10px', flexWrap: 'wrap' } }, h('span.label', etiqueta),
    h('div.row', { style: { gap: '10px' } }, cuenta, h('button.btn.small.primary', { type: 'button', onclick: () => copiar(area.value) }, icono('copy'), textoBoton))), area, h('span.hint', ayuda));
  const etiquetas = h('input', { type: 'checkbox', checked: true, onchange: () => {
    if (letra.value !== generada) { etiquetas.checked = conEtiquetas; return; }   // si ya editaste la letra, no se pisa
    conEtiquetas = etiquetas.checked; generada = letraParaSuno(version, { etiquetasSuno: conEtiquetas }); letra.value = generada; contar();
  } });
  dialogo({ titulo: 'Copiar para Suno', sub: 'Pega el estilo en «Style of Music» y la letra en «Lyrics». Puedes editarlos aquí antes de copiar.', ancho: true, cuerpo: h('div.stack', { style: { gap: '16px' } },
    campo('Estilo', 'Suno entiende mejor los estilos en inglés. Pon géneros, mood e instrumentos; sin nombres de artistas (Suno los rechaza).', estilo, cE, 'Copiar estilo'),
    campo('Letra', 'Con etiquetas [Verse], [Chorus]… Sin título, sin idea central y sin notas técnicas. Suno limita la longitud según su versión: si se corta, acorta o divide la letra.', letra, cL, 'Copiar letra'),
    h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, etiquetas, h('span', 'Etiquetas en inglés para Suno ([Verse 1], [Chorus]…)'))),
  acciones: [{ texto: 'Cerrar', tipo: 'primary' }] });
}

/** El texto de una versión para pegar en cualquier sitio: título, secciones y letra, sin Markdown ni notas técnicas. */
export const copiarTextoLimpio = (version, titulo) => copiar(textoLimpio(version, { titulo }) || version.crudo);
