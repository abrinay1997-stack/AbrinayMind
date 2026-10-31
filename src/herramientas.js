// Abrinay Mind — el chat como canal BILATERAL con el cerebro: además de leerlo, la IA puede modificarlo cuando el artista se lo pide
// (o cuando él le explica algo que debe quedar guardado): crear, ampliar, reescribir, mover, renombrar, borrar, reconectar, recalcular.
// Todo pasa por src/notes.js (índice, enlaces, menciones, concurrencia). Barandillas: borrar manda a la PAPELERA (30 días), cada cambio queda
// anotado en el mensaje con lo necesario para DESHACERLO, hay topes por turno y las notas que mantiene la app no se borran ni se mueven.
import { HttpError, bad, noEsta, recortar } from './http.js';
import { todas, una, notasPorNombre } from './db.js';
import { NOTAS } from './names.js';
import * as notas from './notes.js';
import { buscar } from './search.js';
import { aceptarRegla } from './songs.js';
import { analizarLetra } from '../public/core/prosodia.js';
import { fold, enlaces as enlacesDe, nombreValido, carpetaValida, resumen } from '../public/core/text.js';

/** Las herramientas que no modifican nada: son las únicas disponibles al escribir una letra. */
export const SOLO_LECTURA = new Set(['buscar_notas', 'leer_nota', 'listar_notas', 'analizar_letra']);
export const TIPOS = ['concepto', 'idea', 'estructura', 'metrica', 'tecnica', 'tema', 'recurso', 'referencia'];
export const TOPES = { escrituras: 40, borrados: 25, lecturas: 8, lecturaLetras: 6000, antes: 20_000 };
const PROTEGIDAS = new Set(Object.values(NOTAS).map(fold));
const hoy = () => new Date().toISOString().slice(0, 10);

