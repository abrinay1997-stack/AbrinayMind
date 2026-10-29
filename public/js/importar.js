// Abrinay Mind — meter y sacar la bóveda de un cerebro como un archivo (la bóveda nunca viaja por Git).
// La subida va de a pocas notas para que el Worker no pase de su tiempo de CPU; la interfaz lleva la cuenta.
import { POST, cerebro as B, descargarTexto } from './api.js';
import { h, poner, icono, dialogo, fallo, num, descargar } from './ui.js';
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

/** El diálogo de importar: elegir el archivo, ver qué trae y subirlo con barra de progreso. alTerminar(slug) corre al acabar. */
export function abrirDialogo(alTerminar) {
  let datos = null, trabajando = false;
  const estado = h('div.muted', { style: { minHeight: '22px' } });
  const barra = h('div.progress', { hidden: true }, h('i', { style: { width: '0%' } }));
  const reemplazar = h('input', { type: 'checkbox' });
  const filaReemplazo = h('label.row', { hidden: true, style: { gap: '10px', cursor: 'pointer' } }, reemplazar, h('span', 'Ya existe ese cerebro: reemplazar su contenido por el del archivo'));
  const entrada = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => cargar(entrada.files[0]) });
  const zona = h('div.dropzone', { tabindex: 0, role: 'button', onclick: () => entrada.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') entrada.click(); },
    ondragover: (e) => { e.preventDefault(); zona.classList.add('over'); }, ondragleave: () => zona.classList.remove('over'), ondrop: (e) => { e.preventDefault(); zona.classList.remove('over'); cargar(e.dataTransfer.files[0]); } },
    icono('upload', 26), h('div', { style: { marginTop: '6px' } }, 'Suelta aquí el archivo ', h('code.mono', '.vault.json'), ' o haz clic para elegirlo'));
  async function cargar(f) {
    if (!f) return;
    try {
      datos = await leerArchivo(f);
      const slug = datos.cerebro.slug || datos.cerebro.nombre, existe = S.cerebros.some((c) => c.slug === slug || c.name === datos.cerebro.nombre);
      estado.textContent = `${datos.cerebro.nombre} — ${num(datos.notas.length)} notas${datos.sinapsis?.length ? `, ${num(datos.sinapsis.length)} sinapsis aprendidas` : ''}.`;
      filaReemplazo.hidden = !existe; ok.disabled = false;
    } catch (e) { datos = null; estado.textContent = ''; ok.disabled = true; fallo(e); }
  }
  const ok = h('button.btn.primary', { disabled: true, onclick: async () => {
    if (!datos || trabajando) return; trabajando = true; ok.disabled = true; barra.hidden = false;
    try {
      const slug = await importar(datos, { reemplazar: reemplazar.checked }, (p) => { estado.textContent = `${p.fase}… ${num(p.hechas)} de ${num(p.total)}`; barra.firstChild.style.width = `${Math.round(100 * p.hechas / Math.max(1, p.total))}%`; });
      d.cerrar(); await alTerminar?.(slug);
    } catch (e) { fallo(e); ok.disabled = false; barra.hidden = true; } finally { trabajando = false; }
  } }, 'Importar');
  const d = dialogo({ titulo: 'Importar una bóveda', sub: 'Se sube de a pocas notas. La bóveda nunca pasa por GitHub.', cuerpo: h('div.stack', zona, entrada, estado, filaReemplazo, barra, h('div.actions', h('button.btn.ghost', { onclick: () => d.cerrar() }, 'Cancelar'), ok)) });
  return d;
}
