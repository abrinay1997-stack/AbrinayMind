// Abrinay Mind — un «Anthropic» de mentira para desarrollar la interfaz sin llaves ni gasto.
// Responde en streaming (SSE) con una letra inventada, pregunta el modo si el encargo viene «INCIERTO», y contesta JSON a las tareas de reglas y enlaces.
//   node scripts/dev/llm-simulado.mjs            (escucha en http://127.0.0.1:8799)
// y en .dev.vars:  ANTHROPIC_BASE_URL=http://127.0.0.1:8799   ANTHROPIC_API_KEY=cualquier-cosa
import http from 'node:http';

const PUERTO = Number(process.env.PUERTO || 8799);
const LETRA = (tema) => `Idea central: ${tema || 'la ciudad dormida'}: lo que vuelve es el eco.

[INTRO]
La lluvia dibuja mapas en el cristal
Y yo sigo el trazo sin saber a dónde va

[VERSO 1]
Cuento las luces del barrio una por una
Cada ventana guarda una historia a medias
Llevo en el bolsillo una carta sin destino
Y el reloj del andén se quedó en la misma hora

[CORO]
Que el eco responda lo que yo no sé decir
Que la noche guarde lo que no supe pedir
Que el eco responda, que el eco responda

[VERSO 2]
Cruzo la azotea cuando todo se apaga
El neón me presta un color que no es mío
No explico la imagen, la dejo respirar
Y cierro sin cerrar

[OUTRO]
El tren de las seis pasa y no me subo.

## Notas técnicas
Rima: asonante en -a / -o. Recursos: anáfora en el coro, imagen cotidiana, cierre abierto. Idea central: el eco. Referencias: ninguna.
Notas que pesaron: Reglas de oro — SIEMPRE, Anáfora, Cierre abierto`;

const RESPUESTAS = {
  regla: '{"nunca":"explicar la metáfora en el verso siguiente","siempre":"dejar que la imagen hable sola"}',
  conectar: '{"conexiones":[]}',
  incierto: '¿Qué modo quieres para esta canción: Íntimo, Directo, Romántico o Festivo?',
  charla: 'Te propongo abrir con una imagen concreta (la lluvia en el cristal) y cerrar sin resolver, como pide tu regla de cierre abierto. ¿Probamos con el modo Íntimo?',
};

http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', async () => {
    let j = {}; try { j = JSON.parse(cuerpo || '{}'); } catch { /* sin cuerpo */ }
    const sistema = JSON.stringify(j.system || ''), ultimo = String(j.messages?.at(-1)?.content || '');
    let texto = LETRA(/Tema o situación: (.*)/.exec(ultimo)?.[1]);
    if (sistema.includes('editor de la memoria')) texto = RESPUESTAS.regla;
    else if (sistema.includes('Conectas notas')) texto = RESPUESTAS.conectar;
    else if (/INCIERTO/.test(ultimo)) texto = RESPUESTAS.incierto;
    else if (!/ENCARGO DE LETRA/.test(ultimo)) texto = RESPUESTAS.charla;
    const uso = { input_tokens: 5200, output_tokens: 380, cache_read_input_tokens: 0 };
    if (!j.stream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ model: j.model, content: [{ type: 'text', text: texto }], usage: uso, stop_reason: 'end_turn' })); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: uso.input_tokens, output_tokens: 1, cache_creation_input_tokens: 0 } } })}\n\n`);
    for (const t of texto.match(/[\s\S]{1,14}/g)) { res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })}\n\n`); await new Promise((r) => setTimeout(r, 18)); }
    res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: uso.output_tokens } })}\n\n`);
    res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  });
}).listen(PUERTO, '127.0.0.1', () => console.log(`Proveedor simulado en http://127.0.0.1:${PUERTO} (no gasta nada)`));
