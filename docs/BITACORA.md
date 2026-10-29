# Bitácora — rediseño móvil y sistema de diseño (29 oct 2026)

Qué se hizo, qué problemas salieron por el camino y cómo se resolvieron. Sirve para no repetirlos. El informe de la auditoría que dio origen al trabajo está en [`DISENO_AUDITORIA.md`](DISENO_AUDITORIA.md).

## Resumen

Se rediseñó la interfaz con prioridad móvil en 8 fases: tokens y contraste, armazón móvil, Cerebro, Notas, Estudio, Canciones/Conexiones/Ajustes, accesibilidad y pulido. Todo llegó a `main` y se desplegó. Después aparecieron dos fallos en producción (uno de servidor que ya existía, otro causado por el rediseño); ambos están corregidos.

| Qué | Dónde |
|---|---|
| Auditoría (Fase 0) | PR 2 y `docs/DISENO_AUDITORIA.md` |
| Rediseño (fases 1 a 8) | PR 3 a 10, fusionados de golpe a través del PR 10 (estaban apilados) |
| Arreglo del Estudio (límite de D1) | PR 11 |
| Arreglo del Cerebro con vista Lista guardada | PR 12 |

## Problemas y cómo se resolvieron

### Los que se encontraron en la auditoría (ya corregidos en el rediseño)

| Problema | Causa | Solución |
|---|---|---|
| Texto blanco ilegible sobre colores de acento claros (cian, verde, amarillo…) | `#fff` fijo en botones, interruptores y puntuación | `public/js/color.js` calcula para cualquier color el texto sobre el relleno, el texto de acento y los trazos con contraste AA; con pruebas |
| Botón «Escribir letra» de 24 px de alto en móvil | Los hijos de la columna flex del constructor se encogían | `.builder > * { flex: none }` |
| Dos botones gigantes en «Añadir un cerebro» (escritorio) y en el selector de cerebros | Los iconos SVG de los diálogos no tenían tamaño y se estiraban | Regla base de tamaño para `svg` sin atributo `width` |
| iOS hacía zoom al enfocar campos | Inputs de 14.5 px | 16 px en móvil/táctil |
| `--faint` ilegible (2.99:1) | Gris demasiado oscuro | Paleta grafito con todos los textos ≥ 4.5:1 |
| Un cambio de pestaña justo al entrar se perdía | `enrutar()` descartaba un `hashchange` si ya había una navegación en curso | Se recuerda y se atiende al terminar |

### Los que aparecieron durante el trabajo

1. **Un comentario `//` rompió el grafo (error mío, detectado antes de publicar).** Al editar una línea que contenía varias sentencias, el comentario se comió el resto de la línea en `graph3d.js` y daba `SyntaxError`. Lo detectó el recorrido con consola antes de abrir el PR 8. *Lección:* en líneas compactas usar `/* … */`, y pasar `node --check` a todos los archivos antes de subir.
2. **Pruebas contra CSP.** La CSP bloquea scripts inline, así que axe no se podía inyectar. Solo en el navegador de pruebas se usó `bypassCSP`; la CSP de producción no se tocó.
3. **Playwright con versión distinta a los navegadores instalados.** Se enlazó la instalación global en lugar de reinstalar.

### Los dos fallos en producción tras desplegar

**A. «Algo falló en el servidor» al escribir en el Estudio (error 500).**
- *Causa:* con «Significado» activo, la búsqueda traía todas las notas parecidas y pedía sus datos a D1 en una sola consulta con un valor por nota. **D1 admite como máximo 100 valores por consulta**; con ~364 notas se superaba. La base simulada local (`node:sqlite`) no tiene ese límite, por eso no se vio. No lo causó el rediseño: el servidor no cambió en esa serie.
- *Cómo se diagnosticó:* se reprodujo el envío del Estudio en local (funcionaba), se revisó qué hace el servidor antes de empezar a responder y que solo ocurre en producción, y se encontró el patrón `name in (?, ?, …)` sin límite.
- *Solución (PR 11):* `notasPorNombre()` en `src/db.js` consulta por lotes de 80 (usado en `search.js`, `context.js` y `connect.js`). La D1 simulada de las pruebas ahora **rechaza más de 100 valores**, y hay una prueba con 140 notas parecidas que falla sin el arreglo y pasa con él.
- *Pendiente de confirmar a ciencia cierta:* no se tuvo acceso a los registros de Cloudflare; la causa se dio por buena porque tras el arreglo el chat respondió correctamente en producción.

**B. «No pude abrir esta sección — Cannot access 'cajon' before initialization» en Cerebro (error mío).**
- *Causa:* la vista Lista (nueva) se recuerda en el navegador. Al recargar con «Lista» guardada, `aplicarVista()` cerraba el cajón de la nota antes de que su variable estuviera declarada (más abajo en el archivo). En las pruebas siempre se cambiaba a Lista *después* de cargar.
- *Solución (PR 12):* se declara `cajon` antes de `aplicarVista()`. Se reprodujo en móvil y escritorio antes del arreglo.
- *Para que no se repita:* se hizo un recorrido de las 6 pantallas en 3 tamaños × 5 combinaciones de estado guardado (vista lista, notas en editar, avanzado abierto/cerrado, mapa oculto, capas).

### Proceso

- Los 8 PR del rediseño estaban **apilados** (cada uno sobre el anterior). Para tener un solo despliegue se retargeó el último (PR 10) a `main` y se fusionó con commit de merge; así entraron todos. Los PR 4 a 9 se cerraron como ya incluidos.
- Las respuestas con una sola palabra («sí») sirvieron como autorización para cada fusión; las fusiones a `main` desplegaron solas por el flujo de GitHub, sin ejecutar `npm run deploy` a mano.

## Reglas que salen de esto

1. **D1: máximo 100 valores por consulta.** Cualquier `in (…)` con una lista que pueda crecer va por lotes (`notasPorNombre`, `lotes`). La D1 simulada de `tests/helpers.mjs` lo exige.
2. **Estado guardado en el navegador = más caminos que probar.** Todo lo que se recuerde en `localStorage` debe probarse arrancando con ese estado ya guardado, no solo cambiándolo en la sesión.
3. **Variables antes de usarlas.** En las vistas de `public/js/views/`, declarar el estado compartido (`let …`) antes de cualquier función que se llame durante el montaje.
4. **`node --check` en todos los archivos y consola limpia** antes de abrir un PR de interfaz; un comentario `//` en una línea compacta puede romper un archivo entero.
5. **Un cambio de interfaz no prueba que el servidor esté bien, ni al revés.** Cuando falla en producción, comprobar primero qué cambió realmente en `src/`.

## Qué no se pudo verificar (y sigue abierto)

- Rendimiento del mapa (60 fps) en un móvil modesto y con la bóveda real.
- VoiceOver/TalkBack y el teclado virtual de Android; en iPhone se comprobó a mano tras el despliegue (Estudio y Cerebro cargan y responden).
- Lighthouse de rendimiento y las cabeceras de caché (`/fonts/*`, `/icons/*`) sobre el despliegue real.
- Los registros de Cloudflare para confirmar la causa del error 500 (la comprobación fue funcional: dejó de fallar).
