// Prosodia del español: sílabas y acento, sílabas de un verso (con sinalefa), rimas (consonante, asonante, multisílaba), esquema y anáforas. Todo con texto inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { silabas, silabasDeVerso, rimaDe, comparaRima, partirLetra, analizarLetra, letraDeNota } from '../public/core/prosodia.js';

const corta = (w) => silabas(w).silabas.join('-');
test('sílabas: diptongos, hiatos, grupos de consonantes y «qu/gu»', () => {
  const casos = { canción: 'can-ción', murciélago: 'mur-cié-la-go', país: 'pa-ís', aire: 'ai-re', construir: 'cons-truir', ahora: 'a-ho-ra', reina: 'rei-na', teatro: 'te-a-tro', poeta: 'po-e-ta', huir: 'huir', guerra: 'gue-rra', ciudad: 'ciu-dad', transporte: 'trans-por-te', obstáculo: 'obs-tá-cu-lo', rey: 'rey', hoy: 'hoy', frío: 'frí-o', día: 'dí-a', caída: 'ca-í-da', baúl: 'ba-úl', instrumento: 'ins-tru-men-to', quiero: 'quie-ro', agua: 'a-gua', pingüino: 'pin-güi-no', Uruguay: 'u-ru-guay' };
  for (const [w, esperado] of Object.entries(casos)) assert.equal(corta(w), esperado, w);
});
test('acento: aguda, llana, esdrújula y monosílaba', () => {
  const tipos = { canción: 'aguda', árbol: 'llana', estómago: 'esdrújula', papel: 'aguda', casa: 'llana', habitación: 'aguda', hoy: 'monosílaba', murciélago: 'esdrújula' };
  for (const [w, t] of Object.entries(tipos)) assert.equal(silabas(w).tipo, t, w);
  assert.equal(silabas('habitación').tonica, 3);
});
test('verso: sílabas fonéticas con sinalefa y métricas con el ajuste del final', () => {
  const v = silabasDeVerso('Camino por la calle sin mirar atrás');
  assert.equal(v.foneticas, 12); assert.equal(v.metricas, 13); assert.equal(v.tipoFinal, 'aguda');
  assert.equal(silabasDeVerso('Tu amor es una isla').foneticas, 6, 'serían 8 sin sinalefa (tu·amor, una·isla)');
  assert.equal(silabasDeVerso('').foneticas, 0);
});
test('rima: consonante, asonante y multisílaba; lo que no rima, no rima', () => {
  assert.equal(comparaRima('corazón', 'canción').tipo, 'consonante');
  assert.equal(comparaRima('amor', 'dolor').tipo, 'consonante');
  assert.equal(comparaRima('mar', 'lugar').tipo, 'consonante');
  assert.equal(comparaRima('casa', 'masa').tipo, 'multisilabica'); assert.equal(comparaRima('casa', 'masa').consonante, true);
  assert.equal(comparaRima('casa', 'rata').consonante, false); assert.equal(comparaRima('casa', 'rata').asonante, true);
  assert.equal(comparaRima('tiempo', 'sueño').asonante, true, 'ie-o ≈ ue-o: de un diptongo cuenta la vocal fuerte');
  assert.equal(comparaRima('capital', 'decapitar').tipo, 'asonante');
  assert.equal(comparaRima('perro', 'gato'), null);
  assert.equal(comparaRima('atrás', 'atrás'), null, 'repetir la palabra no es rimar');
  assert.deepEqual(rimaDe('gloria').vocales, ['o', 'a']);
});
test('letra: se parte en secciones, ignora el Markdown y corta en «Notas técnicas»', () => {
  const t = '**Idea central:** x\n\n[VERSO 1]\nUno dos tres cuatro\nCinco seis siete ocho\n\n[CORO]\nNo hay vuelta atrás\n\n## Notas técnicas\nRima: AABB\n[FALSO]\nesto no cuenta';
  const s = partirLetra(t);
  assert.deepEqual(s.map((x) => x.nombre), ['VERSO 1', 'CORO']); assert.equal(s[0].versos.length, 2);
});
test('análisis: esquema de rima, anáfora, finales repetidos y versos atípicos', () => {
  const t = '[VERSO 1]\nCamino por la calle sin mirar atrás\nCargando en la espalda lo que no se va\nHablo con el miedo y me dice que no hay más\nSigo de memoria el mapa de mi hogar\n\n[CORO]\nNo hay vuelta atrás\nNo hay vuelta atrás\nNo hay vuelta atrás\nSolo sigo mi lugar';
  const a = analizarLetra(t);
  assert.equal(a.secciones.length, 2);
  assert.equal(a.secciones[1].anaforas[0].inicio, 'no hay'); assert.equal(a.secciones[1].anaforas[0].versos, 3);
  assert.equal(a.resumen.versos, 8); assert.ok(a.resumen.finalesRepetidos.some((f) => f.palabra === 'atrás' && f.veces >= 3));
  assert.match(a.secciones[0].esquema, /^[A-Z-]{4}$/);
  assert.ok(a.resumen.mediana >= 5 && a.resumen.max >= 12);
  assert.equal(analizarLetra('').resumen.versos, 0);
});

test('robustez: palabras sin vocales, signos y versos vacíos no rompen nada', () => {
  assert.equal(rimaDe('hmm'), null); assert.equal(comparaRima('shh', 'hmm'), null); assert.equal(comparaRima('', 'casa'), null);
  const a = analizarLetra('[VERSO]\nHmm\nShh... ¿¡qué!?\n...\n\n123 456\nSigo');
  assert.ok(a.resumen.versos >= 3); assert.doesNotThrow(() => analizarLetra('# solo titulo\n---\n'));
});
test('letra de una nota de canción: aísla «## Letra» y reconoce etiquetas sueltas como «verse»', () => {
  const nota = '---\ntipo: cancion\n---\n# X\n\nIntro de análisis que no es letra.\n\n## Letra\n\nverse\nUna línea inventada de prueba\nOtra línea inventada de ensayo\nchorus\nEstribillo inventado de muestra\n\n## Medidas\n\nmediana 12';
  const t = letraDeNota(nota);
  assert.doesNotMatch(t, /Intro de análisis|Medidas/);
  assert.deepEqual(partirLetra(t).map((x) => [x.nombre, x.versos.length]), [['verse', 2], ['chorus', 1]]);
  assert.equal(letraDeNota('sin sección de letra'), 'sin sección de letra');
});
test('rima: solo se busca entre versos cercanos (si no, una letra larga «rimaría» toda con todo)', () => {
  const versos = ['Camino por la calle', 'busco la luz', 'bajo el sol', 'hasta el fin', 'sin el pan', 'dulce como miel', 'Encuentro en el detalle'];
  const a = analizarLetra('[X]\n' + versos.join('\n'));
  assert.equal(a.secciones[0].pares.length, 0, 'calle y detalle riman pero están a 6 versos');
});
