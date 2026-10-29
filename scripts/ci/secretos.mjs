// Abrinay Mind — arma el JSON de secretos del Worker a partir de los secretos de GitHub (solo los que tengan valor).
// Los nombres son los que lee el Worker; si un secreto ya está en Cloudflare y aquí está vacío, se deja como está.
import fs from 'node:fs';

export const NOMBRES = ['APP_PASSWORD', 'SESSION_SECRET', 'ANTHROPIC_API_KEY', 'META_API_KEY'];

export function armar(env) {
  const out = {};
  for (const n of NOMBRES) if (String(env[n] ?? '').trim()) out[n] = String(env[n]).trim();
  if (out.SESSION_SECRET && out.SESSION_SECRET.length < 16) throw new Error('SESSION_SECRET debe tener al menos 16 caracteres.');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = armar(process.env), destino = process.argv[2];
  if (!destino) throw new Error('Uso: node scripts/ci/secretos.mjs <archivo.json>');
  fs.writeFileSync(destino, JSON.stringify(s), { mode: 0o600 });
  console.log(Object.keys(s).length ? `Se subirán ${Object.keys(s).length} secreto(s): ${Object.keys(s).join(', ')}.` : 'No hay secretos en GitHub para subir (se conservan los que ya estén en Cloudflare).');
}
