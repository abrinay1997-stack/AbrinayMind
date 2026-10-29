import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, proveedorFalso, BOVEDA_CHICA } from './helpers.mjs';

const LETRA = '[INTRO]\nCamino por la estación cuando nadie llega\n\n[CORO]\nEl silencio que me abraza\n\n## Notas técnicas\nRima: -ube. Anáfora: ninguna.\nNotas que pesaron: Niebla, Anáfora';

async function conBoveda(opciones = {}) {
  const t = await entorno(opciones);
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'prueba', nombre: 'Prueba', subtitulo: 'artista de prueba' } });
  await t.j('POST', '/api/b/prueba/import/notas', { notas: BOVEDA_CHICA });
  await t.j('POST', '/api/b/prueba/menciones', { desde: 0, cuantas: 60 });
  const chat = (await t.j('POST', '/api/b/prueba/chats', {})).datos.conversacion;
  return { ...t, chat, msg: (cuerpo) => t.flujo(`/api/b/prueba/chats/${chat.id}/message`, cuerpo) };
}

test('modelos: el catálogo no filtra llaves; Contributor exige permiso explícito; las funciones se validan', async () => {
  const t = await entorno({ extra: { META_API_KEY: 'meta-secreta-xyz' } });
  const m = await t.j('GET', '/api/models');
  assert.equal(m.status, 200); assert.doesNotMatch(JSON.stringify(m.datos), /sk-ant-prueba|meta-secreta-xyz/, 'ningún valor secreto sale en la API');
  assert.ok(m.datos.proveedores.every((p) => p.configurada)); assert.ok(m.datos.catalogo.find((x) => x.id === 'muse-spark-1.3-contributor').entrena);
  assert.ok(m.datos.funciones.some((f) => f.id === 'letra' && f.actual === 'claude-sonnet-5-5'));
  const sin = await t.j('PUT', '/api/settings', { funciones: { borrador: 'muse-spark-1.3-contributor' } });
  assert.equal(sin.status, 400); assert.match(sin.datos.error, /entrena/);
  assert.equal((await t.j('PUT', '/api/settings', { funciones: { magia: 'claude-sonnet-5-5' } })).status, 400);
  assert.equal((await t.j('PUT', '/api/settings', { funciones: { letra: 'gpt-9' } })).status, 400);
  assert.equal((await t.j('PUT', '/api/settings', { profundidad: 'enorme' })).status, 400);
  const bien = await t.j('PUT', '/api/settings', { entrena: true, funciones: { borrador: 'muse-spark-1.3-contributor' }, profundidad: 'profunda', tope_mensual_usd: 5 });
  assert.equal(bien.status, 200); assert.equal(bien.datos.ajustes.funciones.borrador, 'muse-spark-1.3-contributor');
});

