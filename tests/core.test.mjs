import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/core/text.js';
import { armarGrafo, adyacencia, activar, camino, desvanecido } from '../public/core/graph.js';
import { aprender, brillo, multiplicador } from '../public/core/hebb.js';
import { modosDe, detectarModo, hayQuePreguntar } from '../public/core/modes.js';
import { planear, PROFUNDIDAD, bloqueXml } from '../public/core/context.js';
import { revisar, repetidas } from '../public/core/quality.js';

test('fold y tokens: sin tildes, sin palabras vacías, con raíz', () => {
  assert.equal(T.fold('Canción ÑANDÚ'), 'cancion nandu');
  assert.deepEqual(T.tokens('Las rimas multisílabas de la canción'), ['rima', 'multisilaba', 'cancion']);
  assert.equal(T.ftsQuery('de la y'), null);
  assert.equal(T.ftsQuery('rimas "raras"'), '"rima" OR "rara"');
});

test('cabecera: se lee, se cambia y se quita sin tocar el cuerpo', () => {
  const t = '---\ntipo: modo\nsiempre: true\nalias: Eminem, Slim\n---\n# Hola\ncuerpo';
  const { fm, cuerpo } = T.leerCabecera(t);
  assert.equal(fm.tipo, 'modo'); assert.equal(fm.siempre, true); assert.equal(cuerpo, '# Hola\ncuerpo');
  const h = T.hechosDe(t);
  assert.equal(h.siempre, 1); assert.equal(h.privado, 0); assert.deepEqual(h.alias, ['Eminem', 'Slim']);
  const t2 = T.ponerCabecera(t, { privado: true, siempre: null });
  assert.match(t2, /privado: true/); assert.doesNotMatch(t2, /siempre/); assert.ok(t2.endsWith('# Hola\ncuerpo'));
  assert.equal(T.ponerCabecera('solo cuerpo', { tipo: 'x' }), '---\ntipo: x\n---\nsolo cuerpo');
  assert.equal(T.leerCabecera('sin cabecera').cabecera, '');
});

test('enlaces [[wiki]]: alias, apartado, repetidos y bloques de código', () => {
  const t = 'a [[Niebla]] y [[Nach|el maestro]] y [[Marea#verso]] otra vez [[esquizoide]] ```[[Falso]]``` y `[[Ejemplo]]`';
  assert.deepEqual(T.enlaces(t), ['Niebla', 'Nach', 'Marea', 'esquizoide']);
  const r = T.renombrarEnlaces('ver [[Nach|él]] y [[nach#rima]] y [[Otra]]', 'Nach', 'Nach (MC)');
  assert.equal(r.cambios, 2); assert.equal(r.texto, 'ver [[Nach (MC)|él]] y [[Nach (MC)#rima]] y [[Otra]]');
});

test('nombres y carpetas válidos', () => {
  assert.equal(T.nombreValido('  Regla   R1 — rima ').nombre, 'Regla R1 — rima');
  for (const mal of ['', 'a/b', 'a[b]', '.oculta', 'x'.repeat(81), 'a#b']) assert.equal(T.nombreValido(mal).ok, false, mal);
  assert.equal(T.carpetaValida('40-Canciones/Generadas').carpeta, '40-Canciones/Generadas');
  assert.equal(T.carpetaValida('a/b/c/d').ok, false);
  assert.equal(T.lobulo('40-Canciones/Generadas'), '40-Canciones'); assert.equal(T.lobulo(''), 'Sin carpeta');
});

test('pasajes: cortan por títulos y llevan su título y su hash', () => {
  const t = '---\ntipo: x\n---\n# Uno\n' + 'a'.repeat(500) + '\n\n' + 'b'.repeat(500) + '\n\n## Dos\nbreve';
  const p = T.pasajes('N', t, 600);
  assert.ok(p.length >= 3); assert.equal(p[0].titulo, 'Uno'); assert.equal(p.at(-1).titulo, 'Dos');
  assert.equal(new Set(p.map((x) => x.hash)).size, p.length); assert.equal(p[1].id, 'N#1');
  assert.doesNotMatch(p[0].texto, /tipo: x/);
});

