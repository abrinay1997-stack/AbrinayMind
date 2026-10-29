import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const leer = (f) => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

test('wrangler.local.jsonc (desarrollo sin cuenta de Cloudflare) no se desincroniza de wrangler.jsonc', () => {
  const prod = leer('wrangler.jsonc'), local = leer('wrangler.local.jsonc');
  for (const k of ['name', 'main', 'compatibility_date', 'compatibility_flags', 'assets', 'd1_databases']) assert.deepEqual(local[k], prod[k], `«${k}» debe ser igual en los dos`);
  assert.equal(local.ai, undefined, 'el binding de IA obliga a iniciar sesión en Cloudflare: no va en la config local');
  assert.equal(local.triggers, undefined);
  assert.ok(prod.ai && prod.triggers, 'producción sí lleva IA y cron');
});

test('los scripts de npm que tocan producción no se usan en desarrollo', () => {
  const s = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  assert.match(s.dev, /wrangler\.local\.jsonc/); assert.match(s['migrate:local'], /wrangler\.local\.jsonc/);
  assert.match(s.migrate, /--remote/);
});