test('constructor: arma el contexto (siempre + modo + búsqueda + vecinas), llama con caché y guarda la conversación', async () => {
  const t = await conBoveda({ proveedor: proveedorFalso({ respuesta: LETRA }) });
  const r = await t.msg({ brief: { titulo: 'Tren vacío', tema: 'el aislamiento elegido y la soledad', genero: 'hip-hop', bpm: 88, modo: 'Modo 1 — Introspectivo', semillas: 'Camino por la estación cuando nadie llega' } });
  assert.equal(r.status, 200); assert.equal(r.texto, LETRA); assert.equal(r.error, undefined);
  assert.deepEqual(r.contexto.fijas.sort(), ['Reglas aprendidas', 'Reglas de oro']);
  const leidas = r.contexto.leidas.map((x) => x.nombre);
  assert.ok(leidas.includes('Modo 1 — Introspectivo') && leidas.includes('Niebla'), 'el modo y la canción que lo ejemplifica');
  assert.ok(leidas.includes('Anáfora'), 'la técnica se despierta por el enlace del modo');
  assert.equal(r.contexto.modo.origen, 'elegido');
  const llamada = t.proveedor.peticiones.at(-1);
  assert.match(llamada.url, /api\.anthropic\.com\/v1\/messages$/); assert.equal(llamada.cabeceras['x-api-key'], 'sk-ant-prueba'); assert.equal(llamada.cuerpo.stream, true);
  assert.equal(llamada.cuerpo.system[0].cache_control.type, 'ephemeral', 'la parte fija va con caché de prompt');
  assert.match(llamada.cuerpo.system[0].text, /<memoria_fija>/); assert.match(llamada.cuerpo.system[0].text, /Cerrar sin resolver/); assert.match(llamada.cuerpo.system[0].text, /semilla\) nunca explicar de más/);
  assert.match(llamada.cuerpo.system[1].text, /<recuperado>[\s\S]*<nota nombre="Niebla"/);
  assert.doesNotMatch(llamada.cuerpo.system[0].text, /Marea/, 'lo recuperado no va en la parte con caché');
  const u = llamada.cuerpo.messages.at(-1); assert.equal(u.role, 'user'); assert.match(u.content, /ENCARGO DE LETRA[\s\S]*Introspectivo-Psicológico[\s\S]*NO TOCAR[\s\S]*la estación/);
  // costo: 1000 de entrada y 200 de salida con Sonnet (2 y 10 US$/M)
  assert.ok(Math.abs(r.fin.usd - 0.004) < 1e-9);
  const conv = (await t.j('GET', `/api/b/prueba/chats/${t.chat.id}`)).datos;
  assert.deepEqual(conv.mensajes.map((m) => m.role), ['user', 'assistant']); assert.equal(conv.title, 'Tren vacío');
  assert.equal(conv.mensajes[1].content, LETRA); assert.ok(conv.mensajes[1].meta.leidas.length >= 3);
  const g = (await t.j('GET', '/api/models')).datos.gasto; assert.equal(g.mes.llamadas, 1); assert.equal(g.porModelo[0].model, 'claude-sonnet-5-5');
});

test('modo: se detecta por las palabras; si no está claro, el cerebro pregunta en vez de escribir', async () => {
  const t = await conBoveda({ proveedor: proveedorFalso({ respuesta: '¿Qué modo?' }) });
  const det = await t.msg({ brief: { tema: 'algo profundo, con capas, sobre mi identidad' } });
  assert.equal(det.contexto.modo.origen, 'detectado'); assert.equal(det.contexto.modo.nota, 'Modo 1 — Introspectivo');
  const duda = await t.msg({ brief: { tema: 'una canción sobre el mar' } });
  assert.equal(duda.contexto.modo.pregunta, true); assert.equal(duda.contexto.modo.origen, 'incierto');
  const sis = t.proveedor.peticiones.at(-1).cuerpo;
  assert.match(sis.system[1].text, /Modos disponibles: «Introspectivo-Psicológico», «Técnico-Batalla»/); assert.match(sis.system[1].text, /Modo del encargo: INCIERTO/);
  assert.match(sis.messages.at(-1).content, /INCIERTO — pregunta antes de escribir/);
  const forzado = await t.msg({ brief: { tema: 'una canción sobre el mar', modo: 'preguntar' } });
  assert.equal(forzado.contexto.modo.origen, 'preguntar');
});

test('chat libre: usa el historial y la memoria; el mensaje vacío se rechaza', async () => {
  const t = await conBoveda({ proveedor: proveedorFalso({ respuesta: 'Te propongo una anáfora.' }) });
  assert.equal((await t.msg({ texto: '   ' })).status, 400);
  const a = await t.msg({ texto: '¿Cómo uso la anáfora en una letra?' });
  assert.ok(a.contexto.leidas.some((x) => x.nombre === 'Anáfora'));
  await t.msg({ texto: 'Dame otra idea' });
  const enviado = t.proveedor.peticiones.at(-1).cuerpo.messages;
  assert.deepEqual(enviado.map((m) => m.role), ['user', 'assistant', 'user']); assert.equal(enviado[1].content, 'Te propongo una anáfora.');
  assert.equal((await t.j('PATCH', `/api/b/prueba/chats/${t.chat.id}`, { title: 'Ideas de anáfora' })).status, 200);
  assert.equal((await t.j('GET', '/api/b/prueba/chats')).datos.conversaciones[0].title, 'Ideas de anáfora');
  assert.equal((await t.j('DELETE', `/api/b/prueba/chats/${t.chat.id}`)).status, 200);
  assert.equal((await t.j('GET', `/api/b/prueba/chats/${t.chat.id}`)).status, 404);
});

