// Abrinay Mind — una bóveda de DEMOSTRACIÓN con datos inventados, para desarrollar y probar la interfaz sin la bóveda real.
// Tiene la forma de un cerebro de verdad (lóbulos, modos, reglas «siempre», una nota privada, enlaces rotos, huérfanas, notas muy largas…)
// para que el grafo, el árbol de notas y el Estudio se vean como en producción. Todo el texto es inventado.
//
//   node scripts/dev/boveda-demo.mjs [--salida vault-out/demo.vault.json] [--notas 220]
import fs from 'node:fs';
import path from 'node:path';

const FORMATO = 'abrinay-mind/boveda@1';
const BASE_FECHA = Date.UTC(2026, 0, 5, 12);

/** Generador pseudoaleatorio con semilla: la misma bóveda siempre. */
function azar(semilla = 7) {
  let a = semilla >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, pick: (xs) => xs[Math.floor(r() * xs.length)], n: (a2, b) => a2 + Math.floor(r() * (b - a2 + 1)), mezclar: (xs) => xs.map((x) => [r(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]) };
}

const SUSTANTIVOS = ['la lluvia', 'el espejo', 'una ciudad dormida', 'el humo', 'mi sombra', 'la ventana', 'el tren de las seis', 'un mapa viejo', 'la marea', 'el eco', 'una promesa', 'el reloj parado', 'la azotea', 'el neón', 'una carta sin destino'];
const VERBOS = ['dibuja', 'repite', 'esconde', 'cuenta', 'guarda', 'rompe', 'cruza', 'persigue', 'apaga', 'enciende'];
const COMPLEMENTOS = ['lo que nadie dijo', 'mapas en el cristal', 'una deuda con el silencio', 'la hora exacta del miedo', 'un nombre que ya no uso', 'el ruido de la gente', 'cada paso que di', 'una canción a medias', 'la distancia entre los dos'];
const TECNICAS = ['Anáfora', 'Rima interna', 'Aliteración', 'Enumeración caótica', 'Contraste', 'Cierre abierto', 'Estribillo corto', 'Metáfora sostenida', 'Pausa y respiración', 'Rima asonante', 'Cambio de idioma', 'Imagen cotidiana', 'Verso largo', 'Pregunta sin respuesta', 'Cuenta atrás'];
const TEMAS = ['La noche larga', 'Volver a casa', 'El ruido de la ciudad', 'Cartas sin enviar', 'Lo que dejé atrás', 'Madrugada', 'Dinero y tiempo', 'El espejo', 'Distancia', 'Promesas rotas'];

