// Abrinay Mind — ayuda: el vocabulario del producto (neurona, sinapsis, lóbulo…) y los atajos de teclado, en un solo lugar.
import { h, dialogo } from './ui.js';

export const TERMINOS = [
  ['Neurona', 'Una nota. Cada idea va en su propia nota, escrita en Markdown.'],
  ['Sinapsis', 'La conexión entre dos neuronas. Hay cuatro clases: enlace, mención, significado y aprendida.'],
  ['Enlace', 'Lo escribes tú con [[doble corchete]] dentro de una nota. Es la conexión más fuerte.'],
  ['Mención', 'Una nota nombra a otra sin enlazarla. El cerebro lo detecta solo.'],
  ['Significado', 'Dos notas hablan de lo mismo aunque no se nombren. Lo calcula la IA desde Conexiones.'],
  ['Aprendida', 'Se refuerza cuando apruebas una letra y se debilita con el tiempo si no se usa.'],
  ['Lóbulo', 'La carpeta de primer nivel (Estilo, Referentes…). Agrupa las neuronas por tema.'],
  ['Capas', 'En Cerebro, qué clases de sinapsis se dibujan en el mapa.'],
  ['Memoria fija', 'Notas marcadas «siempre»: se leen enteras antes de cada letra (reglas de oro, firma).'],
  ['Modo', 'La manera de escribir (íntimo, callejero…). Si no eliges uno, el cerebro lo detecta o te pregunta.'],
  ['Anclar', 'Obliga al cerebro a leer una nota concreta en la próxima letra.'],
  ['Privada', 'Una nota privada nunca se envía a un modelo que entrena con tus datos.'],
];

export const ATAJOS = [
  ['?', 'Abrir esta ayuda'], ['/', 'Buscar (en Cerebro y Notas)'], ['g y luego c · n · e · s · x · a', 'Ir a Cerebro · Notas · Estudio · Canciones · Conexiones · Ajustes'],
  ['Ctrl/⌘ + S', 'Guardar la nota'], ['Enter · Mayús + Enter', 'Enviar al cerebro · salto de línea'], ['Esc', 'Cerrar un diálogo o la nota abierta en Cerebro'],
];

export function ayuda() {
  return dialogo({ titulo: 'Cómo funciona', sub: 'El vocabulario del cerebro y los atajos de teclado.', ancho: true,
    cuerpo: h('div.stack', { style: { gap: '18px' } },
      h('dl.glosario', TERMINOS.map(([t, d]) => [h('dt', t), h('dd', d)])),
      h('div', h('div.section-title', { style: { margin: '0 0 8px' } }, 'Atajos de teclado'), h('dl.glosario', ATAJOS.map(([k, d]) => [h('dt', h('kbd', k)), h('dd', d)])))),
    acciones: [{ texto: 'Entendido', tipo: 'primary' }] });
}
