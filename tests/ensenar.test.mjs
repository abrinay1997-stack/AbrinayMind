// Enseñar al cerebro desde el chat: el modelo propone notas nuevas, ampliaciones y reglas contra una lista cerrada; nada se escribe hasta aplicar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entorno, BOVEDA_CHICA, proveedorFalso } from './helpers.mjs';
import { notaNueva } from '../src/ensenar.js';

const PROPUESTAS = JSON.stringify({ propuestas: [
  { accion: 'crear', nombre: 'Métrica de densidad', carpeta: '60-Técnicas', tipo: 'metrica', texto: 'Contar sílabas por barra: 14 a 18 es denso.', enlaces: ['Anáfora', 'Nota inventada por el modelo'], motivo: 'una métrica nueva' },
  { accion: 'ampliar', nombre: 'anáfora', texto: 'Variante: repetir solo el arranque de cada verso.', motivo: 'completa la técnica' },
  { accion: 'ampliar', nombre: 'Nota que no está en la lista', texto: 'x' },
  { accion: 'regla', nunca: 'Explicar la metáfora.', siempre: 'Dejar la imagen sin explicar.' },
  { accion: 'borrar', nombre: 'Anáfora' },
  { accion: 'crear', nombre: 'Mal/nombre', texto: 'x' },
] });
async function conCerebro(respuesta = PROPUESTAS) {
  const proveedor = proveedorFalso({ respuesta });
  const t = await entorno({ proveedor });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  return { t, proveedor, nota: (n) => t.j('GET', `/api/b/p/note?name=${encodeURIComponent(n)}`) };
}

test('proponer: valida lo que devuelve el modelo (destinos y enlaces de la lista cerrada, acciones conocidas) y no escribe nada', async () => {
  const { t, nota } = await conCerebro();
  const r = await t.j('POST', '/api/b/p/learn/knowledge/propose', { texto: 'La densidad se mide en sílabas por barra; la anáfora también puede ser solo el arranque.' });
  assert.equal(r.status, 200);
  const p = r.datos.propuestas;
  assert.deepEqual(p.map((x) => x.accion), ['crear', 'ampliar', 'regla']);
  assert.deepEqual(p[0].enlaces, ['Anáfora'], 'el enlace inventado se descarta');
  assert.equal(p[1].nombre, 'Anáfora', 'se resuelve al nombre real');
  assert.equal((await nota('Métrica de densidad')).status, 404, 'proponer no escribe');
});

test('proponer: sin texto ni conversación se rechaza; con conversación usa lo último que se habló', async () => {
  const { t, proveedor } = await conCerebro();
  assert.equal((await t.j('POST', '/api/b/p/learn/knowledge/propose', { texto: '  ' })).status, 400);
  const chat = (await t.j('POST', '/api/b/p/chats', {})).datos.conversacion;
  await t.flujo(`/api/b/p/chats/${chat.id}/message`, { fn: 'chat', texto: 'Mi regla de oro sobre el cierre sin resolver', anclas: [], modo: null }); await t.esperar();
  const r = await t.j('POST', '/api/b/p/learn/knowledge/propose', { chatId: chat.id });
  assert.equal(r.status, 200);
  assert.match(proveedor.peticiones.at(-1).cuerpo.messages[0].content, /cierre sin resolver/);
});

test('aplicar: crea la nota con cabecera y «Relacionadas», amplía otra, guarda la regla y salta lo que no se puede', async () => {
  const { t, nota } = await conCerebro();
  const r = await t.j('POST', '/api/b/p/learn/knowledge/apply', { propuestas: [
    { accion: 'crear', nombre: 'Métrica de densidad', carpeta: '60-Técnicas', tipo: 'metrica', texto: 'Contar sílabas por barra.', enlaces: ['Anáfora', 'No existe'] },
    { accion: 'ampliar', nombre: 'Anáfora', texto: 'Variante: solo el arranque.' },
    { accion: 'regla', nunca: 'Explicar la metáfora.', siempre: 'Dejar la imagen.' },
    { accion: 'crear', nombre: 'Anáfora', texto: 'duplicada' },
    { accion: 'ampliar', nombre: 'No existe', texto: 'x' },
    { accion: 'crear', nombre: 'Con/barra', texto: 'x' },
  ] });
  assert.equal(r.status, 200); assert.deepEqual(r.datos.creadas, ['Métrica de densidad']); assert.deepEqual(r.datos.ampliadas, ['Anáfora']); assert.equal(r.datos.reglas, 1);
  assert.equal(r.datos.saltadas.length, 3);
  const n = (await nota('Métrica de densidad')).datos;
  assert.match(n.text, /^---\ntipo: metrica\nfuente: chat\n---\n# Métrica de densidad/); assert.match(n.text, /- \[\[Anáfora\]\]/); assert.doesNotMatch(n.text, /No existe/);
  assert.equal(n.folder, '60-Técnicas');
  assert.match((await nota('Anáfora')).datos.text, /Añadido desde el chat[\s\S]*Variante: solo el arranque\./);
  assert.match((await nota('Reglas aprendidas')).datos.text, /NUNCA: Explicar la metáfora\./);
  assert.ok(n.salientes.some((l) => l.name === 'Anáfora'), 'la nota nueva queda enlazada');
  assert.ok((await nota('Anáfora')).datos.entrantes.includes('Métrica de densidad'));
});

test('aplicar: sin propuestas se rechaza y notaNueva solo admite tipos conocidos', async () => {
  const { t } = await conCerebro();
  assert.equal((await t.j('POST', '/api/b/p/learn/knowledge/apply', { propuestas: [] })).status, 400);
  assert.match(notaNueva({ nombre: 'X', tipo: 'inventado', texto: 'a' }), /tipo: concepto/);
});

test('privacidad: un modelo que entrena no recibe las notas privadas como contexto', async () => {
  const proveedor = proveedorFalso({ respuesta: PROPUESTAS });
  const t = await entorno({ proveedor, extra: { META_API_KEY: 'meta-prueba' } });
  await t.j('POST', '/api/brains/import', { cerebro: { slug: 'p', nombre: 'P', subtitulo: 'x' } });
  await t.j('POST', '/api/b/p/import/notas', { notas: BOVEDA_CHICA });
  assert.equal((await t.j('PUT', '/api/settings', { entrena: true, funciones: { ensenar: 'muse-spark-1.3-contributor' } })).status, 200);
  const antes = proveedor.peticiones.length;
  await t.j('POST', '/api/b/p/learn/knowledge/propose', { texto: 'batalla con barras densas y rima multisílaba' });
  const enviadas = proveedor.peticiones.slice(antes).map((x) => JSON.stringify(x.cuerpo)).join('');
  assert.ok(proveedor.peticiones.slice(antes).some((x) => /meta/.test(x.url) || /muse/.test(x.cuerpo.model)), 'se usó el modelo que entrena');
  assert.doesNotMatch(enviadas, /nombres reales de gente|- Marea \[/, 'ni el contenido ni la ficha de la nota privada «Marea» salen hacia un modelo que entrena');
});
