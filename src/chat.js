// Abrinay Mind — la conversación con el cerebro (y el constructor de canciones, que es un mensaje con encargo).
// Un turno: se arma lo que el cerebro lee, se llama al modelo y la respuesta se reenvía EN VIVO al navegador (SSE) mientras el Worker
// anota el texto, el uso y lo leído. Claude va en streaming; Muse Spark contesta de una vez y se emite igual para que el navegador tenga un solo lector.
import { fold } from '../public/core/text.js';
import { HttpError, bad, noEsta, ahora, idCorto, recortar } from './http.js';
import { todas, una, correr, auditar } from './db.js';
import { leerAjustes, elegirModelo, llamarEnFlujo, llamar, PROVEEDORES, costo, presupuestoPensar } from './models.js';
import * as uso from './usage.js';
import { aprenderPalabras } from './aprender-modos.js';
import { HERRAMIENTAS, crearEjecutor, cambiosPublicos } from './herramientas.js';
import { armarContexto, resolverModo, nombresDeModos, modosDelCerebro, sistemaFijo, sistemaVariable, encargoTexto, consultaDeEncargo } from './context.js';

const enc = new TextEncoder();
const sse = (evento, datos) => enc.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const HISTORIAL = 16;
export const SIN_RESPUESTA = '(sin respuesta)';
const MAX_RONDAS = 6;          // pasos máximos de «el modelo pide una herramienta → se ejecuta → sigue» en un mensaje
const INACTIVIDAD = 45_000;   // ms sin recibir nada del modelo antes de darlo por colgado

