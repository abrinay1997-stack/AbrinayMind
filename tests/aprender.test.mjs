// Corregir una letra y que el cerebro aprenda: se guarda lo que dejó el artista, el siguiente turno parte de ESA letra, se proponen reglas y se guardan como ejemplos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA, proveedorFalso } from './helpers.mjs';

const LETRA = '[VERSO 1]\nLa lluvia dibuja un mapa\nCada gota es una calle\nSigo el trazo sin saber\n\n[CORO]\nQue el reloj responda\n\n## Notas técnicas\nRima: -ar.';
const CORREGIDA = '[VERSO 1]\nLa lluvia dibuja un mapa\nCada gota es una puerta\n\n[CORO]\nQue el reloj responda\n\n## Notas técnicas\nRima: -ar.';
const REGLAS = JSON.stringify({ reglas: [{ nunca: 'Cerrar el verso con una línea explicativa.', siempre: 'Terminar el verso con una imagen concreta.' }, { nunca: '', siempre: 'Preferir «puerta» a «calle» para lo que se abre.' }] });

async function conLetra(proveedor = proveedorFalso({ respuesta: (c) => (/Cambios del artista/.test(JSON.stringify(c.messages)) ? REGLAS : LETRA) })) {
  const t = await entorno({ proveedor });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  const r = await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto: 'escribe un verso', anclas: [], modo: null });
  await t.esperar();
  const mensajes = async () => (await t.j('GET', `/api/b/p/chats/${chat.id}`)).datos.mensajes;
  const bot = (await mensajes()).find((m) => m.role === 'assistant');
  return { t, chat, bot, mensajes, proveedor };
}
const nota = async (t, nombre) => (await t.j('GET', `/api/b/p/note?name=${encodeURIComponent(nombre)}`));

test('corregir: la respuesta queda como la dejó el artista, con el original y la marca de corrección', async () => {
  const { t, chat, bot, mensajes } = await conLetra();
  assert.equal(bot.content, LETRA);
  const r = await t.j('PATCH', `/api/b/p/chats/${chat.id}/messages/${bot.id}`, { texto: CORREGIDA });
  assert.equal(r.status, 200); assert.equal(r.datos.content, CORREGIDA);
  const m = (await mensajes()).find((x) => x.id === bot.id);
  assert.equal(m.content, CORREGIDA); assert.equal(m.meta.original, LETRA); assert.equal(m.meta.correcciones, 1); assert.ok(m.meta.editada > 0);
  // una segunda corrección conserva el PRIMER original
  await t.j('PATCH', `/api/b/p/chats/${chat.id}/messages/${bot.id}`, { texto: CORREGIDA + '\nmás' });
  const m2 = (await mensajes()).find((x) => x.id === bot.id);
  assert.equal(m2.meta.original, LETRA); assert.equal(m2.meta.correcciones, 2);
});

test('corregir: no acepta vacío, mensajes del artista, mensajes de otro chat ni de otro cerebro', async () => {
  const { t, chat, bot, mensajes } = await conLetra();
  assert.equal((await t.j('PATCH', `/api/b/p/chats/${chat.id}/messages/${bot.id}`, { texto: '   ' })).status, 400);
  const mio = (await mensajes()).find((m) => m.role === 'user');
  assert.equal((await t.j('PATCH', `/api/b/p/chats/${chat.id}/messages/${mio.id}`, { texto: 'x' })).status, 404);
  const otro = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  assert.equal((await t.j('PATCH', `/api/b/p/chats/${otro.id}/messages/${bot.id}`, { texto: 'x' })).status, 404);
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'q', nombre: 'Q', subtitulo: 'y' } });
  assert.equal((await t.j('PATCH', `/api/b/q/chats/${chat.id}/messages/${bot.id}`, { texto: 'x' })).status, 404);
  assert.equal((await mensajes()).find((m) => m.id === bot.id).content, LETRA, 'nada cambió');
});

