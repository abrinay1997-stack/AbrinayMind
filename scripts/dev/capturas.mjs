// Abrinay Mind — capturas de pantalla de todas las vistas en varios tamaños, para auditar y comparar antes/después.
//   npm run capturas -- --etiqueta antes            → capturas/antes/<tamaño>/<vista>.png
// Necesita la app local en marcha con el cerebro «demo» importado (ver docs/DISENO_AUDITORIA.md) y Playwright:
//   npm i -D playwright && npx playwright install chromium     (no se sube a Git si no lo guardas en package.json)
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.error('Falta Playwright. Instálalo con:\n  npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const base = (process.env.AM_URL || 'http://127.0.0.1:8787').replace(/\/+$/, ''), pass = process.env.AM_PASS || 'clave-local-123', slug = arg('--cerebro', 'demo');
const etiqueta = arg('--etiqueta', 'actual'), salida = path.resolve(arg('--salida', 'capturas'), etiqueta);
const TAMAÑOS = [['movil-320', 320, 568, true], ['movil-390', 390, 844, true], ['movil-412', 412, 915, true], ['movil-horizontal', 844, 390, true], ['tableta', 820, 1180, true], ['escritorio', 1440, 900, false]];
const solo = arg('--tamanos', ''); const tamaños = solo ? TAMAÑOS.filter((t) => solo.split(',').includes(t[0])) : TAMAÑOS;

const navegador = await chromium.launch();
for (const [nombre, ancho, alto, tactil] of tamaños) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: tactil && ancho < 700, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const dir = path.join(salida, nombre); fs.mkdirSync(dir, { recursive: true });
  const errores = []; p.on('pageerror', (e) => errores.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  const foto = async (v) => { await p.waitForTimeout(500); await p.screenshot({ path: path.join(dir, `${v}.png`) }); };
  await p.goto(base + '/'); await p.waitForSelector('input[type=password]'); await p.waitForTimeout(400); await foto('00-login');
  await p.fill('input[type=password]', pass); await p.click('button[type=submit]'); await p.waitForSelector('.app', { timeout: 15000 });
  const ir = async (hash, espera) => { await p.goto(`${base}/#/${hash}`); if (espera) await p.waitForSelector(espera, { timeout: 15000 }).catch(() => errores.push(`No apareció ${espera} en #/${hash}`)); await p.waitForTimeout(900); };
  await ir(`${slug}/cerebro`, '.graph-wrap canvas'); await p.waitForTimeout(1800); await foto('01-cerebro');
  await p.fill('.g-search input', 'anáfora').catch(() => {}); await p.waitForTimeout(900); await foto('02-cerebro-busqueda'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); await foto('03-cerebro-cajon');
  await ir(`${slug}/notas`, '.notes'); await foto('04-notas-arbol');
  await ir(`${slug}/notas/${encodeURIComponent('Reglas de oro — SIEMPRE')}`, '.editor textarea, .editor .pane'); await foto('05-notas-editor');
  await ir(`${slug}/notas/${encodeURIComponent('Nota larga para probar el scroll')}`, '.editor .pane'); await foto('06-notas-larga');
  await ir(`${slug}/estudio`, '.studio'); await foto('07-estudio');
  // en móvil el constructor es una hoja que se abre con el botón «Constructor»; en escritorio ya está a la vista
  const botonConstructor = await p.$('.chat .top .btn:has-text("Constructor")');
  if (botonConstructor && await botonConstructor.isVisible()) { await botonConstructor.click(); await p.waitForTimeout(500); }
  await foto('08-estudio-constructor');
  await p.fill('.builder input[placeholder^="Ej.: Lo que"]', 'Mapas en el cristal').catch(() => errores.push('No encontré el campo de título del constructor'));
  await p.fill('.builder textarea[placeholder^="De qué trata"]', 'Una noche de lluvia en la ciudad').catch(() => {});
  await p.click('.builder button:has-text("Escribir letra")').catch(() => errores.push('No pude pulsar «Escribir letra»'));
  await p.waitForSelector('.msg.bot .lyric:not(.idea)', { timeout: 25000 }).then(async () => { await p.waitForTimeout(2500); await foto('09-estudio-letra'); }).catch(() => errores.push('No llegó la letra: ¿está en marcha scripts/dev/llm-simulado.mjs y .dev.vars apunta a él?'));
  await ir(`${slug}/canciones`, '.page'); await foto('10-canciones');
  if (await p.$('.song')) { await p.click('.song'); await p.waitForSelector('.modal .lyric', { timeout: 8000 }).catch(() => {}); await foto('11-cancion-detalle'); }
  await ir(`${slug}/conexiones`, '.kpis'); await foto('12-conexiones');
  await ir('ajustes', '.setrow'); await foto('13-ajustes');
  fs.writeFileSync(path.join(dir, 'errores.txt'), errores.join('\n') || 'sin errores de consola');
  console.log(`✔ ${nombre} (${ancho}×${alto}) → ${path.relative(process.cwd(), dir)}${errores.length ? `  ⚠ ${errores.length} aviso(s): ver errores.txt` : ''}`);
  await ctx.close();
}
await navegador.close();
