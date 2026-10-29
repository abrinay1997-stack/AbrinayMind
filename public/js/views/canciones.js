// Abrinay Mind — Canciones: la biblioteca de letras y el veredicto del artista. Aprobar refuerza lo que funcionó; rechazar deja una lección que el cerebro lee la próxima vez.
import { h, poner, vaciar, icono, aviso, fallo, dialogo, pedir, confirmar, copiar, num, fecha, esMovil } from '../ui.js';
import { S, api, ir, irANota, invalidarGrafo, recargarMeta } from '../store.js';
import { parsear } from '../lyric.js';
import { vistaDeLetra, mdEl } from '../letra-ui.js';

const ESTADO = { borrador: ['Borrador', ''], aprobada: ['Aprobada', 'good'], rechazada: ['Rechazada', 'bad'] };
const DIAGNOSTICO = [
  'Suena genérica, no a mí', 'Rima forzada', 'Métrica rota o irregular', 'Cliché o frase hecha', 'Tono equivocado para este modo', 'Falta una imagen propia',
  'Vocabulario que yo no usaría', 'Idea central difusa', 'Cierre débil', 'Estructura equivocada', 'Demasiado explicativa', 'Se parece demasiado a un referente',
];

export async function montar(el, { param }) {
  const A = api(), slug = S.slug;
  let canciones = [], filtro = 'todas';
  const cuadricula = h('div.songs'), filtros = h('div.filters', { role: 'group', 'aria-label': 'Filtrar por estado' });
  const pagina = h('div.page', h('div.row.between.wrap', h('div', h('h1', 'Canciones'), h('p.lead', 'Lo que el cerebro escribió y lo que tú guardaste. Cada veredicto le enseña algo.')),
    h('button.btn.primary', { onclick: nuevaPropia }, icono('plus'), 'Letra propia')), filtros, cuadricula);
  poner(el, h('div.scroll', pagina));

  async function cargar() { canciones = (await A.get('songs')).canciones; pintar(); }
  function pintar() {
    const cuenta = (e) => (e === 'todas' ? canciones.length : canciones.filter((c) => c.status === e).length);
    poner(filtros, [['todas', 'Todas'], ['borrador', 'Borradores'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']].map(([id, t]) => h('button', { 'aria-pressed': filtro === id ? 'true' : 'false', onclick: () => { filtro = id; pintar(); } }, `${t} · ${cuenta(id)}`)));
    const lista = canciones.filter((c) => filtro === 'todas' || c.status === filtro);
    vaciar(cuadricula);
    if (!lista.length) { cuadricula.style.display = 'block'; cuadricula.append(h('div.empty', icono('songs', 34), h('b', canciones.length ? 'Nada en este filtro' : 'Aún no hay canciones'), h('span', canciones.length ? 'Prueba con otro estado.' : 'Escribe una en el Estudio y guárdala aquí, o pega una letra propia.'), canciones.length ? null : h('button.btn.primary', { onclick: () => ir(slug, 'estudio') }, 'Ir al Estudio'))); return; }
    cuadricula.style.display = '';
    for (const c of lista) {
      const [txt, cls] = ESTADO[c.status] || ESTADO.borrador;
      cuadricula.append(h('button.song', { onclick: () => abrir(c.id) },
        h('div.row.between', h('span.tag' + (cls ? '.' + cls : ''), txt), c.score != null ? h('span.score', { style: { color: c.score >= 7 ? 'var(--good)' : c.score >= 5 ? 'var(--warn)' : 'var(--bad)' } }, `${c.score}/10`) : null),
        h('b', c.title), h('p', (c.extracto || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim()),
        h('div.row.wrap', { style: { gap: '6px' } }, c.mode ? h('span.tag.accent', String(c.mode).replace(/^Modo \d+\s*[—-]\s*/i, '')) : null, c.genre ? h('span.tag', c.genre) : null, c.bpm ? h('span.tag', `${c.bpm} BPM`) : null),
        h('div.faint', { style: { fontSize: '12px' } }, `${fecha(c.updated)}${c.model ? ' · ' + c.model : ''}`)));
    }
  }

  /* ---------- una canción ---------- */
  async function abrir(id) {
    let c;
    try { c = (await A.get(`songs/${encodeURIComponent(id)}`)).cancion; } catch (e) { fallo(e); return; }
    history.replaceState(null, '', `#/${encodeURIComponent(slug)}/canciones/${encodeURIComponent(id)}`);
    const [txt, cls] = ESTADO[c.status] || ESTADO.borrador;
    const letra = h('div'); const pintarLetra = () => poner(letra, vistaDeLetra(c.text, { existe: (x) => S.nombres.includes(x), alAbrir: (n) => { d.cerrar(); irANota(n); } }));
    pintarLetra();
    const usadas = (c.used || []).filter((u) => u?.nombre && u.motivo !== 'siempre');
    const cuerpo = h('div.stack', { style: { gap: '14px' } },
      h('div.row.wrap', { style: { gap: '6px' } }, h('span.tag' + (cls ? '.' + cls : ''), txt), c.score != null ? h('span.tag', `${c.score}/10`) : null, c.mode ? h('span.tag.accent', String(c.mode)) : null, c.genre ? h('span.tag', c.genre) : null, c.bpm ? h('span.tag', `${c.bpm} BPM`) : null, c.model ? h('span.tag', c.model) : null),
      c.feedback ? h('blockquote.md', { style: { margin: 0, padding: '8px 14px', borderLeft: '3px solid var(--accent-line)', color: 'var(--text-2)', background: 'var(--accent-soft)', borderRadius: '0 8px 8px 0' } }, `“${c.feedback}”`) : null,
      letra,
      usadas.length ? h('div', h('div.section-title', { style: { margin: '0 0 8px' } }, 'Se escribió leyendo'), h('div.linklist', usadas.slice(0, 16).map((u) => h('button.linkchip', { onclick: () => { d.cerrar(); irANota(u.nombre); } }, h('span', u.nombre))))) : null,
      c.note_name ? h('button.btn.small', { style: { alignSelf: 'flex-start' }, onclick: () => { d.cerrar(); irANota(c.note_name); } }, icono('notes'), c.status === 'aprobada' ? 'Ver la nota en el cerebro' : 'Ver la lección en el cerebro') : null);
    const d = dialogo({ titulo: c.title, ancho: true, cuerpo, alCerrar: () => history.replaceState(null, '', `#/${encodeURIComponent(slug)}/canciones`), acciones: [
      { texto: 'Borrar', tipo: 'ghost', onclick: async () => { if (!(await confirmar({ titulo: 'Borrar canción', texto: `«${c.title}» se elimina de la biblioteca. La nota del cerebro, si existe, se queda.`, ok: 'Borrar', peligro: true }))) return false; await A.del(`songs/${encodeURIComponent(c.id)}`); await cargar(); recargarMeta(); aviso('Canción borrada.'); } },
      { texto: 'Copiar', tipo: 'ghost', onclick: () => { copiar(c.text); return false; } },
      { texto: 'Editar', onclick: async () => { d.cerrar(); await editar(c); return false; } },
      ...(c.status === 'borrador' ? [{ texto: 'Rechazar', tipo: 'danger', onclick: async () => { d.cerrar(); await rechazar(c); return false; } }, { texto: 'Aprobar', tipo: 'primary', onclick: async () => { d.cerrar(); await aprobar(c); return false; } }]
        : [{ texto: 'Cambiar veredicto', onclick: async () => { d.cerrar(); await (c.status === 'aprobada' ? rechazar(c) : aprobar(c)); return false; } }, { texto: 'Cerrar', tipo: 'primary' }]),
    ] });
  }

  async function editar(c) {
    const t = h('input', { type: 'text', value: c.title }), x = h('textarea', { rows: 18, value: c.text, style: { fontFamily: 'var(--mono)', fontSize: '13.5px', lineHeight: 1.6 } });
    const d = dialogo({ titulo: 'Editar canción', ancho: true, cuerpo: h('div.stack', h('div.field', h('label', 'Título'), t), h('div.field', h('label', 'Letra'), x, h('span.hint', 'Secciones entre corchetes: [VERSO 1], [CORO]… y «## Notas técnicas» al final.'))), acciones: [
      { texto: 'Cancelar', tipo: 'ghost', onclick: () => { abrir(c.id); } },
      { texto: 'Guardar cambios', tipo: 'primary', onclick: async () => { await A.patch(`songs/${encodeURIComponent(c.id)}`, { titulo: t.value, texto: x.value }); await cargar(); aviso('Guardada.', 'good', 1600); abrir(c.id); } }] });
    return d;
  }

  async function nuevaPropia() {
    const v = await pedir({ titulo: 'Letra propia', sub: 'Pega una letra tuya para guardarla, evaluarla y que el cerebro aprenda de ella.', ok: 'Guardar', campos: [
      { id: 'titulo', etiqueta: 'Título' }, { id: 'texto', etiqueta: 'Letra', tipo: 'textarea', filas: 12, marcador: '[VERSO 1]\nUna línea por barra…' },
      { id: 'genero', etiqueta: 'Género (opcional)' }], validar: (x) => (!x.titulo.trim() ? 'Ponle un título.' : !x.texto.trim() ? 'Pega la letra.' : '') });
    if (!v) return;
    try { const r = await A.post('songs', { titulo: v.titulo.trim(), texto: v.texto, genero: v.genero.trim() || null }); await cargar(); recargarMeta(); abrir(r.cancion.id); } catch (e) { fallo(e); }
  }

  /* ---------- el veredicto ---------- */
  function estrellas(inicial, alCambiar) {
    let valor = inicial; const caja = h('div.stars', { role: 'radiogroup', 'aria-label': 'Puntuación de 0 a 10' });
    const pintar = () => poner(caja, Array.from({ length: 11 }, (_, i) => h('button', { type: 'button', role: 'radio', 'aria-checked': valor === i ? 'true' : 'false', 'aria-pressed': valor === i ? 'true' : 'false', 'aria-label': `${i} de 10`, onclick: () => { valor = i; alCambiar?.(i); pintar(); } }, String(i))));
    pintar(); return { el: caja, valor: () => valor };
  }

  async function aprobar(c) {
    const est = estrellas(c.score ?? 8), coment = h('textarea', { rows: 3, placeholder: 'Qué funcionó (opcional): una imagen, un cierre, el flow…' });
    dialogo({ titulo: `Aprobar «${c.title}»`, sub: 'La letra pasa a ser una neurona más del cerebro y se refuerzan las notas que se leyeron para escribirla.', cuerpo: h('div.stack', h('div.field', h('label', 'Puntuación'), est.el), h('div.field', h('label', 'Comentario'), coment)), acciones: [
      { texto: 'Cancelar', tipo: 'ghost' },
      { texto: 'Aprobar y enseñar al cerebro', tipo: 'primary', onclick: async () => {
        const r = await A.post(`songs/${encodeURIComponent(c.id)}/verdict`, { resultado: 'aprobada', puntuacion: est.valor(), comentario: coment.value });
        invalidarGrafo(); recargarMeta(); await cargar();
        aviso(`Aprobada. El cerebro reforzó ${r.aprendio?.sinapsis || 0} conexiones y ${r.aprendio?.pesos || 0} notas.`, 'good', 6000);
      } }] });
  }

  async function rechazar(c) {
    const p = parsear(c.text), secciones = p.versiones[0]?.secciones.filter((s) => s.lineas.length) || [];
    const est = estrellas(c.score ?? 4), marcados = new Set();
    const checks = h('div.checks', DIAGNOSTICO.map((t) => { const b = h('button.check', { type: 'button', 'aria-pressed': 'false', onclick: () => { if (marcados.has(t)) marcados.delete(t); else marcados.add(t); b.setAttribute('aria-pressed', marcados.has(t)); } }, h('i'), t); return b; }));
    const coment = h('textarea', { rows: 3, placeholder: 'En tus palabras: ¿por qué no funcionó?' });
    const campo = (et, ph) => { const i = h('input', { type: 'text', placeholder: ph || '' }); return { i, el: h('div.field', h('label', et), i) }; };
    const gusto = campo('La línea que sí te gustó'), nunca = campo('La línea que nunca escribirías'), perfecta = campo('Cómo debería ser'), prox = campo('Para la próxima versión'), mantener = campo('Lo que hay que conservar');
    const porSeccion = secciones.map((s) => { const e = h('select', ['bien', 'regular', 'mal'].map((x) => h('option', { value: x }, x))), q = h('input', { type: 'text', placeholder: 'Qué falló aquí' }); return { s, e, q, el: h('div.row', { style: { gap: '8px' } }, h('span.tag', { style: { minWidth: '88px', justifyContent: 'center' } }, s.nombre), e, q) }; });
    porSeccion.forEach((x) => { x.e.style.width = '110px'; });
    const cuerpo = h('div.stack', { style: { gap: '16px' } },
      h('div.field', h('label', 'Puntuación'), est.el), h('div.field', h('label', '¿Qué falló? (marca todo lo que aplique)'), checks), h('div.field', h('label', 'Comentario'), coment),
      porSeccion.length ? h('div.field', h('label', 'Por sección'), h('div.stack', { style: { gap: '6px' } }, porSeccion.map((x) => x.el))) : null,
      h('div.grid2', gusto.el, nunca.el, perfecta.el, prox.el), mantener.el);
    const d = dialogo({ titulo: `Rechazar «${c.title}»`, sub: 'Esto queda en la bitácora de errores y el cerebro propondrá una regla para no repetirlo.', ancho: true, cuerpo, acciones: [
      { texto: 'Cancelar', tipo: 'ghost' },
      { texto: 'Rechazar y enseñar al cerebro', tipo: 'danger', onclick: async () => {
        const formulario = { diagnostico: [...marcados], gusto: gusto.i.value, nunca: nunca.i.value, perfecta: perfecta.i.value, instruccion: prox.i.value, mantener: mantener.i.value,
          secciones: Object.fromEntries(porSeccion.map((x) => [x.s.nombre, { estado: x.e.value, queMal: x.q.value }])) };
        const r = await A.post(`songs/${encodeURIComponent(c.id)}/verdict`, { resultado: 'rechazada', puntuacion: est.valor(), comentario: coment.value, formulario });
        invalidarGrafo(); recargarMeta(); await cargar();
        regla(c, r, prox.i.value);
      } }] });
    return d;
  }

  function regla(c, r, instruccion) {
    const nunca = h('textarea', { rows: 2, value: r.propuesta?.nunca || '', placeholder: 'NUNCA… (lo que el cerebro no debe volver a hacer)' }), siempre = h('textarea', { rows: 2, value: r.propuesta?.siempre || '', placeholder: 'SIEMPRE… (lo que debe hacer en su lugar)' });
    dialogo({ titulo: 'Lo que aprendió el cerebro', sub: r.propuesta ? 'Revisa la regla que propone. Si la aceptas, se lee siempre antes de escribir.' : 'No pude proponer una regla automática (¿sin llave o sin saldo?). Puedes escribirla tú.', cuerpo: h('div.stack', h('div.field', h('label', '🔴 NUNCA'), nunca), h('div.field', h('label', '🟢 SIEMPRE'), siempre),
      h('p.faint', { style: { margin: 0, fontSize: '12.5px' } }, `Quedó la lección «${r.nota}» en la bitácora. Se debilitaron ${r.aprendio?.sinapsis || 0} conexiones.`)), acciones: [
      { texto: 'No añadir regla', tipo: 'ghost' },
      { texto: 'Pedir otra versión', onclick: async () => { try { localStorage.setItem(`am:prefill:${slug}`, `Reescribe «${c.title}» aplicando lo aprendido${instruccion ? ': ' + instruccion : ''}.`); } catch { /* sin almacenamiento */ } ir(slug, 'estudio'); } },
      { texto: 'Aceptar regla', tipo: 'primary', onclick: async () => {
        if (!nunca.value.trim() && !siempre.value.trim()) { aviso('Escribe al menos una de las dos.', 'bad'); return false; }
        await A.post('rules', { nunca: nunca.value, siempre: siempre.value, error: r.nota }); invalidarGrafo(); recargarMeta(); aviso('Regla guardada en «Reglas aprendidas».', 'good', 5000);
      } }] });
  }

  await cargar();
  if (param) abrir(param);
  return {};
}
