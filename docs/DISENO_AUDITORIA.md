# Auditoría de diseño y UX — Fase 0

Estado: **informe para aprobación. No se ha cambiado código.** Medido en local (cerebro «Artista Demo», 230 notas) con Chromium/Playwright en 320×568, 390×844, 412×915, 844×390, 820×1180 y 1440×900. Capturas «antes» en `capturas/antes/<tamaño>/` (no van a Git). `errores.txt` de los 6 tamaños: **sin errores de consola**. Sin scroll horizontal de página en ninguna vista a 320 px.

Referencias `archivo:línea` sobre el estado actual de la rama.

## (a) Inventario de pantallas y estados

| Pantalla | Con datos | Vacío | Cargando | Error | Otros estados |
|---|---|---|---|---|---|
| Login | sí | — | — | `.err` bajo el campo | «Falta configurar acceso / BD» (`app.js:pantallaError`) |
| Armazón | rail (escritorio) / barra inferior + «Más» | sin cerebros: `vacio()` | — | `pantallaError` | chip «Sin llave de modelo» |
| Cerebro | grafo + cajón | «aún no tiene notas» | texto + skeleton | mensaje + toast | cajón: skeleton / error de nota; capa «Significado» vacía → aviso |
| Notas | árbol + editor 3 modos | «Elige una nota» | **sin skeleton** al listar | toast | nota muy larga ✔ (demo), conflicto 409, papelera vacía |
| Estudio | constructor + chat + mapa | bienvenida | orbe «leyendo la memoria…» | toast + «Se cortó» | modo incierto, sin llave, tope, detenida |
| Canciones | tarjetas | «Aún no hay canciones» | **ninguno** | toast | detalle (diálogo), editar, aprobar, rechazar, regla aprendida |
| Conexiones | KPIs + tarjetas | parcial | **ninguno** (pantalla en blanco hasta `Promise.all`) | texto | «falta el binding» (Workers AI) |
| Ajustes | 5 tarjetas | — | ninguno | texto | «falta» por llave, entrena activo, tope |

Limitación: la demo no trae canciones, así que `11-cancion-detalle` no se capturó. En la Fase 1 guardo una desde el Estudio para cubrir detalle/veredicto/rechazo.

## (b) Hallazgos

Severidad: **P0** bloquea o rompe uso móvil · **P1** degrada claramente · **P2** pulido.

### P0

1. **Texto blanco fijo sobre el color de acento: ilegible con acentos claros.** `.btn.primary` (`app.css:68`), `.composer .send` (`:180`), `.stars` activo (`:188`), `.switch` (`:84`) usan `#fff`. Contraste real: cian `#22d3ee` 1.8:1, verde `#34d399` 1.9:1, amarillo `#facc15` 1.5:1, lima 1.5:1, azul `#60a5fa` 2.5:1; incluso el violeta por defecto da 4.2:1 (falla AA). Al revés, un azul oscuro `#1e3a8a` da 1.9:1 de *acento sobre fondo* (enlaces, tags, foco, orbe invisibles). Captura: `movil-390/08-estudio-constructor` / `09-estudio-letra` (botón «Escribir letra» blanco sobre cian). El selector de color de «Cerebro nuevo» ofrece justo estos colores (`app.js` SWATCH) y Conexiones admite un hex libre (`conexiones.js:145`) sin validar.
2. **Botón «Escribir letra» aplastado a 24 px de alto** en el constructor móvil. `.builder` es columna flex con `overflow:auto` (`app.css:162`) y sus hijos se encogen. Medido: `button.btn 361×24`. Es la acción principal del Estudio.
3. **Inputs a 14.5 px → iOS Safari hace zoom** al enfocar. Medido en Cerebro (búsqueda), Notas (filtro), Estudio (input/textarea/select) y todos los diálogos. Causa: `app.css:18` + herencia en `:77`.
4. **Cambiar de cerebro en móvil no se descubre**: el rail desaparece (`:203`) y la única vía es tocar el nombre arriba (`app.js:98`, solo `title`, que no existe en táctil) o «Más». No hay indicio visual (sin chevrón).
5. **Cajón de nota del grafo en móvil** (`:131`, `:220`): ocupa el 100 % sin gesto de cierre, tapa la barra de búsqueda y el pie parte «Copiar enlace» en una segunda línea (`03-cerebro-cajon`). Sin formato de hoja ni asa.
6. **Navegación perdida durante el arranque**: `enrutar()` ignora un `hashchange` si ya hay uno en curso (`app.js:170`). Reproducido: ir a `#/demo/estudio` justo tras iniciar sesión no monta la vista (el enlace profundo o un toque rápido queda muerto). Afecta también a doble toque en pestañas.
7. **Grafo sin alternativa accesible ni de lista**; solo `aria-label` genérico (`cerebro.js:12`). En horizontal (844×390) el lienzo queda en ~250 px de alto y las pastillas de lóbulos se solapan con las herramientas (`movil-horizontal/01-cerebro`).

