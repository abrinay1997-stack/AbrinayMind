// Abrinay Mind — meter y sacar la bóveda de un cerebro como un archivo (la bóveda nunca viaja por Git).
// La subida va de a pocas notas para que el Worker no pase de su tiempo de CPU; la interfaz lleva la cuenta.
import { POST, cerebro as B, descargarTexto } from './api.js';
import { h, poner, icono, dialogo, fallo, num, descargar, confirmar } from './ui.js';
import { carpetasDe, depurar, pareceCancionesOReferentes } from './depurar.js';
import { S } from './store.js';

export const FORMATO = 'abrinay-mind/boveda@1';

export async function leerArchivo(archivo) {
  if (archivo.size > 60 * 1024 * 1024) throw new Error('El archivo pesa demasiado (más de 60 MB).');
  let datos;
  try { datos = JSON.parse(await archivo.text()); } catch { throw new Error('Ese archivo no es un JSON válido.'); }
  if (datos?.formato !== FORMATO) throw new Error(`No es una bóveda de Abrinay Mind (se esperaba «${FORMATO}»).`);
  if (!datos.cerebro?.nombre && !datos.cerebro?.slug) throw new Error('La bóveda no trae el nombre del cerebro.');
  if (!Array.isArray(datos.notas) || !datos.notas.length) throw new Error('La bóveda no tiene notas.');
  return datos;
}

/** progreso({ fase, hechas, total }) · devuelve el identificador del cerebro importado */
export async function importar(datos, { reemplazar = false } = {}, progreso = () => {}) {
  progreso({ fase: 'Creando el cerebro…', hechas: 0, total: datos.notas.length });
  const r = await POST('/api/brains/import', { cerebro: datos.cerebro, reemplazar });
  const slug = r.cerebro.slug, b = B(slug);
  let lote = [], bytes = 0, hechas = 0;
  const subir = async () => {
    if (!lote.length) return;
    await b.post('import/notas', { notas: lote, sobrescribir: true });
    hechas += lote.length; lote = []; bytes = 0;
    progreso({ fase: 'Subiendo notas', hechas, total: datos.notas.length });
  };
  for (const n of datos.notas) {
    const peso = String(n.texto).length + 240;
    if (lote.length >= 10 || (lote.length && bytes + peso > 300_000)) await subir();
    lote.push({ nombre: n.nombre, carpeta: n.carpeta, texto: n.texto, actualizado: n.actualizado }); bytes += peso;
  }
  await subir();
  await b.post('import/fin', { sinapsis: datos.sinapsis || [], pesos: datos.pesos || [] });
  let desde = 0;
  for (;;) {
    const m = await b.post('menciones', { desde, cuantas: 30 });
    progreso({ fase: 'Conectando menciones', hechas: Math.min(datos.notas.length, desde + m.hechas), total: datos.notas.length });
    if (m.siguiente == null) break; desde = m.siguiente;
  }
  return slug;
}

export async function exportar(slug) {
  const texto = await descargarTexto(`/api/b/${encodeURIComponent(slug)}/export`);
  descargar(`${slug}.vault.json`, texto);
}

