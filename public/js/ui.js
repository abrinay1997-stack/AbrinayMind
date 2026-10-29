// Abrinay Mind — piezas pequeñas de interfaz: crear elementos sin innerHTML, iconos, avisos y diálogos.

/** h('div.clase#id', { onclick, 'aria-label': '…', style: {…} }, ...hijos) — los textos siempre entran como texto, nunca como HTML. */
export function h(sel, props, ...hijos) {
  if (props instanceof Node || typeof props === 'string' || typeof props === 'number' || Array.isArray(props) || props == null) { hijos.unshift(props); props = null; }
  const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  for (const t of (m[2] || '').match(/[.#][\w-]+/g) || []) { if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1); }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') v.split(' ').filter(Boolean).forEach((c) => el.classList.add(c));
    else if (k === 'style' && typeof v === 'object') for (const [a, b] of Object.entries(v)) { if (a.startsWith('--')) el.style.setProperty(a, b); else el.style[a] = b; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  añadir(el, hijos);
  return el;
}
function añadir(el, hijos) {
  for (const x of hijos.flat(Infinity)) {
    if (x == null || x === false) continue;
    el.append(x instanceof Node ? x : document.createTextNode(String(x)));
  }
}
export const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const poner = (el, ...hijos) => { vaciar(el); añadir(el, hijos); return el; };

/** HTML ya saneado por nosotros (markdown, SVG de iconos) dentro de un contenedor. */
export function html(sel, props, cadena) { const el = h(sel, props); el.innerHTML = cadena; return el; }

/* ---------- iconos (trazos de 24×24, estilo lineal) ---------- */
const P = {
  logo: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="13" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="9" cy="20" r="2"/><circle cx="15" cy="19" r="2"/><circle cx="12" cy="12.5" r="1.6" fill="currentColor"/><path d="m11 6.8-4.6 4.7M13 6.8l4.6 3.7M6 15l2.2 3.2M17.8 13.8 15.9 17.2M11 19h2.2M12 7v4M10.8 13.6 9.4 18M13.3 13.7l1.3 3.8"/>',
  graph: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="8" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="m7.9 7 8.2.8M7 8l4 8.2M17 10l-4 6"/>',
  notes: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  studio: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  songs: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  pin: '<path d="m15 4 5 5-3 1-3 3 .5 4.5-1.5 1.5-3.5-3.5L5 20l-1-1 4.5-4.5L5 11l1.5-1.5L11 10l3-3z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h0"/>',
  brain: '<path d="M9.5 3A3.5 3.5 0 0 0 6 6.5v.2A3.5 3.5 0 0 0 4 10c0 1 .4 1.8 1 2.4A3.5 3.5 0 0 0 6 18a3.5 3.5 0 0 0 3.5 3 2.5 2.5 0 0 0 2.5-2.5v-14A2.5 2.5 0 0 0 9.5 3zM14.5 3A3.5 3.5 0 0 1 18 6.5v.2A3.5 3.5 0 0 1 20 10c0 1-.4 1.8-1 2.4A3.5 3.5 0 0 1 18 18a3.5 3.5 0 0 1-3.5 3 2.5 2.5 0 0 1-2.5-2.5"/>',
};
export function icono(nombre, tam) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  if (tam) { s.style.width = tam + 'px'; s.style.height = tam + 'px'; }
  s.innerHTML = P[nombre] || P.more;
  return s;
}

/* ---------- avisos ---------- */
let contenedorAvisos;
export function aviso(texto, tipo = '', ms = 4200) {
  if (!contenedorAvisos) { contenedorAvisos = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(contenedorAvisos); }
  const t = h('div.toast' + (tipo ? '.' + tipo : ''), texto);
  contenedorAvisos.append(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, ms);
  return t;
}
export const fallo = (e) => aviso(e?.message || String(e), 'bad', 6500);

/* ---------- diálogos ---------- */
const abiertos = [];
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abiertos.length) abiertos[abiertos.length - 1].cerrar(); });

/**
 * dialogo({ titulo, sub, cuerpo, acciones:[{ texto, tipo:'primary'|'danger'|'ghost', onclick(cerrar) → false para no cerrar }], ancho })
 * → { cerrar, el }
 */
