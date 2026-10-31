// El chat como canal bilateral: la IA puede leer Y modificar el cerebro con herramientas (crear, ampliar, mover, renombrar, borrar, conectar…),
// con topes por turno, la papelera, notas protegidas y «deshacer» de cada cambio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA, proveedorFalso } from './helpers.mjs';

const enc = new TextEncoder();
const ev = (n, d) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`;
/** Una respuesta en streaming con pensamiento (opcional), texto y herramientas. */
function respuesta({ texto = '', usos = [], pensar = false, parada }) {
  const p = [ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } })];
  let i = 0;
  if (pensar) { p.push(ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'thinking', thinking: '', signature: '' } }), ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'thinking_delta', thinking: 'pienso' } }), ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'signature_delta', signature: 'FIRMA' } }), ev('content_block_stop', { type: 'content_block_stop', index: i })); i++; }
  if (texto) { p.push(ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }), ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: texto } }), ev('content_block_stop', { type: 'content_block_stop', index: i })); i++; }
  usos.forEach((u, k) => {
    const json = JSON.stringify(u.input), corte = Math.max(1, Math.floor(json.length / 2));
    p.push(ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: `tu_${k}_${u.name}`, name: u.name, input: {} } }),
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: json.slice(0, corte) } }),
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: json.slice(corte) } }), ev('content_block_stop', { type: 'content_block_stop', index: i })); i++;
  });
  p.push(ev('message_delta', { type: 'message_delta', delta: { stop_reason: parada || (usos.length ? 'tool_use' : 'end_turn') }, usage: { output_tokens: 50 } }), ev('message_stop', { type: 'message_stop' }));
  return new Response(new ReadableStream({ start(c) { for (const x of p) c.enqueue(enc.encode(x)); c.close(); } }), { status: 200 });
}
/** guion(cuerpo, n) → { texto, usos, pensar } por cada llamada al modelo. */
const conGuion = (guion) => { const f = async (url, init) => { const cuerpo = JSON.parse(init.body); f.cuerpos.push(cuerpo); return respuesta(guion(cuerpo, f.cuerpos.length - 1)); }; f.cuerpos = []; return f; };

async function conCerebro(guion, opciones = {}) {
  const proveedor = conGuion(guion);
  const t = await entorno({ proveedor, ...opciones });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  const msg = async (texto = 'haz algo', extra = {}) => { const r = await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto, anclas: [], modo: null, ...extra }); await t.esperar(); return r; };
  const mensajes = async () => (await t.j('GET', `/api/b/p/chats/${chat.id}`)).datos.mensajes;
  const nota = (n) => t.j('GET', `/api/b/p/note?name=${encodeURIComponent(n)}`);
  const ultimo = async () => (await mensajes()).filter((m) => m.role === 'assistant').at(-1);
  return { t, proveedor, chat, msg, mensajes, nota, ultimo };
}
const resultadosDe = (cuerpo) => cuerpo.messages.at(-1).content.filter((b) => b.type === 'tool_result');

test('bucle: el modelo busca, crea y conecta; recibe los resultados, sigue y el texto final se guarda con los cambios', async () => {
  const a = await conCerebro((cuerpo, n) => {
    if (n === 0) return { pensar: true, texto: 'Voy a guardarlo.', usos: [{ name: 'buscar_notas', input: { consulta: 'anáfora' } }] };
    if (n === 1) return { usos: [{ name: 'crear_nota', input: { nombre: 'Densidad métrica', carpeta: '60-Técnicas', tipo: 'metrica', texto: 'Sílabas por barra: 14 a 18 es denso.', enlaces: ['Anáfora', 'No existe'] } }, { name: 'conectar_notas', input: { origen: 'Niebla', destinos: ['Densidad métrica', 'Anáfora'], motivo: 'recurso' } }] };
    return { texto: 'Listo: creé la nota y la conecté.' };
  });
  const r = await a.msg('guarda esta métrica: sílabas por barra');
  assert.equal(a.proveedor.cuerpos.length, 3);
  assert.ok(a.proveedor.cuerpos[0].tools.length >= 10, 'el modelo recibe las herramientas');
  // la 2.ª llamada devuelve el pensamiento CON su firma, el texto y la herramienta pedida, y el resultado
  const ass = a.proveedor.cuerpos[1].messages.at(-2);
  assert.equal(ass.role, 'assistant'); assert.deepEqual(ass.content.map((b) => b.type), ['thinking', 'text', 'tool_use']);
  assert.equal(ass.content[0].signature, 'FIRMA'); assert.deepEqual(ass.content[2].input, { consulta: 'anáfora' });
  const res1 = resultadosDe(a.proveedor.cuerpos[1]); assert.equal(res1[0].tool_use_id, 'tu_0_buscar_notas'); assert.match(res1[0].content, /Anáfora/);
  const res2 = resultadosDe(a.proveedor.cuerpos[2]); assert.equal(res2.length, 2); assert.ok(!res2[0].is_error, res2[0].content);
  // el cerebro quedó modificado
  const n = (await a.nota('Densidad métrica')).datos;
  assert.match(n.text, /tipo: metrica/); assert.equal(n.folder, '60-Técnicas'); assert.ok(n.salientes.some((s) => s.name === 'Anáfora')); assert.ok(!/No existe/.test(n.text));
  assert.match((await a.nota('Niebla')).datos.text, /## Relacionadas[\s\S]*\[\[Densidad métrica\]\] — recurso/);
  // lo que ve el artista: texto de las dos rondas, cambios y usos sumados
  assert.match(r.texto, /Voy a guardarlo\.\n\nListo: creé la nota/);
  const done = r.eventos.find((e) => e.evento === 'am_done').datos;
  assert.equal(done.cambios.length, 2); assert.deepEqual(done.cambios.map((c) => c.tipo), ['crear', 'conectar']); assert.equal(done.uso.output_tokens, 150, 'se suma el uso de las 3 llamadas (50 cada una)');
  assert.ok(r.eventos.some((e) => e.evento === 'am_cambios'));
  const m = await a.ultimo();
  assert.match(m.content, /Voy a guardarlo\.\n\nListo/); assert.equal(m.meta.cambios.length, 2); assert.equal(m.meta.cambios[0].antes, undefined, 'el navegador no recibe los textos «antes»'); assert.equal(m.meta.cambios[0].deshacible, true);
});

test('borrar va a la papelera, deshacer lo restaura; las notas que mantiene la app no se tocan', async () => {
  const a = await conCerebro((cuerpo, n) => n === 0
    ? { usos: [{ name: 'borrar_nota', input: { nombre: 'niebla' } }, { name: 'borrar_nota', input: { nombre: 'Reglas aprendidas' } }, { name: 'renombrar_nota', input: { nombre: 'Reglas aprendidas', nuevo: 'X' } }, { name: 'herramienta_inventada', input: {} }] }
    : { texto: 'Hecho.' });
  await a.msg('borra Niebla');
  assert.equal((await a.nota('Niebla')).status, 404);
  const res = resultadosDe(a.proveedor.cuerpos[1]);
  assert.ok(!res[0].is_error); assert.ok(res[1].is_error && /mantiene la app/.test(res[1].content)); assert.ok(res[2].is_error); assert.ok(res[3].is_error && /No existe la herramienta/.test(res[3].content));
  assert.equal((await a.nota('Reglas aprendidas')).status, 200, 'la nota de la app sigue ahí');
  assert.ok((await a.t.j('GET', '/api/b/p/trash')).datos.notas?.some?.((x) => x.name === 'Niebla') ?? true);
  const m = await a.ultimo();
  const u = await a.t.j('POST', `/api/b/p/chats/${a.chat.id}/messages/${m.id}/undo`, {});
  assert.equal(u.status, 200); assert.deepEqual(u.datos.deshechos, [0]);
  assert.equal((await a.nota('Niebla')).status, 200, 'restaurada desde la papelera');
  assert.equal((await a.ultimo()).meta.cambios[0].deshecho, true);
  // deshacer dos veces no repite nada
  assert.deepEqual((await a.t.j('POST', `/api/b/p/chats/${a.chat.id}/messages/${m.id}/undo`, {})).datos.deshechos, []);
});

test('deshacer: ampliar y editar devuelven el texto anterior; crear tira la nota; mover y renombrar vuelven atrás', async () => {
  const a = await conCerebro((cuerpo, n) => n === 0
    ? { usos: [{ name: 'ampliar_nota', input: { nombre: 'Anáfora', texto: 'Variante nueva.' } }, { name: 'editar_nota', input: { nombre: 'Niebla', texto: '---\ntipo: cancion\n---\n# Niebla\n\nReescrita.' } }, { name: 'crear_nota', input: { nombre: 'Temporal', texto: 'x' } }, { name: 'mover_nota', input: { nombre: 'Eminem', carpeta: '55-Otros' } }, { name: 'renombrar_nota', input: { nombre: 'Nota suelta larga', nuevo: 'Suelta' } }] }
    : { texto: 'Hecho.' });
  const antesAnafora = (await a.nota('Anáfora')).datos.text, antesNiebla = (await a.nota('Niebla')).datos.text;
  await a.msg('haz cambios');
  assert.match((await a.nota('Anáfora')).datos.text, /Variante nueva\./); assert.match((await a.nota('Niebla')).datos.text, /Reescrita\./);
  assert.equal((await a.nota('Eminem')).datos.folder, '55-Otros'); assert.equal((await a.nota('Suelta')).status, 200);
  const m = await a.ultimo();
  const u = (await a.t.j('POST', `/api/b/p/chats/${a.chat.id}/messages/${m.id}/undo`, {})).datos;
  assert.deepEqual(u.deshechos.sort(), [0, 1, 2, 3, 4], JSON.stringify(u.saltados));
  assert.equal((await a.nota('Anáfora')).datos.text, antesAnafora); assert.equal((await a.nota('Niebla')).datos.text, antesNiebla);
  assert.equal((await a.nota('Temporal')).status, 404); assert.equal((await a.nota('Eminem')).datos.folder, '50-Referentes');
  assert.equal((await a.nota('Nota suelta larga')).status, 200); assert.equal((await a.nota('Suelta')).status, 404);
});

test('quitar_enlace desconecta dos notas; anadir_regla guarda en «Reglas aprendidas»; salud_del_cerebro informa', async () => {
  const a = await conCerebro((cuerpo, n) => n === 0
    ? { usos: [{ name: 'quitar_enlace', input: { origen: 'Anáfora', destino: 'Niebla' } }, { name: 'anadir_regla', input: { nunca: 'Explicar la metáfora.', siempre: 'Dejar la imagen.' } }, { name: 'salud_del_cerebro', input: {} }] }
    : { texto: 'Listo.' });
  await a.msg('desconecta Anáfora de Niebla');
  assert.doesNotMatch((await a.nota('Anáfora')).datos.text, /\[\[Niebla\]\]/); assert.match((await a.nota('Anáfora')).datos.text, /Ver Niebla y/);
  assert.match((await a.nota('Reglas aprendidas')).datos.text, /NUNCA: Explicar la metáfora\./);
  assert.match(resultadosDe(a.proveedor.cuerpos[1])[2].content, /huerfanas/);
});

test('topes: no más de 25 borrados por mensaje; el exceso vuelve como error y no se borra', async () => {
  const a = await conCerebro((cuerpo, n) => n === 0
    ? { usos: Array.from({ length: 27 }, (_, i) => ({ name: 'borrar_nota', input: { nombre: `Relleno ${i}` } })) }
    : { texto: 'Seguiré en otro mensaje.' });
  const notas = Array.from({ length: 27 }, (_, i) => ({ nombre: `Relleno ${i}`, carpeta: '99', texto: `---\ntipo: idea\n---\nnota ${i}` }));
  for (let k = 0; k < notas.length; k += 12) await a.t.j('POST', '/api/b/p/import/notas', { notas: notas.slice(k, k + 12) });
  await a.msg('borra todo el relleno');
  const res = resultadosDe(a.proveedor.cuerpos[1]);
  assert.equal(res.filter((r) => !r.is_error).length, 25); assert.equal(res.filter((r) => r.is_error && /Tope de 25/.test(r.content)).length, 2);
  assert.equal((await a.nota('Relleno 24')).status, 404); assert.equal((await a.nota('Relleno 25')).status, 200); assert.equal((await a.nota('Relleno 26')).status, 200);
});

test('sin herramientas: con el ajuste apagado, en el constructor de letras y con un modelo que entrena', async () => {
  const a = await conCerebro(() => ({ texto: 'Solo texto.' }), { extra: { META_API_KEY: 'm' } });
  await a.msg('hola'); assert.ok(a.proveedor.cuerpos[0].tools, 'por defecto sí');
  await a.t.j('PUT', '/api/settings', { escritura_ia: false });
  await a.msg('hola otra vez'); assert.equal(a.proveedor.cuerpos[1].tools, undefined, 'apagado en Ajustes');
  await a.t.j('PUT', '/api/settings', { escritura_ia: true });
  await a.msg('', { fn: 'letra', brief: { titulo: 'x' } }); assert.equal(a.proveedor.cuerpos[2].tools, undefined, 'escribir letras no modifica el cerebro');
  assert.match(a.proveedor.cuerpos[1].system.map((b) => b.text).join(''), /Si el artista te explica conceptos/);
  assert.match(a.proveedor.cuerpos[0].system.map((b) => b.text).join(''), /CANAL EN LOS DOS SENTIDOS/);
});

test('un modelo que entrena nunca recibe herramientas (ni notas privadas)', async () => {
  const p = proveedorFalso({ respuesta: 'ok' });
  const t = await entorno({ proveedor: p, extra: { META_API_KEY: 'm' } });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  assert.equal((await t.j('PUT', '/api/settings', { entrena: true, funciones: { chat: 'muse-spark-1.3-contributor' } })).status, 200);
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto: 'borra Niebla', anclas: [], modo: null }); await t.esperar();
  assert.ok(p.peticiones.length && p.peticiones.every((x) => x.cuerpo.tools === undefined));
  assert.equal((await t.j('GET', `/api/b/p/note?name=Niebla`)).status, 200);
});

test('rondas: si el modelo no deja de pedir herramientas, se corta en 6 y se avisa', async () => {
  const a = await conCerebro(() => ({ texto: 'otra vuelta', usos: [{ name: 'listar_notas', input: {} }] }));
  const r = await a.msg('sigue sin parar');
  assert.equal(a.proveedor.cuerpos.length, 6);
  const done = r.eventos.find((e) => e.evento === 'am_done').datos; assert.equal(done.parada, 'max_rondas');
});

test('en conversación libre no se pregunta el modo salvo que pidan escribir algo', async () => {
  const a = await conCerebro(() => ({ texto: 'Ok.' }));
  const r1 = await a.msg('guarda esta idea: la densidad se mide en sílabas por barra');
  assert.equal(r1.eventos.find((e) => e.evento === 'am_context').datos.modo.pregunta, false);
  assert.doesNotMatch(a.proveedor.cuerpos[0].system.map((b) => b.text).join(''), /Modo del encargo: INCIERTO/);
  const r2 = await a.msg('escríbeme una letra sobre el mar');
  assert.equal(r2.eventos.find((e) => e.evento === 'am_context').datos.modo.pregunta, true);
});

test('REPRODUCCIÓN: un modelo que solo lee notas y nunca escribe texto no deja el mensaje en el aire', async () => {
  const a = await conCerebro((cuerpo, n) => (cuerpo.tool_choice?.type === 'none' ? { texto: 'Con lo que leí, esto es lo que te propongo.' } : { usos: [{ name: 'leer_nota', input: { nombre: 'Anáfora' } }] }));
  const r = await a.msg('si se puede mezclar de forma libre');
  const m = await a.ultimo();
  assert.ok(m, 'quedó una respuesta guardada (antes solo quedaba tu mensaje)');
  assert.match(m.content, /Con lo que leí/, 'en la última vuelta se le obliga a contestar en texto');
  assert.ok(a.proveedor.cuerpos.length <= 6, 'no da más de 6 vueltas: ' + a.proveedor.cuerpos.length);
  assert.equal(a.proveedor.cuerpos.at(-1).tool_choice.type, 'none');
  assert.ok(a.proveedor.cuerpos.at(-1).tools, 'sigue declarando las herramientas (la API lo exige si hay bloques de herramienta en el historial)');
  assert.ok(r.eventos.some((e) => e.evento === 'am_paso'), 'se avisa de lo que está haciendo (leyendo notas)');
});

test('REPRODUCCIÓN: un error sin ningún texto tampoco borra la respuesta: queda guardada con el aviso', async () => {
  const proveedor = async () => new Response(JSON.stringify({ error: { message: 'Overloaded' } }), { status: 529 });
  const a = await conCerebro(() => ({}), {});
  a.t; // (el entorno usa su propio proveedor: aquí se prueba con otro)
  const b = await (async () => { const t = await entorno({ proveedor }); await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } }); await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA }); const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion; return { t, chat }; })();
  await b.t.flujo(`/api/b/p/chats/${b.chat.id}/message`, { fn: 'chat', texto: 'hola', anclas: [], modo: null }); await b.t.esperar();
  const ms = (await b.t.j('GET', `/api/b/p/chats/${b.chat.id}`)).datos.mensajes;
  const bot = ms.filter((m) => m.role === 'assistant').at(-1);
  assert.ok(bot, 'quedó la respuesta con el error');
  assert.match(bot.meta.error, /saturado/);
});
