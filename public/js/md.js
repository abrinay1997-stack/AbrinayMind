// Abrinay Mind — Markdown a HTML, sin dependencias y a prueba de inyección: todo texto se escapa, solo se generan etiquetas propias.
// Entiende [[enlaces|alias]] de la bóveda: salen como <a class="wiki" data-note="…"> (rojos si la nota no existe).
import { leerCabecera } from '/core/text.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function enLinea(texto, ctx) {
  const guardados = [];
  const guardar = (html) => { guardados.push(html); return `\u0001${guardados.length - 1}\u0001`; };
  let t = String(texto);
  t = t.replace(/`([^`\n]+)`/g, (_, c) => guardar(`<code>${esc(c)}</code>`));
  t = t.replace(/\[\[([^\]\n|#^]+?)(?:[#^][^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (_, n, alias) => {
    const nombre = n.trim(); const existe = ctx.existe ? ctx.existe(nombre) : true;
    return guardar(`<a class="wiki${existe ? '' : ' broken'}" data-note="${esc(nombre)}" title="${esc(nombre)}">${esc((alias || nombre).trim())}</a>`);
  });
  t = esc(t);
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(¿¡"'])__([^_\n]+?)__(?=[\s).,;:!?"']|$)/g, '$1<strong>$2</strong>');
  t = t.replace(/(^|[\s(¿¡"'])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?"']|$)/g, '$1<em>$2</em>').replace(/(^|[\s(¿¡"'])_([^_\s][^_\n]*?)_(?=[\s).,;:!?"']|$)/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => guardados[+i]);
}

const RE_LISTA = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_TABLA_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const celdas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Markdown (sin cabecera) → HTML. ctx.existe(nombre) → ¿existe la nota? */
export function md(texto, ctx = {}) {
  const L = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let i = 0;
  const esInicioDeBloque = (l) => /^(#{1,6})\s/.test(l) || /^\s*(```|~~~)/.test(l) || /^\s{0,3}>/.test(l) || RE_LISTA.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^\s*(```|~~~)\s*([\w-]*)/.exec(l))) {
      const cierre = m[1]; const buf = []; i++;
      while (i < L.length && !L[i].trim().startsWith(cierre)) buf.push(L[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { const n = m[1].length; out.push(`<h${n}>${enLinea(m[2], ctx)}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s{0,3}>/.test(l)) {
      const buf = []; while (i < L.length && /^\s{0,3}>/.test(L[i])) buf.push(L[i++].replace(/^\s{0,3}>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'), ctx)}</blockquote>`); continue;
    }
    if (l.includes('|') && i + 1 < L.length && RE_TABLA_SEP.test(L[i + 1]) && L[i + 1].includes('-')) {
      const cab = celdas(l); i += 2; const filas = [];
      while (i < L.length && L[i].includes('|') && L[i].trim()) filas.push(celdas(L[i++]));
      out.push(`<table><thead><tr>${cab.map((c) => `<th>${enLinea(c, ctx)}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${cab.map((_, k) => `<td>${enLinea(f[k] ?? '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (RE_LISTA.test(l)) {
      // lista con sangrías: se arma con una pila de niveles
      const pila = []; // { sangria, tag }
      let html = '';
      while (i < L.length && (RE_LISTA.test(L[i]) || (L[i].trim() && /^\s{2,}\S/.test(L[i]) && pila.length))) {
        const mm = RE_LISTA.exec(L[i]);
        if (!mm) { html = html.replace(/<\/li>$/, '') + '<br>' + enLinea(L[i].trim(), ctx) + '</li>'; i++; continue; }
        const sang = mm[1].replace(/\t/g, '    ').length, tag = /\d/.test(mm[2]) ? 'ol' : 'ul';
        while (pila.length && sang < pila[pila.length - 1].sangria) { html += `</li></${pila.pop().tag}>`; }
        if (!pila.length || sang > pila[pila.length - 1].sangria) { html += `<${tag}>`; pila.push({ sangria: sang, tag }); }
        else html += '</li>';
        html += `<li>${enLinea(mm[3], ctx)}`; i++;
      }
      while (pila.length) html += `</li></${pila.pop().tag}>`;
      out.push(html); continue;
    }
    // párrafo: las líneas seguidas se respetan con salto (así se leen bien las letras)
    const buf = [l]; i++;
    while (i < L.length && L[i].trim() && !esInicioDeBloque(L[i]) && !(L[i].includes('|') && i + 1 < L.length && RE_TABLA_SEP.test(L[i + 1]))) buf.push(L[i++]);
    out.push(`<p>${buf.map((x) => enLinea(x.trim(), ctx)).join('<br>')}</p>`);
  }
  return out.join('\n');
}

/** Una nota entera: separa la cabecera (propiedades) del cuerpo. → { fm, html } */
export function notaAHtml(texto, ctx) {
  const { fm, cuerpo } = leerCabecera(texto);
  return { fm, html: md(cuerpo, ctx) };
}

/** Texto plano de un trozo de markdown (para vistas previas). */
export const plano = (t, n = 160) => String(t).replace(/^---[\s\S]*?\n---\s*/, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/[#>*_`~-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