test('modelos que entrenan: bloqueados sin permiso, sin notas privadas con permiso, y Muse contesta de una vez', async () => {
  const t = await conBoveda({ extra: { META_API_KEY: 'meta-secreta-xyz' }, proveedor: proveedorFalso({ respuesta: 'Letra de Muse.' }) });
  const pedido = { texto: 'Escribe sobre la batalla', model: 'muse-spark-1.3-contributor', anclas: ['Marea', 'Niebla'] };
  const sin = await t.msg(pedido);
  assert.equal(sin.status, 409); assert.equal(sin.datos.codigo, 'entrena');
  await t.j('PUT', '/api/settings', { entrena: true });
  const con = await t.msg(pedido);
  assert.equal(con.status, 200); assert.equal(con.texto, 'Letra de Muse.'); assert.equal(con.contexto.modelo.entrena, true);
  const peticion = t.proveedor.peticiones.at(-1);
  assert.match(peticion.url, /api\.meta\.ai\/v1\/messages$/); assert.equal(peticion.cabeceras.authorization, 'Bearer meta-secreta-xyz'); assert.equal(peticion.cuerpo.stream, undefined, 'Muse no usa streaming');
  assert.equal(typeof peticion.cuerpo.system, 'string');
  assert.doesNotMatch(peticion.cuerpo.system, /<nota nombre="Marea"/, 'la nota privada nunca viaja a un modelo que entrena');
  assert.match(peticion.cuerpo.system, /<nota nombre="Niebla"/);
  assert.ok(con.contexto.omitidas.privadas.includes('Marea'));
  assert.ok(con.fin.usd < 0.001, 'Contributor cuesta una fracción');
  // con Claude la misma nota privada SÍ entra
  const claude = await t.msg({ texto: 'Escribe sobre la batalla', anclas: ['Marea'] });
  assert.ok(claude.contexto.leidas.some((x) => x.nombre === 'Marea'));
  assert.match(t.proveedor.peticiones.at(-1).cuerpo.system[1].text, /<nota nombre="Marea"/);
});

test('llaves y topes: sin llave se dice cuál falta; el tope mensual frena; los errores del proveedor no filtran secretos', async () => {
  const sinLlave = await conBoveda({ extra: { ANTHROPIC_API_KEY: '' } });
  const r = await sinLlave.msg({ texto: 'hola' });
  assert.equal(r.status, 503); assert.match(r.datos.error, /ANTHROPIC_API_KEY/);
  const cae = await conBoveda({ extra: { ANTHROPIC_API_KEY: '', META_API_KEY: 'meta-xyz' }, proveedor: proveedorFalso({ respuesta: 'con Muse' }) });
  const c = await cae.msg({ texto: 'hola' });
  assert.equal(c.status, 200); assert.equal(c.contexto.modelo.id, 'muse-spark-1.3'); assert.match(c.contexto.avisos[0], /Falta ANTHROPIC_API_KEY/);

  const t = await conBoveda({ proveedor: proveedorFalso({ respuesta: 'ok' }) });
  await t.j('PUT', '/api/settings', { tope_mensual_usd: 0.001 });
  assert.equal((await t.msg({ texto: 'primera' })).status, 200);
  const topada = await t.msg({ texto: 'segunda' });
  assert.equal(topada.status, 402); assert.match(topada.datos.error, /tope del mes/);

  const roto = await conBoveda({ proveedor: proveedorFalso({ estado: 500 }) });
  const e = await roto.msg({ texto: 'hola' });
  assert.equal(e.status, 200); assert.ok(e.error, 'el error llega como evento'); assert.doesNotMatch(JSON.stringify(e), /sk-secreto123|sk-ant-prueba/);
  const mal = await conBoveda({ proveedor: proveedorFalso({ estado: 401 }) });
  assert.match((await mal.msg({ texto: 'hola' })).error.error, /rechazó la llave/);
});