### P1

8. **Contraste**: `--faint #5a5a6e` = 2.99:1 sobre `--bg` y 2.84:1 sobre `--surface` (falla AA). Se usa en hints (`:76`), placeholders (`:78`), pies, fechas, `section-title`, contadores. `--muted #8a8aa0` pasa (5.96/5.65). `--accent` violeta sobre superficies 4.5–4.75 (borde). Tags `good/warn/bad` sobre fondo tintado sin medir.
9. **Zonas táctiles < 44 px** (medido en 390): marca/selector de cerebro 34 px de alto; chip de gasto 28; capas 32; lóbulos 28; `.btn.small` 30; filtros de Canciones 32; chips de enlaces 26; casillas del árbol 31; botones de iconos del editor 30; cierre del cajón 40; herramientas del grafo 38; `.mnav` ok (62).
10. **Ajustes a 390 px**: filas «Llaves y accesos» parten «Acceso a la / app», la `code` y el badge se aprietan (`:194` `.keyrow` sin `flex-wrap`; `captura 13-ajustes`). Los `select` por tarea ya van al 100 % (`:212`) pero la etiqueta y la ayuda quedan en columna estrecha.
11. **Estudio móvil**: barra superior con 6 controles en 390 px (`estudio.js:491-496`, `app.css:164/219`); acciones bajo la letra («Guardar como canción / Copiar / Refinar» + «Copiar todo») se parten en 2–3 líneas (`09-estudio-letra`); constructor de **14 campos** en un scroll de ~1600 px sin «Esencial/Avanzado»; atajos rápidos recortados sin indicio de scroll.
12. **Teclado virtual**: `.app{height:100dvh}` (`:28`); en iOS el teclado no encoge el viewport, el compositor puede quedar tapado. No se usa `visualViewport`. La barra inferior queda visible sobre el teclado.
13. **Diálogos** (`ui.js:dialogo`): sin focus trap, sin fondo inert (se puede tabular al contenido de detrás), sin scroll lock del fondo, centrados en vez de hoja inferior. Cierre solo por Esc y clic fuera; en móvil no hay gesto. El foco inicial cae en el primer input (abre teclado de golpe).
14. **Toasts sobre diálogos**: `.toasts` z-index 100 vs `.scrim` 90 (`:100/:104`); en móvil se apilan encima de los botones del diálogo. `role=status` con 4.2 s fijos, sin pausa al foco; «Deshacer» de la papelera (`notas.js:344`) desaparece a los 7 s.
15. **Notas móvil**: barra del editor con 7 iconos sin texto (`notas.js:243-250`, 30 px); «volver» al árbol es un icono de hamburguesa sin etiqueta; el modo por defecto es solo lectura (`:158-159`) y no hay un «Editar» evidente (el ojo/`</>` no se entienden); autocompletado `[[` posicionado con `innerHeight` (`:362`), puede quedar bajo el teclado.
16. **Tooltips solo hover** (`.avatar::after`, `.ibtn::after`, `:36/:41`) y `title`; sin equivalente táctil ni de teclado (no salen con `:focus-visible`).
17. **Subtítulo truncado** con «…» en cabecera móvil (`:49`, `01-cerebro`). Cabecera de 64 px + barra de 62 px en horizontal se comen 126 de 390 px (32 %).
18. **Safe areas**: `.mnav` suma `padding-bottom: env(safe-area-inset-bottom)` pero con `height: var(--tabs)` fijo: en iPhone con barra de inicio el contenido de la barra se reduce en vez de crecer. Sin `safe-area-inset-left/right` en horizontal (notch). `.toasts`/`.g-tools`/`.lobes` no consideran el borde inferior.
19. **Fuente**: `--sans` declara «Inter» (`:10`) pero no se carga; en mis capturas se ve Inter solo porque el contenedor de pruebas la tiene instalada (comprobado con `fc-list`). En un teléfono real cae a San Francisco/Roboto: la jerarquía cambia por dispositivo.
20. **Grafo táctil**: etiquetas 12 px (`graph3d.js:295`), DPR hasta 2 (`:175`) sin límite adaptativo ni pausa fuera de pantalla (sin `visibilitychange`), selección por punto de ~6 px sin radio táctil; los gestos existen (1 dedo rota, pellizco = zoom, 2 dedos desplazan: `graph3d.js:323-343`) pero sin ninguna pista visual para el usuario. Rendimiento con 230 notas bien en emulación; no verificable en móvil modesto.
21. **Estados de carga ausentes** en Notas (lista), Canciones y Conexiones: pantalla vacía hasta que responde la API. Sin skeletons ni reserva de altura (salto de layout).

