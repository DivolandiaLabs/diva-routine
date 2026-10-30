import { api } from './api.js';
import { state, refresh, emit, esc, toast, jobsText, syncInstagram, linkedLibraries, resumeDownloads, requestPoster } from './store.js';
import { renderLibrary } from './library.js';
import { renderVideo } from './video.js';
import { renderRoutine } from './routine.js';
import { renderRoutines } from './routines.js';
import { renderSettings } from './settings.js';

const host = document.getElementById('app');
let teardown = null;

// Cada vista recibe un contenedor nuevo (así no se acumulan listeners) y puede devolver
// una función de limpieza que se llama al salir de ella.
function route() {
  teardown?.();
  teardown = null;
  const root = document.createElement('div');
  root.className = 'view';
  host.replaceChildren(root);
  const [, view = 'biblioteca', id] = location.hash.split('/');
  const section = ['rutinas', 'rutina'].includes(view) ? 'rutinas' : view === 'ajustes' ? 'ajustes' : 'biblioteca';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
  window.scrollTo(0, 0);
  const views = {
    video: () => renderVideo(root, id),
    rutinas: () => renderRoutines(root),
    rutina: () => renderRoutine(root, id),
    ajustes: () => renderSettings(root),
  };
  teardown = (views[view] || (() => renderLibrary(root, id)))() || null;
}

window.addEventListener('hashchange', route);

// Indicador de trabajos en segundo plano (descargas y análisis).
window.addEventListener('store', (e) => {
  if (e.detail.kind !== 'job') return;
  const el = document.getElementById('jobs');
  const text = jobsText();
  el.hidden = !text;
  el.textContent = text ? text + '…' : '';
});

(async function init() {
  try {
    await refresh();
  } catch (e) {
    // Sin datos (p. ej. el disco de red apagado): se explica y se deja ir a Ajustes.
    if (location.hash.startsWith('#/ajustes')) return renderSettings(host);
    host.innerHTML = `<div class="empty-state"><h2>No se pueden abrir los datos</h2><p>${esc(e.message)}</p>
      <p><a class="btn" href="#/ajustes">Ir a Ajustes</a></p></div>`;
    window.addEventListener('hashchange', () => location.hash.startsWith('#/ajustes') && renderSettings(host), { once: true });
    return;
  }
  if (state.google?.configured && !state.google.connected && !skippedLogin()) return showLogin();
  drawAccount(state.google);
  route();
  watchForUpdates(state.version);
  resumeDownloads();
  // Portadas que falten, en segundo plano (así todas las carpetas se ven bien al abrirlas).
  for (const v of state.videos) if (v.source.mediaType === 'video' && v.source.file && !v.poster) requestPoster(v.id);
  autoSyncInstagram();
})();

// Pantalla de entrada: se inicia sesión con la cuenta de Google (se abre el navegador) y,
// cuando Google confirma, la app se abre sola. «Usar sin cuenta» se recuerda en este ordenador.
function skippedLogin() {
  try {
    return localStorage.getItem('jr-login-skip') === '1';
  } catch {
    return false;
  }
}

function showLogin() {
  document.body.classList.add('login-mode');
  host.innerHTML = `
    <div class="login">
      <img class="login-logo" src="/logo.png" alt="">
      <h1>Diva Routine</h1>
      <p>Entra con tu cuenta de Google para tener tus carpetas, vídeos, dibujos y rutinas en todos tus ordenadores y compartirlos con otras personas.</p>
      <a class="btn primary login-btn" href="/api/google/login">
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
        Iniciar sesión con Google</a>
      <p class="hint login-wait" hidden><span class="spin"></span> Termina el inicio de sesión en el navegador que se ha abierto…</p>
      <p class="hint">Si Google avisa de que «no ha verificado esta app», pulsa <b>Configuración avanzada → Ir a Diva Routine</b>.</p>
      <button class="btn small ghost" id="loginSkip">Usar sin cuenta en este ordenador</button>
    </div>`;
  host.querySelector('.login-btn').addEventListener('click', () => (host.querySelector('.login-wait').hidden = false));
  host.querySelector('#loginSkip').onclick = () => {
    try {
      localStorage.setItem('jr-login-skip', '1');
    } catch {
      /* sin almacenamiento: solo esta vez */
    }
    location.reload();
  };
  setInterval(async () => {
    const g = await api.google().catch(() => null);
    if (g?.connected) location.reload();
  }, 2000);
}

// Cuenta con la que se ha entrado, arriba a la derecha (lleva a Ajustes).
function drawAccount(g) {
  const el = document.getElementById('account');
  if (!el) return;
  // Es la entrada a Ajustes: sin sesión de Google, un engranaje.
  if (!g?.connected) {
    if (el.dataset.pic === 'gear') return;
    el.dataset.pic = 'gear';
    el.title = 'Ajustes';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    return;
  }
  el.title = `Ajustes · sesión iniciada como ${g.name ? `${g.name} (${g.email})` : g.email || 'Google'}`;
  if (el.dataset.pic === (g.picture || '')) return;
  el.dataset.pic = g.picture || '';
  const initial = (g.name || g.email || 'G')[0].toUpperCase();
  if (!g.picture) return (el.textContent = initial);
  // La foto de perfil de Google; si no carga, se queda la inicial.
  const img = document.createElement('img');
  img.src = g.picture;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => (el.textContent = initial);
  el.replaceChildren(img);
}