/** Tokens máximos de la respuesta: lo que cabe en la letra pedida (más versiones, más espacio) y el resto de tareas. */
export function tokensDe(fn, brief) {
  if (fn === 'critica') return 1500;
  const v = Math.min(3, Math.max(1, Number(brief?.versiones) || 1));
  return 4096 + (v - 1) * 2800;
}

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
const metaPublica = (crudo) => { const m = JSON.parse(crudo || '{}'); if (m.cambios) m.cambios = cambiosPublicos(m.cambios); return m; };
export async function leer(db, brain, id) {
  const c = await deLaConversacion(db, brain, id);
  const mensajes = (await todas(db, 'select id, role, content, meta, created from chat_messages where chat_id = ? order by id', c.id)).map((m) => ({ id: m.id, role: m.role, content: m.content, meta: metaPublica(m.meta), created: m.created }));
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

/** Lo que le decimos al artista mientras el cerebro usa una herramienta. */
const VERBOS = { buscar_notas: 'Buscando en el cerebro', leer_nota: 'Leyendo', listar_notas: 'Mirando la lista de notas', salud_del_cerebro: 'Revisando la salud del cerebro', crear_nota: 'Creando', ampliar_nota: 'Ampliando', editar_nota: 'Reescribiendo', mover_nota: 'Moviendo', renombrar_nota: 'Renombrando', borrar_nota: 'Mandando a la papelera', conectar_notas: 'Conectando', quitar_enlace: 'Quitando un enlace de', anadir_regla: 'Guardando una regla', recalcular_menciones: 'Recalculando conexiones' };
export const pasoDe = (nombre, entrada) => { const x = entrada?.nombre || entrada?.origen || entrada?.consulta || ''; return `${VERBOS[nombre] || 'Trabajando'}${x ? ` «${recortar(String(x), 40)}»` : ''}…`; };


/** Suma lo que dejó cada respuesta del modelo en un turno con herramientas (texto, uso, cómo terminó). `con(actual)` = lo acumulado + la respuesta en curso. */
export function acumulador() {
  const a = { texto: '', uso: {}, parada: null, fin: false, tope: false };
  const juntar = (x, y) => (x && y ? x + '\n\n' + y : x || y);
  const sumarUso = (base, extra) => { const o = { ...base }; for (const [k, v] of Object.entries(extra || {})) o[k] = typeof v === 'number' ? (o[k] || 0) + v : v; return o; };
  a.sumar = (e) => { a.texto = juntar(a.texto, e.texto.trim() ? e.texto : ''); a.uso = sumarUso(a.uso, e.uso); a.parada = e.parada; a.fin = e.fin; };
  a.con = (e) => (e ? { texto: juntar(a.texto, e.texto.trim() ? e.texto : ''), uso: sumarUso(a.uso, e.uso), parada: e.parada ?? a.parada, fin: e.fin, error: e.error } : { texto: a.texto, uso: a.uso, parada: a.parada, fin: a.fin, error: null });
  return a;
}


/**
 * Lee las líneas SSE de un trozo y va juntando el texto, el uso y el final. Barato a propósito (el Worker del plan gratuito tiene poca CPU):
 * del texto solo se recorta el fragmento ya escapado de cada trozo y se decodifica UNA vez al final, en vez de un JSON.parse por trozo.
 * estado: { texto, uso, parada, fin (¿llegó message_stop?), error }
 */
export function lectorDeEventos() {
  let resto = ''; const dec = new TextDecoder();
  const partes = []; let texto = null;
  const bloques = new Map();   // index → bloque de herramienta o de pensamiento (los de texto van por el camino rápido)
  const estado = {
    uso: {}, parada: null, fin: false, error: null,
    /** Las herramientas que pidió el modelo en esta respuesta: [{ type:'tool_use', id, name, input }]. */
    get herramientas() { return [...bloques.values()].filter((b) => b.type === 'tool_use').map((b) => { let input = {}; try { input = b.json ? JSON.parse(b.json) : {}; } catch { /* argumentos rotos: la herramienta dirá qué falta */ } return { type: 'tool_use', id: b.id, name: b.name, input }; }); },
    /** El pensamiento de esta respuesta, tal cual hay que devolverlo al modelo junto a sus herramientas (con firma). */
    get pensamientos() { return [...bloques.values()].filter((b) => b.type === 'thinking' ? b.signature : b.type === 'redacted_thinking').map((b) => (b.type === 'thinking' ? { type: 'thinking', thinking: b.thinking, signature: b.signature } : { type: 'redacted_thinking', data: b.data })); },
    get texto() {
      if (texto == null) {
        const junto = partes.join('');
        try { texto = JSON.parse(`"${junto}"`); }
        catch { texto = partes.map((p) => { try { return JSON.parse(`"${p}"`); } catch { return ''; } }).join(''); }
      }
      return texto;
    },
    set texto(t) { partes.length = 0; texto = String(t ?? ''); },
  };
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
          if (d.includes('"text_delta"')) {
            const k = d.indexOf('"text":"');
            if (k >= 0 && d.endsWith('"}}')) { partes.push(d.slice(k + 8, d.length - 3)); texto = null; }
            else { const e = JSON.parse(d); partes.push(JSON.stringify(e.delta?.text ?? '').slice(1, -1)); texto = null; }
          }
          else if (d.includes('"content_block_start"')) { const e = JSON.parse(d), b = e.content_block; if (b?.type === 'tool_use') bloques.set(e.index, { type: 'tool_use', id: b.id, name: b.name, json: '' }); else if (b?.type === 'thinking') bloques.set(e.index, { type: 'thinking', thinking: b.thinking || '', signature: b.signature || '' }); else if (b?.type === 'redacted_thinking') bloques.set(e.index, { type: 'redacted_thinking', data: b.data }); }
          else if (d.includes('"input_json_delta"') || d.includes('"thinking_delta"') || d.includes('"signature_delta"')) { const e = JSON.parse(d), b = bloques.get(e.index), x = e.delta; if (b && x) { if (x.type === 'input_json_delta') b.json += x.partial_json || ''; else if (x.type === 'thinking_delta') b.thinking += x.thinking || ''; else if (x.type === 'signature_delta') b.signature = x.signature || ''; } }
          else if (d.includes('"message_start"')) { const e = JSON.parse(d); Object.assign(estado.uso, e.message?.usage ?? {}); }
          else if (d.includes('"message_delta"')) { const e = JSON.parse(d); Object.assign(estado.uso, e.usage ?? {}); if (e.delta?.stop_reason) estado.parada = e.delta.stop_reason; }
          else if (d.includes('"message_stop"')) estado.fin = true;
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
export async function mensaje(env, ctx, db, brain, chatId, datos, { fetchFn = fetch, esperas, tiempos } = {}) {
  const chat = await deLaConversacion(db, brain, chatId);
  const ajustes = await leerAjustes(db);
  const brief = datos.brief && typeof datos.brief === 'object' ? datos.brief : null;
  const texto = brief ? '' : String(datos.texto ?? '').slice(0, 8000);
  if (!brief && !texto.trim()) throw bad('El mensaje está vacío.');
  const fn = ['letra', 'chat', 'borrador', 'critica'].includes(datos.fn) ? datos.fn : brief ? 'letra' : 'chat';
  const { modelo, de, avisos } = elegirModelo(env, ajustes, { fn, pedido: datos.model || null });
  await uso.vigilarTope(db, ajustes);
  // el chat libre es un canal en los dos sentidos: con modelos Claude (que no entrenan) puede leer Y modificar el cerebro con herramientas
  const conHerramientas = fn === 'chat' && ajustes.escritura_ia !== false && modelo.proveedor === 'anthropic' && !modelo.entrena;


  // el historial reciente (de él sale también el modo que ya traía la conversación)
  const previos = (await todas(db, 'select role, content, meta from chat_messages where chat_id = ? order by id desc limit ?', chat.id, HISTORIAL)).reverse();
  const previo = [...previos].reverse().map((m) => { try { if (m.role !== 'assistant') return null; const md = JSON.parse(m.meta || '{}').modo; return md?.notas?.length ? md.notas : md?.nota; } catch { return null; } }).find(Boolean) || null;

  // el modo: se elige, se detecta, continúa el de la conversación o se pregunta
  const modos = await modosDelCerebro(db, brain.id);
  const base = brief ? [brief.titulo, brief.tema, brief.mood, brief.concepto, brief.referencia, brief.restricciones].filter(Boolean).join(' ') : texto;
  const res = resolverModo(modos, datos.modo ?? brief?.modo ?? null, base, brief ? null : previo);   // un encargo nuevo no hereda el modo del anterior; la charla sí
  // en una conversación (sin encargo) la duda de modo solo importa si piden escribir algo; si no, no se pregunta ni se ofrecen botones
  if (!brief && res.origen === 'incierto' && !/\b(letra|cancion|verso|estribillo|coro|escrib\w*|compon\w*)s?\b/.test(fold(texto))) { res.origen = 'conversacion'; res.pregunta = false; }
  // el artista eligió el modo con los botones tras la duda del cerebro: las palabras distintivas de su encargo se quedan en ese modo
  let modoAprendido = [];
  if (datos.aprenderModo === true && res.origen === 'elegido' && res.modos.length === 1) modoAprendido = await aprenderPalabras(db, brain, res.modo, base, modos);
  const mensajeUsuario = brief ? encargoTexto(brief, res) : texto;
  // un mensaje corto («sigue con el segundo verso») no dice de qué se habla: se busca con lo anterior de la conversación para leer las notas correctas
  const ultimoDelArtista = [...previos].reverse().find((m) => m.role === 'user')?.content || '';
  const consulta = brief ? consultaDeEncargo(brief, res.modos) : (texto.split(/\s+/).length < 8 && ultimoDelArtista ? `${recortar(ultimoDelArtista, 400)} ${texto}` : texto);
  const previas = (() => { try { const ult = [...previos].reverse().find((m) => m.role === 'assistant'); return (JSON.parse(ult?.meta || '{}').leidas || []).filter((l) => l.motivo !== 'vecina').map((l) => l.nombre); } catch { return []; } })();
  const profundidad = ['ligera', 'normal', 'profunda'].includes(datos.profundidad) ? datos.profundidad : ajustes.profundidad;
  const anclas = (Array.isArray(datos.anclas) ? datos.anclas : []).map(String).slice(0, 8);

  const contexto = await armarContexto(env, db, brain, { consulta, modo: res.modos.map((m) => m.nota), anclas, previas, profundidad, entrena: !!modelo.entrena });
  const modoTexto = res.modos.length ? (res.origen === 'detectado' ? `detectado: ${res.motivo}` : res.origen === 'continua' ? 'sigue el de la conversación' : 'elegido por el artista') : '';
  const sistema = [{ text: sistemaFijo(brain, contexto.plan.fijas, { herramientas: conHerramientas }), cache: true }, { text: sistemaVariable({ modos, modosSel: res.modos, libre: res.origen === 'libre', conversacion: res.origen === 'conversacion', modoTexto, recuperadas: contexto.plan.recuperadas }) }];

  const mensajes = [...previos.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: mensajeUsuario }];
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();

  const t0 = ahora();
  await correr(db, 'insert into chat_messages (chat_id, role, content, meta, created) values (?,?,?,?,?)', chat.id, 'user', mensajeUsuario, JSON.stringify(brief ? { brief } : {}), t0);
  if (/^nueva conversaci/i.test(chat.title)) await correr(db, 'update chats set title = ? where id = ?', recortar(brief?.titulo || brief?.tema || texto, 60) || chat.title, chat.id);

  const info = {
    modelo: { id: modelo.id, nombre: modelo.nombre, entrena: !!modelo.entrena, de }, avisos,
    modo: res.modos.length ? { nombre: nombresDeModos(res), nota: res.modo.nota, notas: res.modos.map((m) => m.nota), origen: res.origen, ...(modoAprendido.length ? { aprendidas: modoAprendido } : {}) } : { nombre: res.origen === 'libre' ? 'Libre' : null, origen: res.origen, pregunta: res.pregunta, sugerido: res.sugerido?.nota },
    fijas: contexto.fijas, leidas: contexto.leidas, omitidas: contexto.omitidas, significado: contexto.significado, profundidad,
  };

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const cambios = [];   // lo que la IA modificó en el cerebro durante este turno (con lo necesario para deshacerlo)
  const guardar = async (estado, extra = {}) => {
    const usd = await uso.anotar(db, { brainId: brain.id, fn, modelo, uso: estado.uso, ms: ahora() - t0 });
    let mensajeId = null;
    // siempre queda una respuesta guardada: si no hubo texto, un marcador (con el error o la parada en el meta) para que el mensaje del artista no quede en el aire
    {
      const ins = await correr(db, 'insert into chat_messages (chat_id, role, content, meta, created) values (?,?,?,?,?)', chat.id, 'assistant', estado.texto.trim() ? estado.texto : cambios.length ? '(cambios en el cerebro)' : SIN_RESPUESTA, JSON.stringify({ modelo: modelo.id, nombreModelo: modelo.nombre, entrena: !!modelo.entrena, usd, uso: estado.uso, leidas: contexto.leidas, fijas: contexto.fijas, omitidas: contexto.omitidas, modo: info.modo, fn, brief: brief || undefined, ...(cambios.length ? { cambios } : {}), ...extra }), ahora());
      mensajeId = ins.meta?.last_row_id ?? null;
    }
    await correr(db, 'update chats set updated = ? where id = ?', ahora(), chat.id);
    return { usd, mensajeId };
  };

  const bombear = async () => {
    const acum = acumulador(); let espaciado = false;
    let lector = lectorDeEventos(), upstream = null, reloj;
    const maxTokens = tokensDe(fn, brief), pensar = presupuestoPensar(ajustes.pensamiento, fn);
    const ejecutor = conHerramientas ? crearEjecutor({ env, db, brain, cambios }) : null;
    const conversacion = mensajes.map((m) => ({ ...m }));
    // lee del proveedor con vigilancia: si pasa `inactividad` ms sin recibir nada, se da por colgado (y no se queda el spinner para siempre)
    const leer = () => Promise.race([upstream.read(), new Promise((_, no) => { reloj = setTimeout(() => no(new HttpError(504, `${modelo.nombre} dejó de contestar a mitad de la respuesta.`)), tiempos?.inactividad ?? INACTIVIDAD); })]).finally(() => clearTimeout(reloj));
    const vista = () => acum.con(lector.estado);
    try {
      await w.write(sse('am_context', { ...info, herramientas: conHerramientas }));
      if (PROVEEDORES[modelo.proveedor].streaming) {
        for (let ronda = 0; ; ronda++) {
          lector = lectorDeEventos();
          const ultima = ronda >= MAX_RONDAS - 1;   // en la última vuelta se le obliga a contestar en texto con lo que ya leyó
          const res2 = await llamarEnFlujo(env, modelo, { sistema, mensajes: conversacion, maxTokens, pensar, ...(ejecutor ? { herramientas: HERRAMIENTAS, sinHerramientas: ultima } : {}) }, { fetchFn, esperas, tiempos });
          upstream = res2.body.getReader();
          if (ronda > 0 && acum.texto && !espaciado) { espaciado = true; await w.write(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '\n\n' } })}\n\n`)); }
          for (;;) {
            const { done, value } = await leer(); if (done) break;
            lector.empujar(value);
            try { await w.write(value); } catch { await upstream.cancel().catch(() => {}); await guardar(vista(), { interrumpida: true }); return; }
          }
          const e = lector.estado;
          if (e.error) throw new Error(e.error);
          const pedidas = ejecutor && e.parada === 'tool_use' ? e.herramientas : [];
          acum.sumar(e); if (e.texto.trim()) espaciado = false;
          if (!pedidas.length) break;
          if (ultima) { acum.tope = true; break; }   // (con tool_choice none no debería pedir más; por si acaso)
          // el modelo pidió herramientas: se ejecutan y se le devuelve el resultado para que siga
          const resultados = [];
          for (const u of pedidas) {
            await w.write(sse('am_paso', { texto: pasoDe(u.name, u.input) }));
            const r = await ejecutor.ejecutar(u.name, u.input);
            resultados.push({ type: 'tool_result', tool_use_id: u.id, content: r.texto, ...(r.error ? { is_error: true } : {}) });
          }
          await w.write(sse('am_cambios', { cambios: cambiosPublicos(cambios) }));
          conversacion.push({ role: 'assistant', content: [...e.pensamientos, ...(e.texto.trim() ? [{ type: 'text', text: e.texto }] : []), ...pedidas] }, { role: 'user', content: resultados });
        }
      } else {
        const r = await llamar(env, modelo, { sistema, mensajes, maxTokens }, { fetchFn, esperas, tiempos });
        lector.estado.texto = r.texto; lector.estado.uso = r.uso; lector.estado.parada = r.parada; lector.estado.fin = true; acum.sumar(lector.estado);
        await w.write(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: r.texto } })}\n\n`));
        await w.write(enc.encode(`event: message_stop\ndata: {"type":"message_stop"}\n\n`));
      }
      // una respuesta sin message_stop se cortó a mitad; una con stop_reason max_tokens topó con el límite: las dos se marcan para que el navegador lo diga
      const fin = acum.con(null), incompleta = !fin.fin && !acum.tope, parada = acum.tope ? 'max_rondas' : fin.parada;
      const { usd, mensajeId } = await guardar(fin, { parada, ...(incompleta ? { incompleta: true } : {}) });
      await w.write(sse('am_done', { usd, uso: fin.uso, modelo: modelo.id, mensajeId, chatId: chat.id, parada, incompleta, cambios: cambiosPublicos(cambios) }));
    } catch (e) {
      const m = e instanceof HttpError ? e.message : `Se cortó la conexión con ${modelo.nombre}: ${recortar(e?.message, 120)}`;
      try { await upstream?.cancel().catch(() => {}); } catch { /* ya cerrado */ }
      try { const v = vista(); await guardar(v, { error: m, parada: v.parada }); await w.write(sse('am_error', { error: m })); } catch { /* el navegador ya se fue */ }
    } finally { try { await w.close(); } catch { /* ya cerrado */ } }
  };
  ctx.waitUntil(bombear());
  await auditar(db, brain.id, 'generar', 'artista', `${fn} · ${modelo.id}`);
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

export { costo };