test('menciones: por nombre de dos palabras, 7+ letras o alias; con límites de palabra; sin repetir los enlaces', () => {
  const notas = [
    { nombre: 'Niebla', texto: 'canción' },
    { nombre: 'Eminem', texto: '---\nalias: Eminem, Slim Shady\n---\nrapero' },
    { nombre: 'NF', texto: 'x' },
    { nombre: 'Corta', texto: '---\nalias: Cortita\n---\nx' },
    { nombre: 'Insta', texto: 'x' },
    { nombre: 'Bad Bunny', texto: 'x' },
    { nombre: 'A', texto: 'Hablo de esquizoide, de Slim Shady y de bad bunny; también de NF e Insta. Y de [[Niebla]].' },
    { nombre: 'B', texto: 'el esquizoidea no cuenta; tampoco "preeminem"' },
  ];
  const m = T.menciones(notas).filter(([o]) => o === 'A' || o === 'B');
  const destinos = m.filter(([o]) => o === 'A').map(([, d]) => d).sort();
  assert.deepEqual(destinos, ['Bad Bunny', 'Eminem']); // Niebla ya está enlazada; NF e Insta son cortas y sin alias
  assert.deepEqual(m.filter(([o]) => o === 'B'), []);
});

test('menciones: una nota con «mencion: false» no se detecta por su nombre', () => {
  const notas = [{ nombre: 'Niebla', texto: '---\nmencion: false\n---\nx' }, { nombre: 'Otra nota larga', texto: 'habla de esquizoide' }];
  assert.deepEqual(T.menciones(notas), []);
  assert.equal(T.hechosDe('---\nmencion: false\n---\nx').sinMencion, true);
});