test('el siguiente turno parte de la letra corregida, no de la original', async () => {
  const { t, chat, bot, proveedor } = await conLetra();
  await t.j('PATCH', `/api/b/p/chats/${chat.id}/messages/${bot.id}`, { texto: CORREGIDA });
  await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto: 'hazla más corta', anclas: [], modo: null }); await t.esperar();
  const ult = proveedor.peticiones.at(-1).cuerpo.messages;
  const previa = ult.find((m) => m.role === 'assistant').content;
  assert.match(previa, /una puerta/); assert.doesNotMatch(previa, /una calle/);
});

test('proponer: devuelve los cambios y reglas generales; sin llave o con respuesta rota, solo los cambios', async () => {
  const { t } = await conLetra();
  const r = await t.j('POST', '/api/b/p/learn/propose', { antes: LETRA, despues: CORREGIDA, titulo: 'Mapas', modo: '' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.datos.cambios.map((c) => [c.antes, c.despues]), [[['Cada gota es una calle', 'Sigo el trazo sin saber'], ['Cada gota es una puerta']]]);
  assert.equal(r.datos.propuestas.length, 2); assert.match(r.datos.propuestas[0].nunca, /explicativa/);

  const sinCambios = await t.j('POST', '/api/b/p/learn/propose', { antes: LETRA, despues: LETRA });
  assert.deepEqual(sinCambios.datos, { cambios: [], propuestas: [] });

  const rota = await conLetra(proveedorFalso({ respuesta: (c) => (/Cambios del artista/.test(JSON.stringify(c.messages)) ? 'no es json' : LETRA) }));
  const r2 = await rota.t.j('POST', '/api/b/p/learn/propose', { antes: LETRA, despues: CORREGIDA });
  assert.equal(r2.status, 200); assert.equal(r2.datos.propuestas, null); assert.equal(r2.datos.cambios.length, 1);

  const sinLlave = await entorno({ extra: { ANTHROPIC_API_KEY: '' } });
  await sinLlave.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  const r3 = await sinLlave.j('POST', '/api/b/p/learn/propose', { antes: LETRA, despues: CORREGIDA });
  assert.equal(r3.status, 200); assert.equal(r3.datos.propuestas, null);
});

test('aplicar: las reglas entran en «Reglas aprendidas» y los cambios quedan como ejemplos en una nota privada', async () => {
  const { t } = await conLetra();
  const r = await t.j('POST', '/api/b/p/learn/apply', { reglas: [{ nunca: 'Cerrar el verso explicando.', siempre: 'Terminar con una imagen.' }, { nunca: '', siempre: '' }], ejemplo: { antes: LETRA, despues: CORREGIDA, titulo: 'Mapas' } });
  assert.equal(r.status, 200); assert.equal(r.datos.reglas, 1); assert.equal(r.datos.ejemplo, true);
  const reglas = (await nota(t, 'Reglas aprendidas')).datos.text;
  assert.match(reglas, /NUNCA: Cerrar el verso explicando\./); assert.match(reglas, /SIEMPRE: Terminar con una imagen\./);
  const ej = (await nota(t, 'Correcciones del artista')).datos;
  assert.match(ej.text, /Mapas/); assert.match(ej.text, /«Cada gota es una calle \/ Sigo el trazo sin saber» → «Cada gota es una puerta»/);
  assert.equal(ej.private, true, 'material inédito: no llega a modelos que entrenan');
  // una segunda corrección se añade, no se pisa
  await t.j('POST', '/api/b/p/learn/apply', { ejemplo: { antes: '[CORO]\nuno', despues: '[CORO]\ndos', titulo: 'Otra' } });
  const ej2 = (await nota(t, 'Correcciones del artista')).datos.text;
  assert.match(ej2, /Mapas/); assert.match(ej2, /Otra/);
});

test('aplicar: los cambios se recalculan en el servidor y el ejemplo sin cambios no escribe nada', async () => {
  const { t } = await conLetra();
  const r = await t.j('POST', '/api/b/p/learn/apply', { ejemplo: { antes: LETRA, despues: LETRA, titulo: 'Igual' } });
  assert.equal(r.datos.ejemplo, false);
  assert.equal((await nota(t, 'Correcciones del artista')).status, 404);
  const vacio = await t.j('POST', '/api/b/p/learn/apply', {});
  assert.deepEqual([vacio.datos.reglas, vacio.datos.ejemplo], [0, false]);
});
