// Construye la versión web en web/dist: la app (public/) + sw.js (server.js empaquetado para el navegador).
// Uso: node web/build.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const OUT = path.join(HERE, 'dist');
const shim = (f) => path.join(HERE, 'shims', f);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// Firebase (compartir): solo el id del proyecto y su clave web, que Google hace para ir en webs y
// apps; lo que protege los datos son las reglas de Firestore. Se lee del archivo junto a la app.
let firebase = null;
try {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-config.json'), 'utf8'));
  firebase = { apiKey: f.apiKey, projectId: f.projectId };
} catch {
  console.warn('Sin firebase-config.json: en la web no se podrá compartir.');
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

await build({
  entryPoints: [path.join(HERE, 'sw-entry.js')],
  outfile: path.join(OUT, 'sw.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  inject: [shim('prelude.js')],
  define: { 'import.meta.url': '"file:///app/server.js"', 'process.env.JR_LOCAL_DIR': '"/app/data"', 'process.env.JR_WEB_VERSION': JSON.stringify(pkg.version), 'globalThis.JR_WEB_FIREBASE': JSON.stringify(firebase), 'process.env.GOOGLE_TOKEN_URL': JSON.stringify(process.env.JR_WEB_TOKEN_URL || 'https://diva-routine-premium.premium-server.workers.dev/google/token') },
  alias: {
    'node:fs': shim('fs.js'),
    'node:fs/promises': shim('fsp.js'),
    'node:http': shim('http.js'),
    'node:os': shim('os.js'),
    'node:path': 'path-browserify',
    'node:crypto': shim('crypto.js'),
    'node:child_process': shim('child_process.js'),
    'node:url': shim('url.js'),
    'node:stream': shim('stream.js'),
    'node:stream/promises': shim('stream-promises.js'),
    'node:async_hooks': shim('async_hooks.js'),
    'node:util': shim('util.js'),
  },
  logLevel: 'warning',
});

// Se puede instalar como app desde el navegador del móvil (Android e iPhone) o del ordenador.
fs.cpSync(path.join(HERE, 'icons'), path.join(OUT, 'icons'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Diva Routine',
  short_name: 'Diva Routine',
  description: 'Rutinas de baile, deporte y entrenos con tus vídeos.',
  id: './',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#1b1816',
  theme_color: '#1b1816',
  lang: 'es',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// La página: rutas relativas (la app vive en una subcarpeta) y no arranca hasta que el service worker manda.
const index = path.join(OUT, 'index.html');
let html = fs.readFileSync(index, 'utf8');
html = html.replace(/(src|href)="\/(?!\/)/g, '$1="');
html = html.replace('</head>', `  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#1b1816">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Diva Routine">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
</head>`);
html = html.replace(/<script type="module" src="js\/app\.js"><\/script>/, `<script>
  window.JR_WEB = true;
  document.documentElement.classList.add('web');
  (async () => {
    const sw = navigator.serviceWorker;
    if (!sw) return document.body.insertAdjacentHTML('afterbegin', '<p style="padding:2rem">Tu navegador no admite la versión web de Diva Routine.</p>');
    await sw.register('sw.js');
    if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
    import('./js/app.js');
  })();
</script>`);
if (!html.includes("import('./js/app.js')")) throw new Error('No encontré el <script> de app.js en index.html');
fs.writeFileSync(index, html);
console.log(`Versión web ${pkg.version} en ${OUT}`);