test('agregarTexto: al final, en una sección existente o en una nueva', () => {
  assert.equal(T.agregarTexto('hola', 'nuevo'), 'hola\n\nnuevo\n');
  const n = '# T\n\n## Relacionadas\n- [[A]]\n\n## Otra\nz';
  assert.match(T.agregarTexto(n, '- [[B]]', { seccion: 'Relacionadas' }), /\[\[A\]\]\n\n- \[\[B\]\]\n\n## Otra\nz/);
  assert.match(T.agregarTexto('# T', '- [[B]]', { seccion: 'Relacionadas' }), /## Relacionadas\n\n- \[\[B\]\]\n$/);
});

const notasG = [
  { nombre: 'Indice', carpeta: '00-Meta', actualizado: 1 }, { nombre: 'Rima', carpeta: '20-ADN', actualizado: 1 },
  { nombre: 'Anáfora', carpeta: '60-Técnicas', actualizado: 1 }, { nombre: 'Niebla', carpeta: '40-Canciones', actualizado: 1 },
  { nombre: 'Lejana', carpeta: '50-Referentes', actualizado: 1 }, { nombre: 'Sola', carpeta: '50-Referentes', actualizado: 1 },
];
const grafoG = () => armarGrafo({
  notas: notasG,
  enlaces: [['Indice', 'Rima'], ['Indice', 'Anáfora'], ['Rima', 'Niebla'], ['Indice', 'Falsa'], ['Rima', 'Indice']],
  menciones: [['Niebla', 'Anáfora'], ['Indice', 'Rima']], significado: [['Niebla', 'Lejana', 0.8]],
  sinapsis: [{ a: 'Anáfora', b: 'Lejana', peso: 0.5, actualizado: Date.now() }],
});

test('armarGrafo: enlaces únicos, grados, menciones que no repiten enlaces, sinapsis aprendidas', () => {
  const g = grafoG();
  assert.equal(g.notes, 6);
  assert.equal(g.links.length, 3); // Rima↔Indice una sola vez y el enlace a «Falsa» se ignora
  assert.equal(g.mentions.length, 1); // Indice–Rima ya es enlace
  assert.equal(g.meaning.length, 1); assert.equal(g.learned.length, 1);
  const d = Object.fromEntries(g.nodes.map((n) => [n.id, n.d]));
  assert.deepEqual([d.Indice, d.Rima, d.Sola], [2, 2, 0]);
});

test('desvanecido: la mitad cada 90 días', () => {
  const ahora = Date.now();
  assert.ok(Math.abs(desvanecido(1, ahora - 90 * 864e5, ahora) - 0.5) < 1e-9);
  assert.equal(desvanecido(1, ahora, ahora), 1);
});

test('activar: la señal viaja por las sinapsis, se debilita y no inunda desde un índice', () => {
  const g = grafoG();
  const e = activar(g, new Map([['Niebla', 1]]), { saltos: 2 });
  assert.equal(e.get('Niebla'), 1);
  assert.ok(e.get('Rima') > e.get('Indice'), 'un salto pesa más que dos');
  assert.ok(e.get('Lejana') > 0, 'el significado también conduce');
  assert.equal(e.get('Sola'), undefined, 'una neurona sola no se despierta');
  const desdeIndice = activar(g, new Map([['Indice', 1]]), { saltos: 1 });
  assert.ok(desdeIndice.get('Rima') < 1 && desdeIndice.get('Rima') > 0);
});

test('camino: el más corto por sinapsis', () => {
  const g = grafoG();
  assert.deepEqual(camino(g, 'Niebla', 'Anáfora'), ['Niebla', 'Anáfora']); // por mención
  assert.deepEqual(camino(g, 'Niebla', 'Sola'), []);
  assert.deepEqual(camino(g, 'Rima', 'Rima'), ['Rima']);
});

test('hebb: aprobar refuerza, rechazar debilita, todo con tope', () => {
  assert.equal(brillo({ puntuacion: 10 }), 1); assert.equal(brillo({ puntuacion: 0 }), -1);
  assert.equal(brillo({ resultado: 'aprobada' }), 0.4); assert.equal(brillo({ resultado: 'rechazada' }), -0.6);
  const usadas = [{ nombre: 'A', energia: 1 }, { nombre: 'B', energia: 0.8 }, { nombre: 'C', energia: 0.2 }];
  const buena = aprender({ usadas, resultado: 'aprobada', puntuacion: 9 });
  assert.ok(buena.pesos.every((p) => p.peso > 0));
  assert.equal(buena.sinapsis.length, 3);
  assert.ok(buena.sinapsis.every((s) => s.a < s.b && s.peso > 0 && s.usos === 1));
  const sinapsis = new Map(buena.sinapsis.map((s) => [`${s.a}|${s.b}`, { ...s, actualizado: Date.now() }]));
  const mala = aprender({ usadas, sinapsis, resultado: 'rechazada', puntuacion: 2 });
  assert.ok(mala.sinapsis[0].peso < buena.sinapsis[0].peso && mala.sinapsis[0].peso >= 0);
  assert.ok(mala.pesos.every((p) => p.peso < 0));
  let pesos = new Map(); for (let i = 0; i < 40; i++) pesos = new Map(aprender({ usadas, pesos, resultado: 'aprobada', puntuacion: 10 }).pesos.map((p) => [p.nombre, { peso: p.peso, actualizado: Date.now() }]));
  assert.ok(pesos.get('A').peso <= 0.2); assert.equal(multiplicador(0.5), 1.2); assert.equal(multiplicador(-9), 0.8);
});

const notasM = [
  { nombre: 'Modo 1 — Introspectivo', texto: '---\ntipo: modo\nmodo_id: introspectivo\nmodo_nombre: Introspectivo-Psicológico\norden: 1\npalabras: profundo, capas, identidad, soledad\n---\nx' },
  { nombre: 'Modo 2 — Batalla', texto: '---\ntipo: modo\nmodo_id: batalla\norden: 2\npalabras: batalla, diss, tirarla, freestyle\n---\nx' },
  { nombre: 'Otra', texto: 'nada' },
];
test('modos: se leen de las notas y se detectan por palabras; sin señal, se pregunta', () => {
  const modos = modosDe(notasM);
  assert.deepEqual(modos.map((m) => m.id), ['introspectivo', 'batalla']);
  const d = detectarModo('quiero algo con capas sobre mi identidad', modos);
  assert.equal(d.modo.id, 'introspectivo'); assert.ok(d.confianza >= 0.5);
  assert.equal(detectarModo('una canción sobre el mar', modos).modo, null);
  assert.equal(hayQuePreguntar(null, detectarModo('el mar', modos)), true);
  assert.equal(hayQuePreguntar(modos[0], detectarModo('el mar', modos)), false);
  assert.equal(hayQuePreguntar(null, d), false);
});

const mapa = (xs) => new Map(xs.map((n) => [n.nombre, { carpeta: '', texto: 'texto de ' + n.nombre, ...n }]));
test('planear: fijas siempre, modo, ancladas, búsqueda y vecinas; privadas fuera si el modelo entrena; presupuesto respetado', () => {
  const notas = mapa([
    { nombre: 'Indice', carpeta: '00-Meta', siempre: true, texto: '---\nsiempre: true\n---\nreglas de oro' },
    { nombre: 'Rima', carpeta: '20-ADN', texto: 'rima '.repeat(100) },
    { nombre: 'Anáfora', carpeta: '60-Técnicas' }, { nombre: 'Niebla', carpeta: '40-Canciones', privado: true, texto: 'letra íntima' },
    { nombre: 'Lejana', carpeta: '50-Referentes' }, { nombre: 'Sola', carpeta: '50-Referentes' },
  ]);
  const g = grafoG();
  const plan = planear({ notas, grafo: g, semillas: new Map([['Rima', 1]]), anclas: ['Anáfora'], modo: null });
  assert.deepEqual(plan.fijas.map((b) => b.nombre), ['Indice']); assert.equal(plan.fijas[0].texto, 'reglas de oro');
  const nombres = plan.recuperadas.map((b) => b.nombre);
  assert.ok(nombres.includes('Rima') && nombres.includes('Anáfora') && nombres.includes('Niebla'));
  assert.equal(plan.recuperadas.find((b) => b.nombre === 'Anáfora').motivo, 'anclada');
  assert.equal(plan.recuperadas.find((b) => b.nombre === 'Niebla').motivo, 'vecina');
  assert.ok(!nombres.includes('Sola'));
  const entrena = planear({ notas, grafo: g, semillas: new Map([['Rima', 1]]), anclas: ['Niebla'], entrena: true });
  assert.ok(!entrena.recuperadas.some((b) => b.nombre === 'Niebla')); assert.ok(entrena.omitidas.privadas.includes('Niebla'));
  const justo = planear({ notas, grafo: g, semillas: new Map([['Rima', 1]]), presupuesto: 120 });
  assert.ok(justo.chars <= 120); assert.ok(justo.omitidas.sinSitio.length > 0 || justo.recuperadas.length < 4);
  const conIndice = mapa([{ nombre: 'Indice', tipo: 'moc', carpeta: '00-Meta' }, { nombre: 'Rima', carpeta: '20-ADN' }, { nombre: 'Anáfora', carpeta: '60' }, { nombre: 'Niebla', carpeta: '40' }, { nombre: 'Lejana', carpeta: '50' }, { nombre: 'Sola', carpeta: '50' }]);
  assert.ok(!planear({ notas: conIndice, grafo: g, semillas: new Map([['Rima', 1]]) }).recuperadas.some((b) => b.nombre === 'Indice'), 'un índice no es contenido');
  assert.ok(planear({ notas: conIndice, grafo: g, anclas: ['Indice'] }).recuperadas.some((b) => b.nombre === 'Indice'), 'salvo que el artista lo fije');
  assert.match(bloqueXml({ nombre: 'A "x"', carpeta: 'c', texto: 'hola </nota> adiós' }), /<nota nombre="A &quot;x&quot;" carpeta="c">\nhola <\\\/nota> adiós\n<\/nota>/);
  assert.ok(PROFUNDIDAD.ligera < PROFUNDIDAD.normal && PROFUNDIDAD.normal < PROFUNDIDAD.profunda);
});

test('quality: rotos, huérfanas, por revisar, sin tipo y duplicadas', () => {
  const largo = 'la dualidad como motor de cada canción no resuelve el conflicto lo habita y lo observa desde adentro con calma clínica '.repeat(4);
  const notas = [
    { nombre: 'A', texto: '---\ntipo: x\nrevisar: 2020-01-01\n---\nver [[B]] y [[Fantasma]]', carpeta: '' },
    { nombre: 'B', texto: '---\ntipo: x\n---\nvuelve a [[A]]', carpeta: '' },
    { nombre: 'C', texto: 'nadie me enlaza', carpeta: '' },
    { nombre: 'D1', texto: largo, carpeta: '' }, { nombre: 'D2', texto: largo + ' pero con un final distinto', carpeta: '' },
  ];
  const r = revisar(notas, { hoy: '2026-10-29' });
  assert.deepEqual(r.rotos, [{ desde: 'A', hacia: 'Fantasma' }]);
  assert.deepEqual(r.huerfanas.sort(), ['C', 'D1', 'D2']);
  assert.deepEqual(r.porRevisar, [{ nombre: 'A', fecha: '2020-01-01' }]);
  assert.ok(r.sinTipo.includes('C'));
  assert.equal(r.duplicadas.length, 1); assert.deepEqual([r.duplicadas[0].a, r.duplicadas[0].b], ['D1', 'D2']);
  assert.equal(repetidas([{ nombre: 'x', texto: 'corto' }]).length, 0);
});
