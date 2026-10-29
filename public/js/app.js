// Abrinay Mind — arranque: login, armazón (selector de cerebros + pestañas) y enrutador de vistas.
import { GET, POST, alSalir } from './api.js';
import { S, bus, cargarCerebros, abrir, modelos, pintar, ruta, ir, VISTAS, actual } from './store.js';
import { h, poner, icono, dialogo, aviso, fallo, num, usd, esMovil, selectorColor } from './ui.js';
import * as importador from './importar.js';
import { MUESTRAS, normalizar } from './color.js';

const raiz = document.getElementById('root');
const PESTAÑAS = [['cerebro', 'Cerebro', 'graph'], ['notas', 'Notas', 'notes'], ['estudio', 'Estudio', 'studio'], ['canciones', 'Canciones', 'songs'], ['conexiones', 'Conexiones', 'link']];
let vista = null, contenedor = null, armazon = null, enrutando = false, hashPrevio = location.hash;

/* ---------- arranque ---------- */
async function arrancar() {
  let salud;
  try { salud = await GET('/api/health'); } catch (e) { return pantallaError('No pude conectar con el servidor', e.message); }
  if (!salud.db) return pantallaError('Falta la base de datos', 'El Worker no tiene el binding D1 «DB». Revisa wrangler.jsonc y vuelve a desplegar.');
  if (!salud.acceso) return pantallaError('Falta configurar el acceso', 'Añade los secretos APP_PASSWORD y SESSION_SECRET (mínimo 16 letras) al Worker en Cloudflare y recarga esta página.');
  if (!salud.sesion) return login();
  await entrar();
}

function pantallaError(titulo, texto) {
  poner(raiz, h('div.login', h('div.box', h('div', { style: { color: 'var(--warn)', display: 'grid', placeItems: 'center' } }, icono('warn', 34)), h('h1', titulo), h('p', texto), h('button.btn.primary', { onclick: () => location.reload() }, 'Reintentar'))));
}

/* ---------- login ---------- */
function red(canvas) {
  const ctx = canvas.getContext('2d'); let w, hh, puntos = [], raf = 0, vivo = true;
  const ajustar = () => { const d = Math.min(2, devicePixelRatio || 1); w = canvas.clientWidth; hh = canvas.clientHeight; canvas.width = w * d; canvas.height = hh * d; ctx.setTransform(d, 0, 0, d, 0, 0); puntos = Array.from({ length: Math.round(Math.min(90, w * hh / 14000)) }, () => ({ x: Math.random() * w, y: Math.random() * hh, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, r: 1 + Math.random() * 1.8 })); };
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pintarRed = () => {
    if (!vivo || !canvas.isConnected) return;
    ctx.clearRect(0, 0, w, hh);
    for (const p of puntos) { if (!quieto) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > hh) p.vy *= -1; } }
    for (let i = 0; i < puntos.length; i++) for (let j = i + 1; j < puntos.length; j++) {
      const a = puntos[i], b = puntos[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 150) { ctx.strokeStyle = `rgba(148,163,184,${(1 - d / 150) * .35})`; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    for (const p of puntos) { ctx.fillStyle = 'rgba(220,210,255,.7)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); }
    if (!quieto) raf = requestAnimationFrame(pintarRed);
  };
  ajustar(); pintarRed(); addEventListener('resize', ajustar);
  return () => { vivo = false; cancelAnimationFrame(raf); removeEventListener('resize', ajustar); };
}

function login() {
  armazon = null; vista?.destruir?.(); vista = null;
  const err = h('div.err', { role: 'alert' });
  const campo = h('input', { type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password', 'aria-label': 'Contraseña', autofocus: true });
  const boton = h('button.btn.primary', { type: 'submit', style: { width: '100%' } }, 'Entrar');
  const lienzo = h('canvas', { 'aria-hidden': 'true' });
  let parar = () => {};
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; boton.disabled = true;
    try { await POST('/api/login', { password: campo.value }); parar(); await entrar(); }
    catch (x) { err.textContent = x.message; campo.select(); } finally { boton.disabled = false; }
  } }, h('div.field', campo), boton, err);
  poner(raiz, h('div.login', lienzo, h('div.box', h('div', { style: { color: 'var(--accent)', display: 'grid', placeItems: 'center' } }, icono('logo', 42)), h('h1', 'Abrinay Mind'), h('p', 'Cerebros que escriben como sus artistas.'), form)));
  parar = red(lienzo);
  setTimeout(() => campo.focus(), 50);
}
alSalir.addEventListener('sesion', () => { if (armazon) login(); });

