// Razonamiento: pensamiento extendido (petición, respaldo si el modelo no lo acepta, ajustes) y modos (palabras enteras, continuidad de la conversación).
import test from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA } from './helpers.mjs';
import { armarLlamada, validarAjustes, esfuerzoDe, modeloPorId } from '../src/models.js';
import { modosDe, detectarModo } from '../public/core/modes.js';
import { resolverModo } from '../src/context.js';

const enc = new TextEncoder();
const ev = (n, d) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`;
const ok = (texto) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'pienso "esto"' } })
    + ev('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: texto } })
    + ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }) + ev('message_stop', { type: 'message_stop' })));
  c.close();
} }), { status: 200 });
async function conChat(opciones) {
  const t = await entorno(opciones);
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  const msg = async (texto, extra = {}) => { const r = await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto, anclas: [], modo: null, ...extra }); await t.esperar(); return r; };
  return { t, msg, mensajes: async () => (await t.j('GET', `/api/b/p/chats/${chat.id}`)).datos.mensajes };
}
const espiar = (fn) => { const f = async (url, init) => { const cuerpo = JSON.parse(init.body); f.cuerpos.push(cuerpo); return fn(f.cuerpos.length, cuerpo); }; f.cuerpos = []; return f; };

test('pensamiento: se controla con el esfuerzo (output_config.effort); nunca se manda budget_tokens ni thinking', () => {
  const m = modeloPorId('claude-sonnet-5-5');
  const r = armarLlamada({ ANTHROPIC_API_KEY: 'k' }, m, { sistema: 'x', mensajes: [], maxTokens: 12000, esfuerzo: 'high' });
  assert.deepEqual(r.cuerpo.output_config, { effort: 'high' });
  assert.equal(r.cuerpo.thinking, undefined, 'los Claude 5 rechazan budget_tokens con un 400: el pensamiento es adaptativo por defecto');
  assert.equal(r.cuerpo.max_tokens, 12000);
  const sin = armarLlamada({ ANTHROPIC_API_KEY: 'k' }, m, { sistema: 'x', mensajes: [], maxTokens: 4096 });
  assert.equal(sin.cuerpo.output_config, undefined);
  assert.equal(esfuerzoDe('normal', 'letra'), 'high'); assert.equal(esfuerzoDe('normal', 'chat'), 'medium'); assert.equal(esfuerzoDe('apagado', 'letra'), 'low'); assert.equal(esfuerzoDe('profundo', 'letra'), 'xhigh');
});

test('pensamiento: ajuste validado; el chat manda su esfuerzo, «apagado» lo baja y la letra no se mezcla con el razonamiento', async () => {
  assert.equal(validarAjustes({ pensamiento: 'profundo' }).valor.pensamiento, 'profundo');
  assert.equal(validarAjustes({ pensamiento: 'mucho' }).ok, false);
  const p = espiar(() => ok('Respuesta limpia.'));
  const a = await conChat({ proveedor: p });
  const r = await a.msg('hola');
  assert.equal(p.cuerpos[0].output_config.effort, 'medium'); assert.equal(p.cuerpos[0].thinking, undefined);
  assert.equal(r.texto, 'Respuesta limpia.', 'el pensamiento no se cuela en la respuesta');
  assert.equal((await a.mensajes()).at(-1).content, 'Respuesta limpia.');
  await a.t.j('PUT', '/api/settings', { pensamiento: 'apagado' });
  await a.msg('otra'); assert.equal(p.cuerpos[1].output_config.effort, 'low');
});

test('pensamiento: como la API real, un modelo que rechaza el esfuerzo (400) contesta igual sin él, sin gastar un reintento y sin recortar max_tokens', async () => {
  const p = espiar((n) => (n === 1 ? new Response(JSON.stringify({ error: { message: 'output_config.effort: not supported for this model' } }), { status: 400 }) : ok('Salió sin esfuerzo.')));
  const a = await conChat({ proveedor: p });
  const r = await a.msg('hola');
  assert.equal(p.cuerpos.length, 2); assert.equal(p.cuerpos[1].output_config, undefined); assert.equal(p.cuerpos[1].max_tokens, 12000);
  assert.equal(r.texto, 'Salió sin esfuerzo.');
});

test('pensamiento: la letra no se corta a los 4096 tokens: el tope de salida deja sitio al razonamiento', async () => {
  const p = espiar(() => ok('Va.'));
  const a = await conChat({ proveedor: p });
  await a.msg('', { fn: 'letra', brief: { titulo: 'x', versiones: 1 } }); await a.msg('', { fn: 'letra', brief: { titulo: 'x', versiones: 3 } }); await a.msg('hola');
  assert.deepEqual(p.cuerpos.map((c) => c.max_tokens), [12000, 24000, 12000]);
  assert.equal(p.cuerpos[0].output_config.effort, 'high');
  assert.ok(p.cuerpos.every((c) => !/budget_tokens|"thinking":\{/.test(JSON.stringify(c))), 'ninguna petición lleva budget_tokens (la API real lo rechaza con 400 en Sonnet 5.5)');
});

const modos = modosDe([
  { nombre: 'M1', texto: '---\ntipo: modo\nmodo_id: intro\nmodo_nombre: Intro\norden: 1\npalabras: rap, calle, identidad\n---\nx' },
  { nombre: 'M2', texto: '---\ntipo: modo\nmodo_id: batalla\norden: 2\npalabras: batalla, tirarla\n---\nx' },
]);
test('modos: solo cuentan palabras enteras (con plural simple), no trozos de otras', () => {
  assert.equal(detectarModo('una trampa para el sistema', modos).modo, null, '«rap» dentro de «trampa» no cuenta');
  assert.equal(detectarModo('Quiero un RAP de las calles', modos).modo.id, 'intro');
  assert.equal(detectarModo('para tirarla en la batalla', modos).modo.id, 'batalla');
});
test('modos: sin señales, la conversación sigue en su modo; con señal nueva, gana la nueva; sin nada, pregunta', () => {
  assert.equal(resolverModo(modos, null, 'sigue con el segundo verso', 'M1').modo.id, 'intro');
  assert.equal(resolverModo(modos, null, 'sigue con el segundo verso', 'M1').origen, 'continua');
  assert.equal(resolverModo(modos, null, 'ahora una batalla', 'M1').modo.id, 'batalla');
  const duda = resolverModo(modos, null, 'sobre el mar', null);
  assert.equal(duda.pregunta, true); assert.equal(duda.modo, null);
  assert.equal(resolverModo(modos, 'preguntar', 'x', 'M1').pregunta, true);
});

test('modos: en una conversación real, el segundo mensaje sin pistas sigue el modo del primero', async () => {
  const p = espiar(() => ok('Va.'));
  const a = await conChat({ proveedor: p });
  const r1 = await a.msg('quiero algo con capas e identidad', {});
  assert.equal(r1.eventos.find((e) => e.evento === 'am_context').datos.modo.origen, 'detectado');
  const r2 = await a.msg('sigue con el segundo verso', {});
  const m = r2.eventos.find((e) => e.evento === 'am_context').datos.modo;
  assert.equal(m.origen, 'continua'); assert.ok(m.nota);
});

test('mezcla: se eligen varios modos, o dos con señales parecidas se mezclan en vez de preguntar; «libre» no fija ninguno', () => {
  const e = resolverModo(modos, ['M1', 'M2'], 'x');
  assert.deepEqual(e.modos.map((m) => m.id), ['intro', 'batalla']); assert.equal(e.origen, 'elegido'); assert.equal(e.modo.id, 'intro');
  assert.equal(resolverModo(modos, ['M1', 'M1', 'no existe'], 'x').modos.length, 1);
  const d = resolverModo(modos, null, 'una batalla sobre mi identidad', null);
  assert.equal(d.origen, 'detectado'); assert.deepEqual(d.modos.map((m) => m.id).sort(), ['batalla', 'intro']); assert.match(d.motivo, /mezcla/);
  const l = resolverModo(modos, 'libre', 'x', 'M1');
  assert.equal(l.origen, 'libre'); assert.equal(l.modos.length, 0); assert.equal(l.pregunta, false);
});

test('mezcla: el cerebro lee las notas de todos los modos mezclados, el prompt lo dice y la conversación sigue en la mezcla', async () => {
  const p = espiar(() => ok('Va.'));
  const a = await conChat({ proveedor: p });
  const r1 = await a.msg('algo', { modo: ['Modo 1 — Introspectivo', 'Modo 2 — Batalla'] });
  const c = r1.eventos.find((e) => e.evento === 'am_context').datos;
  assert.equal(c.modo.notas.length, 2); assert.match(c.modo.nombre, / \+ /);
  assert.deepEqual(c.leidas.filter((l) => l.motivo === 'modo').map((l) => l.nombre).sort(), ['Modo 1 — Introspectivo', 'Modo 2 — Batalla']);
  assert.match(p.cuerpos[0].system[1].text, /MEZCLA de «Introspectivo-Psicológico» \+ «Técnico-Batalla»/);
  const r2 = await a.msg('sigue con el segundo verso');
  const m2 = r2.eventos.find((e) => e.evento === 'am_context').datos.modo;
  assert.equal(m2.origen, 'continua'); assert.equal(m2.notas.length, 2);
  const r3 = await a.msg('otra cosa', { modo: 'libre' });
  assert.match(p.cuerpos[2].system[1].text, /LIBRE/); assert.equal(r3.eventos.find((e) => e.evento === 'am_context').datos.modo.nombre, 'Libre');
});

test('modos que aprenden: al elegir un modo con los botones tras la duda, las palabras distintivas se quedan en ese modo', async () => {
  const { palabrasDistintivas } = await import('../src/aprender-modos.js');
  assert.deepEqual(palabrasDistintivas('quiero una canción sobre desvelos y trampas, rap', modos), ['desvelos', 'trampas'], 'sin comunes, sin cortas y sin las que el modo ya tiene (rap)');
  const p = espiar(() => ok('Va.'));
  const a = await conChat({ proveedor: p });
  const dudosa = await a.msg('una canción sobre los desvelos del barrio');
  assert.equal(dudosa.eventos.find((e) => e.evento === 'am_context').datos.modo.pregunta, true);
  const r = await a.msg('una canción sobre los desvelos del barrio', { modo: 'Modo 1 — Introspectivo', aprenderModo: true });
  const m = r.eventos.find((e) => e.evento === 'am_context').datos.modo;
  assert.ok(m.aprendidas.includes('desvelos'), JSON.stringify(m));
  const nota = (await a.t.j('GET', '/api/b/p/note?name=' + encodeURIComponent('Modo 1 — Introspectivo'))).datos.text;
  assert.match(nota, /palabras: profundo, capas, identidad, soledad, [^\n]*desvelos/);
  // y la próxima vez se detecta solo
  const sola = await a.msg('una canción sobre los desvelos del barrio');
  assert.equal(sola.eventos.find((e) => e.evento === 'am_context').datos.modo.origen, 'detectado');
  // sin la marca de aprender, elegir un modo no toca la nota
  const antes = nota;
  await a.msg('otra sobre los insomnios', { modo: 'Modo 1 — Introspectivo' });
  assert.equal((await a.t.j('GET', '/api/b/p/note?name=' + encodeURIComponent('Modo 1 — Introspectivo'))).datos.text, antes);
});

test('lectura: un mensaje corto («sigue») se busca con lo anterior de la conversación y conserva las notas que se venían leyendo', async () => {
  const p = espiar(() => ok('Va.'));
  const a = await conChat({ proveedor: p });
  const r1 = await a.msg('háblame de la anáfora y de cómo se usa');
  assert.ok(r1.eventos.find((e) => e.evento === 'am_context').datos.leidas.some((l) => l.nombre === 'Anáfora'));
  const r2 = await a.msg('sigue');
  const l2 = r2.eventos.find((e) => e.evento === 'am_context').datos.leidas;
  assert.ok(l2.some((l) => l.nombre === 'Anáfora' && l.motivo === 'busqueda'), 'Anáfora se sigue leyendo: ' + JSON.stringify(l2.map((l) => [l.nombre, l.motivo])));
});

const cuatro = modosDe([
  { nombre: 'Modo 1 — Introspectivo-Psicológico', texto: '---\ntipo: modo\nmodo_nombre: Introspectivo-Psicológico\norden: 1\npalabras: profundo, capas, introspeccion\n---\nx' },
  { nombre: 'Modo 2 — Técnico-Batalla', texto: '---\ntipo: modo\nmodo_nombre: Técnico-Batalla\norden: 2\npalabras: batalla, diss, tirar\n---\nx' },
  { nombre: 'Modo 3 — Emocional-Vulnerable', texto: '---\ntipo: modo\nmodo_nombre: Emocional-Vulnerable\norden: 3\npalabras: chica, sentimientos, desamor\n---\nx' },
  { nombre: 'Modo 4 — Comercial-Pop', texto: '---\ntipo: modo\nmodo_nombre: Comercial-Pop\norden: 4\npalabras: pegue, viral, single\n---\nx' },
]);
test('modos: el propio nombre del modo también lo señala, así que «Emocional, Vulnerable, Técnico, Introspectivo» es una mezcla', () => {
  assert.deepEqual(cuatro[0].palabras.slice(0, 3), ['profundo', 'capas', 'introspeccion'], 'primero las que declara el artista (es lo que se muestra)');
  assert.ok(cuatro[2].palabras.includes('emocional') && cuatro[2].palabras.includes('vulnerable'));
  const r = resolverModo(cuatro, null, 'me gusta la idea de que sea Emocional, Vulnerable, Técnico, Introspectivo', null);
  assert.equal(r.origen, 'detectado'); assert.deepEqual(r.modos.map((m) => m.id).sort(), ['modo-1-introspectivo-psicologico', 'modo-2-tecnico-batalla', 'modo-3-emocional-vulnerable'].sort());
  assert.match(r.motivo, /mezcla/);
});
test('modos: «de forma libre» se entiende como libre, salvo que la conversación ya venga en una mezcla', () => {
  const l = resolverModo(cuatro, null, 'si se puede mezclar de forma libre', null);
  assert.equal(l.origen, 'libre'); assert.equal(l.pregunta, false);
  const c = resolverModo(cuatro, null, 'si se puede mezclar de forma libre', ['Modo 3 — Emocional-Vulnerable', 'Modo 2 — Técnico-Batalla']);
  assert.equal(c.origen, 'continua'); assert.equal(c.modos.length, 2);
});
