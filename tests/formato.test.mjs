import test from 'node:test';
import assert from 'node:assert/strict';
import { parsear } from '../public/js/lyric.js';
import { etiquetaSuno, letraParaSuno, textoLimpio, estiloSuno, limpiarLinea } from '../public/js/formato.js';

// una letra INVENTADA para las pruebas
const TEXTO = `Idea central: el reloj que no avanza

[INTRO]
Un reloj sin manecillas

[VERSO 1]
La **lluvia** dibuja un mapa en la ventana
Cada gota es una calle sin nombre

(se repite la última)

[PRE-CORO]
Y aun así sigo

[CORO]
Que el reloj responda, que el reloj responda
Que [[Nota inventada]] guarde la hora

[PUENTE (susurrado)]
Nadie me espera

[OUTRO]
Se apaga la ciudad

## Notas técnicas
Rima: -ada. Notas que pesaron: Nota inventada`;

test('las etiquetas en español pasan a las que entiende Suno, con su número y su descriptor', () => {
  assert.equal(etiquetaSuno('INTRO'), '[Intro]');
  assert.equal(etiquetaSuno('VERSO 2'), '[Verse 2]');
  assert.equal(etiquetaSuno('Pre-Coro'), '[Pre-Chorus]');
  assert.equal(etiquetaSuno('CORO'), '[Chorus]');
  assert.equal(etiquetaSuno('Estribillo'), '[Chorus]');
  assert.equal(etiquetaSuno('Coro 2'), '[Chorus]');
  assert.equal(etiquetaSuno('PUENTE (susurrado)'), '[Bridge: susurrado]');
  assert.equal(etiquetaSuno('Verso 1 - rap'), '[Verse 1: rap]');
  assert.equal(etiquetaSuno('Cierre'), '[Outro]');
  assert.equal(etiquetaSuno('Sección rara'), '[Sección rara]');
});

test('letra para Suno: solo la letra, con etiquetas y sin Markdown, idea central ni notas técnicas', () => {
  const v = parsear(TEXTO).versiones[0];
  const s = letraParaSuno(v);
  assert.equal(s, `[Intro]
Un reloj sin manecillas

[Verse 1]
La lluvia dibuja un mapa en la ventana
Cada gota es una calle sin nombre

(se repite la última)

[Pre-Chorus]
Y aun así sigo

[Chorus]
Que el reloj responda, que el reloj responda
Que Nota inventada guarde la hora

[Bridge: susurrado]
Nadie me espera

[Outro]
Se apaga la ciudad`);
  assert.ok(!/Notas t[ée]cnicas|Idea central|\*\*|\[\[/.test(s));
  assert.match(letraParaSuno(v, { etiquetasSuno: false }), /^\[INTRO\]\nUn reloj/);
});

test('texto limpio: título, secciones con su nombre, sin Markdown ni notas', () => {
  const v = parsear(TEXTO).versiones[0];
  const t = textoLimpio(v, { titulo: 'El reloj' });
  assert.ok(t.startsWith('El reloj\n\n[INTRO]\nUn reloj sin manecillas\n\n[VERSO 1]'));
  assert.ok(!/\*\*|\[\[|Notas t[ée]cnicas/.test(t));
  assert.match(textoLimpio(v, { conIdea: true }), /^Idea central: el reloj que no avanza\n\n\[INTRO\]/);
});

test('varias versiones: cada una sale por separado', () => {
  const p = parsear('## VERSIÓN A\n[CORO]\nuno\n\n## VERSIÓN B\n[CORO]\ndos');
  assert.equal(p.versiones.length, 2);
  assert.equal(letraParaSuno(p.versiones[0]), '[Chorus]\nuno');
  assert.equal(letraParaSuno(p.versiones[1]), '[Chorus]\ndos');
});

test('estilo para Suno: género, mood y BPM, sin inventar nada', () => {
  assert.equal(estiloSuno({ genero: 'Rap introspectivo', mood: 'oscuro, honesto', bpm: '90' }), 'Rap introspectivo, oscuro, honesto, 90 BPM');
  assert.equal(estiloSuno({ genero: '  Pop  ', bpm: 'x' }), 'Pop');
  assert.equal(estiloSuno({}), '');
  assert.equal(estiloSuno(), '');
});

test('limpiar una línea: énfasis, enlaces con alias y citas', () => {
  assert.equal(limpiarLinea('**fuerte** y _suave_ y `código`  '), 'fuerte y suave y código');
  assert.equal(limpiarLinea('ve a [[Nota#Parte|el alias]] ya'), 've a el alias ya');
  assert.equal(limpiarLinea('> cita'), 'cita');
});

test('una respuesta sin letra no produce nada que copiar', () => {
  const v = parsear('Solo una conversación, sin secciones.').versiones[0];
  assert.equal(letraParaSuno(v), ''); assert.equal(textoLimpio(v), '');
});