const nombreP = { type: 'string', description: 'Nombre de la nota (tal como aparece en el cerebro).' };
export const HERRAMIENTAS = [
  { name: 'buscar_notas', description: 'Busca en el cerebro las notas que más se relacionan con un texto (por palabras y por significado). Úsala antes de modificar algo para encontrar la nota correcta.', input_schema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] } },
  { name: 'leer_nota', description: 'Lee el texto completo de una nota y a qué notas enlaza y desde cuáles la enlazan.', input_schema: { type: 'object', properties: { nombre: nombreP }, required: ['nombre'] } },
  { name: 'listar_notas', description: 'Lista nombres de notas (máximo 80), opcionalmente de una carpeta o cuyo nombre contenga un texto.', input_schema: { type: 'object', properties: { carpeta: { type: 'string' }, contiene: { type: 'string' } } } },
  { name: 'analizar_letra', description: 'Analiza una letra con prosodia del español: sílabas por verso (estimadas, con sinalefa), rimas (consonante, asonante, multisílaba), esquema por sección, anáforas, finales repetidos y versos que se salen de lo normal. Compara con las medidas de los ejemplos del artista si las hay. Úsala con tu borrador ANTES de entregarlo.', input_schema: { type: 'object', properties: { texto: { type: 'string', description: 'La letra completa, con secciones entre corchetes ([VERSO 1], [CORO]…).' } }, required: ['texto'] } },
  { name: 'salud_del_cerebro', description: 'Revisa el cerebro: enlaces rotos, notas sin ninguna conexión (huérfanas) y notas sin tipo. Úsala para «reconecta lo suelto» o «limpia».', input_schema: { type: 'object', properties: {} } },
  { name: 'crear_nota', description: 'Crea una nota nueva (concepto, idea, estructura, métrica, técnica, tema…). Un tema por nota; conéctala con notas existentes. No copies letras de otros artistas: de un referente solo análisis y métricas.', input_schema: { type: 'object', properties: { nombre: nombreP, carpeta: { type: 'string', description: 'Carpeta existente o nueva (hasta 3 niveles). Vacía = sin carpeta.' }, tipo: { type: 'string', enum: TIPOS }, texto: { type: 'string', description: 'Contenido en Markdown.' }, enlaces: { type: 'array', items: { type: 'string' }, description: 'Nombres EXACTOS de notas existentes con las que conectar.' } }, required: ['nombre', 'texto'] } },
  { name: 'ampliar_nota', description: 'Añade texto al final de una nota (o de una sección) sin tocar lo que ya decía. Prefiérela a reescribir.', input_schema: { type: 'object', properties: { nombre: nombreP, texto: { type: 'string' }, seccion: { type: 'string', description: 'Título de la sección donde añadir (se crea si falta). Opcional.' } }, required: ['nombre', 'texto'] } },
  { name: 'editar_nota', description: 'Reemplaza el texto COMPLETO de una nota (para corregir, reorganizar o quitar partes). Lee la nota antes y conserva su cabecera «---» si la tiene.', input_schema: { type: 'object', properties: { nombre: nombreP, texto: { type: 'string', description: 'El texto nuevo y completo.' } }, required: ['nombre', 'texto'] } },
  { name: 'mover_nota', description: 'Cambia una nota de carpeta.', input_schema: { type: 'object', properties: { nombre: nombreP, carpeta: { type: 'string' } }, required: ['nombre', 'carpeta'] } },
  { name: 'renombrar_nota', description: 'Cambia el nombre de una nota y reescribe los enlaces de las notas que la nombraban.', input_schema: { type: 'object', properties: { nombre: nombreP, nuevo: { type: 'string' } }, required: ['nombre', 'nuevo'] } },
  { name: 'borrar_nota', description: 'Manda una nota a la papelera (se puede restaurar 30 días). Úsala solo cuando el artista lo pidió. Si son muchas, di antes cuáles y pide confirmación.', input_schema: { type: 'object', properties: { nombre: nombreP }, required: ['nombre'] } },
  { name: 'conectar_notas', description: 'Conecta una nota con otras (añade enlaces en su sección «Relacionadas»).', input_schema: { type: 'object', properties: { origen: nombreP, destinos: { type: 'array', items: { type: 'string' } }, motivo: { type: 'string', description: 'Por qué se relacionan, en pocas palabras.' } }, required: ['origen', 'destinos'] } },
  { name: 'quitar_enlace', description: 'Desconecta dos notas: quita el enlace [[destino]] del texto de la nota origen (queda como texto normal).', input_schema: { type: 'object', properties: { origen: nombreP, destino: nombreP }, required: ['origen', 'destino'] } },
  { name: 'anadir_regla', description: 'Guarda una regla general de escritura en «Reglas aprendidas» (el cerebro la lee siempre antes de escribir). Una oración concreta por campo.', input_schema: { type: 'object', properties: { nunca: { type: 'string' }, siempre: { type: 'string' } } } },
  { name: 'recalcular_menciones', description: 'Recalcula las conexiones por mención (qué notas nombran a cuáles) de un trozo de 30 notas. Devuelve «siguiente»: llámala otra vez con ese valor hasta que sea null.', input_schema: { type: 'object', properties: { desde: { type: 'integer' } } } },
];

/** Notas de la lista cerrada de nombres reales (resolviendo mayúsculas y tildes). */
async function indice(db, brain) { return notas.indiceDeNombres(db, brain.id); }
const falla = (texto) => ({ texto, error: true });

/**
 * El ejecutor de un turno: guarda los cambios hechos (con lo necesario para deshacerlos) y aplica los topes.
 * → { ejecutar(nombre, entrada) → { texto, error? }, cambios }
 */
