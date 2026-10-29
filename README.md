# Abrinay Mind

Plataforma de **cerebros por artista** para escribir letras. Cada cerebro es una red de notas conectadas por **enlaces** y por **significado**; antes de escribir, el cerebro lee lo que hace falta de esa red y recién entonces compone. El primer cerebro es el de **Abrinay**.

Corre entero en Cloudflare: un Worker (API) + la interfaz como Static Assets + una base D1 + Workers AI para el significado. No hay servidores que mantener.

## Cómo piensa el cerebro

| Pieza | Qué es |
|---|---|
| **Neurona** | Una nota en Markdown (`---` cabecera, `[[enlaces]]`). |
| **Lóbulo** | La carpeta de primer nivel (`20-ADN Lírico`, `50-Referentes`…). |
| **Sinapsis** | Cuatro clases: **enlace** `[[explícito]]` (1.0) · **aprendida** (se refuerza al aprobar letras, se desvanece a la mitad cada 90 días) · **significado** (cercanía de sentido entre vectores, ×0.7) · **mención** (una nota nombra a otra sin enlazarla, 0.4). |
| **Activación** | Antes de escribir se despiertan semillas (modo elegido, notas ancladas, lo que encuentra la búsqueda por palabras + significado) y la señal viaja 2 saltos por las sinapsis. Lo despertado entra al prompt con presupuesto de caracteres. |
| **Memoria fija** | Notas con `siempre: true` (reglas de oro, firma, lo aprendido): van enteras en cada prompt, con caché. |
| **Modos** | Notas `tipo: modo`. Si el encargo no dice el modo y no se detecta, el cerebro **pregunta** antes de escribir. |
| **Aprendizaje** | Aprobar → la letra pasa a ser una neurona enlazada a lo leído + puntuación + sinapsis reforzadas. Rechazar → entrada en la bitácora de errores + una regla NUNCA/SIEMPRE propuesta que, si la aceptas, entra a «Reglas aprendidas». |

## La interfaz

- **Cerebro**: grafo 3D (arrastra, rueda, clic). Capas de sinapsis, lóbulos, búsqueda, cajón con la nota.
- **Notas**: árbol, editor Markdown con autocompletado de `[[`, renombrar reescribiendo enlaces, mover, papelera con deshacer.
- **Estudio**: constructor de canciones + chat con el cerebro, en streaming. Muestra qué leyó y lo ilumina en un mapa.
- **Canciones**: biblioteca, aprobar/rechazar con formulario de diagnóstico.
- **Conexiones**: salud, menciones, significado, «Conectar con IA», lo aprendido, exportar/importar bóveda.
- **Ajustes**: llaves, modelo por tarea, modelos que entrenan, gasto y tope mensual.
- Selector de cerebros en la barra lateral (uno por artista; nada se mezcla).

## Modelos

Anthropic (Claude) y Meta (Muse Spark, incluido **Contributor**). Cada tarea (letras, chat, borradores, crítica, reglas, enlaces) tiene su modelo en **Ajustes**. Los modelos que **entrenan con tus datos** (Contributor) están bloqueados hasta que los permitas a propósito y **nunca reciben notas con `privado: true`**.

> Los precios de Claude salen de la tabla de costos de Agents Office. Los de Muse y el endpoint de Meta (`https://api.meta.ai/v1/messages`, `Authorization: Bearer`) **no están verificados contra la documentación de Meta**: contrástalos con tu factura y, si tu API usa otra URL, define `META_BASE_URL`.

## Secretos y variables

| Dónde | Nombre | Para qué |
|---|---|---|
| Worker (secreto) | `APP_PASSWORD` | La contraseña de la app. |
| Worker (secreto) | `SESSION_SECRET` | Firma de la sesión (≥ 16 caracteres). |
| Worker (secreto) | `ANTHROPIC_API_KEY` | Claude. |
| Worker (secreto) | `META_API_KEY` (o `MODEL_API_KEY`) | Muse Spark. |
| Worker (variable, opcional) | `ANTHROPIC_BASE_URL`, `META_BASE_URL` | Cambiar el destino de cada proveedor (pruebas, proxy). |
| Binding (sin secreto) | `AI` | Workers AI para el significado. |
| GitHub Actions | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Que el workflow despliegue. |

Detalle paso a paso en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Privacidad (este repositorio es público)

- **La bóveda de un artista nunca va a Git.** Es un archivo `.vault.json` que se sube a D1 con **Importar bóveda** en la app. El extractor específico de cada artista (que lee sus fuentes privadas y contiene curación personal) vive junto a esas fuentes, en un repositorio privado, no aquí.
- De los referentes entra **análisis y métricas, sin el texto de sus letras**.
- Las notas con nombres de personas reales llevan `privado: true`.
- Acceso: una contraseña, cookie `HttpOnly; Secure; SameSite=Strict` firmada con HMAC, 8 intentos fallidos por IP cada 15 min, comprobación de origen en toda petición que cambia datos.

## Desarrollo

```bash
npm install
cp .dev.vars.example .dev.vars      # y rellénalo
npm run migrate:local
npm run dev                         # http://localhost:8787
npm test                            # núcleo, API, letras, interfaz y despliegue
```

`wrangler dev` ejecuta Workers AI de forma remota: «Significado» solo funciona con tu cuenta de Cloudflare conectada (`wrangler login`). Todo lo demás funciona sin red; para probar sin gastar puedes apuntar `ANTHROPIC_BASE_URL` a un proveedor simulado.

### Formato de la bóveda

Una bóveda es un JSON `abrinay-mind/boveda@1` (lo exporta y lo importa la app; cualquier extractor puede producirlo):

```json
{ "formato": "abrinay-mind/boveda@1",
  "cerebro": { "slug": "abrinay", "nombre": "Abrinay", "subtitulo": "…", "color": "#8b5cf6" },
  "notas": [ { "nombre": "…", "carpeta": "20-ADN Lírico/Rima", "texto": "---\ntipo: tecnica\n---\n# …", "actualizado": 1790000000000 } ],
  "sinapsis": [], "pesos": [] }
```

Cada nota es Markdown con `[[enlaces]]`; la cabecera admite `tipo`, `siempre: true`, `privado: true`, `alias:`, `mencion: false`, `revisar:` y, para los modos de escritura, `modo_id`, `modo_nombre`, `orden` y `palabras`.

## Estructura

```
public/            interfaz (HTML + JS sin build) y core/ (módulos puros compartidos con el Worker y los tests)
src/               Worker: app.js (rutas), auth, notes, search, meaning, models, context, chat, songs, connect, transfer
migrations/        D1 (SQLite + FTS5)
scripts/ci/        ayudantes del despliegue
tests/             node --test (D1 simulada sobre node:sqlite con FTS5, IA y proveedores simulados)
.github/workflows/ pruebas y despliegue
```

## Otro artista

En la app: **+ → Cerebro nuevo** (nace con perfil, reglas de oro, protocolo y bitácora para llenar) o **Importar bóveda** con un archivo del formato de arriba.
