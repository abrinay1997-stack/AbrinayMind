// Abrinay Mind — Notas: el árbol de carpetas y el editor. Escribir, editar, renombrar (reescribe los enlaces), mover y mandar a la papelera.
import { h, poner, icono, aviso, fallo, confirmar, pedir, dialogo, debounce, num, fechaHora, esMovil, copiar, vaciar, esqueleto } from '../ui.js';
import { S, api, ir, invalidarGrafo, recargarMeta } from '../store.js';
import { notaAHtml } from '../md.js';
import { fold, enlaces as enlacesDe } from '/core/text.js';

const PLANTILLAS = {
  simple: (n) => `# ${n}\n\n`,
  idea: (n) => `---\ntipo: idea\nestado: borrador\n---\n# ${n}\n\n## Concepto\n\n## Líneas semilla\n\n## Notas\n\n`,
};

function caretXY(ta, pos) {
  const d = document.createElement('div'), cs = getComputedStyle(ta);
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'tabSize']) d.style[p] = cs[p];
  Object.assign(d.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', boxSizing: 'border-box', top: '0', left: '-9999px', width: ta.clientWidth + 'px' });
  d.textContent = ta.value.slice(0, pos); const s = document.createElement('span'); s.textContent = '.'; d.append(s); document.body.append(d);
  const r = ta.getBoundingClientRect(), lh = parseFloat(cs.lineHeight) || 20;
  const out = { x: r.left + s.offsetLeft - ta.scrollLeft, y: r.top + s.offsetTop - ta.scrollTop + lh };
  d.remove(); return out;
}

