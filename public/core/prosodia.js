// Abrinay Mind — prosodia del español: sílabas, acento, sílabas métricas (con sinalefa), rima (consonante, asonante, multisílaba), anáforas y esquema de una letra.
// Lógica pura (sin Worker ni DOM): la usan el navegador (revisión de cada letra), el chat (herramienta `analizar_letra`) y las pruebas.
// Es una ESTIMACIÓN honesta: el español hablado del rap rompe reglas (sinalefa, deshiatos, spanglish). Sirve para comparar versos entre sí y contra tus propias canciones, no como verdad métrica.
import { fold } from './text.js';

const FUERTES = 'aeoáéó', DEBILES = 'iuü', DEBIL_ACENTUADA = 'íú', VOCALES = 'aeiouáéíóúü';
const esV = (c) => VOCALES.includes(c);
const INSEPARABLES = new Set(['pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr', 'kr', 'pl', 'bl', 'cl', 'gl', 'fl', 'kl', 'ch', 'll', 'rr']);

/** Prepara una palabra: minúsculas, solo letras; «qu»/«gu» ante e/i y «y» final se tratan según su sonido. */
function limpiar(p) { return String(p).toLowerCase().replace(/[^a-záéíóúüñ]/g, ''); }

/** Núcleos vocálicos de una palabra: [{ ini, fin }] (un núcleo = una sílaba). Diptongo: fuerte+débil, débil+fuerte o dos débiles distintas; hiato: dos fuertes o débil acentuada. */
function nucleos(w) {
  const letras = [...w]; const out = [];
  const esVocalEn = (i) => {
    const c = letras[i];
    if (esV(c)) { // «u» muda en qu/gu + e/i
      if (c === 'u' && i > 0 && (letras[i - 1] === 'q' || (letras[i - 1] === 'g' && !'üÜ'.includes(c))) && i + 1 < letras.length && 'eiéí'.includes(letras[i + 1])) return false;
      return true;
    }
    return c === 'y' && i === letras.length - 1 && i > 0;   // «rey», «hoy», «muy»: y final = vocal
  };
  let i = 0;
  while (i < letras.length) {
    if (!esVocalEn(i)) { i++; continue; }
    let ini = i; i++;
    // ¿se une la siguiente vocal a este núcleo?
    while (i < letras.length && esVocalEn(i)) {
      const a = letras[i - 1], b = letras[i] === 'y' ? 'i' : letras[i];
      const fuerteA = FUERTES.includes(a), fuerteB = FUERTES.includes(b), acentA = DEBIL_ACENTUADA.includes(a), acentB = DEBIL_ACENTUADA.includes(b);
      const diptongo = !acentA && !acentB && ((fuerteA && !fuerteB) || (!fuerteA && fuerteB) || (!fuerteA && !fuerteB && a !== b));
      if (!diptongo) break;
      // un tercer elemento forma triptongo solo débil+fuerte+débil
      i++;
    }
    out.push({ ini, fin: i - 1 });
  }
  return out;
}