// Al abrir la app, las bibliotecas enlazadas a colecciones de Instagram se ponen al día
// (como mucho una vez cada 6 horas, para no hacer demasiadas peticiones a Instagram).
async function autoSyncInstagram() {
  if (!state.instagram.connected) return;
  const stale = linkedLibraries().filter((l) => l.igCollections.some((c) => !c.syncedAt || Date.now() - Date.parse(c.syncedAt) > 6 * 3600e3));
  if (!stale.length) return;
  const { created } = await syncInstagram(stale);
  if (created.length) toast(`Instagram: ${created.length} publicación(es) nueva(s) en tus colecciones. Se descargan solas.`);
}

/**
 * Vigila el servidor: si la app cambió, avisa para recargar; si otro ordenador cambió los
 * datos (carpeta compartida), se pone al día sola; y avisa si está abierta en otro ordenador.
 */
function watchForUpdates(loaded) {
  let busy = false;
  const check = async () => {
    if (document.hidden || busy) return;
    busy = true;
    try {
      const v = await api.version();
      if (loaded && v.version !== loaded && !document.getElementById('updateBar')) {
        const bar = document.createElement('div');
        bar.id = 'updateBar';
        bar.className = 'update-bar';
        bar.innerHTML = 'Hay una versión nueva de la app. <button class="btn small primary">Recargar</button>';
        bar.querySelector('button').onclick = () => location.reload();
        document.body.appendChild(bar);
      }
      if (v.data && state.data && v.data !== state.data) {
        await refresh();
        emit('data');
        toast('Actualizado con los últimos cambios (de otro ordenador o de quien comparte contigo)');
      }
      drawOthers(v.others || []);
      drawGoogle(v.google, v.collab);
      drawAccount(v.google);
      drawUpdate(v.update);
    } catch {
      /* servidor apagado: ya avisará la siguiente acción */
    } finally {
      busy = false;
    }
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // Sincronizando (carpeta compartida o Google) se mira a menudo (es una consulta muy pequeña);
  // si no, cada minuto.
  setInterval(check, state.sync?.shared || state.google?.connected ? 8000 : 60000);
  drawOthers(state.sync?.others || []);
  drawGoogle(state.google, state.collab);
  drawUpdate(state.update);
}

// App instalada: hay una versión nueva ya descargada. «Actualizar» la instala y la app se
// vuelve a abrir sola; «Más tarde» oculta el aviso (se instalará al cerrar la app).
function drawUpdate(u) {
  let bar = document.getElementById('appUpdateBar');
  const later = sessionStorageGet('jr-update-later');
  if (!u?.desktop || u.state !== 'ready' || later === u.version) return bar?.remove();
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'appUpdateBar';
  bar.className = 'update-bar';
  bar.innerHTML = `Hay una versión nueva de Diva Routine (<b>${esc(u.version)}</b>; tienes la ${esc(u.current)}).
    <button class="btn small primary" data-up="install">Actualizar ahora</button>
    <button class="btn small ghost" data-up="later">Más tarde</button>`;
  bar.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-up]')?.dataset.up;
    if (act === 'later') {
      sessionStorageSet('jr-update-later', u.version);
      return bar.remove();
    }
    if (act !== 'install') return;
    bar.textContent = 'Actualizando… La app se cerrará y se volverá a abrir sola en unos segundos.';
    try {
      await api.installUpdate();
    } catch (err) {
      toast(err.message, 'error');
      bar.remove();
    }
  });
  document.body.appendChild(bar);
}

// (sessionStorage puede no estar disponible: entonces el aviso simplemente vuelve a salir)
function sessionStorageGet(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k, v) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}

// Indicador arriba: sincronizando con Google, o si falló (lleva a Ajustes). También si falla
// lo compartido con otras personas.
function drawGoogle(g, c) {
  const el = document.getElementById('gsync');
  if (!el) return;
  const gOn = g?.connected && (g.state === 'syncing' || g.state === 'error');
  const cErr = g?.connected && c?.state === 'error';
  el.hidden = !gOn && !cErr;
  if (el.hidden) return;
  if (!gOn || (g.state !== 'error' && cErr)) {
    el.classList.add('err');
    el.textContent = '⚠ No se pudo sincronizar lo compartido';
    el.title = c.error || '';
    return;
  }
  el.classList.toggle('err', g.state === 'error');
  const p = g.progress;
  el.textContent = g.state === 'error' ? '⚠ No se pudo sincronizar con Google' : `☁ Sincronizando con Google${p?.total ? ` (${p.done + 1}/${p.total})` : '…'}`;
  el.title = g.state === 'error' ? g.error || '' : 'Sincronizando con tu Google Drive';
}

// Aviso de que la app está abierta a la vez en otro ordenador (con la misma carpeta).
function drawOthers(others) {
  let bar = document.getElementById('othersBar');
  if (!others.length) return bar?.remove();
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'othersBar';
    bar.className = 'others-bar';
    document.querySelector('.topbar').after(bar);
  }
  bar.textContent = `También está abierta en ${others.join(', ')}. Los cambios se ven en los dos en unos segundos; si cambiáis lo mismo a la vez, se queda el último.`;
}