### P2

22. `:focus-visible` solo cambia el contorno al color de acento; con acentos oscuros no se ve; los inputs lo anulan (`:79`) y dependen de un halo de 3 px al 16 % de opacidad, de contraste muy bajo.
23. `.tab[aria-current="page"]` usa `role=tab` sin `aria-selected` ni `tabpanel`; la barra inferior sin `role`. Una sola `nav` etiquetada dos veces en distintos tamaños.
24. Botón «Enviar»/«Detener» cambia `title`+`aria-label` bien, pero el streaming usa `aria-live="polite"` sobre todo el contenedor (`estudio.js:95`): el lector releería la letra completa en cada fragmento.
25. Iconos: `icono()` usa `innerHTML` interno (permitido), sin título; botones solo con icono tienen `aria-label` en su mayoría (ok), pero los `.chip` de enlace usan `title` como nombre.
26. Sin `manifest.webmanifest`, `apple-touch-icon` ni `theme-color` por cerebro (fijo `#07070b`, `store.js:60`).
27. `prefers-reduced-motion` desactiva animaciones CSS, pero el login (`app.js:red`) y el grafo giran por JS (el login lo respeta; verificar el grafo con giro automático).
28. Duraciones mezcladas (.1, .15, .18, .2, .22, .25, .3 s) y z-index sueltos (5, 6, 10, 30, 80, 90, 100, 200).
29. Terminología: «neurona», «lóbulo», «sinapsis», «capas», «menciones», «significado», «anclar» sin ayuda breve en el primer uso; verbos mezclados («Abrir en Notas», «Ver la lección», «Evaluar», «Pedir otra versión»).
30. Atajos de teclado en escritorio: solo `/` (buscar) y Ctrl+S; sin ayuda de atajos.

## (c) Propuesta de sistema de diseño

Todo en `:root` de `app.css`, sin dependencias nuevas. Los nombres de clase actuales **no se renombran**.

- **Espaciado** 4/8: `--s-1:4 --s-2:8 --s-3:12 --s-4:16 --s-5:24 --s-6:32 --s-7:48` px.
- **Tipografía**: base 16 px en inputs móviles, 15 px en lectura; escala `--t-xs 12 / sm 13.5 / md 15 / lg 17 / xl 20 / 2xl 26`; `line-height` 1.5; tracking en títulos. `--serif` (letras) se mantiene del sistema. Inter autoalojada (subset latino `wght` variable, ≤ 60 KB, `font-display: swap`) **solo en la Fase 4 y si lo apruebas**; antes se ajusta `--sans` a una pila del sistema honesta.
- **Radios** `--r-s 8 / --r-m 12 / --r-l 18 / --r-xl 24 / --r-pill`.
- **Elevación** 3 niveles (`--e-1` hoja, `--e-2` menú, `--e-3` diálogo) con sombra + borde.
- **z-index** con nombre: `--z-nav 10, --z-drawer 20, --z-pop 30, --z-sheet 40, --z-toast 50, --z-login 60`; **los toasts por encima de la barra inferior y por debajo de la hoja activa en móvil** (se reposicionan sobre la hoja).
- **Movimiento**: `--dur-1 100ms, --dur-2 160ms, --dur-3 200ms`; `--ease` actual; todo bajo `prefers-reduced-motion`.
- **Táctil**: `--hit: 44px` mínimo en `.btn`, `.tab`, `.chip` interactivo, `.lobe`, `.layer`, `.item`, `.check`, `.stars button`, `.linkchip` (área ampliada con `::before` si el aspecto visual debe ser menor).
- **Estados** unificados vía una sola regla por clase: `hover` (solo `@media (hover:hover)`), `:focus-visible` (anillo doble: 2 px fondo + 2 px acento-claro, ≥3:1), `:active` (scale .98), `[disabled]`, `[aria-busy]` (spinner CSS) para `.btn .field .tab .chip .tag .mode .song .check`.
- **Colores de texto**: `--faint` sube a un valor ≥ 4.5:1 sobre `--surface` (≈ `#8a8aa4` solo para decoración; texto auxiliar usa `--muted #9a9ab0` ≥ 6:1); se elimina el uso de `--faint` para texto legible. Estados `good/warn/bad` recalculados a ≥ 4.5:1 sobre su fondo tintado.
- **Acento arbitrario**: función JS en `store.js:pintar()` (lógica de UI, no `core/`) que calcula: `--on-accent` (blanco o casi negro según el mayor contraste), `--accent-text` (el acento aclarado/oscurecido con `color-mix` hasta ≥ 4.5:1 sobre `--surface` para enlaces/tags/etiquetas), `--accent-ui` (≥ 3:1 para bordes, foco, switch) y `meta theme-color`. Se valida el hex al guardar. Prueba con 8 acentos (violeta, rosa, cian, ámbar, verde, rojo, azul medio, **amarillo `#facc15` y azul oscuro `#1e3a8a`**) mediante el script de capturas con parámetro `--acento`.
- **Componentes nuevos** (sin cambiar vistas más de lo necesario): `hoja()` (bottom sheet) sobre `dialogo()` con focus trap, `inert` en el fondo, scroll lock y arrastre para cerrar; `menu()` accesible para «más acciones»; `Tooltip` táctil/teclado (muestra `data-tip` en `:focus-visible` y pulsación larga); `skeletonLista()`.

