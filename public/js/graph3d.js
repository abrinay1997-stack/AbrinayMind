// Abrinay Mind — el cerebro dibujado: un grafo 3D de neuronas (notas) y sinapsis (enlaces, menciones, significado, aprendido).
// Sin librerías: un layout de fuerzas en 3D (con un ancla por lóbulo/carpeta) y un render en Canvas 2D con perspectiva.
// Solo dibuja cuando algo se mueve, para no gastar batería. Se usa en grande (pestaña Cerebro) y en pequeño (mapa del Estudio).
import { adyacencia, camino } from '/core/graph.js';
import { lobulo } from '/core/text.js';

const FOCAL = 900;
const HUES = [268, 192, 332, 42, 152, 14, 216, 96, 300, 58, 172, 356];
export const colorDeLobulo = (i) => `hsl(${HUES[i % HUES.length]} 74% 66%)`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const AMBAR = '#f5b942';
const MARCAS = { modo: '#ffffff', anclada: '#e9d5ff', busqueda: null, vecina: '#9aa0c8', siempre: AMBAR, hit: '#ffffff' };

export class Graph3D {
  constructor(canvas, o = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.mini = !!o.mini; this.o = o; this.accent = o.accent || '#94a3b8'; this.clave = o.clave || null;
    this.cam = { yaw: .55, pitch: -.32, dist: 1000, tx: 0, ty: 0, tz: 0 };
    this.capas = { links: true, mentions: false, meaning: false, learned: true };
    this.ocultos = new Set(); this.etiquetas = !this.mini; this.girar = this.mini; this.sel = -1; this.hover = -1;
    this.marcas = null; this.pulsos = []; this.destellos = new Map(); this.anim = null; this.vivo = true; this.sucio = true; this.raf = 0;
    this.reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (this.reducir) this.girar = false;
    this.N = 0; this.punteros = new Map(); this.arrastre = null; this.ancho = 0; this.alto = 0; this.dpr = 1;
    this._loop = this._loop.bind(this);
    this.tactil = window.matchMedia?.('(pointer: coarse)').matches; this.pausado = false;
    this._vis = () => { if (!document.hidden) this.despertar(); }; document.addEventListener('visibilitychange', this._vis);
    this._ro = new ResizeObserver(() => this.redimensionar()); this._ro.observe(canvas.parentElement || canvas);
    this._eventos();
    this.redimensionar();
  }

