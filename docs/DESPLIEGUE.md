# Desplegar Abrinay Mind en Cloudflare

Hay que hacer cuatro cosas, una sola vez. Después, cada push a `main` despliega solo.

## 1 · Un token de Cloudflare para que GitHub despliegue

Cloudflare → **My Profile → API Tokens → Create Token**.

- Plantilla **Edit Cloudflare Workers**, y añade el permiso **Account → D1 → Edit**.
- Recursos de cuenta: tu cuenta. Copia el token (solo se muestra una vez).
- Tu **Account ID** está en el panel de cualquier Worker (barra lateral derecha) o en la URL del dashboard.

## 2 · Secretos en GitHub

Repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Obligatorio | Valor |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | sí | El token del paso 1. |
| `CLOUDFLARE_ACCOUNT_ID` | sí | Tu Account ID. |
| `APP_PASSWORD` | recomendado | La contraseña con la que entrarás a la app. |
| `SESSION_SECRET` | recomendado | Una frase larga al azar (≥ 16 caracteres). |
| `ANTHROPIC_API_KEY` | recomendado | Tu llave de Claude. |
| `META_API_KEY` | opcional | Tu llave de Muse Spark. |

Los cuatro últimos el workflow los copia al Worker como **secretos** (nunca quedan en el código). Si prefieres no pasarlos por GitHub, déjalos vacíos y ponlos directo en Cloudflare: **Workers & Pages → abrinay-mind → Settings → Variables and Secrets → Add → Secret**. Los secretos ya puestos allí sobreviven a cada despliegue.

## 3 · Desplegar

Ve a **Actions → Desplegar → Run workflow** (elige la rama por defecto del repositorio), o haz push/merge a `main`. El workflow:

1. corre las pruebas;
2. busca la base D1 `abrinay-mind-db` y la crea si no existe;
3. aplica las migraciones (`migrations/`);
4. despliega el Worker (interfaz + API + cron diario de limpieza);
5. sube los secretos que tengas en GitHub;
6. consulta `/api/health` y te imprime la URL (`https://abrinay-mind.<tu-subdominio>.workers.dev`).

## 4 · Primer uso

1. Abre la URL y entra con `APP_PASSWORD`.
2. **+ → Importar una bóveda** y elige `abrinay.vault.json` (se genera con el extractor privado que vive junto a las fuentes; el archivo no está en Git a propósito).
3. **Conexiones → Significado**: «Entender las notas» y luego «Conectar por significado» (usa Workers AI, consume cuota de IA de tu cuenta).
4. **Ajustes**: revisa qué modelo hace cada tarea.
5. **Estudio**: escribe.

## Muse Spark «Contributor»

Es el mismo modelo a una fracción del precio **a cambio de que Meta use tus prompts y respuestas para entrenar**. Por eso:

- Está apagado hasta que actives **Ajustes → Permitir modelos que entrenan con mis datos**.
- Nunca recibe una nota con `privado: true`.
- Recomendación: úsalo en *Borradores y lluvia de ideas* y deja las letras finales a Claude.

## Problemas comunes

| Síntoma | Causa y arreglo |
|---|---|
| El workflow falla en «Comprobar credenciales» | Faltan `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` en GitHub. |
| `wrangler d1 …` dice *Authentication error* | El token no tiene **D1 → Edit**. Edítalo y vuelve a correr. |
| La app dice «Falta configurar el acceso» | Faltan `APP_PASSWORD` y/o `SESSION_SECRET` en el Worker. |
| «Falta el secreto ANTHROPIC_API_KEY…» | Pon la llave (o elige un modelo de otro proveedor en Ajustes). |
| «Significado» da error de Workers AI | Tu cuenta no tiene Workers AI disponible o sin cuota. Todo lo demás sigue funcionando por palabras. |
| `Llegaste al tope del mes` | Sube el tope en Ajustes. |

## Plan gratuito de Cloudflare

Está pensado para ser liviano en CPU: la interfaz se sirve como archivos estáticos (no despierta el Worker), y las tareas largas (importar, menciones, significado) las dirige el navegador en pasos cortos. Si importas una bóveda muy grande y ves errores de tiempo de CPU, el plan Workers de pago los elimina.
