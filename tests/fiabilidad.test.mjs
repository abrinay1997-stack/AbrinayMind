// Fiabilidad del turno con el modelo: lector del streaming, reintentos, tiempos, cortes, tokens, errores con id, caché de vectores y recorte de notas fijas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA, aiFalsa } from './helpers.mjs';
import { lectorDeEventos, tokensDe } from '../src/chat.js';
import { recortarFija, planear } from '../public/core/context.js';
import { vaciarCacheDeVectores } from '../src/meaning.js';

const enc = new TextEncoder();
const ev = (nombre, datos) => `event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`;
const inicio = ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 1 } } });
const delta = (t) => ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } });
const final = (parada = 'end_turn') => ev('message_delta', { type: 'message_delta', delta: { stop_reason: parada }, usage: { output_tokens: 50 } }) + ev('message_stop', { type: 'message_stop' });
const respuesta = (partes, status = 200) => new Response(new ReadableStream({ start(c) { for (const p of partes) c.enqueue(enc.encode(p)); c.close(); } }), { status });
const colgada = (partes) => new Response(new ReadableStream({ start(c) { for (const p of partes) c.enqueue(enc.encode(p)); /* y no se cierra nunca */ } }), { status: 200 });
const error = (status, cabeceras = {}) => new Response(JSON.stringify({ error: { message: 'Overloaded' } }), { status, headers: cabeceras });

async function conChat(opciones) {
  const t = await entorno(opciones);
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  const msg = async (texto = 'háblame de la anáfora', extra = {}) => { const r = await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto, anclas: [], modo: null, ...extra }); await t.esperar(); return r; };
  const guardados = async () => (await t.j('GET', `/api/b/p/chats/${chat.id}`)).datos.mensajes;
  return { t, msg, guardados };
}
const contar = (fn) => { const f = async (...a) => { f.llamadas++; return fn(f.llamadas, ...a); }; f.llamadas = 0; f.peticiones = []; return f; };

test('lector del streaming: el texto sale idéntico aunque haya comillas, barras, saltos, emojis y cortes en cualquier sitio', () => {
  const original = 'Línea con "comillas", \\ barra, salto\ny tab\t, emoji 😀 y </nota> — ñ ¿?';
  const trozos = original.match(/[\s\S]{1,3}/gu) || [];   // trozos de 3 unidades: parte pares de sustitutos
  const flujo = inicio + trozos.map(delta).join('') + final('end_turn');
  const bytes = enc.encode(flujo);
  for (const corte of [1, 7, 33, 100]) {
    const l = lectorDeEventos();
    for (let i = 0; i < bytes.length; i += corte) l.empujar(bytes.slice(i, i + corte));
    assert.equal(l.estado.texto, original, `con trozos de ${corte} bytes`);
    assert.equal(l.estado.fin, true); assert.equal(l.estado.parada, 'end_turn'); assert.equal(l.estado.uso.output_tokens, 50);
  }
});

