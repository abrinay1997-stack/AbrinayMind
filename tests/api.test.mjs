import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA } from './helpers.mjs';

/** Un cerebro «prueba» con la bóveda chica ya importada. */
async function conBoveda(opciones) {
  const t = await entorno(opciones);
  const c = await t.j('POST', '/api/brains/import', { cerebro: { slug: 'prueba', nombre: 'Prueba', subtitulo: 'artista de prueba', color: '#8b5cf6' } });
  assert.equal(c.status, 200);
  const s = await t.j('POST', '/api/b/prueba/import/notas', { notas: BOVEDA_CHICA });
  assert.equal(s.status, 200, JSON.stringify(s.datos)); assert.equal(s.datos.nuevas, BOVEDA_CHICA.length);
  const m = await t.j('POST', '/api/b/prueba/menciones', { desde: 0, cuantas: 60 });
  assert.equal(m.status, 200);
  return t;
}

test('acceso: sin sesión nada se lee; la contraseña se compara bien; hay tope de intentos y cabecera x-am', async () => {
  const t = await entorno({ entrar: false });
  assert.equal((await t.j('GET', '/api/health')).datos.sesion, false);
  assert.equal((await t.j('GET', '/api/brains')).status, 401);
  assert.equal((await t.j('POST', '/api/login', { password: 'mala' })).status, 401);
  assert.equal((await t.j('POST', '/api/brains', { name: 'X' }, { sinX: true })).status, 403, 'sin x-am no se puede cambiar nada');
  assert.equal((await t.j('POST', '/api/brains', { name: 'X' }, { cabeceras: { origin: 'https://otro.sitio' } })).status, 403);
  const ok = await t.j('POST', '/api/login', { password: 'clave-de-prueba' });
  assert.equal(ok.status, 200); assert.match(ok.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await t.j('GET', '/api/brains')).status, 200);
  assert.equal((await t.j('GET', '/api/health')).datos.sesion, true);
  await t.j('POST', '/api/logout', {});
  assert.equal((await t.j('GET', '/api/brains')).status, 401);
  for (let i = 0; i < 8; i++) await t.j('POST', '/api/login', { password: 'mala' });
  assert.equal((await t.j('POST', '/api/login', { password: 'clave-de-prueba' })).status, 429, 'tras 8 fallos ni la buena entra');
});

test('acceso: sin APP_PASSWORD o con un SESSION_SECRET corto el login dice qué falta', async () => {
  const t = await entorno({ entrar: false, extra: { APP_PASSWORD: '' } });
  const r = await t.j('POST', '/api/login', { password: 'x' });
  assert.equal(r.status, 503); assert.match(r.datos.error, /APP_PASSWORD/);
  assert.equal((await t.j('GET', '/api/health')).datos.acceso, false);
});

test('una cookie manipulada no entra', async () => {
  const t = await entorno({ entrar: false });
  const r = await t.api('GET', '/api/brains', undefined, { cabeceras: { cookie: 'am_session=eyJleHAiOjk5OTk5OTk5OTk5OTl9.firmafalsa' } });
  assert.equal(r.status, 401);
});

test('cerebros: crear con plantilla, listar, cambiar y borrar escribiendo su identificador', async () => {
  const t = await entorno();
  const c = await t.j('POST', '/api/brains', { name: 'Artista Dos', subtitle: 'artista · MC', color: '#ec4899' });
  assert.equal(c.status, 200); assert.equal(c.datos.cerebro.slug, 'artista-dos');
  assert.equal((await t.j('POST', '/api/brains', { name: 'Artista Dos' })).status, 409);
  assert.equal((await t.j('POST', '/api/brains', { name: 'X', color: 'rojo' })).status, 400);
  const meta = await t.j('GET', '/api/b/artista-dos/meta');
  assert.ok(meta.datos.stats.notas >= 8, 'la plantilla trae notas'); assert.ok(meta.datos.siempre.includes('Reglas de oro — SIEMPRE'));
  const q = await t.j('GET', '/api/b/artista-dos/quality');
  assert.equal(q.datos.rotos.length, 0, 'la plantilla no deja enlaces rotos');
  assert.equal((await t.j('PATCH', '/api/brains/artista-dos', { name: 'Artista', color: '#111111' })).datos.cerebro.name, 'Artista');
  assert.equal((await t.j('DELETE', '/api/brains/artista-dos', { confirm: 'otro' })).status, 400);
  assert.equal((await t.j('DELETE', '/api/brains/artista-dos', { confirm: 'artista-dos' })).status, 200);
  assert.equal((await t.j('GET', '/api/b/artista-dos/meta')).status, 404);
  assert.equal((await t.j('GET', '/api/brains')).datos.cerebros.length, 0);
});

