// Abrinay Mind — Conexiones: la salud del cerebro y todo lo que lo mantiene conectado.
// Menciones, significado (vectores), sugerencias con IA, lo aprendido, y llevar la bóveda de un lado a otro.
import { h, poner, vaciar, icono, aviso, fallo, dialogo, pedir, confirmar, num, fecha } from '../ui.js';
import { S, api, bus, ir, irANota, invalidarGrafo, recargarMeta, cargarCerebros, pintar } from '../store.js';
import * as importador from '../importar.js';

export async function montar(el) {
  const A = api(), slug = S.slug;
  const raiz = h('div.page');
  poner(el, h('div.scroll', raiz));
  let q, meta, aprendido;

  async function cargar() {
    [q, meta, aprendido] = await Promise.all([A.get('quality'), recargarMeta(), A.get('learned')]);
    pintarTodo();
  }

  /** Corre una tarea larga en pasos, con barra y botón desactivado. paso(i) → { hechas, total, fin } */
  function tarea(boton, barra, texto, paso, alTerminar) {
    return async () => {
      boton.disabled = true; barra.hidden = false; const etiqueta = boton.lastChild.textContent;
      try {
        let i = 0;
        for (;;) {
          const r = await paso(i++);
          barra.firstChild.style.width = `${Math.round(100 * r.hechas / Math.max(1, r.total))}%`; texto.textContent = `${num(r.hechas)} de ${num(r.total)}`;
          if (r.fin) break;
        }
        await alTerminar?.();
      } catch (e) { fallo(e); } finally { boton.disabled = false; boton.lastChild.textContent = etiqueta; setTimeout(() => { barra.hidden = true; texto.textContent = ''; }, 1200); }
    };
  }
  const filaTarea = () => ({ barra: h('div.progress', { hidden: true }, h('i', { style: { width: '0%' } })), texto: h('span.faint', { style: { fontSize: '12.5px' } }) });

  function pintarTodo() {
    const r = q.resumen, sig = meta.significado;
    poner(raiz, h('h1', 'Conexiones'), h('p.lead', 'Un cerebro vale lo bien conectado que está. Aquí ves qué tan sano está y le añades sinapsis de las cuatro clases: enlaces, menciones, significado y lo aprendido.'),
      h('div.kpis',
        h('div.kpi', h('b', num(r.notas)), h('span', 'neuronas (notas)')),
        h('div.kpi' + (r.rotos ? '.bad' : '.good'), h('b', num(r.rotos)), h('span', 'enlaces rotos')),
        h('div.kpi', h('b', num(r.huerfanas)), h('span', 'notas sin enlaces')),
        h('div.kpi', h('b', `${num(sig.indexadas)}/${num(sig.notas)}`), h('span', 'con significado')),
        h('div.kpi', h('b', num(aprendido.sinapsis.length)), h('span', 'sinapsis aprendidas'))),
      h('div.stack', { style: { gap: '16px' } }, tarjetaSalud(), tarjetaMenciones(), tarjetaSignificado(), tarjetaIA(), tarjetaAprendido(), tarjetaBoveda(), tarjetaCerebro()));
  }

  /* ---------- salud ---------- */
  function tarjetaSalud() {
    const abrirNota = (n) => irANota(n);
    const chip = (n) => h('button.linkchip', { onclick: () => abrirNota(n) }, h('span', n));
    return h('section.card', h('h2', 'Salud'), h('p.sub', 'Lo que conviene arreglar. Todo se corrige desde Notas.'),
      q.rotos.length ? h('div', h('div.section-title', { style: { margin: '0 0 8px' } }, `Enlaces rotos (${q.rotos.length})`), q.rotos.slice(0, 30).map((x) => h('div.list-row', h('div.grow', h('b', x.desde), h('small', `apunta a «${x.hacia}», que no existe`)), h('button.btn.small', { onclick: () => abrirNota(x.desde) }, 'Abrir')))) : h('div.row', { style: { color: 'var(--good)' } }, icono('check', 16), 'Ningún enlace roto.'),
      q.huerfanas.length ? h('div', h('div.section-title', 'Sin ningún enlace'), h('div.linklist', q.huerfanas.slice(0, 40).map(chip)), q.huerfanas.length > 40 ? h('p.faint', `…y ${q.huerfanas.length - 40} más. «Conectar con IA» propone enlaces para estas.`) : null) : null,
      q.porRevisar.length ? h('div', h('div.section-title', 'Para revisar'), q.porRevisar.map((x) => h('div.list-row', h('div.grow', h('b', x.nombre), h('small', `revisar desde ${x.fecha}`)), h('button.btn.small', { onclick: () => abrirNota(x.nombre) }, 'Abrir')))) : null,
      q.sinTipo.length ? h('p.faint', { style: { marginTop: '12px', fontSize: '12.5px' } }, `${q.sinTipo.length} notas no tienen «tipo:» en su cabecera. No es un error, pero el tipo ayuda al cerebro a decidir qué leer.`) : null);
  }

  /* ---------- menciones ---------- */
  function tarjetaMenciones() {
    const { barra, texto } = filaTarea();
    const b = h('button.btn', icono('refresh'), 'Recalcular menciones');
    b.addEventListener('click', tarea(b, barra, texto, async (i) => { const r = await A.post('menciones', { desde: i * 30, cuantas: 30 }); return { hechas: Math.min(r.total, r.desde + r.hechas), total: r.total, fin: r.siguiente == null }; }, async () => { invalidarGrafo(); aviso('Menciones recalculadas.', 'good'); cargar(); }));
    return h('section.card', h('h2', 'Menciones'), h('p.sub', 'Cuando una nota nombra a otra sin enlazarla (por su nombre o su alias), el cerebro lo anota como una sinapsis débil. Se mantienen solas al guardar; recalcula si importaste o renombraste muchas.'),
      h('div.row.wrap', b, texto), barra);
  }

  /* ---------- significado ---------- */
  function tarjetaSignificado() {
    const s = meta.significado, { barra, texto } = filaTarea();
    const indexar = h('button.btn', { disabled: !s.disponible }, icono('sparkle'), 'Entender las notas');
    indexar.addEventListener('click', tarea(indexar, barra, texto, async () => { const r = await A.post('meaning/index', { cuantas: 8 }); return { hechas: r.indexadas, total: r.notas, fin: r.pendientes <= 0 || !r.hechas }; }, async () => { await recargarMeta(); aviso('Listo. Ahora conecta las notas por significado.', 'good', 5000); cargar(); }));
    const conectar = h('button.btn', { disabled: !s.disponible || s.indexadas === 0 }, icono('link'), 'Conectar por significado');
    conectar.addEventListener('click', tarea(conectar, barra, texto, async (i) => { const r = await A.post('meaning/neighbors', { desde: i * 6, cuantas: 6, k: 4, umbral: 0.55 }); return { hechas: Math.min(r.total, r.desde + r.hechas), total: r.total, fin: r.siguiente == null }; }, async () => { invalidarGrafo(); await recargarMeta(); aviso('Sinapsis de significado creadas: actívalas en la capa «Significado» del Cerebro.', 'good', 6000); cargar(); }));
    return h('section.card', h('h2', 'Significado'), h('p.sub', 'El cerebro lee cada nota y la convierte en un punto en un mapa de ideas. Así encuentra «soledad elegida» cuando buscas «aislamiento», aunque no compartan palabras, y dibuja las sinapsis de significado.'),
      s.disponible ? h('div.row.wrap', { style: { marginBottom: '10px', gap: '8px' } }, h('span.tag' + (s.activo ? '.good' : '.warn'), s.activo ? 'activo' : 'sin activar'), h('span.tag', `${num(s.indexadas)} de ${num(s.notas)} notas entendidas`), h('span.tag', `${num(s.sinapsis)} sinapsis de significado`), s.pendientes ? h('span.tag.warn', `${num(s.pendientes)} pendientes`) : null)
        : h('div.row', { style: { color: 'var(--warn)', marginBottom: '10px' } }, icono('warn', 16), 'Falta el binding de Workers AI (nombre «AI») en el Worker. Revisa wrangler.jsonc y vuelve a desplegar.'),
      h('div.row.wrap', indexar, conectar, texto), barra,
      h('p.faint', { style: { fontSize: '12px', marginBottom: 0 } }, `Usa ${s.modelo} de Workers AI: consume de la cuota de IA de tu cuenta de Cloudflare. Solo se vuelve a calcular lo que cambió.`));
  }

  /* ---------- Conectar con IA ---------- */
  let sugerencias = [], desdeSug = 0, pendientesSug = null;
  const cajaIA = h('div.stack', { style: { gap: '10px', marginTop: '12px' } });
  function tarjetaIA() {
    const b = h('button.btn', icono('sparkle'), pendientesSug == null ? 'Buscar sugerencias' : 'Siguientes sugerencias');
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await A.post('connect/suggest', { limite: 3, desde: desdeSug }); sugerencias = r.items; pendientesSug = r.pendientes; desdeSug = r.siguiente; pintarIA(); bus.dispatchEvent(new Event('gasto')); }
      catch (e) { fallo(e); } finally { b.disabled = false; }
    });
    pintarIA();
    return h('section.card', h('h2', 'Conectar con IA'), h('p.sub', 'Para las notas que quedaron sueltas, un modelo económico propone con cuáles enlazar. Nada se escribe hasta que marcas las casillas.'), b, pendientesSug != null ? h('span.faint', { style: { marginLeft: '12px', fontSize: '12.5px' } }, `${num(pendientesSug)} notas sueltas más`) : null, cajaIA);
  }
  function pintarIA() {
    vaciar(cajaIA);
    if (!sugerencias.length) { if (pendientesSug === 0) cajaIA.append(h('p.faint', 'No quedan notas sueltas por revisar.')); return; }
    const marcas = new Map();
    for (const it of sugerencias) {
      const set = new Set(it.destinos.map((d) => d.nombre)); marcas.set(it.nota, set);
      cajaIA.append(h('div.list-row', { style: { flexDirection: 'column', alignItems: 'stretch', gap: '8px' } },
        h('div.row.between', h('b', it.nota), h('button.btn.ghost.small', { onclick: () => irANota(it.nota) }, 'Abrir')),
        it.destinos.length ? it.destinos.map((d) => h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) set.add(d.nombre); else set.delete(d.nombre); } }), h('span', h('b', { style: { fontWeight: 550 } }, d.nombre), h('small.muted', { style: { display: 'block' } }, d.motivo || '')))) : h('span.faint', 'Sin propuestas para esta nota.')));
    }
    cajaIA.append(h('div.row', h('button.btn.primary', { onclick: async (e) => {
      e.currentTarget.disabled = true;
      try {
        const items = sugerencias.map((it) => ({ nota: it.nota, updated: it.updated, destinos: [...marcas.get(it.nota)] })).filter((it) => it.destinos.length);
        if (!items.length) { aviso('No marcaste ningún enlace.', 'bad'); return; }
        const r = await A.post('connect/apply', { items });
        desdeSug = Math.max(0, desdeSug - r.hechas.length); invalidarGrafo(); sugerencias = [];
        aviso(`${r.hechas.reduce((s, x) => s + x.enlaces, 0)} enlaces escritos en ${r.hechas.length} notas.${r.saltadas.length ? ` ${r.saltadas.length} se saltaron (la nota cambió).` : ''}`, 'good', 5000);
        pintarIA(); cargar();
      } catch (x) { fallo(x); } finally { e.currentTarget.disabled = false; }
    } }, icono('check'), 'Aplicar las marcadas')));
  }

  /* ---------- lo aprendido ---------- */
  function tarjetaAprendido() {
    const vacio = !aprendido.sinapsis.length && !aprendido.pesos.length;
    return h('section.card', h('h2', 'Lo que ha aprendido'), h('p.sub', 'Cada canción que aprobaste o rechazaste ajustó la fuerza de las notas que se leyeron. Lo aprendido se desvanece a la mitad cada 90 días sin uso.'),
      vacio ? h('p.faint', 'Todavía nada: aprueba o rechaza canciones y verás aquí qué notas ganan peso.') : h('div.grid2',
        h('div', h('div.section-title', { style: { margin: '0 0 8px' } }, 'Notas que se usan juntas'), aprendido.sinapsis.slice(0, 8).map((s) => h('div.list-row', h('div.grow', h('b', s.a), h('small', `↔ ${s.b}`)), h('div.wbar', h('i', { style: { width: `${Math.round(Math.min(1, s.peso) * 100)}%` } }))))),
        h('div', h('div.section-title', { style: { margin: '0 0 8px' } }, 'Notas que pesan más o menos'), aprendido.pesos.slice(0, 10).map((p) => h('div.list-row', h('div.grow', h('b', p.nombre), h('small', `${p.usos} uso${p.usos === 1 ? '' : 's'}`)), h('span.tag' + (p.peso >= 0 ? '.good' : '.bad'), `${p.peso >= 0 ? '+' : ''}${p.peso.toFixed(2)}`))))),
      vacio ? null : h('div.row', { style: { marginTop: '14px' } }, h('button.btn.danger.small', { onclick: async () => { if (!(await confirmar({ titulo: 'Olvidar todo lo aprendido', texto: 'Se borran las sinapsis y pesos aprendidos. Las canciones, la bitácora y las reglas escritas se quedan.', ok: 'Olvidar', peligro: true }))) return; try { await A.post('learned/reset'); invalidarGrafo(); aviso('El cerebro olvidó lo aprendido.'); cargar(); } catch (e) { fallo(e); } } }, 'Olvidar todo lo aprendido')));
  }

  /* ---------- bóveda ---------- */
  function tarjetaBoveda() {
    return h('section.card', h('h2', 'Bóveda'), h('p.sub', 'Todas las notas del cerebro en un solo archivo, con lo aprendido. Es tu copia de seguridad y la forma de llevar el cerebro a otra instalación. Nunca va a Git.'),
      h('div.row.wrap', h('button.btn', { onclick: async (e) => { e.currentTarget.disabled = true; try { await importador.exportar(slug); aviso('Bóveda descargada.', 'good'); } catch (x) { fallo(x); } finally { e.currentTarget.disabled = false; } } }, icono('download'), 'Exportar esta bóveda'),
        h('button.btn', { onclick: () => importador.abrirDialogo(async (nuevo) => { await cargarCerebros(); bus.dispatchEvent(new Event('cerebros')); aviso('Bóveda importada.', 'good'); ir(nuevo, 'cerebro'); }) }, icono('upload'), 'Importar una bóveda')));
  }

  /* ---------- el cerebro mismo ---------- */
  function tarjetaCerebro() {
    const c = S.cerebros.find((x) => x.slug === slug);
    return h('section.card', h('h2', 'Este cerebro'), h('p.sub', `Identificador: ${slug}. Creado el ${fecha(c?.created)}.`),
      h('div.row.wrap', h('button.btn', { onclick: editarCerebro }, icono('edit'), 'Cambiar nombre y color'),
        h('button.btn.danger', { onclick: borrarCerebro }, icono('trash'), 'Borrar este cerebro')));
  }
  async function editarCerebro() {
    const c = S.cerebros.find((x) => x.slug === slug);
    const v = await pedir({ titulo: 'Este cerebro', ok: 'Guardar', campos: [{ id: 'name', etiqueta: 'Nombre', valor: c.name }, { id: 'subtitle', etiqueta: 'Descripción', valor: c.subtitle || '' }, { id: 'color', etiqueta: 'Color', tipo: 'color', valor: c.color }], validar: (x) => (!x.name.trim() ? 'El nombre no puede estar vacío.' : !x.color ? 'El color debe ser como #94a3b8.' : '') });
    if (!v) return;
    try { const { PATCH } = await import('../api.js'); await PATCH(`/api/brains/${encodeURIComponent(slug)}`, { name: v.name.trim(), subtitle: v.subtitle.trim(), color: v.color.trim() }); await cargarCerebros(); bus.dispatchEvent(new Event('cerebros')); aviso('Guardado.', 'good'); pintarTodo(); } catch (e) { fallo(e); }
  }
  async function borrarCerebro() {
    const v = await pedir({ titulo: 'Borrar este cerebro', sub: `Se borran sus notas, canciones, conversaciones y todo lo aprendido. No hay vuelta atrás: antes exporta la bóveda. Para confirmar, escribe «${slug}».`, ok: 'Borrar para siempre', peligro: true, campos: [{ id: 'confirm', etiqueta: 'Identificador' }], validar: (x) => (x.confirm.trim() === slug ? '' : `Escribe exactamente «${slug}».`) });
    if (!v) return;
    try { const { DELETE } = await import('../api.js'); await DELETE(`/api/brains/${encodeURIComponent(slug)}`, { confirm: v.confirm.trim() }); S.slug = null; S.meta = null; await cargarCerebros(); bus.dispatchEvent(new Event('cerebros')); aviso('Cerebro borrado.'); ir(S.cerebros[0]?.slug || 'x', 'cerebro'); } catch (e) { fallo(e); }
  }

  try { await cargar(); } catch (e) { poner(raiz, h('div.empty', h('b', 'No pude cargar las conexiones'), h('span', e.message))); }
  return {};
}
