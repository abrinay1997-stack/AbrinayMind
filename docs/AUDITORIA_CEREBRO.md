# Auditoría del cerebro: por qué a veces no responde, y cómo mejorar la lectura y el razonamiento

Fecha: 31 oct 2026. Alcance: el camino completo de un mensaje del Estudio (constructor y chat): navegador → Worker → búsqueda y lectura → modelo → respuesta en vivo → guardado. **Solo informe y mediciones; no se ha cambiado código de la aplicación.**

Las mediciones se reproducen con `node scripts/dev/medir-cerebro.mjs` (bóveda inventada de 364 notas y vectores de 1024 números; sin red ni llaves). Son cifras de Node: sirven como orden de magnitud y para comparar antes y después, no como las de Cloudflare.

## Resumen

**«A veces responde y a veces no» tiene cuatro causas combinadas**, de la más a la menos probable:

1. **CPU del Worker.** Cada mensaje gasta del orden de 50 a 70 ms de CPU, y el plan gratuito de Cloudflare da ~10 ms. Casi todo es una sola función lenta (decodificar los vectores del significado: ~25–30 ms) con arreglo trivial (13 veces más rápida). *Solo es la causa si el Worker está en plan gratuito: hay que confirmarlo.*
2. **Cortes silenciosos.** Si la conexión con el modelo se corta a mitad, o la respuesta topa con el límite de 4096 tokens, el servidor lo da por bueno: guarda el texto parcial como si fuera completo y no avisa. Se ve como «respondió a medias» o «no terminó».
3. **Cero reintentos y cero límites de espera.** Un 429/529 («saturado») del proveedor, frecuente, termina en error al primer intento; un proveedor colgado deja el spinner para siempre.
4. **El cliente interpreta mal un corte de red.** En el móvil (pantalla que se apaga, cambio de wifi a datos) borra lo recibido y devuelve el texto a la caja, como si el servidor lo hubiera rechazado.

**La lectura y el razonamiento flojos tienen causas distintas y medibles:**

5. **El cerebro no recuerda lo que leyó entre mensajes**: busca solo con el último mensaje. «Hazla más corta» → leyó **0 notas** (el turno anterior, 39).
6. **Elige mal el modo por coincidencia de letras**, no de palabras: «ex» se activa con «exp**ex**…» y «tirar» con «re**tirar**», y con una sola coincidencia ya no pregunta: escribe en el modo equivocado.
7. **Lee poco y lee la cabeza de las notas**, no el pasaje que casó; la búsqueda por significado deja pasar casi toda la bóveda (ya causó el fallo de las 100 consultas).
8. **No hay espacio de razonamiento**: el prompt pide decidir la idea central pero prohíbe explicar antes de la letra, y no hay pensamiento extendido ni revisión contra las reglas.

## Cómo viaja un mensaje (y dónde se rompe)

```
navegador ──POST──▶ Worker
                     1. lee ajustes, resuelve el modo               ← L2
                     2. armarContexto: grafo + búsqueda (palabras + significado) + activación + presupuesto   ← R1, L1, L3, L4, L5
                     3. guarda el mensaje del artista
                     4. llama al modelo en streaming (waitUntil)    ← R3, R4, R6, R7, Z1
                     5. reenvía cada trozo al navegador, y lo parsea para guardarlo   ← R1
                     6. guarda la respuesta + uso                   ← R2
navegador ◀──SSE── am_context · trozos · am_done / am_error         ← R5
```

## Hallazgos de fiabilidad