/** Sílabas de una palabra con su acento: { silabas: ['can','ción'], tonica: 1 (índice de la sílaba tónica), tipo: 'aguda'|'llana'|'esdrújula'|'monosílaba' }. */
export function silabas(palabra) {
  const w = limpiar(palabra);
  if (!w) return { silabas: [], tonica: -1, tipo: 'monosílaba' };
  const nu = nucleos(w);
  if (nu.length <= 1) return { silabas: [w], tonica: 0, tipo: 'monosílaba' };
  // cortes entre núcleos según las consonantes intermedias
  const cortes = [];
  for (let k = 0; k < nu.length - 1; k++) {
    const entre = w.slice(nu[k].fin + 1, nu[k + 1].ini);
    const n = entre.length;
    let corte; // posición donde empieza la sílaba siguiente (relativa a nu[k].fin + 1)
    if (n === 0) corte = 0;
    else if (n === 1) corte = 0;
    else if (n === 2) corte = INSEPARABLES.has(entre) ? 0 : 1;
    else if (n === 3) corte = INSEPARABLES.has(entre.slice(1)) ? 1 : 2;
    else corte = INSEPARABLES.has(entre.slice(2)) ? 2 : 3;   // 4 consonantes (p. ej. «instrumento»: ins-tru)
    cortes.push(nu[k].fin + 1 + corte);
  }
  const res = []; let a = 0;
  for (const c of cortes) { res.push(w.slice(a, c)); a = c; }
  res.push(w.slice(a));
  // acento: tilde explícita, si no por la terminación (vocal, n, s → llana; otra → aguda)
  let tonica = res.findIndex((s) => /[áéíóú]/.test(s));
  if (tonica < 0) {
    const finVocalNS = /[aeiouáéíóúüyns]$/.test(w) && !/[^aeiou]y$/.test(w) ? true : /[aeiouns]$/.test(w);
    tonica = finVocalNS ? res.length - 2 : res.length - 1;
    if (/y$/.test(w)) tonica = res.length - 1;   // «virrey», «Uruguay»: aguda
  }
  const desdeFinal = res.length - 1 - tonica;
  return { silabas: res, tonica, tipo: desdeFinal === 0 ? 'aguda' : desdeFinal === 1 ? 'llana' : 'esdrújula' };
}

/** Palabras de un verso (sin signos). */
export const palabrasDe = (verso) => String(verso).toLowerCase().replace(/[^a-záéíóúüñ\s'’-]/g, ' ').replace(/['’-]/g, '').split(/\s+/).filter(Boolean);

const terminaVocal = (p) => /[aeiouáéíóúy]$/.test(p);

/**
 * Sílabas de un verso. `foneticas`: contadas palabra por palabra con sinalefa (palabra que acaba en vocal + palabra que empieza por vocal o «h» = una sola sílaba).
 * `metricas`: las anteriores ajustadas por el acento de la última palabra (aguda +1, esdrújula −1), como en la métrica clásica.
 */
export function silabasDeVerso(verso) {
  const ps = palabrasDe(verso);
  if (!ps.length) return { foneticas: 0, metricas: 0, ultima: '', tipoFinal: 'llana', palabras: 0 };
  let total = 0, previaTerminaVocal = false;
  for (const p of ps) {
    const n = silabas(p).silabas.length;
    total += n;
    if (previaTerminaVocal && /^h?[aeiouáéíóú]/.test(p)) total -= 1;   // sinalefa
    previaTerminaVocal = terminaVocal(p.replace(/y$/, 'i'));
  }
  const ultima = ps[ps.length - 1], tipo = silabas(ultima).tipo;
  const ajuste = tipo === 'aguda' || tipo === 'monosílaba' ? 1 : tipo === 'esdrújula' ? -1 : 0;
  return { foneticas: total, metricas: total + ajuste, ultima, tipoFinal: tipo, palabras: ps.length };
}

/* ---------- rima ---------- */

const plana = (v) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', y: 'i' }[v] || v);

/** Sonido de las letras (español de América: seseo, yeísmo): para comparar terminaciones consonantes. */
function fonetica(s) {
  return s.replace(/ch/g, '1').replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/gü/g, 'gu').replace(/gu(?=[eiéí])/g, 'g').replace(/g(?=[eiéí])/g, 'j').replace(/c(?=[eiéí])/g, 's').replace(/[zc]/g, (m) => (m === 'z' ? 's' : 'k'))
    .replace(/v/g, 'b').replace(/h/g, '').replace(/x/g, 'ks').replace(/w/g, 'u').replace(/ñ/g, '2').replace(/[áéíóúü]/g, (m) => plana(m)).replace(/(.)\1+/g, (m, c) => (c === 'r' ? 'r' : c));
}

