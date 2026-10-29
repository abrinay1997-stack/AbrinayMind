// Abrinay Mind — Cloudflare Worker. Solo exporta el manejador; la lógica vive en src/app.js.
import { handle } from './app.js';
import { correr, todas } from './db.js';

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // Una vez al día: vacía la papelera de más de 30 días y los intentos de acceso viejos.
  async scheduled(_evento, env, ctx) {
    const db = env.DB, corte = Date.now() - 30 * 24 * 3600 * 1000;
    ctx.waitUntil((async () => {
      await correr(db, 'delete from notes_trash where deleted < ?', corte);
      await correr(db, 'delete from login_attempts where at < ?', Date.now() - 24 * 3600 * 1000);
      await correr(db, 'delete from audit where at < ?', Date.now() - 180 * 24 * 3600 * 1000);
      void todas;
    })());
  },
};
