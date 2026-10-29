import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conId, idDe, MARCADOR } from '../scripts/ci/d1.mjs';
import { armar } from '../scripts/ci/secretos.mjs';

const UUID = '6d60640b-5f98-4d82-87fc-3bb4ec69d36a';

test('el id de D1 se escribe en wrangler.jsonc real y deja todo lo demás igual', () => {
  const texto = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.ok(texto.includes(MARCADOR), 'el repositorio conserva el marcador');
  const nuevo = conId(texto, UUID);
  assert.ok(nuevo.includes(`"database_id": "${UUID}"`));
  assert.equal(nuevo.replace(UUID, MARCADOR), texto);
  assert.throws(() => conId(texto, 'no-es-uuid'));
  assert.throws(() => conId('{}', UUID));
});

test('se encuentra la base por nombre en el listado de wrangler', () => {
  assert.equal(idDe([{ name: 'otra', uuid: 'x' }, { name: 'abrinay-mind-db', uuid: UUID }]), UUID);
  assert.equal(idDe([{ name: 'otra', uuid: 'x' }]), null);
  assert.equal(idDe(null), null);
});

test('solo se suben los secretos que tienen valor, y la firma exige 16 letras', () => {
  assert.deepEqual(armar({ APP_PASSWORD: ' clave ', ANTHROPIC_API_KEY: '', OTRA: 'x' }), { APP_PASSWORD: 'clave' });
  assert.deepEqual(armar({}), {});
  assert.throws(() => armar({ SESSION_SECRET: 'corta' }), /16/);
});
