// Abrinay Mind — prepara la base D1 en el despliegue: la busca por nombre, la crea si no existe y escribe su id en wrangler.jsonc
// (solo en la copia de trabajo del workflow; el repositorio conserva el marcador, así sirve para cualquier cuenta de Cloudflare).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const NOMBRE = 'abrinay-mind-db';
export const MARCADOR = 'REEMPLAZAR_CON_EL_ID_DE_D1';

/** Pone `id` como database_id de la base `nombre` dentro del texto de wrangler.jsonc. */
export function conId(texto, id, nombre = NOMBRE) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`El id de D1 no parece un UUID: ${id}`);
  const re = new RegExp(`("database_name"\\s*:\\s*"${nombre}"\\s*,\\s*"database_id"\\s*:\\s*")[^"]*(")`);
  if (!re.test(texto)) throw new Error(`No encontré la base «${nombre}» con su database_id en wrangler.jsonc.`);
  return texto.replace(re, `$1${id}$2`);
}

/** Busca el id en la salida JSON de `wrangler d1 list --json`. */
export function idDe(listado, nombre = NOMBRE) {
  const fila = (Array.isArray(listado) ? listado : []).find((d) => d.name === nombre);
  return fila ? fila.uuid || fila.id || null : null;
}

const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const listar = () => { const s = wrangler('d1', 'list', '--json'); return JSON.parse(s.slice(s.indexOf('['))); };

if (import.meta.url === `file://${process.argv[1]}`) {
  let id = idDe(listar());
  if (!id) { console.log(`Creando la base D1 «${NOMBRE}»…`); wrangler('d1', 'create', NOMBRE); id = idDe(listar()); }
  if (!id) throw new Error('No pude obtener el id de la base D1.');
  fs.writeFileSync('wrangler.jsonc', conId(fs.readFileSync('wrangler.jsonc', 'utf8'), id));
  console.log(`Base D1 «${NOMBRE}» lista (${id.slice(0, 8)}…).`);
}
