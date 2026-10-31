// Abrinay Mind — «Enseñar» desde el chat: lo que el artista explica (conceptos, ideas, estructuras, métricas, temas, reglas) se convierte en
// notas propuestas que revisa, edita y acepta. El cerebro propone; nada se guarda hasta aceptar.
import { h, poner, dialogo, aviso, fallo, icono } from './ui.js';
import { api, invalidarGrafo, recargarMeta } from './store.js';

const TIPOS = [['concepto', 'Concepto'], ['idea', 'Idea'], ['estructura', 'Estructura'], ['metrica', 'Métrica'], ['tecnica', 'Técnica'], ['tema', 'Tema'], ['recurso', 'Recurso'], ['referencia', 'Referencia']];

/** texto: lo que escribió el artista · chatId: si no hay texto, se usa el final de esa conversación · alGuardar: se llama cuando algo quedó guardado. */
export async function ensenarAlCerebro({ texto = '', chatId = null, alGuardar = null } = {}) {
  if (!texto.trim() && !chatId) { aviso('Escribe lo que quieres enseñarle al cerebro (un concepto, una estructura, una métrica, una regla…) y pulsa «Enseñar».', '', 5500); return; }
  const espera = aviso('El cerebro está pensando cómo guardarlo y con qué conectarlo…', '', 20000);
  let r;
  try { r = await api().post('learn/knowledge/propose', { texto, chatId }); } catch (e) { espera.remove(); return fallo(e); }
  espera.remove();
  revisar(r, alGuardar, texto.trim());
}

function revisar(r, alGuardar, escrito = '') {
  const nombresExistentes = r.existentes || [];
  const tarjetas = [];
  const tarjeta = (p) => {
    const usar = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Guardar esta propuesta' });
    let leer; let cuerpo;
    if (p.accion === 'regla') {
      const nunca = h('textarea', { rows: 2, value: p.nunca || '', 'aria-label': 'Regla: nunca', placeholder: 'NUNCA…' }), siempre = h('textarea', { rows: 2, value: p.siempre || '', 'aria-label': 'Regla: siempre', placeholder: 'SIEMPRE…' });
      cuerpo = [h('div.field', h('span.label', '🔴 NUNCA'), nunca), h('div.field', h('span.label', '🟢 SIEMPRE'), siempre)];
      leer = () => ({ accion: 'regla', nunca: nunca.value, siempre: siempre.value });
    } else if (p.accion === 'ampliar') {
      const t = h('textarea', { rows: 5, value: p.texto || '', 'aria-label': `Texto que se añade a ${p.nombre}` });
      cuerpo = [h('div.field', h('span.label', 'Se añade al final de la nota'), t)];
      leer = () => ({ accion: 'ampliar', nombre: p.nombre, texto: t.value });
    } else {
      const nombre = h('input', { type: 'text', value: p.nombre || '', 'aria-label': 'Nombre de la nota' });
      const carpeta = h('input', { type: 'text', value: p.carpeta || '', placeholder: 'Carpeta (opcional)', 'aria-label': 'Carpeta' });
      const tipo = h('select', { 'aria-label': 'Tipo' }, TIPOS.map(([v, t]) => h('option', { value: v, selected: v === p.tipo }, t)));
      const t = h('textarea', { rows: 6, value: p.texto || '', 'aria-label': 'Contenido de la nota' });
      cuerpo = [h('div.row.wrap', { style: { gap: '8px' } }, h('div.field.grow', h('span.label', 'Nombre'), nombre), h('div.field', h('span.label', 'Tipo'), tipo)), h('div.field', h('span.label', 'Carpeta'), carpeta), h('div.field', h('span.label', 'Contenido'), t),
        p.enlaces?.length ? h('div.row.wrap', { style: { gap: '6px' } }, h('span.faint', 'Se conecta con:'), p.enlaces.map((e) => h('span.tag.accent', e))) : null];
      leer = () => ({ accion: 'crear', nombre: nombre.value, carpeta: carpeta.value, tipo: tipo.value, texto: t.value, enlaces: p.enlaces || [] });
    }
    const titulo = p.accion === 'regla' ? 'Regla de escritura' : p.accion === 'ampliar' ? `Ampliar «${p.nombre}»` : 'Nota nueva';
    const caja = h('div.regla', h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, usar, h('b', titulo)), p.motivo ? h('small.muted', p.motivo) : null, ...cuerpo);
    tarjetas.push({ usar, leer, caja }); return caja;
  };
  const lista = h('div.stack', { style: { gap: '12px' } });
  const base = r.propuestas && r.propuestas.length ? r.propuestas : [{ accion: 'crear', tipo: 'concepto', nombre: '', texto: escrito, enlaces: [] }];
  lista.append(...base.map(tarjeta));
  dialogo({ titulo: 'Lo que el cerebro propone guardar', ancho: true,
    sub: r.propuestas && r.propuestas.length ? 'Revisa y edita: nada se guarda hasta que aceptes. Desmarca lo que no quieras.' : 'No pude proponer nada automáticamente (¿sin saldo o sin llave?). Puedes escribir la nota tú.',
    cuerpo: h('div.stack', { style: { gap: '14px' } }, lista,
      h('div.row.wrap', { style: { gap: '8px' } },
        h('button.btn.small', { type: 'button', onclick: () => lista.append(tarjeta({ accion: 'crear', tipo: 'concepto', nombre: '', texto: '', enlaces: [] })) }, icono('plus'), 'Otra nota'),
        h('button.btn.small', { type: 'button', onclick: () => lista.append(tarjeta({ accion: 'regla' })) }, icono('plus'), 'Una regla')),
      nombresExistentes.length ? h('details', h('summary.faint', `Notas parecidas que ya existen (${nombresExistentes.length})`), h('p.faint', nombresExistentes.map((n) => n.nombre).join(' · '))) : null),
    acciones: [{ texto: 'Cancelar', tipo: 'ghost' }, { texto: 'Guardar en el cerebro', tipo: 'primary', onclick: async () => {
      const propuestas = tarjetas.filter((t) => t.usar.checked).map((t) => t.leer()).filter((p) => (p.accion === 'regla' ? (p.nunca.trim() || p.siempre.trim()) : p.texto.trim() && (p.accion === 'ampliar' || p.nombre.trim())));
      if (!propuestas.length) { aviso('Marca al menos una propuesta con contenido.', 'bad'); return false; }
      const x = await api().post('learn/knowledge/apply', { propuestas });
      invalidarGrafo(); recargarMeta();
      const partes = [x.creadas.length ? `${x.creadas.length} ${x.creadas.length === 1 ? 'nota nueva' : 'notas nuevas'}` : '', x.ampliadas.length ? `${x.ampliadas.length} ${x.ampliadas.length === 1 ? 'nota ampliada' : 'notas ampliadas'}` : '', x.reglas ? `${x.reglas} ${x.reglas === 1 ? 'regla' : 'reglas'}` : ''].filter(Boolean);
      aviso(partes.length ? `Guardado en el cerebro: ${partes.join(', ')}.` : 'No se guardó nada.', partes.length ? 'good' : 'bad', 6000);
      if (x.saltadas?.length) aviso(`No se pudo guardar: ${x.saltadas.map((s) => `«${s.nombre}» (${s.motivo})`).join('; ')}`, 'bad', 9000);
      if (partes.length) alGuardar?.();
    } }] });
}
