// Abrinay Mind — Estudio: el constructor de canciones y la conversación con el cerebro, en el mismo hilo.
// El cerebro lee primero (lo fijo, el modo, lo anclado, lo que encuentra la búsqueda y lo que despiertan las sinapsis), luego escribe.
import { h, poner, vaciar, icono, aviso, fallo, dialogo, pedir, confirmar, copiar, usd, num, esMovil, debounce } from '../ui.js';
import { S, api, bus, modelos, grafo, anclar, ir, irANota, recargarMeta } from '../store.js';
import { flujo } from '../api.js';
import { parsear, primeraLinea } from '../lyric.js';
import { vistaDeLetra, abrirParaSuno, copiarTextoLimpio } from '../letra-ui.js';
import { ofrecerAprender } from '../aprender.js';
import { textoLimpio } from '../formato.js';
import { Graph3D } from '../graph3d.js';

const RAPIDAS = [
  ['Dame 3 conceptos para una canción nueva', 'Dame 3 conceptos distintos para una canción nueva, cada uno con su idea central en una línea.'],
  ['¿Qué reglas aplican a este modo?', '¿Qué reglas de oro y qué lecciones aprendidas aplican cuando escribo en este modo? Resúmelas.'],
  ['Critica mi letra', 'Critica esta letra contra mis reglas y mi firma (sé directo, con ejemplos de líneas):\n\n'],
  ['Sugiere rimas', 'Sugiere cadenas de rimas (multisílabas, asonantes) para la idea: '],
];
const MOTIVO = { modo: 'modo', anclada: 'anclada', busqueda: 'búsqueda', vecina: 'vecina', siempre: 'siempre' };