/** La rima de una palabra: { consonante: 'on', asonante: 'o', vocales: ['o'], silabasRima: 1 } (desde la vocal tónica hasta el final). */
export function rimaDe(palabra) {
  const w = limpiar(palabra);
  if (!w) return null;
  const s = silabas(w), nu = nucleos(w), n = nu[s.tonica] || nu[nu.length - 1];
  // la vocal tónica: la que lleva tilde; si no, en un diptongo la fuerte (o la segunda débil)
  const grupo = [...w.slice(n.ini, n.fin + 1)]; let k = grupo.findIndex((c) => /[áéíóú]/.test(c));
  if (k < 0 && grupo.length > 1) { k = grupo.findIndex((c) => FUERTES.includes(c)); if (k < 0) k = grupo.length - 1; }
  const cola = w.slice(n.ini + Math.max(0, k));
  // asonancia: una vocal por núcleo de la cola (de un diptongo cuenta la fuerte; si son dos débiles, la segunda)
  const vocales = []; let grupoActual = [];
  const cerrar = () => { if (!grupoActual.length) return; const fuerte = grupoActual.find((c) => FUERTES.includes(c) || /[áéíóú]/.test(c)); vocales.push(plana(fuerte ?? grupoActual[grupoActual.length - 1])); grupoActual = []; };
  [...cola].forEach((c, i) => { if (esV(c) || (c === 'y' && i === cola.length - 1 && i > 0)) grupoActual.push(c); else cerrar(); });
  cerrar();
  return { consonante: fonetica(cola), asonante: vocales.join(''), vocales, silabasRima: vocales.length };
}

/** Cómo riman dos palabras: 'consonante' | 'asonante' | 'multisilabica' (asonante o consonante con ≥2 vocales coincidentes) | null. Profundidad = vocales iguales contando desde el final. */
export function comparaRima(a, b) {
  const x = rimaDe(a), y = rimaDe(b);
  if (!x || !y || limpiar(a) === limpiar(b)) return null;
  let prof = 0; for (let i = 1; i <= Math.min(x.vocales.length, y.vocales.length) && x.vocales.at(-i) === y.vocales.at(-i); i++) prof++;
  const consonante = x.consonante === y.consonante && x.consonante.length > 0;
  const asonante = x.asonante === y.asonante && x.asonante.length > 0;
  if (!consonante && !asonante && prof < 2) return null;
  const tipo = prof >= 2 && (consonante || asonante || prof >= Math.min(x.vocales.length, y.vocales.length)) ? 'multisilabica' : consonante ? 'consonante' : asonante ? 'asonante' : null;
  if (!tipo) return null;
  return { tipo, consonante, asonante, profundidad: prof };
}

/* ---------- la letra ---------- */