| # | Prior. | Hallazgo | Evidencia | Arreglo propuesto |
|---|---|---|---|---|
| R1 | P0 | **CPU por mensaje muy por encima de 10 ms.** `buscarSimilares` decodifica 364 vectores con `Uint8Array.from(atob(b), c => c.charCodeAt(0))` (372 mil llamadas a una función por consulta). `lectorDeEventos` parsea cada trozo con `JSON.parse`. | Medido: `armarContexto` 38–51 ms (de ellos `buscarSimilares` 25–32 ms); `lectorDeEventos` 11–14 ms por 28 mil caracteres. La decodificación con un bucle simple: **24,3 → 1,8 ms** (mismo resultado, probado). | Decodificación con bucle (−23 ms); guardar los vectores ya decodificados en memoria del isolate (clave: cerebro + fecha); aligerar el parseo del streaming (solo se necesita el texto y el uso). Meta: <15 ms por mensaje. Confirmar el plan de Cloudflare: si es gratuito, valorar el plan de pago (30 s de CPU) como seguro. |
| R2 | P0 | **Un corte a mitad se guarda como respuesta completa.** | Simulado: corte sin `message_stop` → el servidor emite `am_done` y guarda 31 caracteres como respuesta final. | Detectar `message_stop` y `stop_reason`; si falta, marcar la respuesta `incompleta`, avisar y ofrecer «Continuar». |
| R3 | P0 | **Límite fijo de 4096 tokens, sin aviso.** Tres versiones + notas técnicas pueden pasarse. `stop_reason` no se guarda ni se muestra. | Simulado: `max_tokens` → respuesta guardada sin marca; la interfaz no tiene dónde mostrarlo. | Tokens según versiones (≈1800 + 1500 por versión); guardar `parada`; aviso «se cortó por longitud» + «Continuar». |
| R4 | P1 | **Sin reintentos** ante 429, 500/502/503 y 529 (saturado), que el proveedor devuelve a menudo en horas punta. | Simulado: 529 → una sola petición y error al artista. | Hasta 2 reintentos con espera creciente y respetando `retry-after`, solo antes de empezar a emitir texto. |
| R5 | P1 | **El cliente trata un corte de red a mitad como «rechazado antes de empezar».** Quita la burbuja del artista y la parcial, y devuelve el texto a la caja, aunque el servidor ya guardó el mensaje: al reenviar se duplica. | Lectura del código (`estudio.js`, `enviar`) y de `api.js` (`flujo`): cualquier excepción de `lector.read()` cae en la misma rama. | Distinguir «no empezó» de «se interrumpió»: conservar lo recibido, recargar el hilo, mostrar «Se interrumpió» con «Reintentar». |
| R6 | P1 | **Sin tiempos límite** hacia el modelo ni en el navegador: un proveedor colgado deja el spinner indefinido. | Lectura del código: no hay `AbortSignal` hacia el proveedor ni vigilancia de inactividad. | Primer byte ≤ 30 s e inactividad ≤ 45 s; mensaje claro y reintento. |
| R7 | P1 | **Si el cliente se desconecta, se cancela al modelo** y se pierde lo que habría llegado. En el móvil ocurre al bloquear la pantalla. | `bombear`: al fallar `w.write` hace `upstream.cancel()` y guarda lo parcial. | Dejar que el modelo termine dentro del margen de `waitUntil` y guardar la respuesta completa para verla al volver. |
| R8 | P2 | **Los 500 son opacos.** El navegador solo ve «Algo falló en el servidor»; no hay identificador para cruzar con los registros. | `app.js`: mensaje fijo, `console.error` sin id. | Cabecera `x-request-id`, registro estructurado y el id en el mensaje («código ab12»). |
| R9 | P2 | **Sin idempotencia:** reenviar tras un error crea otro mensaje del artista. | Consecuencia de R5. | Id de envío generado en el navegador; el servidor ignora un id repetido. |

## Hallazgos de lectura

| # | Prior. | Hallazgo | Evidencia | Arreglo propuesto |
|---|---|---|---|---|
| L1 | P0 | **Sin memoria entre turnos.** La consulta es solo el último mensaje y lo leído antes no se vuelve a adjuntar. | Medido: turno 1 (encargo) leyó 39 notas; «hazla más corta y más directa» leyó **0**. (Banco sintético: en una bóveda real una frase así trae ruido o nada.) | Consulta = mensaje + encargo original + títulos de lo leído; notas «pegajosas» del hilo (las leídas en el último turno, guardadas en `meta.leidas`) con energía base. |
| L2 | P0 | **Detección de modo por trozos de letras y con una sola coincidencia.** | Medido: «una experiencia en el exterior» → modo con la palabra `ex`; «retirar la mano» → modo con `tirar`; ambos con confianza 0,5, que basta para no preguntar. | Coincidir por palabra completa (con su raíz); exigir 2 aciertos o una palabra larga/exacta; en el constructor, si no está claro, preguntar en la interfaz (botones de modos) antes de gastar la llamada. |
| L3 | P1 | **La búsqueda por significado deja pasar casi toda la bóveda.** Umbral 0,3 y normalización `s/0,75`: los vectores de textos no relacionados suelen quedar en torno a 0,3–0,5, así que casi toda nota recibe un puntaje de base. | Código (`search.js`, `meaning.js`). Fue lo que superó las 100 consultas. *Hipótesis a calibrar con tus vectores reales, no verificable aquí.* | Restar la mediana (o z-score), quedarse con las 60 mejores, y un diagnóstico («¿por qué leyó esto?») con puntajes para calibrar. |
| L4 | P1 | **Las notas «fuertes» se leen por la cabeza**: 3.200 caracteres iniciales, no el pasaje que casó; las fijas se recortan a 6.000 sin avisar. | `public/core/context.js` (`MAX_COMPLETA`, `MAX_FIJA`, `recortar`). | Pasajes relevantes + cabecera; avisar en la interfaz cuando una fija se recorta. |
| L5 | P1 | **Presupuesto de lectura conservador**: normal = 30.000 caracteres (≈7.500 tokens), profunda = 60.000. | Medido: 33 notas ≈ 40.000 caracteres con las fijas; en tu captura, 10.108 tokens de entrada. El modelo admite mucho más. | Normal 60.000 / profunda 150.000 con coste estimado visible; el prefijo estable queda en caché. |
| L6 | P2 | **Solo la parte fija usa caché.** El bloque recuperado cambia cada turno, aunque modo y ancladas no. | `chat.js`: `cache: true` solo en el primer bloque. | Tres bloques: fijas (caché) · modo+ancladas (caché) · recuperado (sin caché). |
| L7 | P2 | **El historial manda 16 mensajes enteros**, incluidas letras largas anteriores: encarecen y el modelo tiende a copiar borradores previos. | `HISTORIAL = 16`. | Conservar íntegra la última letra; las anteriores, en resumen. |