/** El diálogo de importar: elegir el archivo, decidir qué carpetas entran, ponerle nombre y subirlo con barra de progreso. alTerminar(slug) corre al acabar. */
export function abrirDialogo(alTerminar) {
  let datos = null, trabajando = false;
  const quitar = new Set();          // carpetas de primer nivel que NO se importan
  const estado = h('div.muted', { style: { minHeight: '22px' } });
  const barra = h('div.progress', { hidden: true }, h('i', { style: { width: '0%' } }));
  const reemplazar = h('input', { type: 'checkbox', onchange: () => { aviso.hidden = !reemplazar.checked; } });
  const aviso = h('p', { hidden: true, role: 'note', style: { margin: 0, color: 'var(--warn)', fontSize: '13px' } }, 'Se borra todo lo que hay ahora en ese cerebro (notas, canciones, conversaciones y lo aprendido) y se sustituye por lo que importes. Antes exporta una copia.');
  const filaReemplazo = h('div.stack', { hidden: true, style: { gap: '6px' } }, h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, reemplazar, h('span', 'Ya existe un cerebro con ese nombre: reemplazar su contenido por el del archivo')), aviso);
  const nombreEl = h('input', { type: 'text', maxlength: 60, 'aria-label': 'Nombre del cerebro', oninput: () => comprobarExiste() });
  const filaNombre = h('div.field', { hidden: true }, h('label', 'Nombre del cerebro'), nombreEl, h('span.hint', 'Si lo cambias, se crea un cerebro aparte y el que tienes ahora no se toca.'));
  const lista = h('div.carpetas', { role: 'group', 'aria-label': 'Carpetas que se importan' });
  const resumen = h('div', { role: 'status', style: { fontWeight: 600 } });
  const limpiar = h('input', { type: 'checkbox', checked: true });
  const filaCarpetas = h('div.stack', { hidden: true, style: { gap: '10px' } },
    h('div.section-title', { style: { margin: 0 } }, 'Qué carpetas importar'), h('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Quita las que no quieras (por ejemplo canciones o letras de referentes) y empieza solo con tus reglas, técnicas y teoría.'),
    h('div.row.wrap', { style: { gap: '8px' } }, h('button.btn.small', { type: 'button', onclick: () => { quitar.clear(); for (const c of carpetasDe(datos.notas)) if (pareceCancionesOReferentes(c.nombre)) quitar.add(c.nombre); pintar(); } }, 'Quitar canciones y referentes'), h('button.btn.ghost.small', { type: 'button', onclick: () => { quitar.clear(); pintar(); } }, 'Importar todo')),
    lista, resumen,
    h('label.row', { style: { gap: '10px', cursor: 'pointer', alignItems: 'flex-start' } }, limpiar, h('span', 'Convertir en texto normal los [[enlaces]] a notas que no se importan ', h('small.muted', '(así no quedan enlaces rotos)'))));
  const entrada = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => cargar(entrada.files[0]) });
  const zona = h('div.dropzone', { tabindex: 0, role: 'button', onclick: () => entrada.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') entrada.click(); },
    ondragover: (e) => { e.preventDefault(); zona.classList.add('over'); }, ondragleave: () => zona.classList.remove('over'), ondrop: (e) => { e.preventDefault(); zona.classList.remove('over'); cargar(e.dataTransfer.files[0]); } },
    icono('upload', 26), h('div', { style: { marginTop: '6px' } }, 'Suelta aquí el archivo ', h('code.mono', '.vault.json'), ' o haz clic para elegirlo'));

  function comprobarExiste() {
    if (!datos) return;
    const nombre = nombreEl.value.trim(), igual = nombre === datos.cerebro.nombre;
    const existe = S.cerebros.some((c) => c.name === nombre || (igual && c.slug === datos.cerebro.slug));
    filaReemplazo.hidden = !existe; if (!existe) { reemplazar.checked = false; aviso.hidden = true; }
  }
  function pintar() {
    const carpetas = carpetasDe(datos.notas);
    poner(lista, carpetas.map((c) => {
      const caja = h('input', { type: 'checkbox', checked: !quitar.has(c.nombre), 'aria-label': `Importar la carpeta ${c.nombre}`, onchange: () => { if (caja.checked) quitar.delete(c.nombre); else quitar.add(c.nombre); resumir(); } });
      return h('label.carpeta', caja, h('div.grow', h('div.row.wrap', { style: { gap: '6px' } }, h('b', c.nombre), h('span.muted', `${num(c.n)} ${c.n === 1 ? 'nota' : 'notas'}`),
        c.siempre ? h('span.tag.warn', `${c.siempre} ${c.siempre === 1 ? 'regla fija' : 'reglas fijas'}`) : null, c.modos ? h('span.tag.accent', `${c.modos} ${c.modos === 1 ? 'modo' : 'modos'}`) : null),
        h('small.faint', c.ejemplos.join(' · '))));
    }));
    resumir();
  }
  function resumir() {
    const r = depurar(datos, { quitar, limpiarEnlaces: false });
    resumen.textContent = `Se importarán ${num(r.quedan)} de ${num(r.total)} notas${r.quitadas ? ` (se quedan fuera ${num(r.quitadas)})` : ''}.`;
    ok.disabled = trabajando || r.quedan === 0;
  }
  async function cargar(f) {
    if (!f) return;
    try {
      datos = await leerArchivo(f); quitar.clear();
      nombreEl.value = datos.cerebro.nombre || datos.cerebro.slug;
      estado.textContent = `${datos.cerebro.nombre} — ${num(datos.notas.length)} notas${datos.sinapsis?.length ? `, ${num(datos.sinapsis.length)} sinapsis aprendidas` : ''}.`;
      filaNombre.hidden = false; filaCarpetas.hidden = false; pintar(); comprobarExiste();
    } catch (e) { datos = null; estado.textContent = ''; filaCarpetas.hidden = true; filaNombre.hidden = true; filaReemplazo.hidden = true; ok.disabled = true; fallo(e); }
  }
  const ok = h('button.btn.primary', { disabled: true, onclick: async () => {
    if (!datos || trabajando) return;
    const nombre = nombreEl.value.trim() || datos.cerebro.nombre;
    if (reemplazar.checked && !(await confirmar({ titulo: 'Reemplazar el cerebro', texto: `Se borra TODO lo que hay ahora en «${nombre}» y se sustituye por esta importación. No se puede deshacer. ¿Ya exportaste una copia?`, ok: 'Sí, reemplazar', peligro: true }))) return;
    trabajando = true; ok.disabled = true; barra.hidden = false;
    try {
      const r = depurar(datos, { quitar, limpiarEnlaces: limpiar.checked });
      const cerebro = { ...r.datos.cerebro, nombre, slug: nombre === datos.cerebro.nombre ? datos.cerebro.slug : undefined };
      const slug = await importar({ ...r.datos, cerebro }, { reemplazar: reemplazar.checked }, (p) => { estado.textContent = `${p.fase}… ${num(p.hechas)} de ${num(p.total)}`; barra.firstChild.style.width = `${Math.round(100 * p.hechas / Math.max(1, p.total))}%`; });
      d.cerrar(); await alTerminar?.(slug);
    } catch (e) { fallo(e); ok.disabled = false; barra.hidden = true; } finally { trabajando = false; }
  } }, 'Importar');
  const d = dialogo({ titulo: 'Importar una bóveda', sub: 'Se sube de a pocas notas. La bóveda nunca pasa por GitHub.', ancho: true, cuerpo: h('div.stack', zona, entrada, estado, filaNombre, filaCarpetas, filaReemplazo, barra, h('div.actions', h('button.btn.ghost', { onclick: () => d.cerrar() }, 'Cancelar'), ok)) });
  return d;
}