test('aprender: aprobar crea una neurona enlazada, anota la puntuación y refuerza las sinapsis de lo leído', async () => {
  const t = await conBoveda({ proveedor: proveedorFalso({ respuesta: LETRA }) });
  const r = await t.msg({ brief: { titulo: 'Tren vacío', tema: 'el aislamiento elegido', modo: 'Modo 1 — Introspectivo', genero: 'hip-hop' } });
  const conv = (await t.j('GET', `/api/b/prueba/chats/${t.chat.id}`)).datos;
  const mensajeId = conv.mensajes.at(-1).id;
  const s = (await t.j('POST', '/api/b/prueba/songs', { titulo: 'Tren vacío', mensajeId })).datos.cancion;
  assert.equal(s.status, 'borrador'); assert.ok(s.used.length >= 3); assert.equal(s.model, 'claude-sonnet-5-5');
  const v = await t.j('POST', `/api/b/prueba/songs/${s.id}/verdict`, { resultado: 'aprobada', puntuacion: 9, comentario: 'Se siente mío' });
  assert.equal(v.status, 200); assert.equal(v.datos.nota, 'Tren vacío'); assert.ok(v.datos.aprendio.sinapsis >= 1);
  const nota = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Tren vacío'))).datos;
  assert.equal(nota.folder, '40-Canciones/Generadas'); assert.match(nota.text, /puntuacion: 9/); assert.match(nota.text, /modo: \[\[Modo 1 — Introspectivo\]\]/);
  assert.ok(nota.salientes.some((x) => x.target === 'Niebla' && x.existe), 'la letra queda enlazada a lo que se leyó');
  assert.ok(nota.text.includes('El silencio que me abraza') && nota.text.includes('## Notas técnicas'));
  assert.deepEqual((await t.j('GET', '/api/b/prueba/quality')).datos.rotos.map((x) => x.hacia), ['Nota que no existe'], 'el veredicto no rompe enlaces');
  const punt = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Puntuaciones reales')));
  assert.equal(punt.status, 200, 'la nota de puntuaciones se crea si faltaba');
  assert.match(punt.datos.text, /## Nuevas puntuaciones\n\n- \d{4}-\d{2}-\d{2} · \[\[Tren vacío\]\] · 9\/10 — Se siente mío/);
  const ap = (await t.j('GET', '/api/b/prueba/learned')).datos;
  assert.ok(ap.sinapsis.length >= 1 && ap.sinapsis.every((x) => x.peso > 0)); assert.ok(ap.pesos.some((x) => x.peso > 0));
  assert.ok(!ap.sinapsis.some((x) => x.a === 'Reglas de oro' || x.b === 'Reglas de oro'), 'las notas «siempre» no se emparejan: están en todos los prompts');
  const g = (await t.j('GET', '/api/b/prueba/graph')).datos; assert.ok(g.learned.length >= 1);
  // lo aprendido pesa en la siguiente búsqueda y se puede olvidar
  assert.equal((await t.j('POST', '/api/b/prueba/learned/reset', {})).status, 200);
  assert.equal((await t.j('GET', '/api/b/prueba/learned')).datos.sinapsis.length, 0);
  assert.equal((await t.j('POST', `/api/b/prueba/songs/${s.id}/verdict`, { resultado: 'quizás' })).status, 400);
  assert.equal((await t.j('POST', `/api/b/prueba/songs/${s.id}/verdict`, { resultado: 'aprobada', puntuacion: 11 })).status, 400);
});

test('aprender: rechazar abre una entrada en la bitácora, propone una regla y, aceptada, el cerebro la lee en la siguiente letra', async () => {
  const proveedor = proveedorFalso({ respuesta: (c) => (JSON.stringify(c.system).includes('editor de la memoria') ? '{"nunca":"explicar la metáfora en el verso siguiente","siempre":"dejar que la imagen hable sola"}' : LETRA) });
  const t = await conBoveda({ proveedor });
  await t.msg({ brief: { titulo: 'Tren vacío', tema: 'aislamiento', modo: 'Modo 1 — Introspectivo' } });
  const mensajeId = (await t.j('GET', `/api/b/prueba/chats/${t.chat.id}`)).datos.mensajes.at(-1).id;
  const s = (await t.j('POST', '/api/b/prueba/songs', { titulo: 'Tren vacío', mensajeId })).datos.cancion;
  const v = await t.j('POST', `/api/b/prueba/songs/${s.id}/verdict`, { resultado: 'rechazada', puntuacion: 4, comentario: 'Explica demasiado, no deja respirar', formulario: { diagnostico: ['Demasiado explícito'], secciones: { CORO: { estado: 'mal', queMal: 'dice lo que ya dijo el verso' } }, nunca: 'el tren como metáfora del aislamiento dicho en voz alta', instruccion: 'Menos explicación' } });
  assert.equal(v.status, 200); assert.equal(v.datos.nota, 'Error 1 — Tren vacío (4 de 10)');
  assert.deepEqual(v.datos.propuesta, { nunca: 'explicar la metáfora en el verso siguiente', siempre: 'dejar que la imagen hable sola' });
  const err = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent(v.datos.nota))).datos;
  assert.equal(err.folder, '70-Aprendizaje/Errores'); assert.match(err.text, /Demasiado explícito/); assert.match(err.text, /\*\*CORO:\*\* mal — dice lo que ya dijo el verso/); assert.match(err.text, /Regla aprendida \(propuesta\)/);
  assert.equal((await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Bitácora de errores'))).status, 200, 'la bitácora se crea si no existía');
  assert.match((await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Bitácora de errores'))).datos.text, /- \[\[Error 1 — Tren vacío \(4 de 10\)\]\]/);
  // aceptar la regla → Reglas aprendidas (una nota «siempre»)
  const ac = await t.j('POST', '/api/b/prueba/rules', { ...v.datos.propuesta, error: v.datos.nota });
  assert.equal(ac.status, 200);
  const reglas = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Reglas aprendidas'))).datos.text;
  assert.match(reglas, /🔴 NUNCA: explicar la metáfora en el verso siguiente 🟢 SIEMPRE: dejar que la imagen hable sola/); assert.match(reglas, /\[\[Error 1 — Tren vacío \(4 de 10\)\]\]/);
  await t.msg({ texto: 'otra idea' });
  assert.match(proveedor.peticiones.at(-1).cuerpo.system[0].text, /dejar que la imagen hable sola/, 'la regla aceptada ya viaja en la memoria fija');
  // un segundo rechazo numera Error 2
  const s2 = (await t.j('POST', '/api/b/prueba/songs', { titulo: 'Otra', texto: 'letra' })).datos.cancion;
  assert.equal((await t.j('POST', `/api/b/prueba/songs/${s2.id}/verdict`, { resultado: 'rechazada' })).datos.nota, 'Error 2 — Otra');
  assert.equal((await t.j('POST', '/api/b/prueba/rules', { nunca: '', siempre: '' })).status, 400);
});

test('conectar con IA: solo propone nombres de la lista, y aplicar respeta la revisión de la nota', async () => {
  const proveedor = proveedorFalso({ respuesta: '{"conexiones":[{"nota":"Anáfora","motivo":"habla de anáfora"},{"nota":"Inventada","motivo":"no existe"},{"nota":"Eminem","motivo":"él la nombra"}]}' });
  const t = await conBoveda({ proveedor });
  const s = (await t.j('POST', '/api/b/prueba/connect/suggest', { limite: 5 })).datos;
  const suelta = s.items.find((i) => i.nota === 'Nota suelta larga');
  assert.ok(suelta, 'las notas sin enlaces son candidatas'); assert.ok(!suelta.destinos.some((d) => d.nombre === 'Inventada'), 'un nombre que no estaba en la lista se descarta');
  assert.ok(suelta.destinos.some((d) => d.nombre === 'Anáfora'));
  const aplicado = await t.j('POST', '/api/b/prueba/connect/apply', { items: [{ nota: suelta.nota, updated: suelta.updated, destinos: suelta.destinos.map((d) => d.nombre) }] });
  assert.equal(aplicado.datos.hechas[0].nota, 'Nota suelta larga');
  const n = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Nota suelta larga'))).datos;
  assert.match(n.text, /## Relacionadas\n\n- \[\[Anáfora\]\]/); assert.ok(n.salientes.some((x) => x.target === 'Anáfora' && x.existe));
  const vieja = await t.j('POST', '/api/b/prueba/connect/apply', { items: [{ nota: 'Nota suelta larga', updated: suelta.updated, destinos: ['Eminem'] }] });
  assert.equal(vieja.datos.hechas.length, 0); assert.match(vieja.datos.saltadas[0].motivo, /cambió/);
});