test('notas: crear, leer con enlaces y menciones, enlaces rotos que se resuelven al crear el destino', async () => {
  const t = await conBoveda();
  const a = await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Anáfora'));
  assert.deepEqual(a.datos.salientes.map((s) => [s.target, s.existe]).sort(), [['Niebla', true], ['Nota que no existe', false]]);
  assert.ok(a.datos.entrantes.includes('Índice') && a.datos.entrantes.includes('Niebla'));
  const q1 = await t.j('GET', '/api/b/prueba/quality');
  assert.deepEqual(q1.datos.rotos, [{ desde: 'Anáfora', hacia: 'Nota que no existe' }]);
  assert.ok(q1.datos.huerfanas.includes('Nota suelta larga') && q1.datos.huerfanas.includes('Eminem'), 'sin [[enlaces]] explícitos son neuronas solas (aunque haya menciones)');
  const crear = await t.j('POST', '/api/b/prueba/note', { name: 'Nota que no existe', carpeta: '90-Proyectos', text: '---\ntipo: proyecto\n---\nAhora sí existe, y habla de [[Anáfora]].' });
  assert.equal(crear.status, 200);
  assert.deepEqual((await t.j('GET', '/api/b/prueba/quality')).datos.rotos, [], 'el enlace roto apunta a la nota nueva');
  assert.equal((await t.j('POST', '/api/b/prueba/note', { name: 'nota que NO existe', text: 'x' })).status, 409, 'el nombre repetido choca aunque cambien mayúsculas');
  assert.equal((await t.j('POST', '/api/b/prueba/note', { name: 'Mala/ruta', text: 'x' })).status, 400);
  assert.equal((await t.j('GET', '/api/b/prueba/note?name=Nada')).status, 404);
});

