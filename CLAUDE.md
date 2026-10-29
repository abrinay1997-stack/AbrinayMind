# CLAUDE.md — Abrinay Mind

Plataforma de cerebros por artista para escribir letras. Cloudflare Worker + Static Assets + D1 (SQLite/FTS5) + Workers AI. Léete [`README.md`](README.md) para la arquitectura y [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) para desplegar.

## Reglas que no se rompen

1. **La bóveda de un artista nunca entra a Git** (el repositorio es público): ni archivos `.vault.json`, ni letras o fragmentos de letras del artista en tests, fixtures, ejemplos o docs (usa texto inventado). `vault-out/`, `*.vault.json` y `brains/` están ignorados; no los fuerces con `git add -f`. Los datos viajan por **Importar bóveda** a D1.
2. **Nunca copies letras de otros artistas** al cerebro: de los referentes solo se guarda análisis y métricas.
3. Las notas con `privado: true` **nunca** se envían a un modelo que entrena (`entrena: true` en el catálogo). Cualquier cambio en `src/context.js` o `public/core/context.js` debe conservar esa garantía (hay tests).
4. Los secretos solo viven como secretos del Worker. Nunca en `wrangler.jsonc`, en el código ni en la interfaz.
5. No pongas identificadores de modelo en commits, PRs ni comentarios de código.

## Comandos

```bash
npm test                      # todo, sin red (D1 simulada sobre node:sqlite, IA y proveedores simulados)
npm run dev                   # wrangler dev (necesita .dev.vars; ver .dev.vars.example)
npm run migrate:local         # aplica migrations/ a la D1 local
```

## Dónde vive cada cosa

- `public/core/*.js` — lógica **pura** compartida por el Worker, el navegador y los tests (texto, grafo, hebb, modos, contexto, calidad). Sin imports de Cloudflare ni del DOM.
- `src/app.js` — tabla de rutas (`/api/*`). Cada módulo (`notes`, `search`, `meaning`, `models`, `chat`, `songs`, `connect`, `transfer`, `brains`) tiene una responsabilidad.
- `public/js/` — interfaz sin build (módulos ES). `h()` en `ui.js` crea DOM sin `innerHTML`; el único HTML que se inserta sale de `md.js` (escapa todo) y de los iconos propios.
- `migrations/` — solo se añaden archivos nuevos (`0002_…`), nunca se edita uno ya aplicado.
- `scripts/ci/` — ayudantes del despliegue. El **extractor de la bóveda de Abrinay NO está en este repositorio** (contiene curación y fragmentos de letras): vive en el repositorio privado de las fuentes, en `herramientas/abrinay-mind/`. No lo traigas aquí.

## Convenciones

- Código, nombres y textos de la interfaz en **español**; tono directo, sin jerga innecesaria.
- Un Worker liviano: nada de bucles pesados por petición. Lo largo se parte en lotes que dirige el navegador (importar ≤ 12 notas, menciones 30, significado 8, vecinas 6).
- Toda escritura que muta notas pasa por `src/notes.js` (mantiene FTS, enlaces, menciones y control de concurrencia con `base`).
- Cada cambio de comportamiento lleva su test en `tests/`.