const RE_SECCION = /^\s*\[([^\]]{1,40})\]\s*$/;
const mediana = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Parte una letra en secciones y versos. Ignora el Markdown, la línea de idea central y todo lo que siga a «Notas técnicas». */
export function partirLetra(texto) {
  const lineas = String(texto ?? '').replace(/\r/g, '').split('\n'); const secciones = []; let actual = null;
  for (const bruta of lineas) {
    if (/^\s*#{1,3}\s*notas t[ée]cnicas/i.test(bruta) || /^\s*notas que pesaron/i.test(bruta)) break;
    if (/^\s*#{1,6}\s/.test(bruta) && !RE_SECCION.test(bruta)) { if (/versi[óo]n\s+[a-z0-9]/i.test(bruta) && secciones.length) break; continue; }
    const m = RE_SECCION.exec(bruta);
    if (m) { actual = { nombre: m[1].trim(), versos: [] }; secciones.push(actual); continue; }
    const l = bruta.replace(/[*_`>]/g, '').replace(/^\s*[-•]\s+/, '').trim();
    if (!l || /^idea central/i.test(l) || /^---+$/.test(l)) continue;
    if (!actual) { actual = { nombre: 'Letra', versos: [] }; secciones.push(actual); }
    // «una barra por línea»: si hay barras «/», cada trozo es un verso
    for (const v of l.split(/\s\/\s/)) if (v.trim()) actual.versos.push(v.trim());
  }
  return secciones.filter((s) => s.versos.length);
}

/** Esquema de rima de una sección: una letra por verso (A, B, C…; «-» si no rima con nadie) y los pares que riman. */
function esquemaDe(versos) {
  const finales = versos.map((v) => palabrasDe(v).at(-1) || '');
  const letras = new Array(versos.length).fill('-'); let sig = 0; const pares = [];
  for (let i = 0; i < versos.length; i++) {
    for (let j = i + 1; j < versos.length; j++) {
      if (!finales[i] || !finales[j]) continue;
      const c = comparaRima(finales[i], finales[j]);
      if (!c) continue;
      pares.push({ a: i, b: j, tipo: c.tipo, profundidad: c.profundidad });
      if (letras[i] === '-' && letras[j] === '-') { letras[i] = letras[j] = String.fromCharCode(65 + (sig++ % 26)); }
      else if (letras[i] === '-') letras[i] = letras[j]; else if (letras[j] === '-') letras[j] = letras[i];
    }
  }
  return { esquema: letras.join(''), pares };
}

/** Anáforas: bloques de ≥2 versos seguidos que empiezan igual (las 2 primeras palabras). → [{ inicio, versos }] */
function anaforasDe(versos) {
  const ini = versos.map((v) => palabrasDe(v).slice(0, 2).join(' '));
  const out = []; let i = 0;
  while (i < versos.length) { let j = i + 1; while (j < versos.length && ini[j] && ini[j] === ini[i]) j++; if (j - i >= 2 && ini[i].split(' ').length >= 1 && ini[i]) out.push({ inicio: ini[i], versos: j - i }); i = j; }
  return out;
}

/**
 * Análisis completo de una letra.
 * → { secciones: [{ nombre, versos: [{ texto, foneticas, metricas, ultima, tipoFinal }], esquema, pares, anaforas, mediana, densidadRima }],
 *     resumen: { versos, mediana, min, max, desviacion, densidadRima, tiposRima, anaforas, finalesRepetidos, versosRepetidos, atipicos:[{seccion, verso, texto, metricas}] } }
 */
export function analizarLetra(texto) {
  const secs = partirLetra(texto); const todas = []; const out = []; const tipos = { consonante: 0, asonante: 0, multisilabica: 0 };
  const finales = new Map(), vistos = new Map(); let anaforas = 0; const atipicos = [];
  for (const s of secs) {
    const versos = s.versos.map((t) => ({ texto: t, ...silabasDeVerso(t) }));
    const { esquema, pares } = esquemaDe(s.versos);
    const ana = anaforasDe(s.versos); anaforas += ana.length;
    const med = mediana(versos.map((v) => v.metricas));
    const conRima = new Set(); for (const p of pares) { conRima.add(p.a); conRima.add(p.b); tipos[p.tipo]++; }
    for (const v of versos) { todas.push(v.metricas); if (v.ultima) finales.set(v.ultima, (finales.get(v.ultima) || 0) + 1); const k = fold(v.texto).replace(/[^a-z0-9 ]/g, '').trim(); if (k) vistos.set(k, (vistos.get(k) || 0) + 1); }
    versos.forEach((v, i) => { if (versos.length >= 4 && Math.abs(v.metricas - med) >= 4) atipicos.push({ seccion: s.nombre, verso: i + 1, texto: v.texto, metricas: v.metricas, mediana: med }); });
    out.push({ nombre: s.nombre, versos, esquema, pares, anaforas: ana, mediana: med, densidadRima: versos.length ? +(conRima.size / versos.length).toFixed(2) : 0 });
  }
  const n = todas.length, media = n ? todas.reduce((a, b) => a + b, 0) / n : 0;
  const desviacion = n ? +Math.sqrt(todas.reduce((a, b) => a + (b - media) ** 2, 0) / n).toFixed(1) : 0;
  const conRimaTotal = out.reduce((a, s) => a + s.densidadRima * s.versos.length, 0);
  return { secciones: out, resumen: {
    versos: n, mediana: mediana(todas), min: n ? Math.min(...todas) : 0, max: n ? Math.max(...todas) : 0, desviacion,
    densidadRima: n ? +(conRimaTotal / n).toFixed(2) : 0, tiposRima: tipos, anaforas,
    finalesRepetidos: [...finales].filter(([, c]) => c >= 3).map(([p, c]) => ({ palabra: p, veces: c })).sort((a, b) => b.veces - a.veces).slice(0, 6),
    versosRepetidos: [...vistos].filter(([, c]) => c >= 2).length, atipicos: atipicos.slice(0, 8),
  } };
}