export async function montar(el, { param }) {
  const A = api(), slug = S.slug, brain = S.cerebros.find((c) => c.slug === slug);
  let meta = S.meta, chats = [], chatId = null, mensajes = [], ctrl = null, mapa = null, mapaVivo = true;
  const guardado = (() => { try { return JSON.parse(localStorage.getItem(`am:brief:${slug}`) || '{}'); } catch { return {}; } })();
  const f = { titulo: '', modo: '', genero: '', bpm: '', tema: '', mood: '', referencia: '', estructura: '', concepto: '', semillas: '', restricciones: '', versiones: '1', profundidad: '', modelo: '', ...guardado };
  const guardarForm = debounce(() => { try { localStorage.setItem(`am:brief:${slug}`, JSON.stringify(f)); } catch { /* sin almacenamiento */ } }, 300);
  let verMapa = true; try { verMapa = localStorage.getItem('am:mapa') !== '0' && innerWidth > 1180; } catch { verMapa = innerWidth > 1180; }

  const mods = await modelos().catch(() => null);
  const modosDisponibles = meta?.modos || [];

  /* ---------- el constructor (izquierda) ---------- */
  const campo = (id, etiqueta, tipo = 'text', extra = {}) => {
    const ctl = tipo === 'textarea' ? h('textarea', { rows: extra.filas || 3, placeholder: extra.marcador || '', value: f[id] }) : h('input', { type: tipo, placeholder: extra.marcador || '', value: f[id], ...(tipo === 'number' ? { min: 40, max: 220 } : {}) });
    ctl.addEventListener('input', () => { f[id] = ctl.value; guardarForm(); });
    return h('div.field', h('label', etiqueta), ctl, extra.ayuda ? h('span.hint', extra.ayuda) : null);
  };
  const modosEl = h('div.modes', { role: 'group', 'aria-label': 'Modo de escritura' });
  const pintarModos = () => {
    poner(modosEl, h('button.mode', { 'aria-pressed': f.modo === '' ? 'true' : 'false', onclick: () => { f.modo = ''; guardarForm(); pintarModos(); } }, h('b', 'Que el cerebro decida'), h('small', 'Lo detecta por tus palabras; si duda, te pregunta.')),
      modosDisponibles.map((m) => h('button.mode', { 'aria-pressed': f.modo === m.nota ? 'true' : 'false', onclick: () => { f.modo = m.nota; guardarForm(); pintarModos(); } }, h('b', m.nombre), m.palabras?.length ? h('small', m.palabras.slice(0, 4).join(' · ')) : null)));
  };
  pintarModos();

  const anclasEl = h('div.linklist');
  const listaId = 'nombres-estudio';
  const datalist = h('datalist', { id: listaId });
  const anclaEntrada = h('input', { type: 'text', list: listaId, placeholder: 'Anclar una nota…', 'aria-label': 'Anclar una nota' });
  const pintarAnclas = () => poner(anclasEl, [...S.anclas].map((n) => h('span.linkchip', h('span', n), h('button', { 'aria-label': `Quitar ${n}`, style: { color: 'var(--muted)' }, onclick: () => anclar(n, false) }, icono('x', 13)))));
  const onAnclas = () => pintarAnclas(); bus.addEventListener('anclas', onAnclas); pintarAnclas();
  grafo().then((g) => { for (const n of g.nodes) datalist.append(h('option', { value: n.id })); }).catch(() => {});
  anclaEntrada.addEventListener('change', () => { const v = anclaEntrada.value.trim(); if (!v) return; if (S.nombres.includes(v)) { anclar(v); anclaEntrada.value = ''; } else aviso('Esa nota no existe. Elige una de la lista.', 'bad', 2500); });

  const modeloSels = [];
  const crearSelModelo = () => {
    const sel = h('select', { 'aria-label': 'Modelo', onchange: () => { f.modelo = sel.value; guardarForm(); for (const o of modeloSels) o.value = f.modelo; } });
    modeloSels.push(sel); return sel;
  };
  const pintarModelos = () => {
    for (const modeloSel of modeloSels) {
      vaciar(modeloSel);
      modeloSel.append(h('option', { value: '' }, 'Modelo: automático'));
      if (mods) for (const p of mods.proveedores) {
        const grupo = h('optgroup', { label: p.nombre + (p.configurada ? '' : ' — falta la llave') });
        for (const m of mods.catalogo.filter((x) => x.proveedor === p.id)) grupo.append(h('option', { value: m.id, disabled: !p.configurada || (m.entrena && !mods.ajustes.entrena), selected: f.modelo === m.id }, `${m.nombre}${m.entrena ? ' · entrena' : ''} (US$${m.in}/${m.out})`));
        modeloSel.append(grupo);
      }
      modeloSel.value = f.modelo;
    }
  };
  const modeloSelTop = crearSelModelo(), modeloSelForm = crearSelModelo();
  pintarModelos();
  const profSel = h('select', { 'aria-label': 'Profundidad', onchange: () => { f.profundidad = profSel.value; guardarForm(); } },
    [['', 'Según Ajustes'], ['ligera', 'Ligera'], ['normal', 'Normal'], ['profunda', 'Profunda']].map(([v, t]) => h('option', { value: v, selected: f.profundidad === v }, t)));
  const verSel = h('select', { 'aria-label': 'Versiones', onchange: () => { f.versiones = verSel.value; guardarForm(); } }, ['1', '2', '3'].map((v) => h('option', { value: v, selected: f.versiones === v }, v === '1' ? '1 versión' : `${v} versiones`)));

  const avanzadoAbierto = (() => { try { return localStorage.getItem('am:avanzado') === '1'; } catch { return false; } })();
  const avanzado = h('details.avanzado', { open: avanzadoAbierto, ontoggle: (e) => { try { localStorage.setItem('am:avanzado', e.currentTarget.open ? '1' : '0'); } catch { /* sin almacenamiento */ } } },
    h('summary', icono('chevron', 16), 'Avanzado', h('small', 'mood, referencia, estructura, semillas, modelo…')),
    h('div.stack', { style: { gap: '13px', paddingTop: '12px' } },
      campo('mood', 'Mood', 'text', { marcador: 'Oscuro, honesto, sin adornos' }),
      campo('referencia', 'Referencia sonora o artística', 'text', { marcador: 'Un beat, un artista, un tema' }),
      campo('estructura', 'Estructura', 'text', { marcador: 'Intro, 2 versos, coro, puente, outro' }),
      campo('concepto', 'Idea central propuesta', 'text', { marcador: 'La frase que vuelve como mantra' }),
      campo('semillas', 'Líneas semilla (tuyas, no se tocan)', 'textarea', { filas: 3, marcador: 'Líneas que ya tienes y quieres conservar' }),
      campo('restricciones', 'Restricciones', 'text', { marcador: 'Sin groserías, sin hablar de…' }),
      h('div.row2', h('div.field', h('label', 'Versiones'), verSel), h('div.field', h('label', 'Profundidad de lectura'), profSel)),
      h('div.field', h('label', 'Modelo'), modeloSelForm, h('span.hint', 'Automático usa lo que elegiste en Ajustes para escribir letras.')),
      h('div.field', h('label', 'Notas ancladas'), anclasEl, h('div.row', anclaEntrada, datalist), h('span.hint', 'El cerebro las leerá enteras. También puedes anclar desde Cerebro.'))));
  const constructor_ = h('aside.builder', { 'aria-label': 'Constructor de canciones' },
    h('div.row.between', h('h2', icono('sparkle', 18), 'Constructor'), h('button.btn.ghost.small.solo-movil', { onclick: () => estudio.classList.remove('show-builder') }, icono('x'), 'Cerrar')),
    campo('titulo', 'Título o concepto', 'text', { marcador: 'Ej.: Lo que no me dijeron' }),
    meta?.modos?.length ? h('div.field', h('label', 'Modo'), modosEl) : null,
    h('div.row2', campo('genero', 'Género', 'text', { marcador: 'Rap introspectivo' }), campo('bpm', 'BPM', 'number', { marcador: '90' })),
    campo('tema', 'Tema o situación', 'textarea', { marcador: 'De qué trata y qué pasó…' }),
    avanzado,
    h('div.acciones-fijas', h('button.btn.primary', { style: { width: '100%' }, onclick: () => escribirLetra('letra') }, icono('sparkle'), 'Escribir letra')),
    h('div.row', { style: { gap: '8px' } }, h('button.btn.small', { style: { flex: 1 }, title: 'Usa el modelo de «Borradores» (más barato) para explorar', onclick: () => escribirLetra('borrador') }, 'Borrador económico'),
      h('button.btn.ghost.small', { onclick: () => { for (const k of Object.keys(f)) if (!['modelo', 'profundidad'].includes(k)) f[k] = k === 'versiones' ? '1' : ''; guardarForm(); for (const n of [...S.anclas]) anclar(n, false); ir(slug, 'estudio', chatId); } }, 'Limpiar')));

  /* ---------- la conversación (centro) ---------- */
  const chatSel = h('select.chat-sel', { 'aria-label': 'Conversación', onchange: async () => { if (chatSel.value === '_nueva') await nuevaConversacion(); else await abrirChat(chatSel.value); } });
  const msgsInner = h('div.inner'), msgsEl = h('div.msgs', { role: 'log', 'aria-label': 'Conversación' }, msgsInner);
  const anuncio = h('div.sr', { role: 'status', 'aria-live': 'polite' });   // el lector avisa de lo importante sin leer la letra a cada fragmento
  const anunciar = (t) => { anuncio.textContent = ''; setTimeout(() => { anuncio.textContent = t; }, 50); };
  const entrada = h('textarea', { rows: 1, placeholder: esMovil() ? 'Pregúntale al cerebro…' : `Pregúntale al cerebro de ${brain?.name || 'este artista'}…`, 'aria-label': 'Mensaje' });
  const enviarBtn = h('button.send', { 'aria-label': 'Enviar', title: 'Enviar (Enter)', onclick: () => (ctrl ? ctrl.abort() : enviarTexto()) }, icono('send'));
  const rapidas = h('div.quick', RAPIDAS.map(([t, txt]) => h('button', { onclick: () => { entrada.value = txt; ajustarAlto(); entrada.focus(); } }, t)));
  const ajustarAlto = () => { entrada.style.height = 'auto'; entrada.style.height = Math.min(180, entrada.scrollHeight) + 'px'; };
  entrada.addEventListener('input', ajustarAlto);
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ctrl) enviarTexto(); } });
  const mapaBtn = h('button.btn.ghost.small.solo-escritorio', { title: 'Mapa de lo que lee el cerebro', 'aria-label': 'Mapa', onclick: () => { verMapa = !verMapa; try { localStorage.setItem('am:mapa', verMapa ? '1' : '0'); } catch { /* sin almacenamiento */ } montarMapa(); } }, icono('map'));
  const constructorBtn = h('button.btn.small', { onclick: () => estudio.classList.toggle('show-builder'), style: { display: esMovil() ? '' : 'none' } }, icono('sparkle'), 'Constructor');
  const chat = h('section.chat',
    h('div.top', constructorBtn, chatSel,
      h('button.btn.ghost.small.solo-movil', { 'aria-label': 'Más acciones de la conversación', 'aria-haspopup': 'dialog', onclick: menuChat }, icono('more')),
      h('button.btn.ghost.small.solo-escritorio', { title: 'Nueva conversación', 'aria-label': 'Nueva conversación', onclick: nuevaConversacion }, icono('plus')),
      h('button.btn.ghost.small.solo-escritorio', { title: 'Renombrar', 'aria-label': 'Renombrar conversación', onclick: renombrarChat }, icono('edit')),
      h('button.btn.ghost.small.solo-escritorio', { title: 'Borrar conversación', 'aria-label': 'Borrar conversación', onclick: borrarChat }, icono('trash')),
      h('div', { style: { flex: 1 } }), h('div.field.solo-escritorio', { style: { width: '230px', maxWidth: '40vw' } }, modeloSelTop), mapaBtn),
    msgsEl, anuncio, h('div.composer', h('div.inner', rapidas, h('div.box', entrada, enviarBtn))));

  const mapaEl = h('aside.mapcol', { 'aria-label': 'Lo que lee el cerebro' });
  const estudio = h('div.studio' + (verMapa ? '.with-map' : ''), constructor_, chat, verMapa ? mapaEl : null);
  poner(el, estudio);

  /* ---------- mensajes ---------- */
  const abajo = () => { msgsEl.scrollTop = msgsEl.scrollHeight; };
  const cercaDelFinal = () => msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 140;

  const opcionesMd = { existe: (x) => S.nombres.includes(x), alAbrir: (n) => irANota(n) };
  function bloquesDeLetra(texto, m, { enVivo = false } = {}) {
    return vistaDeLetra(texto, { ...opcionesMd, enVivo, pie: m?.id ? (v, p) => h('div.row.wrap', { style: { gap: '6px' } },
      h('button.btn.small', { onclick: () => guardarCancion(m, v, p.versiones.length > 1) }, icono('songs'), 'Guardar como canción'),
      h('button.btn.small.solo-escritorio', { onclick: () => corregirVersion(m, v) }, icono('edit'), 'Corregir'),
      h('button.btn.small.solo-escritorio', { onclick: () => abrirParaSuno({ titulo: m.meta?.brief?.titulo, version: v, brief: m.meta?.brief }) }, icono('upload'), 'Para Suno'),
      h('button.btn.ghost.small.solo-escritorio', { onclick: () => copiarTextoLimpio(v, m.meta?.brief?.titulo) }, icono('copy'), 'Copiar letra'),
      h('button.btn.ghost.small.solo-escritorio', { onclick: () => refinar(v) }, icono('edit'), 'Refinar'),
      h('button.btn.small.solo-movil', { 'aria-label': 'Más acciones de esta versión', 'aria-haspopup': 'dialog', onclick: () => menuVersion(m, v) }, icono('more'))) : null });
  }

  /** El artista corrige la letra ahí mismo: se guarda en la conversación (el siguiente turno parte de ESA letra) y se le ofrece enseñarle al cerebro lo que cambió. */
  function corregirVersion(m, v) {
    const area = h('textarea.corregir', { value: v.crudo, spellcheck: 'false', 'aria-label': 'Letra para corregir' });
    dialogo({ titulo: 'Corregir la letra', sub: 'Cambia lo que quieras. Se guarda aquí mismo y el cerebro seguirá trabajando con tu versión. Después podrás enseñarle qué cambiaste.', ancho: true,
      cuerpo: h('div.field', area, h('span.hint', 'Las secciones van entre corchetes: [VERSO 1], [CORO]… Lo que dejes bajo «Notas técnicas» no cuenta como letra.')),
      acciones: [{ texto: 'Cancelar', tipo: 'ghost' }, { texto: 'Guardar corrección', tipo: 'primary', onclick: async () => {
        const nuevo = area.value.trim();
        if (!nuevo) { aviso('La letra no puede quedar vacía.', 'bad'); return false; }
        if (nuevo === v.crudo.trim()) { aviso('No hay cambios que guardar.'); return false; }
        const contenido = m.content.replace(v.crudo, () => nuevo);
        await A.patch(`chats/${encodeURIComponent(chatId)}/messages/${m.id}`, { texto: contenido });
        const antes = textoLimpio(v), despues = textoLimpio(parsear(nuevo).versiones[0]);
        await abrirChat(chatId);
        ofrecerAprender({ antes, despues, titulo: m.meta?.brief?.titulo || primeraLinea(v), modo: m.meta?.modo?.nota || '' });
      } }] });
  }
  const refinar = (v) => { entrada.value = `Refina la ${v.etiqueta ? 'versión ' + v.etiqueta : 'letra'}: `; ajustarAlto(); entrada.focus(); };
  function menuVersion(m, v) {
    const fila = (ic, t, fn) => h('button.list-row', { style: { textAlign: 'left', width: '100%' }, onclick: () => { d.cerrar(); fn(); } }, icono(ic), h('div.grow', h('b', t)));
    const d = dialogo({ titulo: v.etiqueta ? `Versión ${v.etiqueta}` : 'Esta letra', cuerpo: h('div.stack', { style: { gap: '8px' } }, fila('edit', 'Corregir la letra', () => corregirVersion(m, v)), fila('upload', 'Copiar para Suno', () => abrirParaSuno({ titulo: m.meta?.brief?.titulo, version: v, brief: m.meta?.brief })), fila('copy', 'Copiar la letra (texto limpio)', () => copiarTextoLimpio(v, m.meta?.brief?.titulo)), fila('edit', 'Refinar esta versión', () => refinar(v)), fila('copy', 'Copiar todo el mensaje (con notas técnicas)', () => copiar(m.content))) });
  }
  function menuChat() {
    const fila = (ic, t, fn, peligro) => h('button.list-row', { style: { textAlign: 'left', width: '100%', ...(peligro ? { color: 'var(--bad)' } : {}) }, onclick: () => { d.cerrar(); fn(); } }, icono(ic), h('div.grow', h('b', t)));
    const d = dialogo({ titulo: 'Conversación', cuerpo: h('div.stack', { style: { gap: '8px' } }, fila('plus', 'Nueva conversación', nuevaConversacion), fila('edit', 'Renombrar', renombrarChat), fila('sparkle', 'Modelo y profundidad', () => estudio.classList.add('show-builder')), fila('trash', 'Borrar conversación', borrarChat, true)) });
  }
  function cajaLeida(info) {
    if (!info) return null;
    const leidas = info.leidas || [], fijas = info.fijas || [];
    const chip = (n, motivo) => h('button.linkchip', { title: n, onclick: () => irANota(n) }, h('span', n), motivo ? h('span.why', MOTIVO[motivo] || motivo) : null);
    return h('details.readbox', h('summary', icono('brain', 15), `Leyó ${leidas.length} nota${leidas.length === 1 ? '' : 's'} + ${fijas.length} fijas${info.modo?.nombre ? ' · ' + info.modo.nombre : ''}${info.significado ? ' · con significado' : ''}`),
      h('div.linklist', fijas.map((n) => chip(n, 'siempre')), leidas.map((x) => chip(x.nombre, x.motivo))),
      info.omitidas?.sinSitio?.length ? h('div.faint', { style: { padding: '0 12px 10px', fontSize: '12px' } }, `${info.omitidas.sinSitio.length} notas quedaron fuera por falta de espacio (sube la profundidad).`) : null,
      ...(info.omitidas?.recortadas || []).map((r) => h('div', { style: { padding: '0 12px 10px', fontSize: '12px', color: 'var(--warn)' }, role: 'note' }, `«${r.nombre}» es muy larga (${num(r.caracteres)} caracteres) y se leyó recortada por el medio. Conviene ordenarla o resumirla.`)));
  }

  const CONTINUAR = 'Continúa exactamente donde te quedaste, sin repetir nada de lo anterior.';
  /** Aviso bajo una respuesta que no llegó entera, con el botón para continuarla (solo en la última). */
  function avisoDeCorte(meta2, esUltima) {
    const texto = meta2.error ? `Se cortó: ${meta2.error}` : meta2.parada === 'max_tokens' ? 'La respuesta llegó al límite de longitud y quedó cortada.' : meta2.incompleta ? 'La conexión se cortó antes de terminar la respuesta.' : meta2.interrumpida ? 'Detenida antes de terminar.' : '';
    if (!texto) return null;
    return h('div.corte', { role: 'note' }, h('span', texto), esUltima ? h('button.btn.small', { onclick: () => { if (!ctrl) enviar({ texto: CONTINUAR, fn: meta2.fn === 'letra' || meta2.fn === 'borrador' ? meta2.fn : 'chat' }); } }, icono('refresh'), 'Continuar') : null);
  }

  function pintarMensaje(m, esUltima = false) {
    if (m.role === 'user') {
      const esBrief = !!m.meta?.brief;
      return h('div.msg.user', h('div.bubble' + (esBrief ? '.brief' : ''), esBrief ? m.content : m.content));
    }
    const meta2 = m.meta || {};
    const infoLeida = { leidas: meta2.leidas || [], fijas: meta2.fijas || [], modo: meta2.modo, significado: undefined, omitidas: meta2.omitidas };
    return h('div.msg.bot', { 'data-id': m.id },
      h('div.who', h('span.orb'), h('b', { style: { color: 'var(--text-2)', fontWeight: 600 } }, brain?.name || 'Cerebro'), h('span', meta2.nombreModelo || ''), meta2.entrena ? h('span.tag.warn', 'entrena') : null, meta2.modo?.nombre ? h('span.tag.accent', meta2.modo.nombre) : null, meta2.editada ? h('span.tag.good', 'corregida por ti') : null),
      meta2.leidas ? cajaLeida(infoLeida) : null, bloquesDeLetra(m.content, m),
      avisoDeCorte(meta2, esUltima),
      h('div.msg-foot', meta2.usd != null ? h('span', usd(meta2.usd)) : null, meta2.uso?.output_tokens ? h('span', `${num(meta2.uso.input_tokens || 0)} → ${num(meta2.uso.output_tokens)} tokens`) : null,
        h('button.btn.ghost.small', { onclick: () => copiar(m.content) }, icono('copy'), 'Copiar todo')));
  }

  function pintarMensajes() {
    vaciar(msgsInner);
    if (!mensajes.length) {
      msgsInner.append(h('div.empty', { style: { padding: '40px 10px' } }, h('span.orb', { style: { width: '44px', height: '44px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff8, transparent 40%), var(--accent)', boxShadow: '0 0 40px color-mix(in srgb, var(--accent) 55%, transparent)' } }),
        h('b', `Escribe con el cerebro de ${brain?.name || 'este artista'}`),
        h('span', { style: { maxWidth: '52ch' } }, `Lee ${meta?.siempre?.length || 0} notas fijas (reglas de oro, firma, lo aprendido) y busca en ${num(meta?.stats?.notas || 0)} neuronas lo que hace falta para cada encargo. Rellena el constructor o simplemente conversa.`),
        meta?.modos?.length ? h('span.faint', `Modos: ${meta.modos.map((x) => x.nombre).join(' · ')}`) : null,
        mods && mods.proveedores.every((p) => !p.configurada) ? h('div.aviso-llave', { role: 'note' }, icono('warn', 18), h('div', h('b', 'Falta la llave de un modelo'), h('span', 'El cerebro puede leer tus notas, pero no escribir hasta que añadas ANTHROPIC_API_KEY o META_API_KEY en Cloudflare.')), h('button.btn.small', { onclick: () => ir('ajustes') }, 'Ver Ajustes')) : null));
      return;
    }
    mensajes.forEach((m, i) => msgsInner.append(pintarMensaje(m, i === mensajes.length - 1)));
    abajo();
  }

  /* ---------- conversaciones ---------- */
  function pintarChats() {
    vaciar(chatSel);
    chatSel.append(h('option', { value: '_nueva' }, '+ Nueva conversación'));
    for (const c of chats) chatSel.append(h('option', { value: c.id, selected: c.id === chatId }, c.title));
    chatSel.value = chatId || '_nueva';
  }
  async function cargarChats() { chats = (await A.get('chats')).conversaciones; pintarChats(); }
  async function abrirChat(id) {
    try { const c = await A.get(`chats/${encodeURIComponent(id)}`); chatId = c.id; mensajes = c.mensajes; } catch (e) { fallo(e); return; }
    history.replaceState(null, '', `#/${encodeURIComponent(slug)}/estudio/${encodeURIComponent(chatId)}`);
    pintarChats(); pintarMensajes();
    const ultimo = [...mensajes].reverse().find((m) => m.role === 'assistant');
    if (ultimo?.meta?.leidas) marcarMapa({ leidas: ultimo.meta.leidas, fijas: ultimo.meta.fijas || [], modo: ultimo.meta.modo }, false);
  }
  async function nuevaConversacion() {
    if (ctrl) return;
    chatId = null; mensajes = []; history.replaceState(null, '', `#/${encodeURIComponent(slug)}/estudio`); pintarChats(); pintarMensajes(); entrada.focus();
  }
  async function asegurarChat(titulo) {
    if (chatId) return chatId;
    const r = await A.post('chats', { titulo: titulo || 'Nueva conversación' });
    chatId = r.conversacion.id; chats.unshift(r.conversacion); pintarChats();
    history.replaceState(null, '', `#/${encodeURIComponent(slug)}/estudio/${encodeURIComponent(chatId)}`);
    return chatId;
  }
  async function renombrarChat() {
    if (!chatId) return;
    const v = await pedir({ titulo: 'Renombrar conversación', campos: [{ id: 't', etiqueta: 'Título', valor: chats.find((c) => c.id === chatId)?.title || '' }], validar: (x) => (x.t.trim() ? '' : 'Pon un título.') });
    if (!v) return;
    try { await A.patch(`chats/${encodeURIComponent(chatId)}`, { title: v.t.trim() }); await cargarChats(); } catch (e) { fallo(e); }
  }
  async function borrarChat() {
    if (!chatId || !(await confirmar({ titulo: 'Borrar conversación', texto: 'Se borra el hilo. Las canciones que guardaste de él se quedan.', ok: 'Borrar', peligro: true }))) return;
    try { await A.del(`chats/${encodeURIComponent(chatId)}`); chatId = null; mensajes = []; await cargarChats(); pintarMensajes(); } catch (e) { fallo(e); }
  }

  /* ---------- enviar ---------- */
  function briefDeForm() {
    const b = {}; for (const k of ['titulo', 'genero', 'bpm', 'tema', 'mood', 'referencia', 'estructura', 'concepto', 'semillas', 'restricciones']) if (String(f[k]).trim()) b[k] = String(f[k]).trim();
    b.versiones = Number(f.versiones) || 1; if (f.modo) b.modo = f.modo; return b;
  }
  async function escribirLetra(fn) {
    const brief = briefDeForm();
    if (!brief.titulo && !brief.tema && !brief.concepto) { aviso('Cuéntale al cerebro de qué va: pon al menos un título, un tema o una idea central.', 'bad', 4200); return; }
    estudio.classList.remove('show-builder');
    await enviar({ brief, fn });
  }
  async function enviarTexto() {
    const texto = entrada.value.trim(); if (!texto || ctrl) return;
    entrada.value = ''; ajustarAlto();
    const ok = await enviar({ texto, fn: 'chat' }); if (!ok) { entrada.value = texto; ajustarAlto(); }
  }

  async function enviar({ brief, texto, fn }) {
    if (ctrl) return false;
    let id;
    try { id = await asegurarChat(brief?.titulo || brief?.tema || texto); } catch (e) { fallo(e); return false; }
    if (!mensajes.length) vaciar(msgsInner);
    const burbuja = h('div.msg.user', h('div.bubble' + (brief ? '.brief' : ''), brief ? 'ENCARGO DE LETRA\n' + Object.entries(brief).filter(([k]) => k !== 'versiones' || brief.versiones > 1).map(([k, v]) => `${k}: ${v}`).join('\n') : texto));
    const orbe = h('span.orb.think'), cuerpo = h('div'), quien = h('div.who', orbe, h('b', { style: { color: 'var(--text-2)', fontWeight: 600 } }, brain?.name || 'Cerebro'), h('span', 'leyendo la memoria…'));
    const leida = h('div'), pie = h('div.msg-foot');
    const respuesta = h('div.msg.bot', quien, leida, cuerpo, pie);
    msgsInner.append(burbuja, respuesta); abajo();
    anunciar('El cerebro está leyendo y escribiendo…');
    ctrl = new AbortController(); enviarBtn.replaceChildren(icono('x')); enviarBtn.title = 'Detener'; enviarBtn.setAttribute('aria-label', 'Detener');
    let acumulado = '', info = null, hecho = null, fallido = null, pendiente = 0, interrumpido = false;
    const pintarCuerpo = () => { pendiente = 0; const pegado = cercaDelFinal(); poner(cuerpo, acumulado ? bloquesDeLetra(acumulado, null, { enVivo: true }) : null); if (pegado) abajo(); };
    const cuerpoPeticion = { fn, anclas: [...S.anclas], modo: f.modo || null, ...(f.modelo ? { model: f.modelo } : {}), ...(f.profundidad ? { profundidad: f.profundidad } : {}), ...(brief ? { brief } : { texto }) };
    try {
      await flujo(`${A.base}chats/${encodeURIComponent(id)}/message`, cuerpoPeticion, {
        contexto(i) {
          info = i; poner(quien, orbe, h('b', { style: { color: 'var(--text-2)', fontWeight: 600 } }, brain?.name || 'Cerebro'), h('span', i.modelo.nombre), i.modelo.entrena ? h('span.tag.warn', 'entrena') : null, i.modo?.nombre ? h('span.tag.accent', i.modo.nombre) : i.modo?.pregunta ? h('span.tag.warn', 'modo incierto') : null);
          poner(leida, cajaLeida(i)); for (const a of i.avisos || []) aviso(a, '', 6000); marcarMapa(i, true);
        },
        texto(t) { acumulado += t; orbe.classList.remove('think'); if (!pendiente) pendiente = requestAnimationFrame(pintarCuerpo); },
        hecho(d) { hecho = d; },
        error(m) { fallido = m; },
      }, { senal: ctrl.signal });
    } catch (e) {
      if (e.name !== 'AbortError' && (info || acumulado)) {
        interrumpido = true;   // la conexión se cayó a mitad (pantalla apagada, cambio de red): lo recibido NO se borra
      } else if (e.name !== 'AbortError') {
        // el servidor rechazó antes de empezar: nada quedó guardado
        burbuja.remove(); respuesta.remove(); fallo(e); ctrl = null; reponerBoton();
        if (e.codigo === 'sin_llave' || e.codigo === 'entrena' || e.codigo === 'tope') aviso('Ve a Ajustes para resolverlo.', '', 5000);
        if (!mensajes.length) pintarMensajes();
        return false;
      }
    }
    cancelAnimationFrame(pendiente); orbe.classList.remove('think'); pintarCuerpo();
    const sinFinal = !hecho && !fallido && !ctrl.signal.aborted;   // el flujo terminó sin avisar de que acabó: se cayó
    if (fallido) fallo(new Error(fallido));
    else if (interrumpido || sinFinal) aviso('Se interrumpió la conexión con el servidor. Lo que llegó quedó guardado; si falta, pulsa «Continuar».', 'bad', 9000);
    else anunciar('La respuesta está lista.');
    ctrl = null; reponerBoton();
    bus.dispatchEvent(new Event('gasto'));
    try { await abrirChat(id); await cargarChats(); } catch { /* ya está en pantalla lo esencial */ }
    return true;
  }
  const reponerBoton = () => { enviarBtn.replaceChildren(icono('send')); enviarBtn.title = 'Enviar (Enter)'; enviarBtn.setAttribute('aria-label', 'Enviar'); };

  async function guardarCancion(m, v, varias) {
    const sugerido = (m.meta?.brief?.titulo || primeraLinea(v) || 'Sin título') + (varias && v.etiqueta ? ` (versión ${v.etiqueta})` : '');
    const r = await pedir({ titulo: 'Guardar como canción', sub: 'Quedará en Canciones, donde podrás aprobarla o rechazarla para que el cerebro aprenda.', ok: 'Guardar', campos: [{ id: 't', etiqueta: 'Título', valor: sugerido }], validar: (x) => (x.t.trim() ? '' : 'Ponle un título.') });
    if (!r) return;
    try {
      const x = await A.post('songs', { titulo: r.t.trim(), texto: v.crudo, mensajeId: m.id, brief: m.meta?.brief || {} });
      recargarMeta(); const t = aviso('Guardada en Canciones. ', 'good', 8000);
      t.append(h('button.btn.ghost.small', { style: { marginLeft: '6px' }, onclick: () => ir(slug, 'canciones', x.cancion.id) }, 'Evaluar'));
    } catch (e) { fallo(e); }
  }

  /* ---------- el mapa de lo que lee ---------- */
  async function montarMapa() {
    estudio.classList.toggle('with-map', verMapa);
    if (!verMapa) { mapa?.destruir(); mapa = null; mapaEl.remove(); return; }
    estudio.append(mapaEl);
    const lienzo = h('canvas', { 'aria-hidden': 'true' }), zona = h('div.map', lienzo), leyenda = h('div.legend', { id: 'leyenda-mapa' }, h('span.faint', 'Aquí verás qué neuronas despierta cada encargo.'));
    poner(mapaEl, zona, leyenda);
    try {
      const g = await grafo();
      if (!mapaVivo || !verMapa) return;
      mapa?.destruir(); mapa = new Graph3D(lienzo, { mini: true, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-ui').trim(), clave: `am:layout:${slug}` });
      mapa.setData(g); if (ultimoInfo) marcarMapa(ultimoInfo, false);
    } catch { /* sin mapa: el chat sigue funcionando */ }
  }
  let ultimoInfo = null;
  function marcarMapa(info, animar) {
    ultimoInfo = info;
    const leyenda = document.getElementById('leyenda-mapa');
    if (leyenda) {
      const por = {}; for (const l of info.leidas || []) por[l.motivo] = (por[l.motivo] || 0) + 1;
      poner(leyenda, h('div.row.wrap', { style: { gap: '6px', marginBottom: '8px' } }, h('span.tag.warn', `${info.fijas?.length || 0} fijas`), Object.entries(por).map(([k, n]) => h('span.tag' + (k === 'modo' || k === 'busqueda' ? '.accent' : ''), `${n} ${MOTIVO[k] || k}`))),
        h('div.linklist', (info.leidas || []).slice(0, 24).map((l) => h('button.linkchip', { title: l.nombre, onclick: () => irANota(l.nombre) }, h('span', l.nombre)))));
    }
    if (!mapa) return;
    const m = new Map();
    for (const n of info.fijas || []) m.set(n, 'siempre');
    for (const l of info.leidas || []) m.set(l.nombre, l.motivo === 'modo' ? 'modo' : l.motivo === 'anclada' ? 'anclada' : l.motivo === 'busqueda' ? 'busqueda' : 'vecina');
    mapa.marcar(m);
    if (animar) {
      const origen = info.modo?.nota || (info.leidas || []).find((l) => l.motivo === 'anclada')?.nombre || (info.leidas || [])[0]?.nombre;
      if (origen) mapa.pulsar(origen, (info.leidas || []).map((l) => l.nombre).filter((n) => n !== origen).slice(0, 18));
    }
  }

    try { const pf = localStorage.getItem(`am:prefill:${slug}`); if (pf) { entrada.value = pf; localStorage.removeItem(`am:prefill:${slug}`); ajustarAlto(); setTimeout(() => entrada.focus(), 80); } } catch { /* sin almacenamiento */ }
  await cargarChats();
  const abrirId = param && chats.some((c) => c.id === param) ? param : null;
  if (abrirId) await abrirChat(abrirId); else pintarMensajes();
  if (verMapa) montarMapa();
  return { destruir() { mapaVivo = false; mapa?.destruir(); ctrl?.abort(); bus.removeEventListener('anclas', onAnclas); } };
}
