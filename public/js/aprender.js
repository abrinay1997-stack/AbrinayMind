// Abrinay Mind — «enseñar al cerebro»: después de corregir una letra, muestra lo que cambió, propone reglas generales y guarda las que el artista acepta.
import { h, poner, dialogo, aviso, fallo, icono } from './ui.js';
import { api, invalidarGrafo, recargarMeta } from './store.js';
import { cambiosDeLetra, resumenDeCambios } from '/core/diferencias.js';

const tarjetaCambio = (c) => h('div.cambio', c.seccion ? h('span.tag', c.seccion) : null,
  h('div.antes', h('span.sr', 'Antes: '), c.antes.length ? c.antes.map((l) => h('div', l)) : h('em', 'sin esa línea')),
  h('div.despues', h('span.sr', 'Después: '), c.despues.length ? c.despues.map((l) => h('div', l)) : h('em', 'la quitaste')));

/**
 * antes/despues: el texto de la letra antes y después de corregir · titulo y modo (nombre de la nota del modo) son contexto.
 * Primero se ve lo que cambió; si el artista quiere, el cerebro propone reglas, las revisa y se guardan.
 */
export function ofrecerAprender({ antes, despues, titulo = '', modo = '' }) {
  const cambios = cambiosDeLetra(antes, despues);
  if (!cambios.length) { aviso('Guardada. No cambiaste líneas de la letra, así que no hay nada que enseñar.', '', 4500); return; }
  dialogo({ titulo: 'Esto fue lo que cambiaste', sub: `${resumenDeCambios(cambios)}. ¿Quieres que el cerebro aprenda de esto para escribirte mejor la próxima vez?`, ancho: true,
    cuerpo: h('div.stack', { style: { gap: '10px' } }, cambios.slice(0, 20).map(tarjetaCambio), cambios.length > 20 ? h('p.faint', `…y ${cambios.length - 20} cambios más.`) : null),
    acciones: [{ texto: 'Ahora no', tipo: 'ghost' }, { texto: 'Enseñar al cerebro', tipo: 'primary', onclick: () => { proponer({ antes, despues, titulo, modo }); } }] });
}

async function proponer(datos) {
  const espera = aviso('El cerebro está pensando qué aprender de tus cambios…', '', 12000);
  let r;
  try { r = await api().post('learn/propose', datos); } catch (e) { espera.remove(); return fallo(e); }
  espera.remove();
  revisar(datos, r.propuestas);
}

function revisar(datos, propuestas) {
  const filas = [];
  const fila = (p = {}) => {
    const nunca = h('textarea', { rows: 2, value: p.nunca || '', placeholder: 'NUNCA… (lo que el cerebro no debe volver a hacer)', 'aria-label': 'Regla: nunca' });
    const siempre = h('textarea', { rows: 2, value: p.siempre || '', placeholder: 'SIEMPRE… (lo que debe hacer en su lugar)', 'aria-label': 'Regla: siempre' });
    const usar = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Guardar esta regla' });
    const caja = h('div.regla', h('label.row', { style: { gap: '10px', cursor: 'pointer' } }, usar, h('b', 'Guardar esta regla')),
      h('div.field', h('span.label', '🔴 NUNCA'), nunca), h('div.field', h('span.label', '🟢 SIEMPRE'), siempre));
    const reg = { usar, nunca, siempre, caja }; filas.push(reg); return reg;
  };
  const lista = h('div.stack', { style: { gap: '12px' } });
  const nuevas = (propuestas && propuestas.length ? propuestas : [{}]).map(fila);
  lista.append(...nuevas.map((x) => x.caja));
  const ejemplo = h('input', { type: 'checkbox', checked: true });
  dialogo({ titulo: 'Lo que entendió el cerebro', ancho: true,
    sub: propuestas && propuestas.length ? 'Revisa y corrige las reglas: si la aceptas, el cerebro la lee siempre antes de escribir.' : 'No pude proponer reglas automáticas (¿sin saldo o sin llave?). Puedes escribir una tú.',
    cuerpo: h('div.stack', { style: { gap: '14px' } }, lista,
      h('button.btn.small', { type: 'button', onclick: () => lista.append(fila().caja) }, icono('plus'), 'Añadir otra regla'),
      h('label.row', { style: { gap: '10px', cursor: 'pointer', alignItems: 'flex-start' } }, ejemplo, h('span', 'Guardar mis cambios como ejemplos de mi estilo ', h('small.muted', '(quedan en «Correcciones del artista», una nota privada que el cerebro puede leer cuando escribas algo parecido)')))),
    acciones: [{ texto: 'Cancelar', tipo: 'ghost' }, { texto: 'Guardar lo aprendido', tipo: 'primary', onclick: async () => {
      const reglas = filas.filter((f) => f.usar.checked && (f.nunca.value.trim() || f.siempre.value.trim())).map((f) => ({ nunca: f.nunca.value, siempre: f.siempre.value }));
      if (!reglas.length && !ejemplo.checked) { aviso('Marca al menos una regla o los ejemplos para guardar.', 'bad'); return false; }
      const r = await api().post('learn/apply', { reglas, ...(ejemplo.checked ? { ejemplo: { antes: datos.antes, despues: datos.despues, titulo: datos.titulo, modo: datos.modo } } : {}) });
      invalidarGrafo(); recargarMeta();
      const partes = [r.reglas ? `${r.reglas} ${r.reglas === 1 ? 'regla' : 'reglas'}` : '', r.ejemplo ? 'tus cambios como ejemplo' : ''].filter(Boolean);
      aviso(`El cerebro aprendió: ${partes.join(' y ') || 'nada nuevo'}.`, 'good', 6000);
    } }] });
}