/* ---------- armazón ---------- */
async function entrar() {
  try { await cargarCerebros(); } catch (e) { return pantallaError('No pude cargar los cerebros', e.message); }
  construirArmazon();
  modelos().then(refrescarChips).catch(() => {});
  await enrutar();
}

function construirArmazon() {
  const rail = h('nav.rail', { 'aria-label': 'Cerebros' });
  const cabeza = h('header.head');
  contenedor = h('div.view', { id: 'vista', tabindex: '-1' });
  const mnav = h('nav.mnav', { 'aria-label': 'Secciones' });
  armazon = { rail, cabeza, mnav };
  poner(raiz, h('div.app', rail, h('div.main', cabeza, contenedor), mnav));
  pintarRail(); pintarCabeza();
}

function pintarRail() {
  const { rail } = armazon;
  poner(rail,
    h('div.logo', { 'aria-hidden': 'true' }, icono('logo', 30)),
    h('div.sep'),
    S.cerebros.map((c) => h('button.avatar', { style: { '--c': c.color }, 'data-tip': c.name, 'aria-label': `Abrir el cerebro de ${c.name}`, 'aria-current': c.slug === S.slug ? 'true' : null, onclick: () => ir(c.slug, ruta().vista === 'ajustes' ? 'cerebro' : ruta().vista) }, (c.name[0] || '?').toUpperCase())),
    h('button.avatar.add', { 'data-tip': 'Nuevo cerebro o importar', 'aria-label': 'Nuevo cerebro', onclick: menuNuevo }, '+'),
    h('div.grow'),
    h('button.ibtn', { 'data-tip': 'Ajustes y modelos', 'aria-label': 'Ajustes', onclick: () => ir('ajustes') }, icono('settings')),
    h('button.ibtn', { 'data-tip': 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: salir }, icono('logout')));
}

let chipsEl;
function pintarCabeza() {
  const { cabeza, mnav } = armazon, r = ruta(), c = actual(), enAjustes = r.vista === 'ajustes';
  chipsEl = h('div.row', { style: { gap: '8px' } });
  poner(cabeza,
    h('button.brand', { style: { textAlign: 'left' }, title: 'Cambiar de cerebro', onclick: selector },
      h('b', enAjustes ? 'Ajustes' : c ? c.name : 'Abrinay Mind'), h('small', enAjustes ? 'Modelos, llaves y gasto' : c?.subtitle || 'Plataforma de cerebros para escribir')),
    enAjustes ? null : h('div.tabs', { role: 'tablist' }, PESTAÑAS.map(([id, nombre, ic]) => h('button.tab', { role: 'tab', 'aria-current': r.vista === id ? 'page' : null, onclick: () => ir(S.slug, id) }, icono(ic), nombre))),
    h('div.grow'), chipsEl);
  poner(mnav, [...PESTAÑAS.slice(0, 4), ['mas', 'Más', 'more']].map(([id, nombre, ic]) => h('button', { 'aria-current': (id === r.vista || (id === 'mas' && (r.vista === 'conexiones' || enAjustes))) ? 'page' : null, 'aria-label': nombre, onclick: () => (id === 'mas' ? masMovil() : ir(S.slug || S.cerebros[0]?.slug, id)) }, icono(ic), nombre)));
  refrescarChips();
}

