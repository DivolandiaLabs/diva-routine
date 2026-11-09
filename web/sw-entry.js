// Service worker de la versión web: hace de servidor de Diva Routine dentro del navegador.
// /api/… y /media/… los atiende server.js (sobre un disco virtual en IndexedDB);
// el resto de rutas absolutas (/js/…, /styles.css…) se sirven desde la carpeta de la app.
import * as vfs from './shims/vfs.js';
import { dispatch } from './shims/http.js';

const BASE = new URL('./', self.location.href).pathname; // p. ej. /diva-routine/app/
// Cliente OAuth «Aplicación web» de Diva Routine. El secreto no viaja aquí: el canje del código
// lo hace el servidor Premium (GOOGLE_TOKEN_URL, ver build.mjs).
const GOOGLE_WEB_CLIENT = '37274077528-8lifmi4fsvsbotlh01dp511c872f5e3t.apps.googleusercontent.com';
let ready = null;
const start = () => (ready ||= (async () => {
  await vfs.init();
  vfs.put('/app/google-client.json', JSON.stringify({ client_id: GOOGLE_WEB_CLIENT, client_secret: '' }));
  if (globalThis.JR_WEB_FIREBASE) vfs.put('/app/firebase-config.json', JSON.stringify(globalThis.JR_WEB_FIREBASE));
  globalThis.jrWeb = { base: BASE, origin: self.location.origin };
  await import('../server.js');
})());

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function serve(e, url) {
  try {
    await start();
    const res = await dispatch(e.request, url);
    e.waitUntil(vfs.idle()); // que lo guardado llegue a IndexedDB aunque el worker se duerma
    return res;
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/media/')) return e.respondWith(serve(e, url));
  // Enlaces relativos de la app (api/google/login): dentro de la carpeta, para que el worker los vea.
  if (p.startsWith(BASE + 'api/') || p.startsWith(BASE + 'media/')) return e.respondWith(serve(e, new URL('/' + p.slice(BASE.length) + url.search, url)));
  // Vuelta de Google tras iniciar sesión: ?code=…&state=… en la página de la app.
  if (e.request.mode === 'navigate' && p === BASE && url.searchParams.has('state')) return e.respondWith(serve(e, new URL('/' + url.search, url)).then((r) => (r.status === 404 ? fetch(e.request) : r)));
  // Páginas y archivos de la app: siempre se pregunta si hay versión nueva (GitHub Pages deja
  // guardarlos 10 minutos y, si no, tras publicar se seguiría viendo la anterior). Si no ha
  // cambiado, Google responde «igual» sin volver a mandarlo.
  if (e.request.method === 'GET' && (e.request.mode === 'navigate' || p.startsWith(BASE))) {
    return e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(e.request)));
  }
  // Ruta absoluta de la app (/js/app.js, /logo.png…): la misma dentro de la carpeta de la app.
  e.respondWith(fetch(BASE + p.slice(1) + url.search, { cache: 'no-cache' }));
});

// Arranca ya, para que la primera petición no espere tanto.
start().catch((err) => console.error('Diva Routine web:', err));