export function construirDemo({ notas: objetivo = 220, semilla = 7 } = {}) {
  const A = azar(semilla);
  const N = new Map(); // nombre → { carpeta, texto }
  const poner = (nombre, carpeta, texto) => { if (!N.has(nombre)) N.set(nombre, { nombre, carpeta, texto }); return nombre; };
  const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
  const frase = () => `${A.pick(SUSTANTIVOS)} ${A.pick(VERBOS)} ${A.pick(COMPLEMENTOS)}`;
  const parrafo = (n = 3) => Array.from({ length: n }, () => `${frase()[0].toUpperCase()}${frase().slice(1)}, y aun así ${frase()}.`).join(' ');
  const hijos = new Map(); // MOC → [nombres]
  const bajoMoc = (moc, nombre) => { if (!hijos.has(moc)) hijos.set(moc, []); hijos.get(moc).push(nombre); };

  // ---- 00-Meta
  const MOCS = { '00-Meta': 'MOC — Meta', '10-Identidad': 'MOC — Identidad', '20-Estilo': 'MOC — Estilo', '30-Modos': 'MOC — Modos', '40-Canciones': 'MOC — Canciones', '50-Referentes': 'MOC — Referentes', '60-Técnicas': 'MOC — Técnicas', '70-Aprendizaje': 'MOC — Aprendizaje', '80-Producción': 'MOC — Producción', '90-Proyectos': 'MOC — Proyectos' };
  poner('Reglas de oro — SIEMPRE', '00-Meta', `${fm({ tipo: 'regla', siempre: true })}# Reglas de oro — SIEMPRE\n\n1. Empezar cada letra con una imagen concreta, no con una idea abstracta.\n2. Dejar el cierre abierto: la última línea no explica nada.\n3. Repetir la idea central como un mantra, cambiando solo una palabra cada vez.\n4. Escribir como se habla: frases cortas, sin adornos que no diría en voz alta.\n\nVer [[Reglas de oro — NUNCA]] y [[MOC — Meta]].`);
  poner('Reglas de oro — NUNCA', '00-Meta', `${fm({ tipo: 'regla', siempre: true })}# Reglas de oro — NUNCA\n\n1. Nunca explicar una metáfora en el verso siguiente.\n2. Nunca usar frases hechas de moda ni palabras de relleno para completar una rima.\n3. Nunca empezar dos versos seguidos con la misma palabra sin que sea una [[Anáfora]] deliberada.\n\nVer [[Reglas de oro — SIEMPRE]] y [[MOC — Meta]].`);
  poner('Reglas aprendidas', '00-Meta', `${fm({ tipo: 'regla', siempre: true })}# Reglas aprendidas\n\nLo que el cerebro aprendió de los veredictos.\n\n## Reglas\n\n- *(demo)* 🔴 NUNCA: cerrar el coro con una moraleja. 🟢 SIEMPRE: cerrar con una imagen.\n\nVer [[Bitácora de errores]].`);
  poner('Cómo escribe este cerebro', '00-Meta', `${fm({ tipo: 'protocolo', siempre: true })}# Cómo escribe este cerebro\n\n1. Leer las reglas de oro y lo aprendido.\n2. Si no se sabe el modo, preguntarlo.\n3. Decidir la idea central en una línea.\n4. Escribir con la estructura del modo.\n5. Entregar con notas técnicas.\n\nVolver al [[MOC — Meta]].`);
  poner('Bitácora de errores', '00-Meta', `${fm({ tipo: 'bitacora' })}# Bitácora de errores\n\n## Entradas\n\n- [[Error 1 — Letra demo (3 de 10)]]\n`);
  poner('Puntuaciones reales', '00-Meta', `${fm({ tipo: 'aprendizaje' })}# Puntuaciones reales\n\n| Canción | Nota |\n|---|---|\n| [[Mapas en el cristal]] | 8/10 |\n| [[Hora exacta]] | 7/10 |\n| [[Cartas sin destino]] | 9/10 |\n\n## Nuevas puntuaciones\n\n`);
  poner('Contexto rápido del agente', '00-Meta', `${fm({ tipo: 'referencia' })}# Contexto rápido del agente\n\n${parrafo(2)}\n\n- Tono: directo, íntimo.\n- Idioma: español.\n- Estructura: intro, dos versos, coro, puente, outro.`);

  // ---- 10-Identidad
  poner('Perfil — Artista Demo', '10-Identidad', `${fm({ tipo: 'identidad', siempre: true })}# Perfil — Artista Demo\n\nCompositor de una ciudad inventada. ${parrafo(2)}\n\n## Obsesiones\n\n- [[Tema — Madrugada]]\n- [[Tema — Distancia]]\n- [[Tema — El espejo]]\n\nVolver al [[MOC — Identidad]].`);
  for (const n of ['Origen', 'Voz y registro', 'Sueño artístico', 'Palabras propias', 'Palabras que no usa', 'Cómo trabaja', 'Rutina de escritura', 'Miedos creativos', 'Lo que busca decir']) poner(`Identidad — ${n}`, '10-Identidad', `${fm({ tipo: 'identidad' })}# Identidad — ${n}\n\n${parrafo(A.n(2, 4))}\n\n> ${frase()}.\n\nVer [[Perfil — Artista Demo]].`);
  for (const n of ['Infancia', 'Primeras canciones', 'Qué escucha', 'Qué evita']) poner(`Entrevista — ${n}`, '10-Identidad/Entrevista', `${fm({ tipo: 'entrevista' })}# Entrevista — ${n}\n\n**Pregunta:** ¿${frase()}?\n\n**Respuesta:** ${parrafo(2)}\n\nVer [[Perfil — Artista Demo]].`);

  // ---- 20-Estilo
  const ESTILO = { Rima: ['Rima en cadena', 'Rima asonante', 'Rima interna', 'Rima partida'], Métrica: ['Versos de ocho', 'Versos largos', 'Respiración cada cuatro'], Recursos: TECNICAS.slice(0, 6).map((t) => `Recurso — ${t}`), Vocabulario: ['Campo de la noche', 'Campo del dinero', 'Campo del cuerpo', 'Campo de la ciudad'], Temas: TEMAS.map((t) => `Tema — ${t}`) };
  for (const [sub, lista] of Object.entries(ESTILO)) for (const n of lista) poner(n, `20-Estilo/${sub}`, `${fm({ tipo: 'estilo' })}# ${n}\n\n${parrafo(A.n(2, 4))}\n\n## Ejemplo\n\n> ${frase()}.\n> ${frase()}.\n\nRelacionada con [[${A.pick(TECNICAS)}]].`);

  // ---- 30-Modos
  const MODOS = [['Modo 1 — Íntimo', 'Íntimo-Reflexivo', 'intimo, reflexion, noche, memoria, confesion'], ['Modo 2 — Directo', 'Directo-Callejero', 'calle, directo, barrio, reto, dinero'], ['Modo 3 — Romántico', 'Romántico-Vulnerable', 'amor, extraño, ex, corazon, dolor'], ['Modo 4 — Festivo', 'Festivo-Comercial', 'fiesta, pegajoso, baile, verano, single']];
  MODOS.forEach(([nota, nombre, palabras], i) => poner(nota, '30-Modos', `${fm({ tipo: 'modo', modo_id: nombre.split('-')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), modo_nombre: nombre, orden: i + 1, palabras })}# ${nota}\n\n${parrafo(3)}\n\n## Estructura\n\n- Intro de 4 versos\n- Dos versos de 16\n- Coro de 6 líneas\n- Cierre abierto\n\nUsa [[${A.pick(TECNICAS)}]] y [[${A.pick(TECNICAS)}]].`));
  for (const [nota] of MODOS) poner(`${nota} — Ejemplos`, '30-Modos', `${fm({ tipo: 'modo-ejemplo' })}# ${nota} — Ejemplos\n\n${parrafo(2)}\n\nVolver a [[${nota}]].`);

  // ---- 40-Canciones (con letras inventadas)
  const letra = (modoNota) => {
    const verso = (k) => Array.from({ length: k }, () => frase()[0].toUpperCase() + frase().slice(1)).join('\n');
    return `## Letra\n\n[INTRO]\n${verso(2)}\n\n[VERSO 1]\n${verso(4)}\n\n[CORO]\n${verso(3)}\n\n[VERSO 2]\n${verso(4)}\n\n[OUTRO]\n${verso(1)}\n\n## Notas técnicas\n\nUsa [[${A.pick(TECNICAS)}]]. Modo: [[${modoNota}]].`;
  };
  const CANCIONES = [['Mapas en el cristal', 'Originales'], ['Hora exacta', 'Originales'], ['Cartas sin destino', 'Originales'], ['Neón y humo', 'Originales'], ['Azotea a las seis', 'Generadas'], ['Eco de nadie', 'Generadas'], ['La deuda del silencio', 'Generadas'], ['Lo que nadie dijo', 'Coescritas'], ['Marea baja', 'Coescritas']];
  for (const [t, sub] of CANCIONES) { const m = A.pick(MODOS)[0]; poner(t, `40-Canciones/${sub}`, `${fm({ tipo: 'cancion', modo: `[[${m}]]`, estado: sub === 'Generadas' ? 'aprobada' : 'original', ...(sub === 'Generadas' ? { puntuacion: A.n(6, 9) } : {}) })}# ${t}\n\n${letra(m)}`); }
  poner('Letra que nunca se publicó, con un nombre largo para probar cortes en pantalla', '40-Canciones/Versiones', `${fm({ tipo: 'cancion', privado: true })}# Título larguísimo\n\nNota privada de demostración: nunca se envía a modelos que entrenan.\n\n${letra('Modo 1 — Íntimo')}`);

  // ---- 50-Referentes (solo análisis, sin letras)
  const REFS = ['Referente Alfa', 'Referente Beta', 'Referente Gamma', 'Referente Delta'];
  for (const r of REFS) {
    poner(r, '50-Referentes', `${fm({ tipo: 'referente', alias: r })}# ${r}\n\n${parrafo(3)}\n\n## Qué aporta\n\n- ${A.pick(TECNICAS)}\n- ${A.pick(TECNICAS)}\n\nVolver al [[MOC — Referentes]].`);
    const k = A.n(9, 14);
    for (let i = 1; i <= k; i++) poner(`${r} — Tema ${String(i).padStart(2, '0')}`, `50-Referentes/${r}`, `${fm({ tipo: 'referente-cancion', artista: r })}# ${r} — Tema ${String(i).padStart(2, '0')}\n\n| Medida | Valor |\n|---|---|\n| Versos | ${A.n(24, 80)} |\n| Sílabas por verso (mediana) | ${A.n(8, 14)} |\n| Rima | ${A.pick(['asonante', 'consonante', 'mixta'])} |\n\nTécnica dominante: [[${A.pick(TECNICAS)}]]. Pertenece a [[${r}]].`);
  }

  // ---- 60-Técnicas
  for (const t of TECNICAS) poner(t, '60-Técnicas/Conceptos', `${fm({ tipo: 'tecnica', alias: t.toLowerCase() })}# ${t}\n\n${parrafo(3)}\n\n\`\`\`\nEjemplo de patrón: ${frase()} / ${frase()} / ${frase()}\n\`\`\`\n\nSe nota en [[${A.pick(CANCIONES)[0]}]].`);
  for (let i = 1; i <= 8; i++) poner(`Regla técnica ${i}`, '60-Técnicas/Reglas', `${fm({ tipo: 'regla-tecnica' })}# Regla técnica ${i}\n\n${frase()[0].toUpperCase()}${frase().slice(1)}.\n\nAplica a [[${A.pick(TECNICAS)}]].`);

  // ---- 70, 80, 90
  poner('Error 1 — Letra demo (3 de 10)', '70-Aprendizaje/Errores', `${fm({ tipo: 'error', puntuacion: 3 })}# Error 1 — Letra demo (3 de 10)\n\n**Qué falló:** explicaba la metáfora.\n\n> 🔴 NUNCA: explicar la imagen. 🟢 SIEMPRE: dejarla respirar.\n\nBitácora: [[Bitácora de errores]].`);
  for (const n of ['Evolución del estilo', 'Frases que sí funcionaron', 'Formulario de rechazo', 'Revisión en lote', 'Proceso de escritura', 'Qué aprendimos de los primeros diez']) poner(n, '70-Aprendizaje', `${fm({ tipo: 'aprendizaje' })}# ${n}\n\n${parrafo(3)}\n\n- ${frase()}\n- ${frase()}\n- ${frase()}`);
  for (const n of ['Beats que le funcionan', 'Voz y grabación', 'Mezcla de referencia', 'Colaboradores', 'Equipo y software', 'Flujo de producción']) poner(n, '80-Producción', `${fm({ tipo: 'produccion' })}# ${n}\n\n${parrafo(2)}`);
  ['EP de invierno', 'Colaboración pendiente'].forEach((n, i) => poner(n, '90-Proyectos', `${fm({ tipo: 'proyecto', revisar: '2026-03-01' })}# ${n}\n\n${parrafo(2)}${i === 0 ? '\n\nPendiente: [[Una nota que aún no existe]].' : ''}`));

  // ---- para probar pantallas: nota larguísima, enlace roto, tabla grande y huérfanas
  poner('Nota larga para probar el scroll', '90-Proyectos', `${fm({ tipo: 'proyecto' })}# Nota larga para probar el scroll\n\n${Array.from({ length: 14 }, (_, i) => `## Apartado ${i + 1}\n\n${parrafo(5)}\n\n- ${frase()}\n- ${frase()}\n- ${frase()}\n`).join('\n')}\n\nEnlace roto a propósito: [[Nota inexistente de demostración]].`);
  for (const n of ['Huérfana uno', 'Huérfana dos', 'Huérfana tres']) poner(n, '90-Proyectos', `# ${n}\n\nUna nota sin ningún enlace para probar la salud del cerebro. ${parrafo(1)}`);

  // ---- relleno hasta el objetivo con notas de ideas sueltas
  let k = 1;
  while (N.size < objetivo) { const tema = A.pick(TEMAS); poner(`Idea ${String(k).padStart(3, '0')} — ${tema}`, '20-Estilo/Temas', `${fm({ tipo: 'idea' })}# Idea ${String(k).padStart(3, '0')} — ${tema}\n\n${parrafo(2)}\n\nSe parece a [[${A.pick(TECNICAS)}]] y a [[Tema — ${tema}]].`); k++; }

  // ---- los índices (MOC) y el enlace de cada nota a su lóbulo
  const mocDe = (carpeta) => MOCS[carpeta.split('/')[0]];
  for (const n of [...N.values()]) { const moc = mocDe(n.carpeta); if (moc && !/^MOC — /.test(n.nombre) && n.nombre !== 'Nota larga para probar el scroll' && !/^Huérfana/.test(n.nombre)) { bajoMoc(moc, n.nombre); if (!n.texto.includes(`[[${moc}]]`)) n.texto += `\n\nParte de [[${moc}]].`; } }
  for (const [carpeta, moc] of Object.entries(MOCS)) {
    const lista = (hijos.get(moc) || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
    poner(moc, carpeta, `${fm({ tipo: 'moc' })}# ${moc}\n\nÍndice del lóbulo **${carpeta}**.\n\n${lista.map((x) => `- [[${x}]]`).join('\n')}\n`);
  }
  return {
    formato: FORMATO,
    cerebro: { slug: 'demo', nombre: 'Artista Demo', subtitulo: 'Cerebro de demostración (datos inventados)', color: '#22d3ee' },
    creado: new Date(BASE_FECHA).toISOString(),
    notas: [...N.values()].sort((a, b) => a.carpeta.localeCompare(b.carpeta) || a.nombre.localeCompare(b.nombre)).map((n, i) => ({ nombre: n.nombre, carpeta: n.carpeta, texto: n.texto, actualizado: BASE_FECHA + i * 60_000 })),
    sinapsis: [], pesos: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const salida = path.resolve(arg('--salida', 'vault-out/demo.vault.json'));
  const b = construirDemo({ notas: Number(arg('--notas', 220)) });
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(b));
  console.log(`✔ ${b.notas.length} notas de demostración → ${path.relative(process.cwd(), salida)}\n  Impórtala en la app con «+ → Importar bóveda» o con: npm run demo:importar`);
}