async function refrescarChips() {
  if (!chipsEl) return;
  const m = S.modelos, meta = S.meta, r = ruta(), chips = [];
  if (meta && r.vista !== 'ajustes') chips.push(h('span.chip.hide-s', h('b', num(meta.stats.notas)), 'notas'), h('span.chip.hide-s', h('b', `${meta.stats.aprobadas}/${meta.stats.canciones}`), 'canciones'));
  if (m) {
    const sinLlave = m.proveedores.every((p) => !p.configurada);
    if (sinLlave) chips.push(h('button.chip.warn', { onclick: () => ir('ajustes'), title: 'Añade ANTHROPIC_API_KEY o META_API_KEY en Cloudflare' }, icono('warn', 14), 'Sin llave de modelo'));
    else chips.push(h('button.chip', { onclick: () => ir('ajustes'), title: 'Gasto del mes en modelos' }, h('b', usd(m.gasto.mes.usd)), 'este mes'));
  }
  poner(chipsEl, chips);
}
bus.addEventListener('meta', refrescarChips);
bus.addEventListener('cerebros', () => { if (!armazon) return; pintar(actual()?.color); pintarRail(); pintarCabeza(); });
bus.addEventListener('gasto', async () => { try { await modelos(true); } catch { /* sin gasto */ } refrescarChips(); });

async function salir() {
  try { await POST('/api/logout'); } catch { /* da igual */ }
  S.modelos = null; location.hash = ''; login();
}

/* ---------- menús: cambiar, crear e importar ---------- */
function selector() {
  const d = dialogo({ titulo: 'Tus cerebros', sub: 'Cada artista tiene el suyo. Nada se mezcla entre ellos.', cuerpo: h('div.stack', { style: { gap: '8px' } },
    S.cerebros.map((c) => h('button.list-row', { style: { textAlign: 'left', width: '100%' }, onclick: () => { d.cerrar(); ir(c.slug, ruta().vista === 'ajustes' ? 'cerebro' : ruta().vista); } },
      h('span.avatar', { style: { '--c': c.color, width: '38px', height: '38px', borderRadius: '12px' } }, (c.name[0] || '?').toUpperCase()),
      h('div.grow', h('b', c.name), h('small', c.subtitle || ''), h('small', `${num(c.notes)} notas · ${num(c.songs)} canciones`)),
      c.slug === S.slug ? h('span.tag.accent', 'abierto') : null)),
    h('div.row', { style: { marginTop: '6px', flexWrap: 'wrap' } }, h('button.btn', { onclick: () => { d.cerrar(); nuevoCerebro(); } }, icono('plus'), 'Nuevo cerebro'), h('button.btn', { onclick: () => { d.cerrar(); importarBoveda(); } }, icono('upload'), 'Importar bóveda'))) });
}
function menuNuevo() {
  const d = dialogo({ titulo: 'Añadir un cerebro', sub: 'Crea uno vacío con su esqueleto, o trae una bóveda que ya tengas.', cuerpo: h('div.stack', h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); nuevoCerebro(); } }, icono('plus'), h('div.grow', h('b', 'Cerebro nuevo'), h('small', 'Empieza con reglas, protocolo y bitácora listos para llenar.'))),
    h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); importarBoveda(); } }, icono('upload'), h('div.grow', h('b', 'Importar una bóveda'), h('small', 'Un archivo .vault.json con todas las notas del artista.')))) });
}
function masMovil() {
  const d = dialogo({ titulo: 'Más', cuerpo: h('div.stack', { style: { gap: '8px' } },
    h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); ir(S.slug, 'conexiones'); } }, icono('link'), h('div.grow', h('b', 'Conexiones'), h('small', 'Salud, significado, aprendido, importar/exportar'))),
    h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); selector(); } }, icono('brain'), h('div.grow', h('b', 'Cambiar de cerebro'))),
    h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); ir('ajustes'); } }, icono('settings'), h('div.grow', h('b', 'Ajustes y modelos'))),
    h('button.list-row', { style: { textAlign: 'left' }, onclick: () => { d.cerrar(); salir(); } }, icono('logout'), h('div.grow', h('b', 'Cerrar sesión')))) });
}