export function crearEjecutor({ env, db, brain, cambios = [], medidas = [], soloLectura = false }) {
  const cuenta = { escrituras: 0, borrados: 0, lecturas: 0 };
  const lee = () => { if (++cuenta.lecturas > TOPES.lecturas) throw new HttpError(429, `Ya hiciste ${TOPES.lecturas} lecturas en este mensaje: contesta al artista con lo que tienes.`); };
  const POR = 'chat-ia';
  const real = async (n) => { const x = (await indice(db, brain)).get(fold(String(n ?? '').trim())); if (!x) throw noEsta(`No hay una nota llamada «${recortar(String(n ?? ''), 60)}». Usa buscar_notas o listar_notas.`); return x; };
  const escribe = () => { if (++cuenta.escrituras > TOPES.escrituras) throw new HttpError(429, `Tope de ${TOPES.escrituras} cambios por mensaje. Dile al artista lo que falta y que lo pida de nuevo.`); };
  const protegida = (n) => { if (PROTEGIDAS.has(fold(n))) throw bad(`«${n}» la mantiene la app: no se borra, renombra ni mueve (sí se puede ampliar o editar).`); };
  const antes = async (nombre) => { const r = await una(db, 'select text, folder from notes where brain_id = ? and name = ?', brain.id, nombre); return r ? { texto: r.text.length <= TOPES.antes ? r.text : null, carpeta: r.folder } : null; };
  const anotar = (c) => { cambios.push({ ...c, hora: Date.now() }); };

  const acciones = {
    async buscar_notas({ consulta }) {
      lee();
      const { resultados } = await buscar(env, db, brain, String(consulta ?? '').slice(0, 600), { n: 10 });
      if (!resultados.length) return 'No encontré notas parecidas.';
      const filas = await notasPorNombre(db, brain.id, resultados.map((r) => r.nombre), 'name, folder, text, tipo');
      return filas.map((f) => `- ${f.name} [${f.folder || 'sin carpeta'}${f.tipo ? ' · ' + f.tipo : ''}]: ${resumen(f.text, 200)}`).join('\n');
    },
    async leer_nota({ nombre }) {
      lee();
      const n = await notas.leer(db, brain.id, await real(nombre));
      const cuerpo = n.text.length > TOPES.lecturaLetras ? n.text.slice(0, TOPES.lecturaLetras) + `\n[…recortada: ${TOPES.lecturaLetras} de ${n.text.length} letras]` : n.text;
      return `NOTA «${n.name}» [${n.folder || 'sin carpeta'}${n.tipo ? ' · ' + n.tipo : ''}]\nEnlaza a: ${n.salientes.map((s) => s.target + (s.existe ? '' : ' (no existe)')).join(', ') || '—'}\nEnlazada desde: ${n.entrantes.join(', ') || '—'}\n\n<nota_texto>\n${cuerpo.replace(/<\/nota_texto>/gi, '<\\/nota_texto>')}\n</nota_texto>`;
    },
    async listar_notas({ carpeta = '', contiene = '' }) {
      lee();
      const l = await notas.listar(db, brain.id, { carpeta: String(carpeta || ''), q: String(contiene || '') });
      return `${l.length} notas${l.length > 80 ? ' (primeras 80)' : ''}:\n` + l.slice(0, 80).map((f) => `- ${f.name} [${f.folder || 'sin carpeta'}${f.tipo ? ' · ' + f.tipo : ''}]`).join('\n');
    },
    async analizar_letra({ texto }) {
      lee();
      const a = analizarLetra(String(texto ?? '').slice(0, 20_000)); const r = a.resumen;
      if (!r.versos) return 'No encontré versos en ese texto. Pásame la letra con sus secciones entre corchetes.';
      const fila = (s) => `- ${s.nombre}: ${s.versos.length} versos, esquema ${s.esquema}, mediana ${s.mediana} sílabas${s.anaforas.length ? `, anáfora «${s.anaforas.map((x) => `${x.inicio} ×${x.versos}`).join('», «')}»` : ''}`;
      const vara = medidas.length ? `\nSus ejemplos (estimado): ${medidas.map((m) => `«${m.nombre}» mediana ${m.mediana} (rango ${m.min}–${m.max}), rima ${Math.round(m.densidadRima * 100)} %`).join(' · ')}` : '';
      return [`${r.versos} versos en ${a.secciones.length} secciones. Sílabas métricas por verso (estimadas): mediana ${r.mediana}, rango ${r.min}–${r.max}, desviación ${r.desviacion}.${vara}`,
        `Rima: ${Math.round(r.densidadRima * 100)} % de los versos riman con uno cercano (consonantes ${r.tiposRima.consonante}, asonantes ${r.tiposRima.asonante}, multisílabas ${r.tiposRima.multisilabica}).`,
        `Anáforas: ${r.anaforas}. Líneas repetidas: ${r.versosRepetidos}.${r.finalesRepetidos.length ? ` Finales que se repiten: ${r.finalesRepetidos.map((f) => `«${f.palabra}» ×${f.veces}`).join(', ')}.` : ''}`,
        'Por sección:', ...a.secciones.map(fila),
        r.atipicos.length ? `Versos que se salen de la sección: ${r.atipicos.map((x) => `[${x.seccion} v${x.verso}] ${x.metricas} sílabas (la sección va por ${x.mediana}): «${recortar(x.texto, 70)}»`).join(' | ')}` : 'Ningún verso se sale mucho de su sección.',
        'Son estimaciones: el rap rompe reglas de sinalefa y acento.'].join('\n');
    },
    async salud_del_cerebro() {
      lee();
      const s = await notas.salud(db, brain.id);
      return JSON.stringify({ resumen: s.resumen, enlacesRotos: s.rotos.slice(0, 30), huerfanas: s.huerfanas.slice(0, 40), sinTipo: s.sinTipo.slice(0, 30) });
    },
    async crear_nota({ nombre, carpeta = '', tipo = 'concepto', texto, enlaces = [] }) {
      escribe();
      const v = nombreValido(nombre); if (!v.ok) throw bad(v.error);
      const todos = await indice(db, brain);
      const links = [...new Set((Array.isArray(enlaces) ? enlaces : []).map((e) => todos.get(fold(String(e)))).filter(Boolean))].slice(0, 10);
      const c = carpetaValida(carpeta ?? '');
      const cuerpo = String(texto ?? '').trim();
      const completo = /^---\r?\n/.test(cuerpo) ? cuerpo + '\n' : notaNueva({ nombre: v.nombre, tipo, texto: cuerpo, enlaces: links });
      await notas.crear(db, brain, { nombre: v.nombre, carpeta: c.ok ? c.carpeta : '', texto: completo, por: POR });
      anotar({ tipo: 'crear', nombre: v.nombre, resumen: `Nota nueva «${v.nombre}»${links.length ? ` conectada con ${links.length}` : ''}` });
      return `Creada «${v.nombre}»${links.length ? ` (enlaces: ${links.join(', ')})` : ''}.`;
    },
    async ampliar_nota({ nombre, texto, seccion = '' }) {
      escribe(); const n = await real(nombre);
      const previo = await antes(n);
      await notas.agregar(db, brain, { nombre: n, texto: String(texto ?? '').slice(0, 8000), seccion: String(seccion || '').slice(0, 80), por: POR });
      anotar({ tipo: 'ampliar', nombre: n, antes: previo, resumen: `Ampliada «${n}»` });
      return `Ampliada «${n}».`;
    },
    async editar_nota({ nombre, texto }) {
      escribe(); const n = await real(nombre);
      const previo = await antes(n);
      if (!String(texto ?? '').trim()) throw bad('El texto nuevo no puede quedar vacío (para quitar la nota usa borrar_nota).');
      await notas.guardar(db, brain, { nombre: n, texto: String(texto), por: POR });
      anotar({ tipo: 'editar', nombre: n, antes: previo, resumen: `Reescrita «${n}»` });
      return `Reescrita «${n}».`;
    },
    async mover_nota({ nombre, carpeta }) {
      escribe(); const n = await real(nombre); protegida(n);
      const previo = await antes(n);
      const r = await notas.mover(db, brain, { nombre: n, carpeta, por: POR });
      anotar({ tipo: 'mover', nombre: n, antes: { carpeta: previo?.carpeta ?? '' }, resumen: `«${n}» movida a ${r.folder || 'sin carpeta'}` });
      return `«${n}» ahora está en ${r.folder || 'sin carpeta'}.`;
    },
    async renombrar_nota({ nombre, nuevo }) {
      escribe(); const n = await real(nombre); protegida(n);
      const r = await notas.renombrar(db, brain, { nombre: n, nuevo, reescribir: true, por: POR });
      anotar({ tipo: 'renombrar', nombre: r.name, antes: { nombre: n }, resumen: `«${n}» → «${r.name}»${r.reescritas ? ` (${r.reescritas} notas reescritas)` : ''}` });
      return `Renombrada a «${r.name}» (${r.reescritas} notas con enlaces reescritas).`;
    },
    async borrar_nota({ nombre }) {
      escribe(); if (++cuenta.borrados > TOPES.borrados) throw new HttpError(429, `Tope de ${TOPES.borrados} borrados por mensaje. Confirma con el artista y que lo pida de nuevo.`);
      const n = await real(nombre); protegida(n);
      await notas.tirar(db, brain, { nombre: n, por: POR });
      const t = await una(db, 'select id from notes_trash where brain_id = ? and name = ? order by id desc limit 1', brain.id, n);
      anotar({ tipo: 'borrar', nombre: n, antes: { papeleraId: t?.id ?? null }, resumen: `Borrada «${n}» (en la papelera)` });
      return `«${n}» está en la papelera (se puede restaurar).`;
    },
    async conectar_notas({ origen, destinos, motivo = '' }) {
      escribe(); const o = await real(origen);
      const todos = await indice(db, brain);
      const actual = await una(db, 'select text from notes where brain_id = ? and name = ?', brain.id, o);
      const ya = new Set(enlacesDe(actual.text).map(fold));
      const nuevos = [...new Set((Array.isArray(destinos) ? destinos : []).map((d) => todos.get(fold(String(d)))).filter((d) => d && d !== o && !ya.has(fold(d))))].slice(0, 10);
      if (!nuevos.length) return 'Ya estaban conectadas (o los destinos no existen): no cambié nada.';
      const previo = await antes(o);
      const m = recortar(String(motivo ?? ''), 80);
      await notas.agregar(db, brain, { nombre: o, texto: nuevos.map((d) => `- [[${d}]]${m ? ` — ${m}` : ''}`).join('\n'), seccion: 'Relacionadas', por: POR });
      anotar({ tipo: 'conectar', nombre: o, antes: previo, resumen: `«${o}» conectada con ${nuevos.map((d) => `«${d}»`).join(', ')}` });
      return `«${o}» ahora enlaza a ${nuevos.join(', ')}.`;
    },
    async quitar_enlace({ origen, destino }) {
      escribe(); const o = await real(origen); const d = await real(destino);
      const fila = await una(db, 'select text from notes where brain_id = ? and name = ?', brain.id, o);
      let quitados = 0; const fd = fold(d);
      const nuevo = fila.text.replace(/\[\[([^\]\n|#^]{1,120})(?:[#^][^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/g, (todo, nom, alias) => (fold(nom.trim()) === fd ? (quitados++, alias || nom) : todo));
      if (!quitados) return `«${o}» no enlazaba a «${d}».`;
      const previo = await antes(o);
      await notas.guardar(db, brain, { nombre: o, texto: nuevo, por: POR });
      anotar({ tipo: 'quitar_enlace', nombre: o, antes: previo, resumen: `Quitado el enlace «${o}» → «${d}»` });
      return `Quitado el enlace de «${o}» a «${d}» (${quitados}).`;
    },
    async anadir_regla({ nunca = '', siempre = '' }) {
      escribe();
      const previo = await antes(NOTAS.aprendidas);
      await aceptarRegla(db, brain, { nunca, siempre });
      anotar({ tipo: 'regla', nombre: NOTAS.aprendidas, antes: previo, resumen: `Regla guardada${nunca ? `: NUNCA ${recortar(nunca, 60)}` : ''}${siempre ? ` · SIEMPRE ${recortar(siempre, 60)}` : ''}` });
      return 'Regla guardada en «Reglas aprendidas».';
    },
    async recalcular_menciones({ desde = 0 }) {
      escribe();
      const r = await notas.recalcularMenciones(db, brain, { desde: Math.max(0, Number(desde) || 0), cuantas: 30 });
      if (r.siguiente == null) anotar({ tipo: 'menciones', nombre: '', resumen: `Menciones recalculadas (${r.total} notas)` });
      return `Recalculadas ${r.hechas} notas de ${r.total}. siguiente: ${r.siguiente}`;
    },
  };

  return {
    cambios,
    permite: (nombre) => !soloLectura || SOLO_LECTURA.has(nombre),
    async ejecutar(nombre, entrada) {
      const f = (soloLectura && !SOLO_LECTURA.has(nombre)) ? null : acciones[nombre];
      if (!f) return falla(`No existe la herramienta «${recortar(String(nombre), 40)}».`);
      try { return { texto: recortar(String(await f(entrada && typeof entrada === 'object' ? entrada : {})), 8000) }; }
      catch (e) { if (e instanceof HttpError) return falla(e.message); throw e; }
    },
  };
}

/** El texto completo de una nota nueva: cabecera, título, contenido y «Relacionadas». */
export function notaNueva({ nombre, tipo, texto, enlaces = [] }) {
  const relacionadas = enlaces.length ? `\n\n## Relacionadas\n\n${enlaces.map((e) => `- [[${e}]]`).join('\n')}` : '';
  return `---\ntipo: ${TIPOS.includes(tipo) ? tipo : 'concepto'}\nfuente: chat\n---\n# ${nombre}\n\n${String(texto).trim()}${relacionadas}\n`;
}

/** Los cambios de un mensaje tal como los ve el navegador: sin los textos «antes» (pesan), con si se pueden deshacer. */
export const cambiosPublicos = (cambios = []) => cambios.map((c, i) => ({ i, tipo: c.tipo, nombre: c.nombre, resumen: c.resumen, deshecho: !!c.deshecho,
  deshacible: !c.deshecho && (['crear', 'mover', 'renombrar'].includes(c.tipo) || (c.tipo === 'borrar' && !!c.antes?.papeleraId) || (['ampliar', 'editar', 'conectar', 'quitar_enlace', 'regla'].includes(c.tipo) && typeof c.antes?.texto === 'string')) }));

/** Deshace cambios de un mensaje (los índices dados, o todos), del último al primero. → { deshechos, saltados } */
export async function deshacer(db, brain, chatId, mensajeId, { indices = null } = {}) {
  const m = await una(db, "select m.id, m.meta from chat_messages m join chats c on c.id = m.chat_id where m.id = ? and c.id = ? and c.brain_id = ? and m.role = 'assistant'", Number(mensajeId), String(chatId), brain.id);
  if (!m) throw noEsta('Ese mensaje no existe.');
  const meta = JSON.parse(m.meta || '{}'); const lista = meta.cambios || [];
  const quiero = (Array.isArray(indices) ? indices.map(Number) : lista.map((_, i) => i)).filter((i) => lista[i]).sort((a, b) => b - a);
  const deshechos = [], saltados = [];
  for (const i of quiero) {
    const c = lista[i]; if (c.deshecho) continue;
    try {
      const existe = await una(db, 'select 1 x from notes where brain_id = ? and name = ?', brain.id, c.nombre);
      if (c.tipo === 'crear') { if (!existe) throw noEsta('la nota ya no existe'); await notas.tirar(db, brain, { nombre: c.nombre, por: 'deshacer' }); }
      else if (c.tipo === 'mover') { if (!existe) throw noEsta('la nota ya no existe'); await notas.mover(db, brain, { nombre: c.nombre, carpeta: c.antes?.carpeta ?? '', por: 'deshacer' }); }
      else if (c.tipo === 'renombrar') { if (!existe) throw noEsta('la nota ya no existe'); await notas.renombrar(db, brain, { nombre: c.nombre, nuevo: c.antes.nombre, reescribir: true, por: 'deshacer' }); }
      else if (c.tipo === 'borrar') { if (!c.antes?.papeleraId) throw bad('no se puede restaurar'); await notas.restaurar(db, brain, { id: c.antes.papeleraId, por: 'deshacer' }); }
      else if (['ampliar', 'editar', 'conectar', 'quitar_enlace', 'regla'].includes(c.tipo) && typeof c.antes?.texto === 'string') {
        if (!existe) throw noEsta('la nota ya no existe');
        await notas.guardar(db, brain, { nombre: c.nombre, texto: c.antes.texto, por: 'deshacer' });
      } else throw bad('este cambio no se puede deshacer');
      c.deshecho = true; deshechos.push(i);
    } catch (e) { if (e instanceof HttpError) saltados.push({ i, motivo: e.message }); else throw e; }
  }
  await db.prepare('update chat_messages set meta = ? where id = ?').bind(JSON.stringify(meta), m.id).run();
  return { ok: true, deshechos, saltados, cambios: cambiosPublicos(meta.cambios) };
}