## Hallazgos de razonamiento

| # | Prior. | Hallazgo | Propuesta |
|---|---|---|---|
| Z1 | P1 | **No hay espacio para pensar.** El prompt pide «decidir la idea central en una línea» pero prohíbe explicar antes de la letra; no se usa pensamiento extendido. | Pensamiento extendido solo para letras (3–4 mil tokens, no se muestra). Coste estimado: unos centavos por letra con Sonnet; **no probado contra tu llave real**: se activa con un interruptor en Ajustes, apagado por defecto. |
| Z2 | P1 | **Nadie revisa la letra contra las reglas.** Existe la tarea «Criticar», pero es manual. | Botón «Pulir con mis reglas»: una pasada barata (Haiku) que contrasta la letra con las reglas NUNCA/SIEMPRE y devuelve cambios concretos. |
| Z3 | P2 | **Misma temperatura para todo.** | Más baja en chat y crítica (más estable), la del modelo en letras. (El pensamiento extendido exige la temperatura por defecto.) |
| Z4 | P2 | **Los ejemplos de estilo dependen de la suerte de la búsqueda.** | Que las letras aprobadas con mejor puntuación puedan entrar como ejemplos de estilo (respetando «no copiar letras de otros artistas»). |

## Plan por PR (de mayor a menor impacto por riesgo)

| PR | Contenido | Riesgo | Cambia coste/comportamiento |
|---|---|---|---|
| A | **Fiabilidad del servidor**: R1 (decodificación y caché de vectores, parseo ligero), R2, R3, R4, R6, R7, R8, con pruebas de fallos simulados | Bajo | Solo mejora; tokens por versión sube un poco el gasto en letras largas |
| B | **Cliente**: R5, R9, aviso y botón «Continuar»/«Reintentar» | Bajo | No |
| C | **Lectura**: L1, L2, L4 (+ constructor que pregunta el modo en pantalla) | Medio | Cambia qué notas entran y cuándo se pregunta el modo |
| D | **Calibrar el significado**: L3 + herramienta de diagnóstico; calibrar con tus vectores reales | Medio | Cambia la mezcla de resultados |
| E | **Presupuesto y caché**: L5, L6, L7 | Bajo | Sube el gasto por mensaje (a medir), baja con caché |
| F | **Razonamiento**: Z1, Z2, Z3, Z4 con interruptores en Ajustes | Medio | Sube el gasto por letra si se activa |

## Preguntas abiertas

1. **¿El Worker está en plan gratuito o de pago?** En Cloudflare: *Workers & Pages → abrinay-mind → Metrics* (CPU time p99 y errores «Exceeded CPU/resource limits») y *Logs* (línea `[abrinay-mind]`). Si es gratuito, R1 pasa a ser la prioridad absoluta.
2. ¿Aceptas subir el presupuesto de lectura por defecto (L5) y ver el coste estimado antes de enviar?
3. ¿Activamos el pensamiento extendido por defecto o lo dejamos como interruptor apagado?
4. En el constructor, ¿prefieres que **pregunte el modo en pantalla** (con botones) cuando no esté claro, o que elija el más probable y lo diga?

## Qué no se pudo verificar

- Los vectores y la distribución real de similitudes de tu bóveda (Workers AI no está disponible en local).
- El comportamiento exacto del proveedor real ante saturación, y el soporte de pensamiento extendido con tus modelos y tu llave.
- Los registros y métricas de Cloudflare.