test('lector del streaming: un delta con campos extra (sin el cierre habitual) también se lee, y sin message_stop no hay fin', () => {
  const l = lectorDeEventos();
  l.empujar(enc.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hola "x"', extra: 1 } })}\n\n`));
  l.empujar(enc.encode(delta(' y adiós')));
  assert.equal(l.estado.texto, 'hola "x" y adiós');
  assert.equal(l.estado.fin, false);
  l.estado.texto = 'reemplazado'; assert.equal(l.estado.texto, 'reemplazado');
});

test('tokens: una versión 4096; más versiones, más espacio; la crítica, corta', () => {
  assert.equal(tokensDe('letra', { versiones: 1 }), 4096);
  assert.ok(tokensDe('letra', { versiones: 3 }) > tokensDe('letra', { versiones: 2 }));
  assert.equal(tokensDe('chat', null), 4096);
  assert.equal(tokensDe('critica', null), 1500);
  assert.equal(tokensDe('letra', { versiones: 99 }), tokensDe('letra', { versiones: 3 }));
});

test('reintentos: un «saturado» (529) pasajero se resuelve solo; uno permanente avisa tras 3 intentos; un error del artista no se reintenta', async () => {
  const pasajero = contar((n) => (n < 3 ? error(529) : respuesta([inicio, delta('Hola, artista.'), final()])));
  const a = await conChat({ proveedor: pasajero });
  const r = await a.msg();
  assert.equal(pasajero.llamadas, 3);
  assert.equal(r.texto, 'Hola, artista.');

  const permanente = contar(() => error(529));
  const b = await conChat({ proveedor: permanente });
  const r2 = await b.msg();
  assert.equal(permanente.llamadas, 3);
  assert.ok(r2.eventos.some((e) => e.evento === 'am_error' && /saturado/.test(e.datos.error)), JSON.stringify(r2.eventos.map((e) => e.evento)));

  const malo = contar(() => error(400));
  const c = await conChat({ proveedor: malo });
  await c.msg();
  assert.equal(malo.llamadas, 1, '400 no se reintenta');
});

test('tiempos: un proveedor que no contesta se corta y se avisa; uno que se calla a mitad conserva lo recibido', async () => {
  const mudo = contar((n, url, init) => new Promise((_, no) => init.signal.addEventListener('abort', () => no(new Error('abortado')))));
  const a = await conChat({ proveedor: mudo, tiempos: { primerByte: 25 } });
  const r = await a.msg();
  assert.equal(mudo.llamadas, 3);
  assert.ok(r.eventos.some((e) => e.evento === 'am_error' && /tardó demasiado/.test(e.datos.error)));

  const seCalla = contar(() => colgada([inicio, delta('La anáfora repite '), delta('al inicio de cada verso')]));
  const b = await conChat({ proveedor: seCalla, tiempos: { inactividad: 40 } });
  const r2 = await b.msg();
  assert.ok(r2.eventos.some((e) => e.evento === 'am_error' && /dejó de contestar/.test(e.datos.error)));
  const guardado = (await b.guardados()).find((m) => m.role === 'assistant');
  assert.match(guardado.content, /La anáfora repite al inicio de cada verso/);
  assert.match(guardado.meta.error, /dejó de contestar/);
});

test('cortes: sin message_stop se marca incompleta; con max_tokens se marca la parada; una respuesta normal, ninguna de las dos', async () => {
  const corte = contar(() => respuesta([inicio, delta('La anáfora repite ')]));
  const a = await conChat({ proveedor: corte });
  const r = await a.msg();
  const hecho = r.eventos.find((e) => e.evento === 'am_done').datos;
  assert.equal(hecho.incompleta, true);
  assert.equal((await a.guardados()).find((m) => m.role === 'assistant').meta.incompleta, true);

  const largo = contar(() => respuesta([inicio, delta('[VERSO 1]\nUna línea que se corta'), final('max_tokens')]));
  const b = await conChat({ proveedor: largo });
  const r2 = await b.msg();
  const h2 = r2.eventos.find((e) => e.evento === 'am_done').datos;
  assert.equal(h2.parada, 'max_tokens'); assert.equal(h2.incompleta, false);
  assert.equal((await b.guardados()).find((m) => m.role === 'assistant').meta.parada, 'max_tokens');

  const bien = contar(() => respuesta([inicio, delta('Todo en orden.'), final()]));
  const c = await conChat({ proveedor: bien });
  const h3 = (await c.msg()).eventos.find((e) => e.evento === 'am_done').datos;
  assert.equal(h3.incompleta, false); assert.equal(h3.parada, 'end_turn');
});

test('el constructor pide más espacio de salida cuando se piden varias versiones', async () => {
  const visto = [];
  const p = contar((n, url, init) => { visto.push(JSON.parse(init.body).max_tokens); return respuesta([inicio, delta('ok'), final()]); });
  const a = await conChat({ proveedor: p });
  await a.msg('', { fn: 'letra', brief: { titulo: 'x', versiones: 1 } });
  await a.msg('', { fn: 'letra', brief: { titulo: 'x', versiones: 3 } });
  const pensar = 4000;   // el pensamiento (por defecto «normal») se suma al espacio de la letra
  assert.deepEqual(visto, [4096 + pensar, tokensDe('letra', { versiones: 3 }) + pensar]);
});

test('un fallo interno del servidor devuelve un código para encontrarlo en los registros', async () => {
  const t = await entorno();
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  const real = t.env.DB.prepare;
  t.env.DB.prepare = () => { throw new Error('boom'); };
  const silencio = console.error; console.error = () => {};
  const r = await t.j('GET', '/api/b/p/chats');
  console.error = silencio; t.env.DB.prepare = real;
  assert.equal(r.status, 500);
  assert.match(r.datos.error, /Algo falló/); assert.match(r.datos.id, /^[0-9a-f]{14}$/);
});

test('vectores: se leen una vez mientras no cambien y se vuelven a leer cuando se reindexa', async () => {
  vaciarCacheDeVectores();
  const t = await entorno({ conAI: true });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  let e; do { e = (await t.j('POST', '/api/b/p/meaning/index', { cuantas: 8 })).datos; } while (e.pendientes > 0 && e.hechas > 0);
  let lecturas = 0; const real = t.env.DB.prepare;
  t.env.DB.prepare = (sql) => { if (/select name, scale, v from vectors/.test(sql)) lecturas++; return real(sql); };
  for (let i = 0; i < 3; i++) assert.equal((await t.j('GET', '/api/b/p/search?q=' + encodeURIComponent('la soledad'))).datos.significado, true);
  assert.equal(lecturas, 1, 'tres búsquedas, una lectura de vectores');
  await t.j('POST', '/api/b/p/note/append', { name: 'Eminem', text: 'más texto sobre la rima' });
  do { e = (await t.j('POST', '/api/b/p/meaning/index', { cuantas: 8 })).datos; } while (e.pendientes > 0 && e.hechas > 0);
  await t.j('GET', '/api/b/p/search?q=' + encodeURIComponent('la soledad'));
  assert.equal(lecturas, 2, 'al reindexar se vuelve a leer');
  t.env.DB.prepare = real;
});

test('notas fijas largas: se recorta por el medio y se conserva lo más nuevo (las reglas que acaba de enseñarse)', () => {
  const reglas = Array.from({ length: 60 }, (_, i) => `- *(2026-10-${String(i % 28 + 1).padStart(2, '0')})* 🔴 NUNCA: regla inventada número ${i + 1} con una explicación de tamaño normal. 🟢 SIEMPRE: alternativa inventada número ${i + 1}, también explicada.`);
  const texto = '---\ntipo: regla\nsiempre: true\n---\n# Reglas aprendidas\n\n## Reglas\n\n' + reglas.join('\n') + '\n';
  const notas = new Map([['Reglas aprendidas', { nombre: 'Reglas aprendidas', carpeta: '00-Meta', texto, siempre: true, privado: false, tipo: 'regla' }]]);
  const grafo = { nodes: [{ id: 'Reglas aprendidas', s: true }], links: [], mentions: [], meaning: [], learned: [] };
  const p = planear({ notas, grafo });
  const b = p.fijas[0].texto;
  assert.match(b, /regla inventada número 60\b/, 'la más nueva llega al modelo');
  assert.match(b, /regla inventada número 1\b/, 'la más antigua también');
  assert.ok(b.length <= 8_100);
  assert.equal(p.omitidas.recortadas.length, 1); assert.equal(p.omitidas.recortadas[0].nombre, 'Reglas aprendidas');
  // lo que cabe no se toca
  assert.equal(recortarFija('corto', 100), 'corto');
  const chica = new Map([['Reglas aprendidas', { ...notas.get('Reglas aprendidas'), texto: '# R\n\n- una regla' }]]);
  assert.equal(planear({ notas: chica, grafo }).omitidas.recortadas.length, 0);
});
