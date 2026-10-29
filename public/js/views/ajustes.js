// Abrinay Mind — Ajustes: qué llaves tiene el Worker, qué modelo hace cada tarea, si se permiten modelos que entrenan con tus datos y cuánto llevas gastado.
import { h, poner, vaciar, icono, aviso, fallo, confirmar, num, usd } from '../ui.js';
import { PUT } from '../api.js';
import { S, modelos, bus } from '../store.js';

const PROF = { ligera: ['Ligera', '≈14 mil caracteres leídos: rápido y barato'], normal: ['Normal', '≈30 mil: el equilibrio'], profunda: ['Profunda', '≈60 mil: lee más notas, cuesta más'] };

export async function montar(el) {
  const raiz = h('div.page');
  poner(el, h('div.scroll', raiz));
  let m;
  async function cargar() { m = await modelos(true); pintarTodo(); }

  async function guardar(parcial, { revertir } = {}) {
    const a = m.ajustes, nuevo = { funciones: { ...a.funciones }, entrena: a.entrena, profundidad: a.profundidad, tope_mensual_usd: a.tope_mensual_usd, ...parcial };
    try { await PUT('/api/settings', nuevo); await cargar(); aviso('Guardado.', 'good', 1400); bus.dispatchEvent(new Event('gasto')); }
    catch (e) { fallo(e); revertir?.(); await cargar(); }
  }

  const opcionesDeModelo = (valor, defectoId) => {
    const pri = [h('option', { value: '', selected: valor === '' }, `Por defecto · ${m.catalogo.find((x) => x.id === defectoId)?.nombre || defectoId}`)];
    for (const p of m.proveedores) {
      const g = h('optgroup', { label: p.nombre + (p.configurada ? '' : ' — falta la llave') });
      for (const c of m.catalogo.filter((x) => x.proveedor === p.id)) g.append(h('option', { value: c.id, selected: valor === c.id, disabled: !p.configurada || (c.entrena && !m.ajustes.entrena) }, `${c.nombre}${c.entrena ? ' · entrena' : ''} — US$${c.in} / ${c.out} por millón`));
      pri.push(g);
    }
    return pri;
  };

  function pintarTodo() {
    const a = m.ajustes, g = m.gasto;
    poner(raiz, h('h1', 'Ajustes'), h('p.lead', 'Los secretos viven en Cloudflare, no aquí. Aquí eliges qué modelo hace cada trabajo y cuánto estás dispuesto a gastar.'),
      h('div.stack', { style: { gap: '16px' } },
        tarjetaLlaves(), tarjetaFunciones(a), tarjetaEntrena(a), tarjetaProfundidad(a), tarjetaGasto(a, g)));
  }

  function tarjetaLlaves() {
    const fila = (nombre, secreto, ok, ayuda) => h('div.keyrow', h('div', h('b', { style: { fontWeight: 600 } }, nombre), ayuda ? h('div.faint', { style: { fontSize: '12.5px' } }, ayuda) : null), h('div.row', h('code', secreto), h('span.tag' + (ok ? '.good' : '.warn'), ok ? 'configurada' : 'falta')));
    return h('section.card', h('h2', 'Llaves y accesos'), h('p.sub', 'Se guardan como secretos del Worker (Cloudflare → Workers → abrinay-mind → Settings → Variables and Secrets). Nunca viajan a esta pantalla.'),
      fila('Acceso a la app', 'APP_PASSWORD · SESSION_SECRET', m.acceso.configurado, 'Contraseña y firma de la sesión.'),
      ...m.proveedores.map((p) => fila(p.nombre, p.llave + (p.id === 'meta' ? ' (o MODEL_API_KEY)' : ''), p.configurada, p.id === 'anthropic' ? 'Claude: escribe las letras finales.' : 'Muse Spark: borradores baratos y exploración.')),
      fila('Significado (Workers AI)', 'binding AI', m.significado.disponible, `Modelo ${m.significado.modelo}. No necesita llave.`));
  }

  function tarjetaFunciones(a) {
    return h('section.card', h('h2', 'Qué modelo hace cada tarea'), h('p.sub', 'Un modelo potente para las letras y uno barato para lo mecánico ahorra mucho sin perder calidad donde importa.'),
      ...m.funciones.map((f) => {
        const sel = h('select', { 'aria-label': f.nombre, onchange: () => guardar({ funciones: { ...a.funciones, [f.id]: sel.value } }, { revertir: () => { sel.value = a.funciones[f.id] || ''; } }) }, opcionesDeModelo(a.funciones[f.id] || '', f.defecto));
        sel.value = a.funciones[f.id] || '';
        return h('div.setrow', h('div.t', h('b', f.nombre), h('small', f.ayuda)), sel);
      }));
  }

  function tarjetaEntrena(a) {
    const interruptor = h('button.switch', { role: 'switch', 'aria-checked': a.entrena ? 'true' : 'false', 'aria-label': 'Permitir modelos que entrenan con mis datos', onclick: async () => {
      if (!a.entrena) {
        if (!(await confirmar({ titulo: 'Permitir modelos que entrenan', texto: 'Muse Spark «Contributor» cuesta una fracción del precio porque Meta usa tus prompts y las respuestas para entrenar sus modelos. Eso incluye las notas del cerebro que se envíen como contexto y las letras que genere. Las notas marcadas «privado: true» nunca se envían a estos modelos. ¿Lo permites?', ok: 'Sí, permitirlo', peligro: true }))) return;
        guardar({ entrena: true });
      } else {
        // al apagarlo, cualquier tarea que lo usara vuelve a su modelo por defecto
        const funciones = Object.fromEntries(Object.entries(a.funciones).filter(([, id]) => !m.catalogo.find((c) => c.id === id)?.entrena));
        guardar({ entrena: false, funciones });
      }
    } });
    return h('section.card', h('div.setrow', { style: { padding: 0, border: 0 } }, h('div.t', h('h2', 'Permitir modelos que entrenan con mis datos'), h('p.sub', { style: { margin: 0 } }, 'Apagado por defecto. Con esto activo puedes elegir Muse Spark · Contributor para borradores baratos. Las notas «privado: true» nunca les llegan.')), interruptor),
      a.entrena ? h('p', { style: { color: 'var(--warn)', margin: '12px 0 0', fontSize: '13px' } }, 'Activo: Meta puede entrenar con lo que envíes a los modelos «Contributor». Úsalos para ideas y borradores, no para material que quieras mantener inédito.') : null);
  }

  function tarjetaProfundidad(a) {
    return h('section.card', h('h2', 'Profundidad de lectura'), h('p.sub', 'Cuánta memoria recupera el cerebro (además de las notas fijas) antes de cada respuesta. Más profundidad = letras más informadas y más tokens.'),
      h('div.filters', { style: { marginBottom: '6px' } }, Object.entries(PROF).map(([id, [t]]) => h('button', { 'aria-pressed': a.profundidad === id ? 'true' : 'false', onclick: () => guardar({ profundidad: id }) }, t))), h('p.faint', { style: { margin: 0, fontSize: '12.5px' } }, PROF[a.profundidad][1]));
  }

  function tarjetaGasto(a, g) {
    const tope = a.tope_mensual_usd, pct = tope ? Math.min(100, Math.round(100 * g.mes.usd / tope)) : 0;
    const campo = h('input', { type: 'number', min: 0, step: '1', placeholder: 'Sin tope', value: tope ?? '', style: { width: '140px' }, 'aria-label': 'Tope mensual en dólares' });
    return h('section.card', h('h2', 'Gasto en modelos'), h('p.sub', 'Cada llamada queda anotada con lo que informa el proveedor. Los precios de Muse son de fuentes secundarias: contrástalos con tu factura.'),
      h('div.kpis', h('div.kpi', h('b', usd(g.mes.usd)), h('span', 'este mes')), h('div.kpi', h('b', num(g.mes.llamadas)), h('span', 'llamadas'))),
      tope ? h('div', { style: { marginBottom: '14px' } }, h('div.progress', h('i', { style: { width: pct + '%', background: pct >= 90 ? 'var(--bad)' : undefined } })), h('small.muted', `${pct}% del tope de US$${tope}`)) : null,
      g.porModelo.length ? g.porModelo.map((x) => h('div.list-row', h('div.grow', h('b', x.model), h('small', `${num(x.llamadas)} llamadas · ${num(x.tin)} → ${num(x.tout)} tokens`)), h('span.score', usd(x.usd)))) : h('p.faint', 'Aún no hay gasto este mes.'),
      h('div.row.wrap', { style: { marginTop: '16px' } }, h('div.field', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, h('label', 'Tope mensual (US$)'), campo),
        h('button.btn.small', { onclick: () => { const v = campo.value.trim(); guardar({ tope_mensual_usd: v === '' ? null : Number(v) }); } }, 'Guardar tope'), h('span.faint', { style: { fontSize: '12.5px' } }, 'Al llegar al tope, el cerebro deja de llamar a los modelos hasta el mes siguiente o hasta que lo subas.')));
  }

  try { await cargar(); } catch (e) { poner(raiz, h('div.empty', h('b', 'No pude cargar los ajustes'), h('span', e.message))); }
  return {};
}