export function dialogo({ titulo, sub, cuerpo, acciones = [], ancho = false, alCerrar }) {
  const previo = document.activeElement;
  const scrim = h('div.scrim', { onmousedown: (e) => { if (e.target === scrim) cerrar(); } });
  const caja = h('div.modal' + (ancho ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo || 'Diálogo' },
    titulo ? h('h2', titulo) : null, sub ? h('p.sub', sub) : null, cuerpo || null);
  let barra = null;
  const cerrar = () => { const i = abiertos.indexOf(api); if (i >= 0) abiertos.splice(i, 1); scrim.remove(); try { previo?.focus?.(); } catch { /* sin foco previo */ } alCerrar?.(); };
  const api = { cerrar, el: caja, scrim };
  if (acciones.length) {
    barra = h('div.actions', acciones.map((a) => h('button.btn' + (a.tipo ? '.' + a.tipo : ''), {
      type: 'button', disabled: a.deshabilitado,
      onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { const r = await a.onclick?.(cerrar, api); if (r !== false) cerrar(); } catch (err) { fallo(err); } finally { b.disabled = false; }
      },
    }, a.texto)));
    caja.append(barra);
  }
  scrim.append(caja); document.body.append(scrim); abiertos.push(api);
  setTimeout(() => (caja.querySelector('[autofocus], input, textarea, select') || caja.querySelector('button.primary') || caja).focus?.(), 30);
  return api;
}

export const confirmar = ({ titulo, texto, ok = 'Aceptar', peligro = false, cancelar = 'Cancelar' }) => new Promise((res) => {
  let hecho = false;
  const d = dialogo({ titulo, sub: texto, alCerrar: () => { if (!hecho) res(false); }, acciones: [
    { texto: cancelar, tipo: 'ghost', onclick: () => { res(false); hecho = true; } },
    { texto: ok, tipo: peligro ? 'danger' : 'primary', onclick: () => { res(true); hecho = true; } },
  ] });
  return d;
});

/** Pide uno o varios textos. campos: [{ id, etiqueta, valor, ayuda, tipo:'text'|'textarea'|'select', opciones, marcador }] → objeto con los valores, o null si cancela. */
export function pedir({ titulo, sub, campos, ok = 'Aceptar', peligro = false, validar }) {
  return new Promise((res) => {
    let hecho = false;
    const refs = {};
    const cuerpo = h('div.stack', campos.map((c) => {
      const ctl = c.tipo === 'textarea' ? h('textarea', { rows: c.filas || 4, placeholder: c.marcador || '', value: c.valor || '' })
        : c.tipo === 'select' ? h('select', c.opciones.map((o) => h('option', { value: o.valor ?? o, selected: (o.valor ?? o) === c.valor }, o.texto ?? o)))
        : h('input', { type: 'text', placeholder: c.marcador || '', value: c.valor || '', ...(c.lista ? { list: c.lista } : {}) });
      refs[c.id] = ctl;
      return h('div.field', h('label', c.etiqueta), ctl, c.ayuda ? h('span.hint', c.ayuda) : null);
    }));
    const d = dialogo({ titulo, sub, cuerpo, alCerrar: () => { if (!hecho) res(null); }, acciones: [
      { texto: 'Cancelar', tipo: 'ghost', onclick: () => { hecho = true; res(null); } },
      { texto: ok, tipo: peligro ? 'danger' : 'primary', onclick: () => {
        const v = Object.fromEntries(Object.entries(refs).map(([k, el]) => [k, el.value]));
        const err = validar?.(v); if (err) { aviso(err, 'bad'); return false; }
        hecho = true; res(v);
      } },
    ] });
    cuerpo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); d.el.querySelector('.actions .btn:last-child')?.click(); } });
  });
}

/* ---------- utilidades ---------- */
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const fecha = (t) => { if (!t) return '—'; const d = new Date(t); return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const fechaHora = (t) => new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const usd = (n) => (n == null ? '—' : n < 0.01 && n > 0 ? '<US$0.01' : 'US$' + Number(n).toFixed(n < 1 ? 3 : 2));
export const num = (n) => Number(n || 0).toLocaleString('es');
export async function copiar(texto) { try { await navigator.clipboard.writeText(texto); aviso('Copiado.', 'good', 1800); } catch { aviso('No pude copiar; selecciona y copia a mano.', 'bad'); } }
export function descargar(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h('a', { href: url, download: nombre }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const esMovil = () => window.matchMedia('(max-width: 900px)').matches;
