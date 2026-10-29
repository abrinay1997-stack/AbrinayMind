// Abrinay Mind — Cerebro: el grafo 3D del artista. Buscar, filtrar por lóbulos, encender capas de sinapsis y abrir cualquier nota.
import { h, poner, icono, debounce, fallo, aviso, num, esMovil, copiar } from '../ui.js';
import { S, grafo, api, irANota, anclar } from '../store.js';
import { Graph3D } from '../graph3d.js';
import { notaAHtml } from '../md.js';
import { fold } from '/core/text.js';

const CAPAS = [['links', 'Enlaces', 'l-links'], ['mentions', 'Menciones', 'l-mention'], ['meaning', 'Significado', 'l-meaning'], ['learned', 'Aprendido', 'l-learned']];

export async function montar(el, { param }) {
  const slug = S.slug;
  const lienzo = h('canvas', { 'aria-label': 'Grafo del cerebro: arrastra para girar, rueda para acercar, clic en una neurona para abrirla', tabindex: 0 });
  lienzo.setAttribute('aria-label', 'Grafo del cerebro. Arrastra para girar, pellizca o usa la rueda para acercar, toca una neurona para abrirla. Para navegar con teclado o lector de pantalla usa la vista Lista.');
  const envoltura = h('div.graph-wrap', lienzo);
  poner(el, envoltura);
  const cargando = h('div.empty', { style: { position: 'absolute', inset: 0 } }, h('div.skeleton', { style: { width: '200px', height: '10px' } }), h('span', 'Despertando las neuronas…'));
  envoltura.append(cargando);
  let g;
  try { g = await grafo(true); } catch (e) { cargando.remove(); fallo(e); poner(envoltura, h('div.empty', h('b', 'No pude cargar el grafo'), h('span', e.message))); return {}; }
  cargando.remove();
  if (!g.nodes.length) {
    poner(envoltura, h('div.empty', { style: { height: '100%' } }, icono('brain', 40), h('b', 'Este cerebro aún no tiene notas'), h('span', 'Escribe la primera o importa una bóveda desde Conexiones.'), h('button.btn.primary', { onclick: () => (location.hash = `#/${slug}/notas`) }, 'Ir a Notas')));
    return {};
  }

  if (matchMedia('(max-height: 500px)').matches) envoltura.classList.add('sin-filtros');   // en horizontal el mapa necesita la altura
  const existentes = new Set(g.nodes.map((n) => n.id)), plegados = new Map(g.nodes.map((n) => [fold(n.id), n.id]));
  let capas = { links: true, mentions: false, meaning: false, learned: true };
  try { capas = { ...capas, ...JSON.parse(localStorage.getItem('am:capas') || '{}') }; } catch { /* por defecto */ }
  const gr = new Graph3D(lienzo, { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-ui').trim() || '#94a3b8', clave: `am:layout:${slug}`, onSelect: abrirCajon, onHover: () => {} });
  gr.setData(g); gr.setCapas(capas);

  /* ---- búsqueda ---- */
  const entrada = h('input', { type: 'search', placeholder: 'Buscar en el cerebro…', 'aria-label': 'Buscar en el cerebro', autocomplete: 'off', spellcheck: 'false' });
  const resultados = h('div.results.glass', { hidden: true, role: 'listbox' });
  let lista = [], marcado = 0;
  const pintarResultados = () => {
    resultados.hidden = !lista.length;
    poner(resultados, lista.map((r, i) => h('button.result', { role: 'option', 'aria-selected': i === marcado ? 'true' : 'false', onclick: () => elegir(r) }, h('b', r.nombre), h('small', `${r.carpeta || ''}${r.via ? ' · ' + (r.via === 'significado' ? 'por significado' : r.via === 'ambos' ? 'palabras + significado' : 'por palabras') : ''}`))));
  };
  const elegir = (r) => { resultados.hidden = true; entrada.value = ''; gr.marcar(null); gr.seleccionar(r.nombre, { volar: true, avisar: true }); };
  const buscarLocal = (q) => { const f = fold(q); return g.nodes.filter((n) => fold(n.id).includes(f)).slice(0, 6).map((n) => ({ nombre: n.id, carpeta: n.g })); };
  let ultima = 0;
  const buscarRemoto = debounce(async (q) => {
    const mia = ++ultima;
    try {
      const r = await api().get(`search?q=${encodeURIComponent(q)}&n=10`);
      if (mia !== ultima) return;
      const vistos = new Set(lista.map((x) => x.nombre));
      lista = [...lista, ...r.resultados.filter((x) => !vistos.has(x.nombre))].slice(0, 12); pintarResultados();
      gr.marcar(new Map(lista.map((x) => [x.nombre, 'hit'])));
    } catch { /* la búsqueda local ya respondió */ }
  }, 320);
  entrada.addEventListener('input', () => {
    const q = entrada.value.trim();
    if (q.length < 2) { lista = []; pintarResultados(); gr.marcar(null); return; }
    lista = buscarLocal(q); marcado = 0; pintarResultados(); gr.marcar(new Map(lista.map((x) => [x.nombre, 'hit']))); buscarRemoto(q);
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { marcado = Math.min(lista.length - 1, marcado + 1); pintarResultados(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { marcado = Math.max(0, marcado - 1); pintarResultados(); e.preventDefault(); }
    else if (e.key === 'Enter' && lista[marcado]) elegir(lista[marcado]);
    else if (e.key === 'Escape') { entrada.value = ''; lista = []; pintarResultados(); gr.marcar(null); entrada.blur(); }
  });
  entrada.addEventListener('blur', () => setTimeout(() => { resultados.hidden = true; }, 160));
  entrada.addEventListener('focus', () => { if (lista.length) resultados.hidden = false; });

  /* ---- capas, lóbulos, herramientas ---- */
  const botonesCapa = h('div.layers.glass', { role: 'group', 'aria-label': 'Capas de sinapsis' }, CAPAS.map(([k, nombre, cls]) => {
    const n = k === 'links' ? g.links.length : k === 'mentions' ? g.mentions.length : k === 'meaning' ? g.meaning.length : g.learned.length;
    const b = h('button.layer.' + cls, { 'aria-pressed': capas[k] ? 'true' : 'false', title: `${num(n)} sinapsis`, onclick: () => {
      capas[k] = !capas[k]; b.setAttribute('aria-pressed', capas[k]); gr.setCapas({ [k]: capas[k] });
      try { localStorage.setItem('am:capas', JSON.stringify(capas)); } catch { /* sin almacenamiento */ }
      if (k === 'meaning' && !g.meaning.length && capas[k]) aviso('Aún no hay sinapsis de significado: actívalas en Conexiones → Significado.', '', 5200);
    } }, h('i'), nombre);
    return b;
  }));
  const ocultos = new Set();
  const lobos = h('div.lobes.glass', { role: 'group', 'aria-label': 'Lóbulos (carpetas)' }, gr.lobulos.map((l) => {
    const b = h('button.lobe', { style: { '--c': l.color }, 'aria-pressed': 'true', title: 'Mostrar u ocultar este lóbulo', onclick: () => {
      if (ocultos.has(l.nombre)) ocultos.delete(l.nombre); else ocultos.add(l.nombre);
      b.setAttribute('aria-pressed', !ocultos.has(l.nombre)); gr.setOcultos(new Set(ocultos));
    } }, h('i'), l.nombre.replace(/^\d+-/, ''), h('small', num(l.n)));
    return b;
  }));
  const bGirar = h('button', { title: 'Giro automático', 'aria-label': 'Giro automático', 'aria-pressed': 'false', onclick: () => { const v = bGirar.getAttribute('aria-pressed') !== 'true'; bGirar.setAttribute('aria-pressed', v); gr.setGirar(v); } }, icono('rotate'));
  const bEtiq = h('button', { title: 'Mostrar nombres', 'aria-label': 'Mostrar nombres', 'aria-pressed': 'true', onclick: () => { const v = bEtiq.getAttribute('aria-pressed') !== 'true'; bEtiq.setAttribute('aria-pressed', v); gr.setEtiquetas(v); } }, icono('type'));
  const herramientas = h('div.g-tools.glass',
    h('button', { title: 'Encuadrar todo', 'aria-label': 'Encuadrar todo', onclick: () => gr.ajustar() }, icono('fit')), bGirar, bEtiq,
    h('button', { title: 'Mostrar u ocultar capas y lóbulos', 'aria-label': 'Filtros: capas y lóbulos', 'aria-pressed': matchMedia('(max-height: 500px)').matches ? 'false' : 'true', class: 'solo-movil', onclick: (e) => { const v = !envoltura.classList.toggle('sin-filtros'); e.currentTarget.setAttribute('aria-pressed', v); } }, icono('tag')),
    h('button', { title: 'Recargar el grafo', 'aria-label': 'Recargar el grafo', onclick: async () => { try { const n = await grafo(true); gr.setData(n); gr.setCapas(capas); aviso('Grafo actualizado.', 'good', 1800); } catch (e) { fallo(e); } } }, icono('refresh')));
  const stats = h('div.g-stats', h('span', h('b', num(g.notes)), ' neuronas'), h('span', h('b', num(g.links.length)), ' enlaces'), h('span', h('b', num(g.mentions.length)), ' menciones'), h('span', h('b', num(g.meaning.length)), ' de significado'), h('span', h('b', num(g.learned.length)), ' aprendidas'));
  /* ---- vista Lista: la misma información, navegable con teclado, lector de pantalla y dedos torpes ---- */
  let vistaActual = 'mapa'; try { vistaActual = localStorage.getItem('am:cerebro:vista') === 'lista' ? 'lista' : 'mapa'; } catch { /* por defecto */ }
  const colorLobulo = new Map(gr.lobulos.map((l) => [l.nombre, l.color]));
  const listaEl = h('div.g-list', { hidden: true, role: 'region', 'aria-label': 'Lista de neuronas' });
  let tope = 80;
  const pintarLista = () => {
    const q = fold(entrada.value.trim());
    const todas = g.nodes.filter((n) => !q || fold(n.id).includes(q)).sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
    poner(listaEl, h('div.g-list-in',
      h('p.faint', { style: { margin: '0 0 8px', fontSize: '12.5px' }, role: 'status' }, q ? `${num(todas.length)} de ${num(g.nodes.length)} neuronas` : `${num(g.nodes.length)} neuronas`),
      todas.length ? h('ul', todas.slice(0, tope).map((n) => h('li', h('button.item', { onclick: () => gr.seleccionar(n.id, { avisar: true }), 'aria-label': `${n.id}, lóbulo ${String(n.g || 'raíz').replace(/^\d+-/, '')}` },
        h('i.dot', { style: { background: colorLobulo.get(n.g) || 'var(--faint)' } }), h('span.n', n.id), h('span.faint', { style: { fontSize: '12px' } }, String(n.g || '').replace(/^\d+-/, '')))))) : h('div.empty', h('b', 'Nada con ese nombre'), h('span', 'Prueba con otra palabra.')),
      todas.length > tope ? h('button.btn', { onclick: () => { tope += 120; pintarLista(); } }, `Mostrar más (${num(todas.length - tope)})`) : null));
  };
  const aplicarVista = () => {
    const lista = vistaActual === 'lista';
    envoltura.classList.toggle('en-lista', lista); listaEl.hidden = !lista; lienzo.hidden = lista; gr.pausar(lista);
    for (const b of selector.children) b.setAttribute('aria-checked', b.dataset.v === vistaActual ? 'true' : 'false');
    if (lista) { cerrarCajon(); pintarLista(); } else { gr.redimensionar(); }
    try { localStorage.setItem('am:cerebro:vista', vistaActual); } catch { /* sin almacenamiento */ }
  };
  const selector = h('div.seg.glass', { role: 'radiogroup', 'aria-label': 'Cómo ver el cerebro' }, [['mapa', 'Mapa', 'graph'], ['lista', 'Lista', 'menu']].map(([v, t, ic]) => h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-checked': 'false', onclick: () => { vistaActual = v; aplicarVista(); } }, icono(ic, 16), t)));
  entrada.addEventListener('input', () => { if (vistaActual === 'lista') { tope = 80; pintarLista(); } });
  envoltura.append(h('div.g-top', h('div.g-search', icono('search'), entrada, resultados), selector, botonesCapa), listaEl, lobos, herramientas, stats);
  aplicarVista();

  /* ---- cajón con la nota ---- */
  let cajon = null, pedido = 0;
  async function abrirCajon(id) {
    cerrarCajon();
    if (!id) return;
    const mio = ++pedido;
    const cuerpo = h('div.body', h('div.skeleton', { style: { height: '14px', width: '60%', marginBottom: '10px' } }), h('div.skeleton', { style: { height: '90px' } }));
    const titulo = h('h2', id);
    const asa = h('div.grab', { 'aria-hidden': 'true' }, h('i'));
    cajon = h('aside.drawer', { 'aria-label': `Nota ${id}` }, asa, h('header', titulo, h('button.ibtn', { 'aria-label': 'Cerrar', onclick: () => gr.seleccionar(null, { avisar: true }) }, icono('x'))), cuerpo);
    envoltura.append(cajon); envoltura.classList.add('con-cajon'); stats.style.display = 'none'; arrastrable(cajon, asa);
    if (!esMovil()) herramientas.style.right = '456px';
    let n;
    try { n = await api().get(`note?name=${encodeURIComponent(id)}`); } catch (e) { if (mio === pedido) poner(cuerpo, h('div.empty', h('b', 'No pude abrir la nota'), h('span', e.message))); return; }
    if (mio !== pedido) return;
    const { fm, html } = notaAHtml(n.text, { existe: (x) => plegados.has(fold(x)) });
    const cuerpoMd = h('div.md'); cuerpoMd.innerHTML = html;
    cuerpoMd.addEventListener('click', (e) => { const a = e.target.closest('a.wiki'); if (a && plegados.has(fold(a.dataset.note))) { e.preventDefault(); gr.seleccionar(plegados.get(fold(a.dataset.note)), { volar: true, avisar: true }); } });
    const chip = (nombre, extra) => h('button.linkchip' + (existentes.has(nombre) ? '' : '.broken'), { title: nombre, onclick: () => existentes.has(nombre) && gr.seleccionar(nombre, { volar: true, avisar: true }) }, h('span', nombre), extra || null);
    const grupo = (titulo2, items) => (items.length ? [h('div.section-title', titulo2), h('div.linklist', items)] : []);
    const propiedades = [['Carpeta', n.folder || '—'], ['Tipo', n.tipo || '—'], ['Actualizada', new Date(n.updated).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })], ['Tamaño', `${num(n.bytes)} bytes`]];
    for (const k of ['modo', 'estado', 'puntuacion', 'fecha']) if (fm[k]) propiedades.push([k[0].toUpperCase() + k.slice(1), String(fm[k]).replace(/\[\[|\]\]/g, '')]);
    poner(cuerpo,
      h('div.row.wrap', { style: { marginBottom: '12px', gap: '6px' } }, n.always ? h('span.tag.warn', 'siempre se lee') : null, n.private ? h('span.tag.bad', 'privada') : null, h('span.tag', n.folder || 'raíz')),
      h('dl.props', propiedades.map(([k, v]) => [h('dt', k), h('dd', v)])), cuerpoMd,
      grupo('Enlaza a', n.salientes.map((s) => chip(s.name || s.target))), grupo('Enlazada desde', n.entrantes.map((x) => chip(x))),
      grupo('Parecidas por significado', n.parecidas.map((x) => chip(x.name, h('span.faint', `${Math.round(x.sim * 100)}%`)))), grupo('Menciona a', n.nombra.map((x) => chip(x))), grupo('Mencionada por', n.mencionadaPor.map((x) => chip(x))));
    const anclada = S.anclas.has(id);
    cajon.append(h('footer', h('button.btn.primary.small', { onclick: () => irANota(id) }, icono('notes'), 'Abrir en Notas'),
      h('button.btn.small', { 'aria-pressed': anclada, onclick: (e) => { const ya = S.anclas.has(id); anclar(id, !ya); e.currentTarget.lastChild.textContent = !ya ? 'Anclada' : 'Anclar para escribir'; aviso(!ya ? `«${id}» se leerá en la próxima letra.` : 'Desanclada.', '', 2200); } }, icono('pin'), anclada ? 'Anclada' : 'Anclar para escribir'),
      h('button.btn.ghost.small', { onclick: () => copiar(`[[${id}]]`) }, icono('copy'), 'Copiar enlace')));
  }
  /** Hoja inferior en móvil: arrastrar el asa hacia abajo la cierra y hacia arriba la abre del todo; tocarla alterna. */
  function arrastrable(hoja, asa) {
    let y0 = null, dy = 0, mov = 0;
    asa.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; mov = 0; asa.setPointerCapture(e.pointerId); hoja.style.transition = 'none'; });
    asa.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = e.clientY - y0; mov = Math.max(mov, Math.abs(dy)); if (!hoja.classList.contains('full') || dy > 0) hoja.style.transform = `translateY(${Math.max(0, dy)}px)`; });
    const soltar = () => {
      if (y0 == null) return; y0 = null; hoja.style.transition = ''; hoja.style.transform = '';
      if (mov < 6) hoja.classList.toggle('full');
      else if (dy > 110 && !hoja.classList.contains('full')) gr.seleccionar(null, { avisar: true });
      else if (dy > 60) hoja.classList.remove('full');
      else if (dy < -50) hoja.classList.add('full');
    };
    asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  }
  function cerrarCajon() { cajon?.remove(); cajon = null; envoltura.classList.remove('con-cajon'); herramientas.style.right = ''; stats.style.display = ''; }

  const teclas = (e) => {
    if (e.key === 'Escape' && gr.sel >= 0) gr.seleccionar(null, { avisar: true });
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); entrada.focus(); }
  };
  addEventListener('keydown', teclas);
  if (param && plegados.has(fold(param))) setTimeout(() => gr.seleccionar(plegados.get(fold(param)), { volar: true, avisar: true }), 400);

  return { destruir() { removeEventListener('keydown', teclas); gr.destruir(); } };
}
