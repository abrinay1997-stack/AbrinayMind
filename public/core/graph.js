// Abrinay Mind — el grafo del cerebro: notas = neuronas, conexiones = sinapsis.
// Cuatro clases de sinapsis (cada una con su fuerza):
//   enlace    [[explícito]] escrito en la nota ......................... 1.00
//   aprendida lo que el cerebro reforzó al usar notas juntas en letras buenas .... 0 – 1 (se desvanece con los días)
//   significado cercanía de sentido entre dos notas (vectores) ........ similitud × 0.70
//   mención   una nota nombra a otra sin enlazarla ..................... 0.40
// Puro: lo usan el Worker (para elegir qué lee el cerebro), el navegador (para dibujarlo) y los tests.

export const FUERZA = { enlace: 1, mencion: 0.4, significado: 0.7 };
export const MEDIA_VIDA_DIAS = 90;

/** El peso de algo aprendido hace `dias` días: se reduce a la mitad cada MEDIA_VIDA_DIAS sin uso. */
export const desvanecido = (peso, actualizado, ahora = Date.now()) => {
  const dias = Math.max(0, (ahora - (actualizado || ahora)) / 864e5);
  return peso * Math.pow(0.5, dias / MEDIA_VIDA_DIAS);
};

/**
 * Arma el grafo que se dibuja.
 * notas:   [{ nombre, carpeta, actualizado, siempre, privado, bytes }]
 * enlaces: [[origen, destino]]   (solo los que apuntan a una nota que existe)
 * menciones: [[origen, destino]] · significado: [[a, b, similitud]] · sinapsis: [{ a, b, peso, actualizado }] · pesos: [{ nombre, peso, actualizado }]
 */
export function armarGrafo({ notas, enlaces = [], menciones = [], significado = [], sinapsis = [], pesos = [], ahora = Date.now() }) {
  const orden = [...notas].sort((x, y) => String(x.carpeta).localeCompare(String(y.carpeta)) || x.nombre.localeCompare(y.nombre));
  const idx = new Map(orden.map((n, i) => [n.nombre, i]));
  const par = (a, b) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  const vistos = new Set();
  const pares = (lista, conPeso = false) => {
    const out = [];
    for (const e of lista) {
      const a = idx.get(e[0]), b = idx.get(e[1]);
      if (a == null || b == null || a === b) continue;
      const k = par(a, b);
      if (vistos.has(k + (conPeso ? 'w' : ''))) continue;
      vistos.add(k + (conPeso ? 'w' : ''));
      out.push(conPeso ? [a, b, e[2]] : [a, b]);
    }
    return out;
  };
  const links = pares(enlaces);
  const grado = new Array(orden.length).fill(0);
  for (const [a, b] of links) { grado[a]++; grado[b]++; }
  vistos.clear();
  const ment = pares(menciones.filter(([a, b]) => !links.some(([x, y]) => (x === idx.get(a) && y === idx.get(b)) || (y === idx.get(a) && x === idx.get(b)))));
  vistos.clear();
  const sig = pares(significado, true).map(([a, b, s]) => [a, b, +(+s).toFixed(3)]);
  vistos.clear();
  const apr = [];
  for (const s of sinapsis) {
    const a = idx.get(s.a), b = idx.get(s.b); if (a == null || b == null || a === b) continue;
    const w = desvanecido(s.peso, s.actualizado, ahora);
    if (w >= 0.03) apr.push([a, b, +w.toFixed(3)]);
  }
  const peso = new Map(pesos.map((p) => [p.nombre, desvanecido(p.peso, p.actualizado, ahora)]));
  const nodes = orden.map((n, i) => ({
    id: n.nombre, g: n.carpeta || '', d: grado[i], t: Math.round((n.actualizado || 0) / 1000), b: n.bytes || 0,
    ...(n.siempre ? { s: 1 } : {}), ...(n.privado ? { p: 1 } : {}), ...(peso.get(n.nombre) ? { w: +peso.get(n.nombre).toFixed(3) } : {}),
  }));
  return { notes: orden.length, nodes, links, mentions: ment, meaning: sig, learned: apr };
}

/** Lista de vecinas por nombre con la fuerza de cada sinapsis (si dos clases unen el mismo par, se suman con tope 1.2). */
export function adyacencia(g) {
  const adj = g.nodes.map(() => new Map());
  const poner = (a, b, f) => { for (const [x, y] of [[a, b], [b, a]]) adj[x].set(y, Math.min(1.2, (adj[x].get(y) || 0) + f)); };
  for (const [a, b] of g.links) poner(a, b, FUERZA.enlace);
  for (const [a, b] of g.mentions) poner(a, b, FUERZA.mencion);
  for (const [a, b, s] of g.meaning) poner(a, b, FUERZA.significado * s);
  for (const [a, b, w] of g.learned) poner(a, b, w);
  return adj;
}

/**
 * Propagación de activación: las semillas (notas que la búsqueda encontró o que el artista ancló) despiertan a sus vecinas;
 * la señal viaja `saltos` saltos, se debilita con `caida` en cada uno y se reparte entre las vecinas de una nota muy conectada
 * (un índice con 40 enlaces no inunda el resultado). → Map nombre → energía (las semillas incluidas).
 */
export function activar(g, semillas, { saltos = 2, caida = 0.55, adj = null } = {}) {
  const A = adj || adyacencia(g);
  const id = new Map(g.nodes.map((n, i) => [n.id, i]));
  const energia = new Map();
  let frente = new Map();
  for (const [nombre, e] of semillas) { const i = id.get(nombre); if (i == null) continue; frente.set(i, Math.max(frente.get(i) || 0, e)); energia.set(i, Math.max(energia.get(i) || 0, e)); }
  for (let s = 0; s < saltos; s++) {
    const sig = new Map();
    for (const [u, e] of frente) {
      const reparto = Math.sqrt(A[u].size + 1);
      for (const [v, f] of A[u]) {
        const aporte = (e * caida * f) / reparto;
        if (aporte > (sig.get(v) || 0)) sig.set(v, aporte);
      }
    }
    for (const [v, e] of sig) if (e > (energia.get(v) || 0)) energia.set(v, e);
    frente = sig;
  }
  const out = new Map();
  for (const [i, e] of energia) out.set(g.nodes[i].id, e);
  return out;
}

/** El camino más corto (por sinapsis) entre dos notas, para animar la señal. [] si no hay. */
export function camino(g, de, a, { adj = null } = {}) {
  const A = adj || adyacencia(g);
  const id = new Map(g.nodes.map((n, i) => [n.id, i]));
  const s = id.get(de), t = id.get(a);
  if (s == null || t == null) return [];
  if (s === t) return [de];
  const padre = new Map([[s, -1]]); let cola = [s];
  while (cola.length) {
    const sig = [];
    for (const u of cola) for (const v of A[u].keys()) {
      if (padre.has(v)) continue;
      padre.set(v, u);
      if (v === t) { const r = []; for (let x = t; x !== -1; x = padre.get(x)) r.push(g.nodes[x].id); return r.reverse(); }
      sig.push(v);
    }
    cola = sig;
  }
  return [];
}