## (d) Plan por PR (ramas `diseno/<tema>`, un PR pequeño cada uno)

| PR | Rama | Contenido | Riesgo |
|---|---|---|---|
| 1 | `diseno/tokens-contraste` | Tokens (espaciado, tipografía, radios, z-index, movimiento); `--faint`/estados a AA; cálculo de `--on-accent`/`--accent-text`/`--accent-ui`; validación de hex; botón del Estudio sin encoger; inputs 16 px en móvil; `prefers-reduced-motion` completo; anillos de foco. Prueba unitaria del cálculo de contraste (función pura nueva en `public/js/`, con test en `tests/`). | Bajo |
| 2 | `diseno/armazon-movil` | Hoja inferior reutilizable (`dialogo` → hoja en móvil, focus trap, inert, Esc, scroll lock); toasts sobre barra y bajo hoja; selector de cerebros descubrible (chevrón + avatar con inicial); menú «Más»; safe areas; manifest + apple-touch-icon; corrige la carrera de `enrutar()`; cabecera compacta en horizontal. | Medio |
| 3 | `diseno/cerebro-movil` | Cajón como hoja arrastrable; lóbulos como chips con scroll; controles sin chocar con la barra; alternativa en **lista/buscador** accesible; zonas táctiles del grafo, límite de DPR y pausa en segundo plano. | Medio |
| 4 | `diseno/notas-movil` | Maestro-detalle con «‹ Notas», barra con menú «más» y botón «Editar» visible, autocompletado `[[` con `visualViewport`, skeleton de lista. | Bajo |
| 5 | `diseno/estudio-movil` | Constructor a pantalla completa con «Esencial / Avanzado»; compositor sobre el teclado (`visualViewport`); menú de acciones por versión; barra superior simplificada; `aria-live` educado en streaming. | Medio |
| 6 | `diseno/canciones-ajustes` | Una columna, detalle y veredicto a pantalla completa, puntuación 0–10 cómoda, rechazo por pasos; Ajustes/Conexiones con filas en columna, `keyrow` que envuelve; skeletons. | Bajo |
| 7 | `diseno/accesibilidad-ux` | Roles/ARIA (tabs, nav, listbox), nombres accesibles, ayuda contextual del vocabulario (neurona/lóbulo/sinapsis), primer uso, verbos consistentes, confirmaciones y deshacer, atajos de escritorio con panel de ayuda; axe sin críticos; Lighthouse móvil A11y/BP ≥ 95. | Bajo |
| 8 | `diseno/pulido` | Sin saltos de layout, transiciones ≤ 200 ms, grafo a 60 fps en móvil modesto, **Inter autoalojada** (opcional) y revisión de peso JS/CSS. | Bajo |

Cada PR: `npm test` verde, `errores.txt` limpio, sin scroll horizontal a 320, capturas antes/después en 390×844 y 1440×900, sin recursos externos, prueba por teclado, y lista de lo que no pude verificar (IA real, Significado/Workers AI, despliegue, rendimiento con la bóveda real de 364 notas, VoiceOver/TalkBack y teclado virtual de iOS reales).

## Decisiones que necesito de Abrinay

1. ¿Autorizas **Inter autoalojada** (subset latino, ≤ 60 KB) en la Fase 4, o prefieres una pila del sistema?
2. El **selector de color** de «Cerebro nuevo»: ¿lo mantengo con las 8 muestras actuales (todas pasarán a ser legibles con el texto calculado) o lo limito a colores que ya cumplan?
3. ¿Cambia el comportamiento por defecto de **Notas en móvil** a «editar» (con botón visible para leer) o prefieres seguir en «lectura»?
4. La alternativa en lista del grafo: ¿pestaña dentro de Cerebro («Mapa | Lista») o un panel desde la búsqueda?
5. La carrera de `enrutar()` (hallazgo 6) toca el armazón de `app.js`, no la lógica: ¿OK corregirla en el PR 2?