test('notas: editar con revisión (409 si otro cambió), añadir a una sección y mover', async () => {
  const t = await conBoveda();
  const n = (await t.j('GET', '/api/b/prueba/note?name=Eminem')).datos;
  const g1 = await t.j('PUT', '/api/b/prueba/note', { name: 'Eminem', text: n.text + '\nUna línea más con [[Niebla]].', base: n.updated });
  assert.equal(g1.status, 200); assert.ok(g1.datos.updated > n.updated);
  const g2 = await t.j('PUT', '/api/b/prueba/note', { name: 'Eminem', text: 'pisando', base: n.updated });
  assert.equal(g2.status, 409); assert.match(g2.datos.error, /Otra persona/);
  assert.equal((await t.j('PUT', '/api/b/prueba/note', { name: 'Eminem', text: '   ', base: g1.datos.updated })).status, 400);
  assert.ok((await t.j('GET', '/api/b/prueba/note?name=Niebla')).datos.entrantes.includes('Eminem'));
  const ap = await t.j('POST', '/api/b/prueba/note/append', { name: 'Reglas aprendidas', text: '- nueva regla', seccion: 'Reglas' });
  assert.equal(ap.status, 200);
  assert.match((await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Reglas aprendidas'))).datos.text, /semilla\) nunca explicar de más\.\n\n- nueva regla/);
  assert.equal((await t.j('POST', '/api/b/prueba/note/move', { name: 'Eminem', carpeta: '50-Referentes/Rap' })).datos.folder, '50-Referentes/Rap');
  assert.equal((await t.j('POST', '/api/b/prueba/note/move', { name: 'Eminem', carpeta: 'a/b/c/d' })).status, 400);
});

test('notas: renombrar reescribe los [[enlaces]] de quienes la nombraban; la papelera guarda y restaura', async () => {
  const t = await conBoveda();
  const r = await t.j('POST', '/api/b/prueba/note/rename', { name: 'Niebla', nuevo: 'Niebla (original)' });
  assert.equal(r.status, 200); assert.ok(r.datos.reescritas >= 3);
  const ind = (await t.j('GET', '/api/b/prueba/note?name=' + encodeURIComponent('Índice'))).datos;
  assert.match(ind.text, /\[\[Niebla \(original\)\]\]/); assert.doesNotMatch(ind.text, /\[\[Niebla\]\]/);
  assert.deepEqual((await t.j('GET', '/api/b/prueba/quality')).datos.rotos.map((x) => x.hacia), ['Nota que no existe'], 'ningún enlace se rompió por el cambio de nombre');
  assert.equal((await t.j('POST', '/api/b/prueba/note/rename', { name: 'Eminem', nuevo: 'marea' })).status, 409);
  // papelera
  const base = (await t.j('GET', '/api/b/prueba/note?name=Eminem')).datos.updated;
  assert.equal((await t.j('POST', '/api/b/prueba/note/trash', { name: 'Eminem', base: base - 5 })).status, 409);
  assert.equal((await t.j('POST', '/api/b/prueba/note/trash', { name: 'Eminem', base })).status, 200);
  assert.equal((await t.j('GET', '/api/b/prueba/note?name=Eminem')).status, 404);
  const pap = (await t.j('GET', '/api/b/prueba/trash')).datos.papelera; assert.equal(pap[0].name, 'Eminem');
  const buscarEmi = await t.j('GET', '/api/b/prueba/search?q=' + encodeURIComponent('referente técnico número uno'));
  assert.ok(!buscarEmi.datos.resultados.some((x) => x.nombre === 'Eminem'), 'una nota en la papelera no se encuentra');
  assert.equal((await t.j('POST', '/api/b/prueba/note/restore', { id: pap[0].id })).datos.name, 'Eminem');
  assert.ok((await t.j('GET', '/api/b/prueba/search?q=' + encodeURIComponent('referente técnico número uno'))).datos.resultados.some((x) => x.nombre === 'Eminem'));
});

test('grafo: neuronas, enlaces únicos, menciones sin enlace y «siempre»/privadas marcadas', async () => {
  const t = await conBoveda();
  const g = (await t.j('GET', '/api/b/prueba/graph')).datos;
  assert.equal(g.notes, BOVEDA_CHICA.length);
  const id = (n) => g.nodes.findIndex((x) => x.id === n);
  const tiene = (lista, a, b) => lista.some(([x, y]) => (x === id(a) && y === id(b)) || (x === id(b) && y === id(a)));
  assert.ok(tiene(g.links, 'Índice', 'Reglas de oro')); assert.ok(tiene(g.links, 'Anáfora', 'Niebla'));
  assert.ok(tiene(g.mentions, 'Nota suelta larga', 'Eminem'), 'la nota suelta nombra a Eminem');
  assert.ok(tiene(g.mentions, 'Nota suelta larga', 'Anáfora'), 'y a la anáfora (por alias)');
  assert.ok(!tiene(g.mentions, 'Nota suelta larga', 'Niebla'));
  assert.equal(g.nodes[id('Reglas de oro')].s, 1); assert.equal(g.nodes[id('Marea')].p, 1);
  assert.equal(g.nodes[id('Anáfora')].d, 3);
});

test('búsqueda por palabras: BM25 con tildes y plurales; devuelve pasajes', async () => {
  const t = await conBoveda();
  const r = (await t.j('GET', '/api/b/prueba/search?q=' + encodeURIComponent('anafora martillo repetir'))).datos;
  assert.equal(r.resultados[0].nombre, 'Anáfora'); assert.match(r.resultados[0].pasajes[0], /martillo/);
  assert.equal(r.significado, false);
  assert.deepEqual((await t.j('GET', '/api/b/prueba/search?q=a')).datos.resultados, []);
});

test('significado: se indexa por pasadas, dibuja sinapsis y mezcla con las palabras', async () => {
  const t = await conBoveda({ conAI: true });
  assert.equal((await t.j('GET', '/api/b/prueba/meaning')).datos.activo, false);
  let e; do { e = (await t.j('POST', '/api/b/prueba/meaning/index', { cuantas: 4 })).datos; } while (e.pendientes > 0 && e.hechas > 0);
  assert.equal(e.pendientes, 0); assert.equal(e.activo, true);
  let v; let desde = 0; do { v = (await t.j('POST', '/api/b/prueba/meaning/neighbors', { desde, cuantas: 4, umbral: 0.9 })).datos; desde = v.siguiente; } while (v.siguiente != null);
  const g = (await t.j('GET', '/api/b/prueba/graph')).datos;
  assert.ok(g.meaning.length > 0, 'hay sinapsis de significado');
  const r = (await t.j('GET', '/api/b/prueba/search?q=' + encodeURIComponent('la soledad'))).datos;
  assert.equal(r.significado, true);
  // una nota que cambia queda con el vector viejo hasta reindexar
  await t.j('POST', '/api/b/prueba/note/append', { name: 'Eminem', text: 'más texto' });
  assert.equal((await t.j('GET', '/api/b/prueba/meaning')).datos.pendientes, 1);
  const sinAI = await conBoveda();
  assert.equal((await sinAI.j('POST', '/api/b/prueba/meaning/index', {})).status, 400);
});

test('exportar e importar: la bóveda viaja entera y los lotes grandes se rechazan', async () => {
  const t = await conBoveda();
  const x = (await t.j('GET', '/api/b/prueba/export')).datos;
  assert.equal(x.formato, 'abrinay-mind/boveda@1'); assert.equal(x.notas.length, BOVEDA_CHICA.length);
  assert.equal((await t.j('POST', '/api/b/prueba/import/notas', { notas: Array(13).fill({ nombre: 'a', texto: 'x' }) })).status, 400);
  assert.equal((await t.j('POST', '/api/brains/import', { cerebro: { slug: 'prueba', nombre: 'Prueba' } })).status, 409);
  const re = await t.j('POST', '/api/brains/import', { cerebro: x.cerebro, reemplazar: true });
  assert.equal(re.status, 200);
  assert.equal((await t.j('GET', '/api/b/prueba/meta')).datos.stats.notas, 0, 'reemplazar vacía el cerebro');
  await t.j('POST', '/api/b/prueba/import/notas', { notas: x.notas.slice(0, 10) });
  assert.equal((await t.j('GET', '/api/b/prueba/meta')).datos.stats.notas, BOVEDA_CHICA.length);
});

test('con significado activo y muchas notas parecidas, buscar y escribir no superan el límite de 100 valores de D1', async () => {
  const t = await conBoveda({ conAI: true });
  // 140 notas inventadas que hablan de lo mismo: para la IA de mentira todas se parecen a la consulta
  const muchas = Array.from({ length: 140 }, (_, i) => ({ nombre: `Rima suelta ${i + 1}`, carpeta: '20-Estilo', texto: `# Rima suelta ${i + 1}\n\nLa rima y la soledad, versión ${i + 1}.` }));
  for (let i = 0; i < muchas.length; i += 12) assert.equal((await t.j('POST', '/api/b/prueba/import/notas', { notas: muchas.slice(i, i + 12) })).status, 200);
  let e; do { e = (await t.j('POST', '/api/b/prueba/meaning/index', { cuantas: 8 })).datos; } while (e.pendientes > 0 && e.hechas > 0);
  assert.equal(e.activo, true);
  const r = await t.j('GET', '/api/b/prueba/search?q=' + encodeURIComponent('rima y soledad'));
  assert.equal(r.status, 200, JSON.stringify(r.datos)); assert.equal(r.datos.significado, true);
  const chat = (await t.j('POST', '/api/b/prueba/chats', { titulo: 'x' })).datos.conversacion;
  const m = await t.flujo(`/api/b/prueba/chats/${chat.id}/message`, { fn: 'chat', texto: 'rima y soledad', anclas: [], modo: null });
  assert.equal(m.status, 200, JSON.stringify(m.datos));
});
