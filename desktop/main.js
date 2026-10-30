// App de escritorio (Windows): Diva Routine en su propia ventana, con el servidor dentro.
// - Los datos van en %LOCALAPPDATA%\Diva Routine (se conservan al actualizar o desinstalar).
// - El identificador de Google y la configuración de Firebase que vienen con el instalador se
//   copian ahí la primera vez (así, quien la instala ya puede iniciar sesión y compartir).
// - Se actualiza sola: mira si hay una versión publicada más nueva, la baja en segundo plano y
//   avisa (notificación de Windows y aviso en la app) para instalarla con un clic.
import { app, BrowserWindow, Notification, shell, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import updaterPkg from 'electron-updater';

const { autoUpdater } = updaterPkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(HERE, 'icon.png');
const EVERY = 3 * 3600e3; // cada cuánto se mira si hay versión nueva (y al abrir)

app.setAppUserModelId('com.divolandia.jazzrutinas'); // para las notificaciones de Windows

if (!app.requestSingleInstanceLock()) {
  // Ya estaba abierta: se enseña esa ventana (ver 'second-instance').
  app.quit();
} else {
  start();
}

function start() {
  // ---------- dónde van los datos ----------
  const BASE = process.env.LOCALAPPDATA || app.getPath('appData');
  const HOME = process.env.JR_HOME || path.join(BASE, 'Diva Routine');
  // La app antes se llamaba «Jazz Rutinas»: sus datos se pasan a la carpeta nueva (se mueven, no se copian).
  const OLD_HOME = path.join(BASE, 'Jazz Rutinas');
  if (!process.env.JR_HOME && !fs.existsSync(HOME) && fs.existsSync(OLD_HOME)) {
    try {
      fs.renameSync(OLD_HOME, HOME);
    } catch (e) {
      dialog.showErrorBox('Diva Routine', `No pude pasar tus datos de «${OLD_HOME}» a «${HOME}» (${e.code || e.message}). Cierra cualquier otra ventana de la app y vuelve a abrirla.`);
      app.exit(1);
      return;
    }
  }
  fs.mkdirSync(HOME, { recursive: true });
  process.env.JR_LOCAL_DIR ||= path.join(HOME, 'data');
  process.env.JR_CONFIG ||= path.join(HOME, 'config.json');
  process.env.JR_GOOGLE_CLIENT ||= path.join(HOME, 'google-client.json');
  process.env.JR_FIREBASE ||= path.join(HOME, 'firebase-config.json');
  if (app.isPackaged) {
    for (const [name, target] of [['google-client.json', process.env.JR_GOOGLE_CLIENT], ['firebase-config.json', process.env.JR_FIREBASE]]) {
      const bundled = path.join(process.resourcesPath, 'config', name);
      if (fs.existsSync(bundled) && !fs.existsSync(target)) fs.copyFileSync(bundled, target);
    }
  }
  const log = (...a) => fs.appendFile(path.join(HOME, 'app.log'), `${new Date().toISOString()} ${a.join(' ')}\n`, () => {});

  let win = null;
  const show = () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };
  app.on('second-instance', show);

  // ---------- actualizaciones ----------
  const update = { state: 'idle', version: null, percent: 0, error: null, checkedAt: null };
  const set = (patch) => Object.assign(update, patch);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // si no se pulsa «Actualizar», se instala al cerrar
  autoUpdater.logger = { info: (m) => log('[actualizar]', m), warn: (m) => log('[actualizar] aviso:', m), error: (m) => log('[actualizar] error:', m), debug: () => {} };
  // Para probar con versiones de prueba: JR_UPDATE_URL=http://… (carpeta con latest.yml y el instalador).
  if (process.env.JR_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.JR_UPDATE_URL });

  const friendly = (e) => {
    const m = String(e?.message || e);
    if (/404|latest\.yml|No published versions|Unable to find latest version/i.test(m)) return { state: 'none', error: null, noReleases: true };
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::ERR/i.test(m)) return { state: 'error', error: 'Sin conexión: se volverá a mirar más tarde.' };
    return { state: 'error', error: m.split('\n')[0].slice(0, 200) };
  };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ state: 'none', checkedAt: new Date().toISOString() }));
  autoUpdater.on('download-progress', (p) => set({ percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    set({ state: 'ready', version: i.version, percent: 100, checkedAt: new Date().toISOString() });
    notifyReady(i.version);
  });
  autoUpdater.on('error', (e) => set({ ...friendly(e), checkedAt: new Date().toISOString() }));

  async function check() {
    if (!app.isPackaged && !process.env.JR_UPDATE_URL) return set({ state: 'dev' }); // `npm run app`: sin actualizaciones
    if (['checking', 'downloading', 'ready'].includes(update.state)) return update;
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      set({ ...friendly(e), checkedAt: new Date().toISOString() });
    }
    return update;
  }

  function install() {
    log('[actualizar] instalando', update.version);
    // Sin preguntas (el instalador ya se aceptó la primera vez) y se vuelve a abrir al terminar.
    autoUpdater.quitAndInstall(true, true);
  }

  function notifyReady(version) {
    if (!Notification.isSupported() || process.env.JR_QUIET) return; // JR_QUIET: en las pruebas
    const n = new Notification({
      title: `Nueva versión de Diva Routine (${version})`,
      body: 'Pulsa aquí para actualizar ahora. Si no, se instalará sola al cerrar la app.',
      icon: ICON,
    });
    n.on('click', install);
    n.show();
  }

  // Lo que usa el servidor (server.js) para hablar con la ventana.
  globalThis.jrDesktop = {
    version: app.getVersion(),
    update,
    check,
    install,
    focus: show,
    restart: () => {
      app.relaunch();
      app.exit(0);
    },
  };

  // ---------- servidor y ventana ----------
  const serverReady = import('../server.js').then((m) => m.ready);

  app.whenReady().then(async () => {
    let port;
    try {
      port = await serverReady;
    } catch (e) {
      dialog.showErrorBox('Diva Routine no pudo arrancar', String(e?.stack || e));
      return app.exit(1);
    }
    const origin = `http://localhost:${port}`;
    win = new BrowserWindow({
      width: 1320,
      height: 880,
      minWidth: 820,
      minHeight: 560,
      title: 'Diva Routine',
      icon: ICON,
      backgroundColor: '#f6f1ea',
      show: false,
      webPreferences: { spellcheck: false },
    });
    win.removeMenu();
    win.once('ready-to-show', () => win.show());

    // Lo de fuera (enlaces, y el inicio de sesión con Google, que Google no deja hacer dentro
    // de una app) se abre en el navegador; al terminar, el servidor trae de vuelta esta ventana.
    const openOutside = (url) => /^https?:\/\//i.test(url) && shell.openExternal(url);
    const outside = (url) => !url.startsWith(origin + '/') || url.startsWith(origin + '/api/google/login');
    win.webContents.on('will-navigate', (e, url) => {
      if (!outside(url)) return;
      e.preventDefault();
      openOutside(url);
    });
    win.webContents.on('will-redirect', (e, url) => {
      if (url.startsWith(origin + '/')) return;
      e.preventDefault();
      openOutside(url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      openOutside(url);
      return { action: 'deny' };
    });
    // Sin menú: F5 recarga y F12 abre las herramientas (por si hay que mirar un fallo).
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const k = input.key.toLowerCase();
      if (k === 'f5' || (input.control && k === 'r')) {
        e.preventDefault();
        win.webContents.reload();
      } else if (k === 'f12' || (input.control && input.shift && k === 'i')) {
        e.preventDefault();
        win.webContents.toggleDevTools();
      }
    });
    win.on('closed', () => (win = null));
    win.loadURL(origin + '/');

    setTimeout(check, 8000);
    setInterval(check, EVERY);
  });

  app.on('window-all-closed', () => app.quit());
}