export async function montar(el, { param }) {
  const A = api(), slug = S.slug;
  let notas = [], nombres = new Set(), porPlegado = new Map(), actual = null, sucio = false, textoGuardado = '', modo = 'dividir', filtro = '', remoto = null;
  try { modo = localStorage.getItem('am:notas:modo') || (esMovil() ? 'leer' : 'dividir'); } catch { /* por defecto */ }
  if (esMovil() && modo === 'dividir') modo = 'leer';
  const cerradas = new Set(); let abiertasPorUsuario = new Set();

  const arbolEl = h('div.list'), filtroEl = h('input', { type: 'search', placeholder: 'Filtrar notas…', 'aria-label': 'Filtrar notas', autocomplete: 'off' });
  const raiz = h('div.notes', h('aside.tree', { 'aria-label': 'Notas' },
    h('div.top', h('div.row', { style: { gap: '8px' } }, filtroEl, h('button.btn.small.primary', { title: 'Nueva nota', 'aria-label': 'Nueva nota', onclick: () => nueva() }, icono('plus'))),
      h('div.row.between', h('span.faint', { id: 'cuenta', style: { fontSize: '12px' } }), h('button.btn.ghost.small', { onclick: papelera }, icono('trash'), 'Papelera'))), arbolEl));
  const editorEl = h('section.editor'); raiz.append(editorEl);
  poner(el, raiz);

  /* ---------- árbol ---------- */
  async function cargarLista() {
    notas = (await A.get('notes')).notas; nombres = new Set(notas.map((n) => n.name)); porPlegado = new Map(notas.map((n) => [fold(n.name), n.name])); S.nombres = [...nombres];
    pintarArbol();
  }
  function construir(lista) {
    const raizA = { hijos: new Map(), notas: [] };
    for (const n of lista) {
      let nodo = raizA; const partes = (n.folder || '').split('/').filter(Boolean);
      partes.forEach((p, i) => { if (!nodo.hijos.has(p)) nodo.hijos.set(p, { hijos: new Map(), notas: [], ruta: partes.slice(0, i + 1).join('/') }); nodo = nodo.hijos.get(p); });
      nodo.notas.push(n);
    }
    return raizA;
  }
  const total = (nodo) => nodo.notas.length + [...nodo.hijos.values()].reduce((s, x) => s + total(x), 0);
  function pintarItem(n) {
    return h('button.item', { 'aria-current': actual?.name === n.name ? 'true' : null, title: n.name, onclick: () => abrir(n.name) },
      h('i.dot' + (n.always ? '.siempre' : n.private ? '.priv' : '')), h('span.n', n.name));
  }
  function pintarNodo(nombre, nodo, nivel) {
    const ruta = nodo.ruta, cerrada = filtro ? false : (ruta && (cerradas.has(ruta) || (!abiertasPorUsuario.has(ruta) && nivel === 0 && !contiene(nodo, actual?.name) && true)));
    const f = h('div.folder' + (cerrada ? '.closed' : ''));
    f.append(h('button.fname', { 'aria-expanded': !cerrada, onclick: () => { if (f.classList.toggle('closed')) { cerradas.add(ruta); abiertasPorUsuario.delete(ruta); } else { cerradas.delete(ruta); abiertasPorUsuario.add(ruta); } } }, icono('chevron'), h('span', { style: { flex: 1, textAlign: 'left' } }, nombre), h('span.faint', { style: { fontWeight: 400 } }, num(total(nodo)))),
      h('div.items', [...nodo.hijos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true })).map(([n, x]) => pintarNodo(n, x, nivel + 1)), nodo.notas.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(pintarItem)));
    return f;
  }
  const contiene = (nodo, nombre) => !!nombre && (nodo.notas.some((n) => n.name === nombre) || [...nodo.hijos.values()].some((x) => contiene(x, nombre)));
  function pintarArbol() {
    const q = filtro.trim(); vaciar(arbolEl);
    const lista = q ? notas.filter((n) => fold(n.name).includes(fold(q))) : notas;
    raiz.querySelector('#cuenta').textContent = q ? `${num(lista.length)} de ${num(notas.length)} notas` : `${num(notas.length)} notas`;
    if (q) {
      arbolEl.append(...lista.slice(0, 120).map(pintarItem));
      if (q.length >= 3) arbolEl.append(h('button.item', { style: { color: 'var(--accent)', marginTop: '6px' }, onclick: () => buscarContenido(q) }, icono('search', 15), h('span.n', `Buscar «${q}» dentro de las notas`)));
      if (remoto && remoto.q === q) arbolEl.append(h('div.section-title', { style: { margin: '12px 6px 6px' } }, 'Dentro del contenido'), ...remoto.items.map((r) => h('button.item', { title: r.pasajes?.[0]?.slice(0, 200) || '', onclick: () => abrir(r.nombre) }, h('i.dot'), h('span.n', r.nombre), h('span.faint', { style: { fontSize: '11px' } }, `${Math.round(r.score * 100)}%`))));
      return;
    }
    const nodo = construir(notas);
    for (const n of nodo.notas.sort((a, b) => a.name.localeCompare(b.name, 'es'))) arbolEl.append(pintarItem(n));
    for (const [n, x] of [...nodo.hijos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))) arbolEl.append(pintarNodo(n, x, 0));
  }
  async function buscarContenido(q) {
    try { const r = await A.get(`search?q=${encodeURIComponent(q)}&n=20`); remoto = { q, items: r.resultados }; pintarArbol(); } catch (e) { fallo(e); }
  }
  filtroEl.addEventListener('input', debounce(() => { filtro = filtroEl.value; remoto = null; pintarArbol(); }, 120));

  /* ---------- abrir / editar ---------- */
  async function confirmarSalida() {
    if (!sucio) return true;
    return confirmar({ titulo: 'Hay cambios sin guardar', texto: `«${actual.name}» tiene cambios que aún no guardaste. ¿Los descartas?`, ok: 'Descartar cambios', peligro: true });
  }
  async function abrir(nombre, { forzar = false } = {}) {
    if (!forzar && actual?.name === nombre) { raiz.classList.remove('show-tree'); return; }
    if (!(await confirmarSalida())) return;
    try { actual = await A.get(`note?name=${encodeURIComponent(nombre)}`); } catch (e) { fallo(e); return; }
    sucio = false; textoGuardado = actual.text; raiz.classList.remove('show-tree');
    history.replaceState(null, '', `#/${encodeURIComponent(slug)}/notas/${encodeURIComponent(nombre)}`);
    pintarEditor(); pintarArbol();
  }

  const estadoGuardado = h('span.dirty', { hidden: true, title: 'Cambios sin guardar' });
  let ta, vista, pie;
  function pintarEditor() {
    editorEl.classList.toggle('split', modo === 'dividir');
    if (!actual) {
      poner(editorEl, h('div.bar', h('button.btn.ghost.small.volver', { onclick: () => raiz.classList.add('show-tree'), style: { display: esMovil() ? '' : 'none' } }, icono('chevron'), 'Notas')),
        h('div.empty', { style: { flex: 1 } }, icono('notes', 36), h('b', 'Elige una nota'), h('span', 'Cada nota es una neurona. Los [[enlaces]] que escribas son sus sinapsis.'), h('button.btn.primary', { onclick: () => nueva() }, icono('plus'), 'Nueva nota')));
      return;
    }
    ta = h('textarea.src', { spellcheck: 'false', 'aria-label': `Texto de ${actual.name}`, value: actual.text });
    vista = h('div.pane');
    const modoBtn = (id, ic, t) => h('button.btn.ghost.small', { title: t, 'aria-label': t, 'aria-pressed': modo === id, style: modo === id ? { color: 'var(--text)', background: 'var(--surface-2)' } : {}, onclick: () => { modo = id; try { localStorage.setItem('am:notas:modo', id); } catch { /* sin almacenamiento */ } pintarEditor(); } }, icono(ic));
    pie = h('div.foot');
    const bGuardar = h('button.btn.primary.small', { id: 'guardar', disabled: !sucio, onclick: guardar }, icono('save'), 'Guardar');
    const segMovil = h('div.seg', { role: 'radiogroup', 'aria-label': 'Modo de la nota' }, [['leer', 'Leer', 'eye'], ['editar', 'Editar', 'edit']].map(([id, t, ic]) => h('button', { type: 'button', role: 'radio', 'aria-checked': modo === id ? 'true' : 'false', onclick: () => { modo = id; try { localStorage.setItem('am:notas:modo', id); } catch { /* sin almacenamiento */ } pintarEditor(); if (id === 'editar') setTimeout(() => ta?.focus(), 30); } }, icono(ic, 16), t)));
    const barra = esMovil()
      ? h('div.bar.bar-m', h('div.row', { style: { width: '100%', gap: '6px' } }, h('button.btn.ghost.small.volver', { onclick: () => raiz.classList.add('show-tree') }, icono('chevron'), 'Notas'), h('h2', actual.name), estadoGuardado),
        h('div.row', { style: { width: '100%', gap: '8px' } }, segMovil, h('div', { style: { flex: 1 } }), bGuardar, h('button.btn.small', { 'aria-label': 'Más acciones', 'aria-haspopup': 'dialog', onclick: menuMas }, icono('more'))))
      : h('div.bar', h('h2', actual.name), estadoGuardado,
        h('div.row', { style: { gap: '2px' } }, modoBtn('leer', 'eye', 'Solo lectura'), modoBtn('dividir', 'split', 'Editar y ver a la vez'), modoBtn('editar', 'code', 'Solo texto')),
        bGuardar,
        h('button.btn.ghost.small', { title: 'Ver en el cerebro', 'aria-label': 'Ver en el cerebro', onclick: () => ir(slug, 'cerebro', actual.name) }, icono('graph')),
        h('button.btn.ghost.small', { title: 'Renombrar', 'aria-label': 'Renombrar', onclick: renombrar }, icono('edit')),
        h('button.btn.ghost.small', { title: 'Mover de carpeta', 'aria-label': 'Mover', onclick: mover }, icono('folder')),
        h('button.btn.ghost.small', { title: 'Mandar a la papelera', 'aria-label': 'Eliminar', onclick: eliminar }, icono('trash')));
    const paneles = h('div.panes');
    if (modo !== 'leer') paneles.append(ta);
    if (modo !== 'editar') paneles.append(vista);
    poner(editorEl, barra, paneles, pie);
    estadoGuardado.hidden = !sucio;
    pintarVista(); pintarPie(); activarAutocompletar();
    ta.addEventListener('input', () => { sucio = ta.value !== textoGuardado; estadoGuardado.hidden = !sucio; document.getElementById('guardar').disabled = !sucio; vistaLenta(); pieLento(); });
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); } });
    if (modo === 'editar' && !esMovil()) setTimeout(() => ta.focus(), 30);
  }
  const textoActual = () => (ta ? ta.value : actual?.text ?? '');
  const vistaLenta = debounce(() => pintarVista(true), 140), pieLento = debounce(() => pintarPie(), 200);
  function pintarVista(sinListas = false) {
    if (!vista) return;
    const pos = vista.scrollTop;
    const { fm, html } = notaAHtml(textoActual(), { existe: (x) => porPlegado.has(fold(x)) });
    const cuerpo = h('div.md'); cuerpo.innerHTML = html;
    cuerpo.addEventListener('click', (e) => { const a = e.target.closest('a.wiki'); if (!a) return; e.preventDefault(); const real = porPlegado.get(fold(a.dataset.note)); if (real) abrir(real); else crearDesdeEnlace(a.dataset.note); });
    const props = Object.entries(fm).filter(([k]) => k !== 'alias' || true);
    const chip = (nombre, extra, real) => h('button.linkchip' + (porPlegado.has(fold(real || nombre)) ? '' : '.broken'), { title: nombre, onclick: () => (porPlegado.has(fold(real || nombre)) ? abrir(porPlegado.get(fold(real || nombre))) : crearDesdeEnlace(nombre)) }, h('span', nombre), extra || null);
    const grupo = (t, items) => (items?.length ? [h('div.section-title', t), h('div.linklist', items)] : []);
    poner(vista, props.length ? h('dl.props', props.map(([k, v]) => [h('dt', k), h('dd', String(v).replace(/\[\[|\]\]/g, ''))])) : null, cuerpo,
      sinListas || sucio ? null : [h('div.divider'), grupo('Enlaza a', actual.salientes.map((s) => chip(s.target, null, s.name))), grupo('Enlazada desde', actual.entrantes.map((x) => chip(x))),
        grupo('Parecidas por significado', actual.parecidas.map((x) => chip(x.name, h('span.faint', `${Math.round(x.sim * 100)}%`)))), grupo('Menciona a', actual.nombra.map((x) => chip(x))), grupo('Mencionada por', actual.mencionadaPor.map((x) => chip(x)))]);
    vista.scrollTop = pos;
  }
  function pintarPie() {
    if (!pie) return;
    const t = textoActual(), palabras = (t.match(/\S+/g) || []).length, en = enlacesDe(t), rotos = en.filter((e) => !porPlegado.has(fold(e))).length;
    poner(pie, h('span', `${num(t.length)} caracteres · ${num(palabras)} palabras`), h('span', `${num(en.length)} enlaces${rotos ? ` · ${rotos} sin nota` : ''}`), h('span', `Actualizada ${fechaHora(actual.updated)}`), actual.always ? h('span', { style: { color: 'var(--warn)' } }, 'se lee siempre') : null, actual.private ? h('span', { style: { color: 'var(--bad)' } }, 'privada: no va a modelos que entrenan') : null);
  }

  /* ---------- acciones ---------- */
  function menuMas() {
    const fila = (ic, t, sub, fn, peligro) => h('button.list-row', { style: { textAlign: 'left', width: '100%', ...(peligro ? { color: 'var(--bad)' } : {}) }, onclick: () => { d.cerrar(); fn(); } }, icono(ic), h('div.grow', h('b', t), sub ? h('small', sub) : null));
    const d = dialogo({ titulo: actual.name, cuerpo: h('div.stack', { style: { gap: '8px' } },
      fila('graph', 'Ver en el cerebro', 'Abre esta neurona en el mapa', () => ir(slug, 'cerebro', actual.name)), fila('edit', 'Renombrar', 'Reescribe los enlaces que la nombran', renombrar),
      fila('folder', 'Mover de carpeta', 'La carpeta es el lóbulo donde vive', mover), fila('trash', 'Mandar a la papelera', 'Podrás restaurarla', eliminar, true)) });
  }
  async function guardar() {
    if (!actual || !sucio) return;
    const texto = ta.value;
    try {
      const r = await A.put('note', { name: actual.name, text: texto, base: actual.updated });
      invalidarGrafo(); recargarMeta();
      actual = await A.get(`note?name=${encodeURIComponent(actual.name)}`); textoGuardado = actual.text; sucio = texto !== actual.text;
      estadoGuardado.hidden = !sucio; const b = document.getElementById('guardar'); if (b) b.disabled = !sucio;
      pintarVista(); pintarPie(); await cargarLista(); aviso('Guardada.', 'good', 1500);
    } catch (e) {
      if (e.status === 409) dialogo({ titulo: 'La nota cambió mientras la editabas', sub: e.message, acciones: [
        { texto: 'Copiar mi texto y recargar', onclick: async () => { await copiar(ta.value); sucio = false; await abrir(actual.name, { forzar: true }); } },
        { texto: 'Seguir editando', tipo: 'primary' }] });
      else fallo(e);
    }
  }
  async function nueva(nombreInicial = '', carpetaInicial = '') {
    if (!(await confirmarSalida())) return;
    const carpetas = [...new Set(notas.map((n) => n.folder).filter(Boolean))].sort();
    const lista = h('datalist', { id: 'carpetas-am' }, carpetas.map((c) => h('option', { value: c }))); document.body.append(lista);
    const v = await pedir({ titulo: 'Nueva nota', sub: 'Una idea por nota. Enlázala con [[otras]] para que el cerebro la encuentre.', ok: 'Crear', campos: [
      { id: 'nombre', etiqueta: 'Nombre', valor: nombreInicial, marcador: 'Ej.: Anáfora de apertura' },
      { id: 'carpeta', etiqueta: 'Carpeta', valor: carpetaInicial || (actual?.folder ?? ''), lista: 'carpetas-am', ayuda: 'Se crea si no existe. Déjala vacía para la raíz.' },
      { id: 'plantilla', etiqueta: 'Empezar con', tipo: 'select', opciones: [{ valor: 'simple', texto: 'Nota simple' }, { valor: 'idea', texto: 'Idea de canción (concepto, líneas semilla)' }], valor: 'simple' },
    ], validar: (x) => (x.nombre.trim() ? '' : 'Ponle un nombre a la nota.') });
    lista.remove(); if (!v) return;
    try {
      const nombre = v.nombre.trim().replace(/\s+/g, ' ');
      const r = await A.post('note', { name: nombre, carpeta: v.carpeta.trim().replace(/^\/+|\/+$/g, ''), text: PLANTILLAS[v.plantilla](nombre) });
      invalidarGrafo(); recargarMeta(); await cargarLista(); sucio = false; actual = null; await abrir(r.name, { forzar: true });
      modo = modo === 'leer' ? 'dividir' : modo; if (esMovil()) modo = 'editar'; pintarEditor();
    } catch (e) { fallo(e); }
  }
  const crearDesdeEnlace = async (nombre) => { if (await confirmar({ titulo: 'Esa nota no existe', texto: `«${nombre}» aún no existe. ¿La creas?`, ok: 'Crear nota' })) nueva(nombre); };
  async function renombrar() {
    const v = await pedir({ titulo: 'Renombrar', sub: 'Los enlaces que apuntan a esta nota se pueden reescribir solos.', ok: 'Renombrar', campos: [
      { id: 'nuevo', etiqueta: 'Nuevo nombre', valor: actual.name },
      { id: 'reescribir', etiqueta: 'Enlaces que la nombran', tipo: 'select', opciones: [{ valor: 'si', texto: 'Reescribirlos para que sigan funcionando' }, { valor: 'no', texto: 'Dejarlos como están (quedarán rotos)' }], valor: 'si' }],
      validar: (x) => (!x.nuevo.trim() ? 'El nombre no puede estar vacío.' : x.nuevo.trim() === actual.name ? 'Es el mismo nombre.' : '') });
    if (!v) return;
    if (sucio && !(await confirmarSalida())) return;
    try {
      const r = await A.post('note/rename', { name: actual.name, nuevo: v.nuevo.trim(), reescribir: v.reescribir === 'si' });
      invalidarGrafo(); sucio = false; await cargarLista(); await abrir(r.name, { forzar: true }); aviso(r.reescritas ? `Renombrada. ${r.reescritas} nota(s) con enlaces reescritos.` : 'Renombrada.', 'good');
    } catch (e) { fallo(e); }
  }
  async function mover() {
    const carpetas = [...new Set(notas.map((n) => n.folder).filter(Boolean))].sort();
    const lista = h('datalist', { id: 'carpetas-am' }, carpetas.map((c) => h('option', { value: c }))); document.body.append(lista);
    const v = await pedir({ titulo: 'Mover de carpeta', ok: 'Mover', campos: [{ id: 'carpeta', etiqueta: 'Carpeta', valor: actual.folder, lista: 'carpetas-am', ayuda: 'Vacía = raíz. La carpeta es el lóbulo del cerebro donde vive la nota.' }] });
    lista.remove(); if (!v) return;
    try { await A.post('note/move', { name: actual.name, carpeta: v.carpeta.trim().replace(/^\/+|\/+$/g, '') }); invalidarGrafo(); await cargarLista(); const t = textoActual(); const dirty = sucio; await abrir(actual.name, { forzar: true }); if (dirty && ta) { ta.value = t; ta.dispatchEvent(new Event('input')); } aviso('Movida.', 'good', 1600); } catch (e) { fallo(e); }
  }
  async function eliminar() {
    if (!(await confirmar({ titulo: 'Mandar a la papelera', texto: `«${actual.name}» saldrá del cerebro y sus enlaces quedarán sin destino. Podrás restaurarla desde la papelera.`, ok: 'Mandar a la papelera', peligro: true }))) return;
    const nombre = actual.name;
    try {
      await A.post('note/trash', { name: nombre, base: actual.updated }); invalidarGrafo(); recargarMeta(); sucio = false; actual = null; history.replaceState(null, '', `#/${encodeURIComponent(slug)}/notas`);
      await cargarLista(); pintarEditor();
      const t = aviso(`«${nombre}» está en la papelera. `, '', 7000);
      t.append(h('button.btn.ghost.small', { style: { marginLeft: '6px' }, onclick: async () => { try { const p = (await A.get('trash')).papelera.find((x) => x.name === nombre); if (p) { await A.post('note/restore', { id: p.id }); invalidarGrafo(); await cargarLista(); await abrir(nombre); t.remove(); } } catch (e) { fallo(e); } } }, 'Deshacer'));
    } catch (e) { fallo(e); }
  }
  async function papelera() {
    let items;
    try { items = (await A.get('trash')).papelera; } catch (e) { return fallo(e); }
    const cuerpo = h('div.stack', { style: { gap: '6px' } }, items.length ? items.map((it) => h('div.list-row', h('div.grow', h('b', it.name), h('small', `${it.folder || 'raíz'} · ${fechaHora(it.deleted)}`)),
      h('button.btn.small', { onclick: async (e) => { try { await A.post('note/restore', { id: it.id }); invalidarGrafo(); await cargarLista(); e.currentTarget.closest('.list-row').remove(); aviso(`«${it.name}» restaurada.`, 'good'); } catch (x) { fallo(x); } } }, 'Restaurar'))) : h('div.empty', 'La papelera está vacía.'));
    dialogo({ titulo: 'Papelera', sub: 'Las últimas notas eliminadas.', cuerpo, acciones: [{ texto: 'Cerrar', tipo: 'primary' }] });
  }

  /* ---------- autocompletar [[ ]] ---------- */
  function activarAutocompletar() {
    let pop = null, items = [], sel = 0, inicio = -1;
    const cerrarPop = () => { pop?.remove(); pop = null; };
    const insertar = (n) => { ta.setRangeText(`${n}]]`, inicio, ta.selectionStart, 'end'); cerrarPop(); ta.focus(); ta.dispatchEvent(new Event('input')); };
    const mostrar = () => {
      const { x, y } = caretXY(ta, ta.selectionStart), vv = window.visualViewport, vh = vv ? vv.height : innerHeight, top0 = vv ? vv.offsetTop : 0, vw = vv ? vv.width : innerWidth;   // el teclado virtual encoge el viewport visual
      const abajo = y + 4 + 250 <= top0 + vh;
      cerrarPop(); pop = h('div.pop.glass', { role: 'listbox', 'aria-label': 'Notas para enlazar', style: { left: Math.max(8, Math.min(x, vw - 296)) + 'px', ...(abajo ? { top: (y + 4) + 'px' } : { top: Math.max(top0 + 8, y - 250 - 28) + 'px' }) } },
        items.map((n, i) => h('button.result', { role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onmousedown: (e) => { e.preventDefault(); insertar(n); } }, h('b', n))));
      document.body.append(pop);
    };
    const evaluar = () => {
      const antes = ta.value.slice(0, ta.selectionStart), m = /\[\[([^\]\n|]*)$/.exec(antes);
      if (!m) return cerrarPop();
      inicio = ta.selectionStart - m[1].length; const q = fold(m[1]);
      items = [...nombres].filter((n) => !q || fold(n).includes(q)).sort((a, b) => (fold(a).startsWith(q) ? 0 : 1) - (fold(b).startsWith(q) ? 0 : 1) || a.length - b.length).slice(0, 8);
      if (!items.length) return cerrarPop(); sel = 0; mostrar();
    };
    ta.addEventListener('input', evaluar); ta.addEventListener('click', cerrarPop); ta.addEventListener('blur', () => setTimeout(cerrarPop, 120));
    ta.addEventListener('keydown', (e) => {
      if (!pop) return;
      if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; mostrar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; mostrar(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { insertar(items[sel]); e.preventDefault(); }
      else if (e.key === 'Escape') { cerrarPop(); e.preventDefault(); e.stopPropagation(); }
    });
  }

  poner(arbolEl, esqueleto(8, 30));
  await cargarLista();
  if (param && porPlegado.has(fold(param))) await abrir(porPlegado.get(fold(param)), { forzar: true }); else pintarEditor();
  if (esMovil() && !actual) raiz.classList.add('show-tree');
  const teclaBuscar = (e) => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.querySelector('.scrim')) { e.preventDefault(); raiz.classList.add('show-tree'); filtroEl.focus(); } };
  addEventListener('keydown', teclaBuscar);
  return { puedeSalir: confirmarSalida, hayCambios: () => sucio, destruir() { removeEventListener('keydown', teclaBuscar); document.querySelectorAll('.pop').forEach((x) => x.remove()); } };
}
