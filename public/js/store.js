// Abrinay Mind — el estado compartido de la interfaz: qué cerebro está abierto, su resumen, su grafo y las notas ancladas.
import { GET, cerebro as B } from './api.js';

export const S = {
  cerebros: [], slug: null, meta: null, grafo: null, modelos: null,
  anclas: new Set(),          // notas fijadas a mano para la próxima letra
  nombres: [],                // nombres de todas las notas (autocompletar [[ ]])
};
export const bus = new EventTarget();
const avisar = (t, d) => bus.dispatchEvent(new CustomEvent(t, { detail: d }));

export const actual = () => S.cerebros.find((c) => c.slug === S.slug) || null;
export const api = () => B(S.slug);

export async function cargarCerebros() {
  S.cerebros = (await GET('/api/brains')).cerebros;
  avisar('cerebros');
  return S.cerebros;
}

/** Abre un cerebro: pide su resumen y descarta el grafo viejo. */
export async function abrir(slug) {
  if (S.slug === slug && S.meta) return S.meta;
  S.slug = slug; S.meta = null; S.grafo = null; S.nombres = [];
  try { S.anclas = new Set(JSON.parse(localStorage.getItem(`am:anclas:${slug}`) || '[]')); } catch { S.anclas = new Set(); }
  S.meta = await B(slug).get('meta');
  avisar('cerebro');
  return S.meta;
}

export async function recargarMeta() { if (!S.slug) return null; S.meta = await B(S.slug).get('meta'); avisar('meta'); return S.meta; }

export async function grafo(forzar = false) {
  if (!forzar && S.grafo) return S.grafo;
  const g = await B(S.slug).get('graph');
  S.grafo = g; S.nombres = g.nodes.map((n) => n.id);
  return g;
}
export const invalidarGrafo = () => { S.grafo = null; };

export async function listaDeNombres() {
  if (S.nombres.length) return S.nombres;
  S.nombres = (await B(S.slug).get('notes')).notas.map((n) => n.name);
  return S.nombres;
}

export async function modelos(forzar = false) {
  if (!forzar && S.modelos) return S.modelos;
  S.modelos = await GET('/api/models');
  return S.modelos;
}

export function anclar(nombre, si = true) {
  if (si) S.anclas.add(nombre); else S.anclas.delete(nombre);
  try { localStorage.setItem(`am:anclas:${S.slug}`, JSON.stringify([...S.anclas])); } catch { /* sin almacenamiento */ }
  avisar('anclas');
}

/** Aplica el color del cerebro a toda la interfaz. */
export function pintar(color) {
  const c = color || '#8b5cf6';
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--c', c);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#07070b');
}

/* ---------- navegación por hash:  #/<cerebro>/<vista>/<parámetro> ---------- */
export const VISTAS = ['cerebro', 'notas', 'estudio', 'canciones', 'conexiones'];
export function ruta() {
  const p = location.hash.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  if (p[0] === 'ajustes') return { vista: 'ajustes', slug: null, param: null };
  return { slug: p[0] || null, vista: VISTAS.includes(p[1]) ? p[1] : 'cerebro', param: p.slice(2).join('/') || null };
}
export function ir(slug, vista = 'cerebro', param = null) {
  const h = slug === 'ajustes' ? '#/ajustes' : `#/${encodeURIComponent(slug)}/${vista}${param ? '/' + encodeURIComponent(param) : ''}`;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
}
export const irANota = (nombre) => ir(S.slug, 'notas', nombre);
