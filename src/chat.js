// Abrinay Mind — la conversación con el cerebro (y el constructor de canciones, que es un mensaje con encargo).
// Un turno: se arma lo que el cerebro lee, se llama al modelo y la respuesta se reenvía EN VIVO al navegador (SSE) mientras el Worker
// anota el texto, el uso y lo leído. Claude va en streaming; Muse Spark contesta de una vez y se emite igual para que el navegador tenga un solo lector.
import { HttpError, bad, noEsta, ahora, idCorto, recortar } from './http.js';
import { todas, una, correr, auditar } from './db.js';
import { leerAjustes, elegirModelo, llamarEnFlujo, llamar, PROVEEDORES, costo } from './models.js';
import * as uso from './usage.js';
import { armarContexto, resolverModo, modosDelCerebro, sistemaFijo, sistemaVariable, encargoTexto, consultaDeEncargo } from './context.js';

const enc = new TextEncoder();
const sse = (evento, datos) => enc.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const HISTORIAL = 16;

/* ---------- conversaciones ---------- */

export async function listar(db, brainId) {
  return (await todas(db, 'select id, title, created, updated from chats where brain_id = ? order by updated desc limit 100', brainId)).map((c) => ({ id: c.id, title: c.title, created: c.created, updated: c.updated }));
}
export async function crear(db, brain, { titulo = 'Nueva conversación' } = {}) {
  const id = idCorto(), t = ahora();
  await correr(db, 'insert into chats (id, brain_id, title, created, updated) values (?,?,?,?,?)', id, brain.id, recortar(titulo, 80) || 'Nueva conversación', t, t);
  return { id, title: recortar(titulo, 80) || 'Nueva conversación', created: t, updated: t };
}
export async function deLaConversacion(db, brain, id) {
  const c = await una(db, 'select * from chats where id = ? and brain_id = ?', String(id ?? ''), brain.id);
  if (!c) throw noEsta('Esa conversación no existe.');
  return c;
}
export async function leer(db, brain, id) {
  const c = await deLaConversacion(db, brain, id);
  const mensajes = (await todas(db, 'select id, role, content, meta, created from chat_messages where chat_id = ? order by id', c.id)).map((m) => ({ id: m.id, role: m.role, content: m.content, meta: JSON.parse(m.meta || '{}'), created: m.created }));
  return { id: c.id, title: c.title, created: c.created, updated: c.updated, mensajes };
}
export async function renombrar(db, brain, id, titulo) {
  const c = await deLaConversacion(db, brain, id);
  const t = recortar(titulo, 80); if (!t) throw bad('La conversación necesita un título.');
  await correr(db, 'update chats set title = ?, updated = ? where id = ?', t, ahora(), c.id);
  return { ok: true, title: t };
}
export async function borrar(db, brain, id) {
  const c = await deLaConversacion(db, brain, id);
  await db.batch([db.prepare('delete from chat_messages where chat_id = ?').bind(c.id), db.prepare('delete from chats where id = ?').bind(c.id)]);
  return { ok: true };
}

/* ---------- un turno ---------- */

/** Lee las líneas SSE de un trozo y va juntando el texto, el uso y el final. Barato: solo se parsean las líneas que importan. */
export function lectorDeEventos() {
  let resto = ''; const dec = new TextDecoder();
  const estado = { texto: '', uso: {}, parada: null, error: null };
  return {
    estado,
    empujar(bytes) {
      resto += dec.decode(bytes, { stream: true });
      let i;
      while ((i = resto.indexOf('\n')) !== -1) {
        const linea = resto.slice(0, i).trimEnd(); resto = resto.slice(i + 1);
        if (!linea.startsWith('data:')) continue;
        const d = linea.slice(5).trim();
        try {
          if (d.includes('"text_delta"')) { const e = JSON.parse(d); estado.texto += e.delta?.text ?? ''; }
          else if (d.includes('"message_start"')) { const e = JSON.parse(d); Object.assign(estado.uso, e.message?.usage ?? {}); }
          else if (d.includes('"message_delta"')) { const e = JSON.parse(d); Object.assign(estado.uso, e.usage ?? {}); if (e.delta?.stop_reason) estado.parada = e.delta.stop_reason; }
          else if (d.includes('"type":"error"') || d.includes('"type": "error"')) { const e = JSON.parse(d); estado.error = e.error?.message || 'error del proveedor'; }
        } catch { /* una línea rota no tumba el turno */ }
      }
    },
  };
}

/**
 * Un mensaje del artista → la respuesta del cerebro en vivo.
 * datos: { texto?, brief?, fn?, model?, anclas?, profundidad?, modo? }
 */