  /* ---------- datos y layout ---------- */
  setData(g) {
    this.g = g; const N = this.N = g.nodes.length;
    this.idx = new Map(g.nodes.map((n, i) => [n.id, i]));
    const nombres = [...new Set(g.nodes.map((n) => lobulo(n.g)))].sort();
    this.lobulos = nombres.map((nombre, i) => ({ nombre, color: colorDeLobulo(i), n: g.nodes.filter((n) => lobulo(n.g) === nombre).length }));
    const pos = new Map(nombres.map((n, i) => [n, i]));
    this.lobo = Int16Array.from(g.nodes, (n) => pos.get(lobulo(n.g)));
    this.adj = adyacencia(g);
    this.sel = -1; this.hover = -1; this.marcas = null; this.pulsos = []; this.destellos.clear();
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.sx = new Float32Array(N); this.sy = new Float32Array(N); this.sc = new Float32Array(N); this.zc = new Float32Array(N);
    this.visible = new Uint8Array(N).fill(1);
    // los más conectados llevan etiqueta siempre
    const grados = g.nodes.map((n, i) => [n.d, i]).sort((a, b) => b[0] - a[0]);
    this.hubs = new Set(grados.slice(0, Math.min(this.mini ? 6 : 24, N)).filter((x) => x[0] > 2).map((x) => x[1]));
    // aristas del layout: enlaces fuertes, menciones y significado débiles
    const ea = [], eb = [], ek = [], er = [];
    for (const [a, b] of g.links) { ea.push(a); eb.push(b); ek.push(.05); er.push(34); }
    for (const [a, b] of g.mentions) { ea.push(a); eb.push(b); ek.push(.006); er.push(80); }
    for (const [a, b, s] of g.meaning) { ea.push(a); eb.push(b); ek.push(.012 * s); er.push(64); }
    this.E = { a: Int32Array.from(ea), b: Int32Array.from(eb), k: Float32Array.from(ek), r: Float32Array.from(er) };
    // anclas de lóbulo en una esfera
    const R = 80 + 8.5 * Math.sqrt(N), k = nombres.length;
    this.anclas = nombres.map((_, i) => { const y = k === 1 ? 0 : 1 - (i / (k - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963; return [Math.cos(th) * r * R, y * R * .85, Math.sin(th) * r * R]; });
    // posiciones: las recordadas, o semilla alrededor del ancla
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(this.clave) || '{}'); } catch { /* sin caché */ }
    let conocidos = 0, s = 12345;
    const azar = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - .5; };
    g.nodes.forEach((n, i) => {
      const c = cache[n.id];
      if (c) { this.p.set(c, i * 3); conocidos++; }
      else { const a = this.anclas[this.lobo[i]]; this.p[i * 3] = a[0] + azar() * 90; this.p[i * 3 + 1] = a[1] + azar() * 90; this.p[i * 3 + 2] = a[2] + azar() * 90; }
    });
    this.alfa = conocidos > N * .8 ? .12 : 1;
    if (this.alfa === 1) for (let i = 0; i < (N > 900 ? 40 : 110); i++) this._paso(1 - i / 220);
    this._recalcularVisibles(); this.ajustar(false); this.despertar();
  }

  _paso(alfa) {
    const { p, v, N } = this, E = this.E, rep = 1700, cerca = N > 900;
    for (let i = 0; i < N; i++) {
      const m = cerca ? 30 : N;
      for (let q = 0; q < m; q++) {
        const j = cerca ? (Math.random() * N) | 0 : q; if (j <= i && !cerca) continue; if (j === i) continue;
        const dx = p[i * 3] - p[j * 3], dy = p[i * 3 + 1] - p[j * 3 + 1], dz = p[i * 3 + 2] - p[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz; if (d2 > 26000) continue;
        const f = (rep * alfa) / (d2 + 40) * (cerca ? N / m / 2 : 1), d = Math.sqrt(d2) + .01, fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
        v[i * 3] += fx; v[i * 3 + 1] += fy; v[i * 3 + 2] += fz; if (!cerca) { v[j * 3] -= fx; v[j * 3 + 1] -= fy; v[j * 3 + 2] -= fz; }
      }
    }
    for (let e = 0; e < E.a.length; e++) {
      const a = E.a[e], b = E.b[e], dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1], dz = p[b * 3 + 2] - p[a * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + .01, f = E.k[e] * (d - E.r[e]) * alfa, fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
      v[a * 3] += fx; v[a * 3 + 1] += fy; v[a * 3 + 2] += fz; v[b * 3] -= fx; v[b * 3 + 1] -= fy; v[b * 3 + 2] -= fz;
    }
    for (let i = 0; i < N; i++) {
      const a = this.anclas[this.lobo[i]];
      v[i * 3] += (a[0] - p[i * 3]) * .012 * alfa - p[i * 3] * .0015 * alfa; v[i * 3 + 1] += (a[1] - p[i * 3 + 1]) * .012 * alfa - p[i * 3 + 1] * .0015 * alfa; v[i * 3 + 2] += (a[2] - p[i * 3 + 2]) * .012 * alfa - p[i * 3 + 2] * .0015 * alfa;
      for (let k = 0; k < 3; k++) { v[i * 3 + k] *= .8; p[i * 3 + k] += clamp(v[i * 3 + k], -30, 30); }
    }
  }

  guardarLayout() {
    if (!this.clave || !this.g) return;
    try { const o = {}; this.g.nodes.forEach((n, i) => { o[n.id] = [Math.round(this.p[i * 3]), Math.round(this.p[i * 3 + 1]), Math.round(this.p[i * 3 + 2])]; }); localStorage.setItem(this.clave, JSON.stringify(o)); } catch { /* cuota llena */ }
  }

  /* ---------- estado que fija la interfaz ---------- */
  setCapas(c) { Object.assign(this.capas, c); this.despertar(); }
  setOcultos(set) { this.ocultos = set; this._recalcularVisibles(); this.despertar(); }
  setAcento(c) { this.accent = c; this.despertar(); }
  setEtiquetas(b) { this.etiquetas = b; this.despertar(); }
  setGirar(b) { this.girar = b && !this.reducir; this.despertar(); }
  _recalcularVisibles() { for (let i = 0; i < this.N; i++) this.visible[i] = this.ocultos.has(this.lobulos[this.lobo[i]].nombre) ? 0 : 1; }

  /** Selecciona una nota por nombre (o ninguna). */
  seleccionar(id, { volar = false, avisar = false } = {}) {
    this.sel = id == null ? -1 : (this.idx.get(id) ?? -1);
    this._vecinos = null;
    if (this.sel >= 0 && volar) this.volarA(this.sel);
    if (avisar) this.o.onSelect?.(this.sel >= 0 ? this.g.nodes[this.sel].id : null);
    this.despertar();
  }
  /** Marca notas con un rol visible: { nombre: 'modo'|'busqueda'|'vecina'|'siempre'|'anclada'|'hit' }. null quita las marcas. */
  marcar(mapa) {
    if (!mapa) { this.marcas = null; this.despertar(); return; }
    this.marcas = new Map();
    for (const [id, tipo] of mapa) { const i = this.idx.get(id); if (i != null) this.marcas.set(i, tipo); }
    if (!this.marcas.size) this.marcas = null;
    this.despertar();
  }
  /** Una señal que viaja por las sinapsis desde `desde` hasta cada nota de `hacia`. */
  pulsar(desde, hacia, { retardo = 90 } = {}) {
    const ahora = performance.now(); let n = 0;
    for (const id of hacia) {
      if (id === desde) { this.destellos.set(this.idx.get(id), ahora + n * retardo); n++; continue; }
      const ruta = camino(this.g, desde, id, { adj: this.adj }).map((x) => this.idx.get(x));
      if (ruta.length < 2) { const j = this.idx.get(id); if (j != null) this.destellos.set(j, ahora + n * retardo + 200); n++; continue; }
      this.pulsos.push({ ruta, t0: ahora + n * retardo, dur: 380 * (ruta.length - 1) + 250 }); n++;
    }
    this.despertar();
  }
  volarA(i) {
    const d0 = this.cam.dist;
    this.anim = { t0: performance.now(), dur: this.reducir ? 1 : 750, de: { tx: this.cam.tx, ty: this.cam.ty, tz: this.cam.tz, dist: d0 }, a: { tx: this.p[i * 3], ty: this.p[i * 3 + 1], tz: this.p[i * 3 + 2], dist: clamp(Math.min(d0, 620), 260, 3000) } };
    this.despertar();
  }
  /** Encuadra todo el grafo. */
  ajustar(animar = true) {
    if (!this.N) return;
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (let i = 0; i < this.N; i++) if (this.visible[i]) { cx += this.p[i * 3]; cy += this.p[i * 3 + 1]; cz += this.p[i * 3 + 2]; n++; }
    if (!n) return; cx /= n; cy /= n; cz /= n;
    const ds = []; for (let i = 0; i < this.N; i++) if (this.visible[i]) ds.push(Math.hypot(this.p[i * 3] - cx, this.p[i * 3 + 1] - cy, this.p[i * 3 + 2] - cz));
    ds.sort((a, b) => a - b); const rad = Math.max(40, ds[Math.floor(ds.length * .93)] * 1.12); // los más lejanos pueden quedar fuera del encuadre
    const lado = Math.min(this.ancho || 800, this.alto || 600) / 2;
    const dist = clamp(rad * FOCAL / (lado * (this.mini ? 1.12 : .8)) + rad * (this.mini ? .12 : .35), 260, 4000);
    if (animar && !this.reducir) this.anim = { t0: performance.now(), dur: 700, de: { ...this.cam }, a: { tx: cx, ty: cy, tz: cz, dist } };
    else Object.assign(this.cam, { tx: cx, ty: cy, tz: cz, dist });
    this.despertar();
  }

  /* ---------- el bucle ---------- */
  despertar() { this.sucio = true; if (!this.raf && this.vivo && !this.pausado && !document.hidden) this.raf = requestAnimationFrame(this._loop); }
  /** Pausa el dibujo (p. ej. cuando el lienzo está oculto por la vista de lista o la pestaña está en segundo plano). */
  pausar(b) { this.pausado = !!b; if (this.pausado && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } else if (!this.pausado) this.despertar(); }
  _loop(t) {
    this.raf = 0; if (!this.vivo || !this.N || this.pausado || document.hidden) return;
    let sigue = false;
    if (this.alfa > .02) { const pasos = this.N > 700 ? 1 : 2; for (let k = 0; k < pasos; k++) { this._paso(this.alfa); this.alfa *= .992; } sigue = true; if (this.alfa <= .02) this.guardarLayout(); }
    if (this.girar && !this.arrastre) { this.cam.yaw += this.mini ? .0016 : .0007; sigue = true; }
    if (this.anim) {
      const u = clamp((t - this.anim.t0) / this.anim.dur, 0, 1), e = ease(u);
      for (const k of ['tx', 'ty', 'tz', 'dist']) this.cam[k] = this.anim.de[k] + (this.anim.a[k] - this.anim.de[k]) * e;
      if (u >= 1) this.anim = null; sigue = true;
    }
    if (this.pulsos.length || this.destellos.size) sigue = true;
    if (this.sucio || sigue) this._dibujar(t);
    this.sucio = false;
    if (sigue) this.raf = requestAnimationFrame(this._loop);
  }

  redimensionar() {
    const el = this.c.parentElement || this.c, r = el.getBoundingClientRect();
    this.dpr = Math.min(this.tactil && this.N > 300 ? 1.5 : 2, window.devicePixelRatio || 1);   // móviles modestos: menos píxeles que pintar
    this.ancho = Math.max(10, r.width); this.alto = Math.max(10, r.height);
    this.c.width = Math.round(this.ancho * this.dpr); this.c.height = Math.round(this.alto * this.dpr);
    this.despertar();
  }

  /* ---------- proyección y dibujo ---------- */
  _proyectar() {
    const { yaw, pitch, dist, tx, ty, tz } = this.cam, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), w2 = this.ancho / 2, h2 = this.alto / 2;
    for (let i = 0; i < this.N; i++) {
      const x = this.p[i * 3] - tx, y = this.p[i * 3 + 1] - ty, z = this.p[i * 3 + 2] - tz;
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, zc = z2 + dist;
      this.zc[i] = zc; const sc = zc > 40 ? FOCAL / zc : 0; this.sc[i] = sc; this.sx[i] = w2 + x1 * sc; this.sy[i] = h2 + y2 * sc;
    }
  }
  _radio(i) { const n = this.g.nodes[i]; return Math.max(1.3, (1.9 + Math.sqrt(n.d) * .85 + (n.s ? 1.1 : 0)) * this.sc[i] * (this.mini ? .85 : 1)); }
  _hex(c, a) { return c.startsWith('#') ? `${c}${Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0')}` : c.replace(')', ` / ${clamp(a, 0, 1).toFixed(2)})`); }
  _vecinosDeSel() {
    if (this._vecinos) return this._vecinos;
    const s = new Set([this.sel]);
    if (this.sel >= 0) for (const [j, f] of this.adj[this.sel]) { if (f >= .3 || this.capas.mentions) s.add(j); }
    return (this._vecinos = s);
  }

  _dibujar(t) {
    const ctx = this.ctx, W = this.ancho, H = this.alto;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!this.N) return;
    this._proyectar();
    const dist = this.cam.dist, rad = 330, near = dist - rad, span = 2 * rad;
    const foco = this.marcas ? new Set(this.marcas.keys()) : this.sel >= 0 ? this._vecinosDeSel() : null;
    const vis = this.visible, g = this.g;
    const fondo = foco ? .3 : 1;

    // ---- sinapsis
    const lote = (lista, estilo, anchoLinea, alfaBase, filtro) => {
      const cubos = [[], [], []];
      for (const e of lista) {
        const a = e[0], b = e[1]; if (!vis[a] || !vis[b] || !this.sc[a] || !this.sc[b]) continue;
        if (filtro && !filtro(e)) continue;
        const prof = clamp((((this.zc[a] + this.zc[b]) / 2) - near) / span, 0, .999);
        cubos[(prof * 3) | 0].push(e);
      }
      cubos.forEach((es, c) => {
        if (!es.length) return;
        ctx.beginPath();
        for (const e of es) { ctx.moveTo(this.sx[e[0]], this.sy[e[0]]); ctx.lineTo(this.sx[e[1]], this.sy[e[1]]); }
        ctx.strokeStyle = estilo(alfaBase * [1, .62, .34][c] * fondo); ctx.lineWidth = anchoLinea; ctx.stroke();
      });
    };
    ctx.lineCap = 'round';
    if (this.capas.mentions) lote(g.mentions, (a) => `rgba(160,160,190,${a})`, .6, .1);
    if (this.capas.meaning) lote(g.meaning, (a) => `rgba(96,165,250,${a})`, .8, .22);
    if (this.capas.links) lote(g.links, (a) => `rgba(205,205,235,${a})`, .8, .2);
    if (this.capas.learned) lote(g.learned, (a) => `rgba(245,185,66,${Math.min(1, a * 2.2)})`, 1.4, .34);
    if (foco) {
      // las sinapsis que tocan lo enfocado, encendidas
      const capasActivas = [['links', g.links], ['mentions', g.mentions], ['meaning', g.meaning], ['learned', g.learned]].filter(([k]) => this.capas[k]);
      ctx.beginPath();
      for (const [, lista] of capasActivas) for (const e of lista) {
        const a = e[0], b = e[1]; if (!vis[a] || !vis[b] || !this.sc[a] || !this.sc[b]) continue;
        const dentro = this.marcas ? this.marcas.has(a) && this.marcas.has(b) : (a === this.sel || b === this.sel);
        if (dentro) { ctx.moveTo(this.sx[a], this.sy[a]); ctx.lineTo(this.sx[b], this.sy[b]); }
      }
      ctx.strokeStyle = this._hex(this.accent, .85); ctx.lineWidth = 1.5; ctx.stroke();
    }

    // ---- neuronas, de lejos a cerca
    const orden = []; for (let i = 0; i < this.N; i++) if (vis[i] && this.sc[i]) orden.push(i);
    orden.sort((a, b) => this.zc[b] - this.zc[a]);
    for (const i of orden) {
      const n = g.nodes[i], r = this._radio(i), x = this.sx[i], y = this.sy[i];
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const prof = clamp((this.zc[i] - near) / span, 0, 1);
      let alfa = clamp(1.15 - prof * .75, .3, 1);
      const enFoco = !foco || foco.has(i);
      if (!enFoco) alfa *= .2;
      const color = this.lobulos[this.lobo[i]].color;
      const marca = this.marcas?.get(i);
      if (marca || i === this.sel) {
        const col = marca === 'siempre' ? AMBAR : marca === 'busqueda' || !marca ? this.accent : (MARCAS[marca] || this.accent);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        gr.addColorStop(0, this._hex(col, .55)); gr.addColorStop(1, this._hex(col, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 6.2832); ctx.fill();
      }
      const d = this.destellos.get(i);
      if (d != null) {
        const u = (t - d) / 1100;
        if (u >= 1) this.destellos.delete(i);
        else if (u >= 0) { const rr = r * (3 + 7 * u); ctx.strokeStyle = this._hex(this.accent, (1 - u) * .9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.stroke(); alfa = 1; }
      }
      if (n.w > .04) { ctx.strokeStyle = this._hex(AMBAR, .35 * alfa); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 2.4, 0, 6.2832); ctx.stroke(); }
      ctx.globalAlpha = alfa; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      if (n.s) { ctx.strokeStyle = this._hex(AMBAR, .95 * Math.max(alfa, .35)); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, 6.2832); ctx.stroke(); }
      if (n.p) { ctx.strokeStyle = `rgba(248,113,113,${.85 * Math.max(alfa, .35)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3.4, 0, 6.2832); ctx.stroke(); }
      if (i === this.sel || i === this.hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = i === this.sel ? 2 : 1.2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.2832); ctx.stroke(); }
    }

    // ---- señales que viajan
    this.pulsos = this.pulsos.filter((p) => {
      const u = (t - p.t0) / p.dur; if (u < 0) return true;
      if (u >= 1) { this.destellos.set(p.ruta[p.ruta.length - 1], t); return false; }
      const s = u * (p.ruta.length - 1), k = Math.min(p.ruta.length - 2, Math.floor(s)), f = s - k;
      const a = p.ruta[k], b = p.ruta[k + 1], x = this.sx[a] + (this.sx[b] - this.sx[a]) * f, y = this.sy[a] + (this.sy[b] - this.sy[a]) * f;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, '#ffffffee'); gr.addColorStop(.3, this._hex(this.accent, .7)); gr.addColorStop(1, this._hex(this.accent, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.2832); ctx.fill();
      return true;
    });

    // ---- etiquetas (sin pisarse)
    if (this.etiquetas || this.marcas) {
      const quiero = [];
      if (this.sel >= 0) quiero.push([this.sel, 0]);
      if (this.hover >= 0) quiero.push([this.hover, 0]);
      if (this.marcas) for (const [i, tp] of this.marcas) quiero.push([i, tp === 'modo' ? 1 : tp === 'siempre' ? 6 : 2]);
      if (this.sel >= 0) for (const j of this._vecinosDeSel()) quiero.push([j, 3]);
      if (this.etiquetas && !this.marcas) for (const j of this.hubs) quiero.push([j, 5]);
      if (this.etiquetas && !this.marcas && this.cam.dist < 520) for (const i of orden.slice(-60)) quiero.push([i, 7]);
      quiero.sort((a, b) => a[1] - b[1]);
      const cajas = []; let n = 0, ya = new Set();
      ctx.font = `${this.mini ? 10.5 : this.tactil ? 13 : 12}px ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'middle';
      for (const [i] of quiero) {
        if (ya.has(i) || !vis[i] || !this.sc[i] || n > 70) continue; ya.add(i);
        const txt = g.nodes[i].id.length > 34 ? g.nodes[i].id.slice(0, 33) + '…' : g.nodes[i].id, w = ctx.measureText(txt).width, x = this.sx[i] + this._radio(i) + 5, y = this.sy[i];
        if (x + w > W - 4 || x < 0 || y < 8 || y > H - 8) continue;
        const caja = [x - 2, y - 8, x + w + 2, y + 8];
        if (cajas.some((c) => caja[0] < c[2] && caja[2] > c[0] && caja[1] < c[3] && caja[3] > c[1])) continue;
        cajas.push(caja); n++;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(7,7,11,.88)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = i === this.sel || i === this.hover ? '#fff' : foco && !foco.has(i) ? 'rgba(236,236,244,.4)' : 'rgba(236,236,244,.88)'; ctx.fillText(txt, x, y);
      }
    }
  }

  /* ---------- puntero ---------- */
  _pick(mx, my) {
    let mejor = -1, zm = 1e9;
    for (let i = 0; i < this.N; i++) {
      if (!this.visible[i] || !this.sc[i]) continue;
      const dx = this.sx[i] - mx, dy = this.sy[i] - my, r = this._radio(i) + (this.tactil ? 14 : 5);   // con el dedo hace falta más margen
      if (dx * dx + dy * dy <= r * r && this.zc[i] < zm) { zm = this.zc[i]; mejor = i; }
    }
    return mejor;
  }
  _xy(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _eventos() {
    const c = this.c;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId); const [x, y] = this._xy(e);
      this.tactil = e.pointerType === 'touch' || (e.pointerType === 'mouse' ? false : this.tactil); this.punteros.set(e.pointerId, { x, y });
      this.arrastre = { x0: x, y0: y, t0: performance.now(), mov: 0, modo: this.punteros.size > 1 || e.button === 2 || e.shiftKey || e.button === 1 ? 'pan' : 'rotar', d0: this._distanciaPunteros() };
      this.o.onInteraccion?.();
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = this._xy(e), p = this.punteros.get(e.pointerId);
      if (!p || !this.arrastre) {
        if (!this.mini && e.pointerType === 'mouse') { const i = this._pick(x, y); if (i !== this.hover) { this.hover = i; c.style.cursor = i >= 0 ? 'pointer' : ''; this.o.onHover?.(i >= 0 ? this.g.nodes[i].id : null); this.despertar(); } }
        return;
      }
      const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y; this.arrastre.mov += Math.abs(dx) + Math.abs(dy);
      this.anim = null;
      if (this.punteros.size >= 2) {
        const d = this._distanciaPunteros(); if (this.arrastre.d0 > 0 && d > 0) this.cam.dist = clamp(this.cam.dist * (this.arrastre.d0 / d), 180, 4500); this.arrastre.d0 = d;
        this._pan(dx / 2, dy / 2);
      } else if (this.arrastre.modo === 'pan') this._pan(dx, dy);
      else { this.cam.yaw += dx * .0072; this.cam.pitch = clamp(this.cam.pitch + dy * .0072, -1.45, 1.45); }
      this.despertar();
    });
    const fin = (e) => {
      const a = this.arrastre; this.punteros.delete(e.pointerId);
      if (!this.punteros.size) this.arrastre = null; else if (a) a.modo = 'pan';
      if (!a || this.mini || e.type === 'pointercancel') return;
      const [x, y] = this._xy(e);
      if (a.mov < 5 && performance.now() - a.t0 < 450 && !this.punteros.size) {
        const i = this._pick(x, y);
        if (i >= 0) { this.seleccionar(this.g.nodes[i].id, { avisar: true }); }
        else if (this.sel >= 0) this.seleccionar(null, { avisar: true });
        const ahora = performance.now();
        if (i >= 0 && this._ultimo && this._ultimo.i === i && ahora - this._ultimo.t < 380) this.volarA(i);
        this._ultimo = { i, t: ahora };
      }
    };
    c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
    c.addEventListener('pointerleave', () => { if (this.hover >= 0) { this.hover = -1; this.o.onHover?.(null); this.despertar(); } });
    c.addEventListener('wheel', (e) => {
      if (this.mini) return;
      e.preventDefault(); this.anim = null;
      this.cam.dist = clamp(this.cam.dist * Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0012)), 180, 4500); this.despertar();
    }, { passive: false });
  }
  _distanciaPunteros() { const v = [...this.punteros.values()]; return v.length < 2 ? 0 : Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); }
  _pan(dx, dy) {
    const { yaw, pitch, dist } = this.cam, k = dist / FOCAL, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = -dx * k, y = -dy * k, z = 0; // vector en la cámara → mundo
    const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
    this.cam.tx += x * cy - z1 * sy; this.cam.ty += y1; this.cam.tz += x * sy + z1 * cy;
  }

  destruir() {
    this.vivo = false; if (this.raf) cancelAnimationFrame(this.raf); this._ro.disconnect(); document.removeEventListener('visibilitychange', this._vis);
    if (this.alfa < 1) this.guardarLayout();
  }
}
