// Abrinay Mind — sube un archivo de bóveda a una instancia LOCAL desde la terminal (lo mismo que «Importar bóveda» en la app).
//   node scripts/dev/importar.mjs [archivo=vault-out/demo.vault.json]      AM_URL=http://127.0.0.1:8787  AM_PASS=<APP_PASSWORD de .dev.vars>
import fs from 'node:fs';

const base = (process.env.AM_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
if (!/^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.)/.test(base)) { console.error('Por seguridad este script solo habla con una instancia local. Usa la app para importar en producción.'); process.exit(2); }
const archivo = process.argv[2] || 'vault-out/demo.vault.json';
const b = JSON.parse(fs.readFileSync(archivo, 'utf8'));
let galleta = '';
async function api(metodo, ruta, cuerpo) {
  const r = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json', 'x-am': '1', ...(galleta ? { cookie: galleta } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) galleta = sc.split(';')[0];
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${t.slice(0, 200)}`);
  return d;
}
await api('POST', '/api/login', { password: process.env.AM_PASS || 'clave-local-123' });
await api('POST', '/api/brains/import', { cerebro: b.cerebro, reemplazar: true });
const slug = b.cerebro.slug;
for (let i = 0; i < b.notas.length; i += 8) await api('POST', `/api/b/${slug}/import/notas`, { notas: b.notas.slice(i, i + 8) });
for (let d = 0; ;) { const r = await api('POST', `/api/b/${slug}/menciones`, { desde: d, cuantas: 30 }); if (r.siguiente == null) break; d = r.siguiente; }
console.log(`✔ «${b.cerebro.nombre}»: ${b.notas.length} notas importadas en ${base} → abre ${base}/#/${slug}/cerebro`);