export async function mensaje(env, ctx, db, brain, chatId, datos, { fetchFn = fetch } = {}) {
  const chat = await deLaConversacion(db, brain, chatId);
  const ajustes = await leerAjustes(db);
  const brief = datos.brief && typeof datos.brief === 'object' ? datos.brief : null;
  const texto = brief ? '' : String(datos.texto ?? '').slice(0, 8000);
  if (!brief && !texto.trim()) throw bad('El mensaje está vacío.');
  const fn = ['letra', 'chat', 'borrador', 'critica'].includes(datos.fn) ? datos.fn : brief ? 'letra' : 'chat';
  const { modelo, de, avisos } = elegirModelo(env, ajustes, { fn, pedido: datos.model || null });
  await uso.vigilarTope(db, ajustes);

  // el modo: se elige, se detecta o se pregunta
  const modos = await modosDelCerebro(db, brain.id);
  const base = brief ? [brief.titulo, brief.tema, brief.mood, brief.concepto, brief.referencia, brief.restricciones].filter(Boolean).join(' ') : texto;
  const res = resolverModo(modos, datos.modo ?? brief?.modo ?? null, base);
  const mensajeUsuario = brief ? encargoTexto(brief, res) : texto;
  const consulta = brief ? consultaDeEncargo(brief, res.modo) : texto;
  const profundidad = ['ligera', 'normal', 'profunda'].includes(datos.profundidad) ? datos.profundidad : ajustes.profundidad;
  const anclas = (Array.isArray(datos.anclas) ? datos.anclas : []).map(String).slice(0, 8);

  const contexto = await armarContexto(env, db, brain, { consulta, modo: res.modo?.nota ?? null, anclas, profundidad, entrena: !!modelo.entrena });
  const modoTexto = res.modo ? (res.origen === 'detectado' ? `detectado: ${res.motivo}` : 'elegido por el artista') : '';
  const sistema = [{ text: sistemaFijo(brain, contexto.plan.fijas), cache: true }, { text: sistemaVariable({ modos, modo: res.modo, modoTexto, recuperadas: contexto.plan.recuperadas }) }];

  // el historial reciente + el mensaje nuevo
  const previos = (await todas(db, 'select role, content from chat_messages where chat_id = ? order by id desc limit ?', chat.id, HISTORIAL)).reverse();
  const mensajes = [...previos.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: mensajeUsuario }];
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();

  const t0 = ahora();
  await correr(db, 'insert into chat_messages (chat_id, role, content, meta, created) values (?,?,?,?,?)', chat.id, 'user', mensajeUsuario, JSON.stringify(brief ? { brief } : {}), t0);
  if (/^nueva conversaci/i.test(chat.title)) await correr(db, 'update chats set title = ? where id = ?', recortar(brief?.titulo || brief?.tema || texto, 60) || chat.title, chat.id);

  const info = {
    modelo: { id: modelo.id, nombre: modelo.nombre, entrena: !!modelo.entrena, de }, avisos,
    modo: res.modo ? { nombre: res.modo.nombre, nota: res.modo.nota, origen: res.origen } : { nombre: null, origen: res.origen, pregunta: res.pregunta },
    fijas: contexto.fijas, leidas: contexto.leidas, omitidas: contexto.omitidas, significado: contexto.significado, profundidad,
  };

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const guardar = async (estado, extra = {}) => {
    const usd = await uso.anotar(db, { brainId: brain.id, fn, modelo, uso: estado.uso, ms: ahora() - t0 });
    let mensajeId = null;
    if (estado.texto.trim()) {
      const ins = await correr(db, 'insert into chat_messages (chat_id, role, content, meta, created) values (?,?,?,?,?)', chat.id, 'assistant', estado.texto, JSON.stringify({ modelo: modelo.id, nombreModelo: modelo.nombre, entrena: !!modelo.entrena, usd, uso: estado.uso, leidas: contexto.leidas, fijas: contexto.fijas, modo: info.modo, fn, brief: brief || undefined, ...extra }), ahora());
      mensajeId = ins.meta?.last_row_id ?? null;
    }
    await correr(db, 'update chats set updated = ? where id = ?', ahora(), chat.id);
    return { usd, mensajeId };
  };

  const bombear = async () => {
    const lector = lectorDeEventos();
    let upstream = null;
    try {
      await w.write(sse('am_context', info));
      if (PROVEEDORES[modelo.proveedor].streaming) {
        const res2 = await llamarEnFlujo(env, modelo, { sistema, mensajes, maxTokens: fn === 'critica' ? 1500 : 4096 }, { fetchFn });
        upstream = res2.body.getReader();
        for (;;) {
          const { done, value } = await upstream.read(); if (done) break;
          lector.empujar(value);
          try { await w.write(value); } catch { await upstream.cancel().catch(() => {}); await guardar(lector.estado, { interrumpida: true }); return; }
        }
      } else {
        const r = await llamar(env, modelo, { sistema, mensajes, maxTokens: fn === 'critica' ? 1500 : 4096 }, { fetchFn });
        lector.estado.texto = r.texto; lector.estado.uso = r.uso;
        await w.write(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: r.texto } })}\n\n`));
        await w.write(enc.encode(`event: message_stop\ndata: {"type":"message_stop"}\n\n`));
      }
      if (lector.estado.error) throw new Error(lector.estado.error);
      const { usd, mensajeId } = await guardar(lector.estado);
      await w.write(sse('am_done', { usd, uso: lector.estado.uso, modelo: modelo.id, mensajeId, chatId: chat.id }));
    } catch (e) {
      const m = e instanceof HttpError ? e.message : `Se cortó la conexión con ${modelo.nombre}: ${recortar(e?.message, 120)}`;
      try { await guardar(lector.estado, { error: m }); await w.write(sse('am_error', { error: m })); } catch { /* el navegador ya se fue */ }
    } finally { try { await w.close(); } catch { /* ya cerrado */ } }
  };
  ctx.waitUntil(bombear());
  await auditar(db, brain.id, 'generar', 'artista', `${fn} · ${modelo.id}`);
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

export { costo };