const SWATCH = MUESTRAS;
function nuevoCerebro() {
  let color = SWATCH[S.cerebros.length % SWATCH.length];
  const nombre = h('input', { type: 'text', placeholder: 'Nombre del artista', maxlength: 60, autofocus: true }), sub = h('input', { type: 'text', placeholder: 'Compositor · productor…', maxlength: 120 });
  const plantilla = h('input', { type: 'checkbox', checked: true });
  const muestras = selectorColor(color, (c) => { color = c; }).el;
  dialogo({ titulo: 'Nuevo cerebro', sub: 'Un cerebro por artista. Después llénalo con sus letras, reglas y referentes.', cuerpo: h('div.stack', h('div.field', h('label', 'Nombre'), nombre), h('div.field', h('label', 'Descripción (opcional)'), sub), h('div.field', h('label', 'Color'), muestras),
    h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, plantilla, h('span', 'Crear con el esqueleto (perfil, reglas de oro, protocolo, bitácora)'))),
  acciones: [{ texto: 'Cancelar', tipo: 'ghost' }, { texto: 'Crear cerebro', tipo: 'primary', onclick: async () => {
    if (!nombre.value.trim()) { aviso('Ponle un nombre al cerebro.', 'bad'); return false; }
    if (!normalizar(color)) { aviso('El color debe ser como #94a3b8.', 'bad'); return false; }
    const r = await POST('/api/brains', { name: nombre.value, subtitle: sub.value, color, plantilla: plantilla.checked });
    await cargarCerebros(); pintarRail(); aviso(`Cerebro de ${r.cerebro.name} creado.`, 'good'); ir(r.cerebro.slug, 'notas');
  } }] });
}

function importarBoveda() {
  importador.abrirDialogo(async (slug) => { await cargarCerebros(); pintarRail(); aviso('Bóveda importada. Ahora puedes activar «Significado» en Conexiones.', 'good', 6000); ir(slug, 'cerebro'); });
}

/* ---------- enrutador ---------- */
async function enrutar() {
  if (enrutando) return; enrutando = true;
  try {
    const r = ruta();
    if (vista?.puedeSalir && !(await vista.puedeSalir())) { history.replaceState(null, '', hashPrevio); return; }
    if (r.vista !== 'ajustes') {
      if (!S.cerebros.length) { vista?.destruir?.(); vista = null; pintarCabeza(); return vacio(); }
      if (!r.slug || !S.cerebros.some((c) => c.slug === r.slug)) { enrutando = false; return ir(S.cerebros[0].slug, 'cerebro'); }
      try { await abrir(r.slug); } catch (e) { fallo(e); return; }
      pintar(actual()?.color);
    } else pintar(actual()?.color || S.cerebros[0]?.color);
    hashPrevio = location.hash;
    pintarRail(); pintarCabeza();
    vista?.destruir?.(); vista = null;
    const pagina = h('div', { style: { position: 'absolute', inset: 0 } });
    poner(contenedor, pagina);
    try {
      const mod = await import(`./views/${r.vista}.js`);
      vista = (await mod.montar(pagina, { slug: r.slug, param: r.param })) || null;
    } catch (e) { console.error(e); poner(pagina, h('div.empty', h('b', 'No pude abrir esta sección'), h('span', e.message))); }
    document.title = `${r.vista === 'ajustes' ? 'Ajustes' : actual()?.name || 'Abrinay Mind'} · Abrinay Mind`;
  } finally { enrutando = false; }
}

function vacio() {
  poner(contenedor, h('div.empty', { style: { height: '100%' } }, icono('brain', 40), h('b', 'Aún no hay ningún cerebro'), h('span', 'Crea el de un artista o importa una bóveda ya hecha.'),
    h('div.row', h('button.btn.primary', { onclick: nuevoCerebro }, icono('plus'), 'Nuevo cerebro'), h('button.btn', { onclick: importarBoveda }, icono('upload'), 'Importar bóveda'))));
}

addEventListener('hashchange', () => { if (armazon) enrutar(); });
addEventListener('beforeunload', (e) => { if (vista?.hayCambios?.()) { e.preventDefault(); e.returnValue = ''; } });
export { VISTAS };
arrancar();
