// Ajustes: sincronizar entre ordenadores. Lo recomendado: iniciar sesión con Google (los datos
// se guardan en tu Google Drive y se juntan los cambios de todos tus ordenadores). Otra forma:
// que todos usen la misma carpeta compartida (un disco de la red, OneDrive…). Y, para compartir
// con otras personas, configurar Firebase.
// Se abre como una ventana emergente (como el menú de Configuración de Claude): un diálogo con
// un menú lateral de secciones, encima de lo que estuvieras viendo.
import { api } from './api.js';
import { mountMega } from './mega.js';
import { openNet, NET_INFO } from './redes.js';
import { CLOUDS, NET_ICON, SAVED_HINT, ICON_IG, spotifyCard } from './library.js';
import { esc, toast, sleep, ask, state, emit, modelPicker, styleTiles, chooseAi, ui, shelves, shelfName, libraryById, upsert, queueDownload, canDownload } from './store.js';
import { LANGS, lang, setLang, tr } from './i18n.js';

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// Atajos de teclado y ratón de toda la app, por apartados.
const KEYS = [
  ['Bibliotecas', [
    ['Alt + arrastrar', 'Copia el elemento en la carpeta o biblioteca donde lo sueltas, sin preguntar.'],
    ['Ctrl + arrastrar', 'Mueve el elemento a la carpeta o biblioteca donde lo sueltas, sin preguntar.'],
    ['Arrastrar', 'Al soltar en una carpeta o biblioteca, pregunta si mover o copiar.'],
    ['Esc', 'Cancela el arrastre.'],
    ['Ctrl + rueda', 'Cambia el tamaño de la vista.'],
    ['Doble clic en el nombre', 'Cambia el nombre de la carpeta o biblioteca.'],
  ]],
  ['Video', [
    ['Espacio', 'Reproduce o pausa.'],
    ['← →', 'Mueve 0,1 s (con Mayús, 1 s).'],
    ['I / O', 'Marcan el inicio y el fin del tramo.'],
  ]],
  ['Clase', [
    ['Espacio', 'Reproduce o pausa.'],
    ['← →', 'Elemento anterior o siguiente.'],
  ]],
  ['Textos que se editan encima', [
    ['Intro', 'Guarda.'],
    ['Esc', 'Deja lo que había.'],
  ]],
];
// Versión web: estas secciones se ven, pero necesitan el programa de Windows o la cuenta de Google (que llegará).
const WEB_OFF = {
  social: 'Conectar redes sociales y descargar sus vídeos',
  folder: 'Usar una carpeta compartida del ordenador',
};
const APP_URL = 'https://github.com/DivolandiaLabs/diva-routine/releases/latest';
const webNote = (what) => `<div class="web-note"><b>${esc(tr(what))}</b> ${esc(tr('aún no está disponible en la versión web.'))} <a href="${APP_URL}" target="_blank" rel="noopener">${esc(tr('Descargar la app de Windows'))}</a></div>`;

const keysPane = () => `<section class="set-card"><h3>Atajos de teclado</h3>
  ${KEYS.map(([group, rows]) => `<h4 class="keys-group">${group}</h4><dl class="keys">${rows.map(([k, what]) => `<dt>${k.split(' + ').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</dt><dd>${what}</dd>`).join('')}</dl>`).join('')}
</section>`;

const ICON = {
  app: svg('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  account: svg('<circle cx="12" cy="8" r="3.3"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  share: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  ai: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>'),
  language: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  models: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5L6 19"/>'),
  social: svg('<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>'),
  cloud: svg('<path d="M7 18h11.5a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.4-1.6A4.5 4.5 0 0 0 7 18z"/>'),
  sidebar: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  keys: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  theme: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  backup: svg('<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 10h16M10 14h4"/>'),
  about: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

// Deben coincidir con las variantes de Lemon Squeezy; url: el enlace de compra de cada una.
// La barra lateral: fija, oculta o que aparece al acercar el ratón al borde.
const OPTS_MODES = [['fixed', 'Mantener fija'], ['auto', 'Ocultar automáticamente'], ['hidden', 'Ocultar por completo']];
const optsMode = () => {
  try {
    return localStorage.getItem('jr-opts-mode') || 'fixed';
  } catch {
    return 'fixed';
  }
};
const applyOptsMode = (mode) => {
  document.documentElement.classList.toggle('opts-auto', mode === 'auto');
  document.documentElement.classList.toggle('opts-hidden', mode === 'hidden');
};
applyOptsMode(optsMode());

// Packs de pago único. Precios con IVA: dejan margen tras impuestos, comisión e imágenes.
// url: el enlace de compra de cada pack en Lemon Squeezy.
const CREDIT_PACKS = [{ credits: 100, price: 12, url: '' }, { credits: 200, price: 22, url: '' }, { credits: 500, price: 49, url: '' }, { credits: 1000, price: 89, url: '' }];

const PLANS = [
  { id: 'week', label: '1 semana', price: '9 € / semana', vignettes: 60, url: '' },
  { id: 'month', label: '1 mes', price: '19 € / mes', vignettes: 150, url: '' },
  { id: 'year', label: '1 año', price: '99 € / año', vignettes: 1200, url: '' },
];

// a, b y s: colores de la muestra (acento, fondo y superficie). Los mismos que en styles.css.
const THEMES = [
  { id: 'dark', label: 'Oscuro', hint: 'Cálido y oscuro', a: '#e0745a', b: '#1b1816', s: '#25211e' },
  { id: 'light', label: 'Claro', hint: 'Papel claro', a: '#c4553a', b: '#f6f1ea', s: '#ffffff' },
  { id: 'auto', label: 'Por defecto', hint: 'Sigue a Windows', split: true },
  { id: 'midnight', label: 'Medianoche', hint: 'Azul noche', a: '#6ea8ff', b: '#0b1220', s: '#131c2e' },
];

// Marco común (título + cerrar) para cualquier estado: cargando, error o ya con datos.
const shell = (inner) => `
  <div class="settings">
    <header class="lib-top set-modal-head">
      <nav class="crumbs"><h2>Ajustes</h2></nav>
      <button class="x" data-close-settings aria-label="Cerrar">✕</button>
    </header>
    ${inner}
  </div>`;

/** Abre Ajustes como ventana emergente encima de lo que se esté viendo. Devuelve el diálogo. */
export function openSettings(section = null) {
  document.getElementById('settingsDialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'settingsDialog';
  dlg.className = 'settings-dialog';
  document.body.appendChild(dlg);
  const teardown = mountSettings(dlg, section);
  dlg.addEventListener('close', () => {
    teardown();
    dlg.remove();
  }, { once: true });
  // Clic justo en el fondo (fuera de la tarjeta): como pulsar la X.
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  dlg.showModal();
  return dlg;
}

function mountSettings(root, section) {
  root.innerHTML = shell('<p class="hint">Cargando…</p>');
  let info = null;
  let g = null; // estado de la cuenta de Google
  let upd = null; // versión de la app instalada y si hay otra nueva
  let c = null; // estado de lo compartido (con las reglas de Firestore)
  let changingClient = false;
  let changingFb = false;
  let activeSection = section; // sección elegida en el menú lateral
  const desk = () => Boolean(upd?.desktop);

  // ---------- versión de la app (solo en la app instalada) ----------

  const drawApp = () => {
    const box = root.querySelector('#appCard');
    if (!box) return;
    box.hidden = !desk();
    if (box.hidden) return;
    const u = upd;
    const line = {
      checking: 'Mirando si hay una versión nueva…',
      downloading: `Descargando la versión ${esc(u.version || '')}… ${u.percent ? `${u.percent} %` : ''}`,
      ready: `La versión <b>${esc(u.version)}</b> está lista para instalar.`,
      none: u.noReleases ? 'Aún no hay versiones publicadas.' : `Tienes la última versión${u.checkedAt ? ` (mirado ${timeOf(u.checkedAt)})` : ''}.`,
      error: `<span class="err-text">No se pudo mirar: ${esc(u.error || '')}</span>`,
    }[u.state] || 'Se mira sola al abrir la app y cada pocas horas.';
    box.innerHTML = `
      <h3>Diva Routine ${esc(u.current)}</h3>
      <p>${u.state === 'checking' || u.state === 'downloading' ? '<span class="spin"></span> ' : ''}${line}</p>
      <div class="row wrap">
        ${u.state === 'ready'
          ? '<button class="btn primary" data-u="install">Actualizar ahora</button>'
          : `<button class="btn" data-u="check" ${['checking', 'downloading'].includes(u.state) ? 'disabled' : ''}>Buscar actualizaciones</button>`}
      </div>
      <p class="hint">Cuando hay una versión nueva, la app la descarga sola y te avisa (con una notificación de Windows y un aviso arriba). Al actualizar se cierra y se vuelve a abrir en unos segundos; tus datos no se tocan.</p>`;
  };

  // ---------- cuenta de Google ----------

  const timeOf = (iso) => (iso ? new Date(iso).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) : '');

  const drawGoogle = () => {
    const box = root.querySelector('#googleCard');
    if (!box || !g) return;
    const err = g.error ? `<p class="ig-msg error">${esc(g.error)}</p>` : '';
    let body;
    if (!g.configured || changingClient) {
      body = `
        <p><b>Primero, una sola vez:</b> crea tu identificador de Google. Es gratis y son unos 10 minutos (los nombres de los botones pueden variar un poco):</p>
        <ol class="set-steps">
          <li>Entra en <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> con tu cuenta y crea un proyecto llamado <b>Diva Routine</b>.</li>
          <li>Activa la <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> (botón <b>Habilitar</b>).</li>
          <li>Ve a <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a> → <b>Comenzar</b>: nombre de la app «Diva Routine», tu correo, público <b>Externo</b>, y acepta.</li>
          <li>En <b>Público</b>, pulsa <b>Publicar app</b> para que quede <b>En producción</b> (si no, Google te pediría volver a iniciar sesión cada 7 días).</li>
          <li>En <b>Clientes</b> → <b>Crear cliente</b>: tipo <b>App de escritorio</b>, nombre «Diva Routine» → <b>Crear</b> → <b>Descargar JSON</b>.</li>
          <li>Sube aquí ese archivo:</li>
        </ol>
        <div class="row wrap">
          <label class="btn primary">Subir el archivo de Google<input type="file" id="gFile" accept=".json,application/json" hidden></label>
          ${changingClient ? '<button class="btn ghost" data-g="cancel-client">Cancelar</button>' : ''}
        </div>
        <p class="hint">Ese archivo identifica a la app ante Google; no es tu contraseña. Se guarda junto a la app (google-client.json), así que al copiar la app a otro ordenador ya va incluido.</p>`;
    } else if (!g.connected) {
      body = `
        <div class="row wrap">
          <a class="btn primary g-login" href="api/google/login">Iniciar sesión con Google</a>
        </div>
        <p class="hint">Se abre Google: elige tu cuenta y da permiso a «Diva Routine» para guardar sus datos en tu Drive. Si aparece «Google no ha verificado esta app», pulsa <b>Configuración avanzada → Ir a Diva Routine</b>: es tu propia app.</p>`;
    } else {
      const p = g.progress;
      const line = g.state === 'syncing'
        ? `Sincronizando…${p?.total ? ` ${esc(p.what)} ${p.done + 1} de ${p.total}` : ''}`
        : g.state === 'error' ? 'No se pudo sincronizar (mira el mensaje).' : g.last ? `Todo sincronizado · ${timeOf(g.last)}` : 'Preparando…';
      body = `
        <dl class="set-list">
          <dt>Cuenta</dt><dd><b>${esc(g.email || 'Google')}</b></dd>
          <dt>Estado</dt><dd>${g.state === 'syncing' ? '<span class="spin"></span> ' : ''}${line}</dd>
        </dl>
        <div class="drive-space" id="driveSpace">${spaceHtml()}</div>
        <div class="row wrap">
          <button class="btn" data-g="sync" ${g.state === 'syncing' ? 'disabled' : ''}>Sincronizar ahora</button>
          <button class="btn ghost danger" data-g="logout">Cerrar sesión</button>
        </div>
        <p class="hint">Se sincroniza sola unos segundos después de cada cambio y cada minuto. En otro ordenador: ${desk() ? 'instala la app' : 'copia la app (sin <code>data</code>) y ábrela'}, y pulsa <b>Iniciar sesión con Google</b> con esta misma cuenta.</p>`;
    }
    box.innerHTML = `
      <h3>Tu cuenta</h3>
      ${err}${body}`;
    if (g.connected && Date.now() - spaceAt > 60_000) loadSpace();
  };

  // Espacio de Google Drive: se pide como mucho una vez por minuto.
  let space = null;
  let spaceAt = 0;
  const gb = (n) => tr(`${(n / 1024 ** 3).toLocaleString(lang, { maximumFractionDigits: 1 })} GB`);
  const mb = (n) => tr(`${Math.max(0.1, n / 1024 ** 2).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`);
  function spaceHtml() {
    if (!space) return '';
    const pct = space.limit ? Math.min(100, (space.usage / space.limit) * 100) : 0;
    return `<div class="space-head"><b>Espacio en Google Drive</b><span>${space.limit ? `${gb(space.usage)} / ${gb(space.limit)}` : gb(space.usage)}</span></div>
      ${space.limit ? `<div class="bar"><div style="width:${pct.toFixed(1)}%" class="${pct > 90 ? 'full' : ''}"></div></div>
      <p class="hint">Libres: ${gb(Math.max(0, space.limit - space.usage))}. Diva Routine ocupa ${mb(space.app)}. El espacio se comparte con Gmail y Google Fotos.</p>` : `<p class="hint">Espacio ilimitado. Diva Routine ocupa ${mb(space.app)}.</p>`}`;
  }
  async function loadSpace() {
    spaceAt = Date.now();
    try {
      space = await api.googleStorage();
    } catch {
      return; // sin conexión o sin permiso: no se muestra
    }
    const el = root.querySelector('#driveSpace');
    if (el) el.innerHTML = spaceHtml();
  }

  // ---------- compartir con otras personas (Firebase) ----------

  const drawCollab = () => {
    const box = root.querySelector('#collabCard');
    if (!box || !c || !g) return;
    // No se repinta mientras se está pegando la configuración.
    const typing = box.querySelector('#fbConfig');
    if (typing && (document.activeElement === typing || typing.value.trim())) return;
    let body;
    // Sin Firebase en la app (lo trae el instalador) no se muestra nada que configurar.
    box.hidden = !g.firebase;
    if (!g.firebase) return;
    {
      const mine = c.spaces.filter((s) => s.mine).length;
      const theirs = c.spaces.length - mine;
      const p = c.progress;
      const line = !g.connected ? 'Inicia sesión con Google (en «Tu cuenta») para compartir.'
        : c.state === 'syncing' ? `Sincronizando lo compartido…${p?.total ? ` ${esc(p.what)} ${p.done + 1} de ${p.total}` : ''}`
        : c.state === 'error' ? `<span class="err-text">No se pudo sincronizar: ${esc(c.error || '')}</span>`
        : c.last ? `Al día · ${timeOf(c.last)}` : 'Preparando…';
      body = `
        <dl class="set-list">
          <dt>Estado</dt><dd>${c.state === 'syncing' ? '<span class="spin"></span> ' : ''}${line}</dd>
          ${g.connected ? `<dt>Compartido</dt><dd>${mine} cosa${mine === 1 ? '' : 's'} tuya${mine === 1 ? '' : 's'} · ${theirs} que te comparten</dd>` : ''}
        </dl>
        <div class="row wrap">
          ${g.connected ? `<button class="btn" data-g="collab-sync" ${c.state === 'syncing' ? 'disabled' : ''}>Sincronizar ahora</button>` : ''}
        </div>
        <p class="hint">Para compartir: en la <b>Biblioteca</b>, entra en una carpeta y pulsa <b>Compartir</b> (podrán añadir cosas); en una rutina, <b>Editores</b>; en <b>Rutinas</b>, elige un dibujo y pulsa <b>Compartir</b>. Escribe el Gmail de cada persona.</p>
`;
    }
    const html = `
      <h3>Compartir con otras personas</h3>
      <p>Comparte carpetas (los demás pueden añadir videos y fotos), rutinas (con varios editores) y dibujos. Cada persona lo ve en su app al entrar con su Gmail.</p>
      ${body}`;
    // Si no cambió nada, no se repinta (así no se cierra lo que tengas desplegado).
    if (html === lastCollabHtml) return;
    lastCollabHtml = html;
    box.innerHTML = html;
  };
  let lastCollabHtml = '';

  const loadGoogle = async () => {
    try {
      [g, c, upd] = await Promise.all([api.google(), api.collab(), api.update()]);
      drawApp();
      drawGoogle();
      drawCollab();
    } catch {
      /* servidor reiniciándose */
    }
  };
  const poll = setInterval(() => !document.hidden && loadGoogle(), 2500);

  // ---------- carpeta compartida (otra forma de sincronizar, sin cuenta de Google) ----------

  const folderPane = () => {
    const s = info;
    return `
      <p>Sin cuenta de Google: todos los ordenadores usan <b>la misma carpeta de datos</b>, en un sitio compartido (un disco de la red de casa, o una carpeta de OneDrive, Google Drive o Dropbox instalados en cada ordenador).</p>
      ${s.error ? `<p class="ig-msg error">${esc(s.error)}</p>` : ''}
      <dl class="set-list">
        <dt>Este ordenador</dt><dd>${esc(s.host)}</dd>
        <dt>Carpeta de datos</dt><dd><code>${esc(s.dataDir)}</code> ${s.shared ? '<span class="badge b-auto">compartida</span>' : '<span class="badge">solo de este ordenador</span>'}</dd>
        ${s.sizeMB != null ? `<dt>Ocupa</dt><dd>${s.sizeMB} MB</dd>` : ''}
        ${s.shared ? `<dt>Abierta ahora en</dt><dd>${s.others.length ? esc(s.others.join(', ')) + ' y en este' : 'solo en este ordenador'}</dd>` : ''}
      </dl>
      <label class="field">Carpeta compartida
        <input id="dir" value="${esc(s.configured)}" placeholder="Por ejemplo: Z:\\Diva Routine" spellcheck="false"></label>
      ${s.suggestions.length ? `<div class="row wrap set-sugs"><span class="hint">Encontradas:</span>${s.suggestions.map((x) => `<button class="btn small" data-dir="${esc(x.dir)}" title="${esc(x.dir)}">${esc(x.label)}</button>`).join('')}</div>` : ''}
      <div class="row wrap">
        <button class="btn primary" data-act="use">Usar esta carpeta</button>
        ${s.shared ? '<button class="btn ghost" data-act="local">Volver a la carpeta de este ordenador</button>' : ''}
        <span class="hint" id="busy"></span>
      </div>
      <details class="set-help">
        <summary>Cómo se hace en el otro ordenador</summary>
        <ol>
          <li>${desk() ? 'Instala allí la app.' : 'Copia allí la carpeta de la app (sin la carpeta <code>data</code>, que no hace falta) e instala Node.js.'}</li>
          <li>Ábrela con <b>Iniciar Diva Routine</b> y ve a <b>Ajustes</b>.</li>
          <li>Pon la misma carpeta compartida (si es un disco de red, con la misma letra o con su ruta <code>\\\\equipo\\carpeta</code>) y pulsa <b>Usar esta carpeta</b>: como ya tiene datos, usará esos.</li>
          <li>Conecta allí también tu Instagram si quieres sincronizar colecciones (la sesión no se comparte).</li>
        </ol>
        <p>Puedes tener la app abierta en dos ordenadores, y cada uno ve los cambios del otro en unos segundos; pero si los dos cambian lo mismo a la vez, se queda el último. La app avisa arriba cuando está abierta en otro ordenador.</p>
      </details>`;
  };

  const aboutPane = () => `
    <section class="set-card about" id="aboutCard">
      <img class="about-logo" src="/logo.png" alt="">
      <div>
        <h3>Acerca de Diva Routine</h3>
        <p>Rutinas de baile a partir de tus videos: los movimientos dibujados con IA, tablas para imprimir y todo sincronizado con tu cuenta de Google.</p>
        <dl class="set-list">
          ${upd?.current ? `<dt>Versión</dt><dd>${esc(upd.current)}</dd>` : ''}
          <dt>Desarrollado por</dt><dd><b>Divolandia Labs</b> · Barcelona</dd>
          <dt>Web</dt><dd><a href="https://divolandialabs.github.io/" target="_blank" rel="noopener">divolandialabs.github.io</a></dd>
          <dt>Página de la app</dt><dd><a href="https://divolandialabs.github.io/diva-routine/" target="_blank" rel="noopener">divolandialabs.github.io/diva-routine</a></dd>
          <dt>Código</dt><dd><a href="https://github.com/DivolandiaLabs/diva-routine" target="_blank" rel="noopener">github.com/DivolandiaLabs/diva-routine</a></dd>
          <dt>Ayuda</dt><dd><a href="https://github.com/DivolandiaLabs/diva-routine/issues" target="_blank" rel="noopener">Cuéntanos un problema o una idea</a></dd>
        </dl>
        <p class="hint">© ${new Date().getFullYear()} Divolandia Labs. Todos los derechos reservados.</p>
      </div>
    </section>`;

  // ---------- Premium: las cuotas (aún sin cobro real) ----------

  const drawPremium = () => {
    const box = root.querySelector('#premiumCard');
    if (!box) return;
    const a = state.ai;
    const plan = PLANS.find((p) => p.id === a?.plan);
    const premium = Boolean(a?.premium);
    const special = premium && a.kind !== 'paid'; // cortesía o activado en el panel: no es una suscripción
    const usage = premium ? `
      <p>Has usado ${a.used} de ${a.limit} créditos en este periodo.</p>
      <div class="plan-meter"><i style="width:${Math.min(100, (a.used / (a.limit || 1)) * 100)}%"></i></div>` : '';
    const until = (ms) => new Date(ms).toLocaleDateString(lang, { dateStyle: 'long' });
    const daysLeft = a?.expires ? Math.max(0, Math.ceil((a.expires - Date.now()) / 864e5)) : null;
    const current = !premium ? '' : special ? `
      <aside class="plan-special">
        <span class="plan-special-tag">Licencia especial</span>
        <dl class="set-list">
          <dt>Tipo</dt><dd>${a.kind === 'comp' ? 'Licencia de cortesía' : 'Premium activado en tu cuenta'}</dd>
          <dt>Cuota</dt><dd>${a.days ? `${a.limit} créditos en ${a.days} días` : esc(plan?.label || '')}</dd>
          ${a.expires ? `<dt>Válido hasta</dt><dd>${esc(until(a.expires))}</dd>
          <dt>Tiempo restante</dt><dd>${daysLeft === 1 ? '1 día' : `${daysLeft} días`}</dd>` : ''}
          <dt>Créditos</dt><dd>Quedan ${Math.max(0, a.limit - a.used)} de ${a.limit}</dd>
        </dl>
        ${usage}
      </aside>` : `
      <section class="plan-now">
        <h4>Tu plan actual</h4>
        <p class="plan-now-name">${esc(plan?.label || '')}<span>${esc(plan?.price || '')}</span></p>
        ${usage}
        ${a.expires ? `<p class="hint">Válido hasta el ${esc(until(a.expires))}</p>` : ''}
      </section>`;
    const planCard = (p) => {
      const mine = premium && !special && p.id === a.plan;
      const label = premium && !special ? 'Cambiar a este plan' : 'Elegir';
      return `
          <article class="plan${mine ? ' current' : ''}">
            <h4>${esc(p.label)}</h4>
            <p class="plan-price">${esc(p.price)}</p>
            <p class="hint">${p.vignettes.toLocaleString(lang)} créditos</p>
            ${mine ? '<button class="btn" disabled>Tu plan</button>'
              : p.url && a?.available ? `<a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">${label}</a>`
              : '<button class="btn primary" disabled>Disponible pronto</button>'}
          </article>`;
    };
    box.innerHTML = `
      <h3>Diva Routine Premium</h3>
      <p>Genera las viñetas de tus rutinas con IA en la nube: eliges el estilo al crear las viñetas y la app hace el resto.</p>
      ${!premium && a?.licensed ? '<p class="hint warn">Tu suscripción ya no está activa. Renuévala para seguir usando la IA.</p>' : ''}
      ${current}
      ${premium ? `<h4 class="plans-title">${special ? 'Otras cuotas Premium' : 'Cambiar de plan'}</h4>` : ''}
      <div class="plans">${PLANS.map(planCard).join('')}</div>
      <h4 class="plans-title">Créditos sueltos</h4>
      ${a?.extra ? `<p class="hint">Tienes ${a.extra} créditos sueltos. No caducan y se gastan al acabarse la cuota.</p>` : ''}
      <div class="row credit-pack"><select id="creditPack" aria-label="Créditos sueltos">${CREDIT_PACKS.map((c) => `<option value="${c.credits}">${tr(`${c.credits.toLocaleString(lang)} créditos`)} · ${c.price} €</option>`).join('')}</select><button class="btn primary" data-premium="buy-pack" ${CREDIT_PACKS.some((c) => c.url) ? '' : 'disabled'}>${CREDIT_PACKS.some((c) => c.url) ? 'Comprar' : 'Disponible pronto'}</button></div>
      <div class="row credit-pack"><input id="packKey" autocomplete="off" spellcheck="false" placeholder="Pega aquí la clave de tu pack" aria-label="Clave del pack"><button class="btn" data-premium="redeem" ${premium ? '' : 'disabled'}>Canjear</button></div>
      ${!premium || special ? `
        <div class="row"><input id="licKey" autocomplete="off" spellcheck="false" placeholder="Pega aquí tu clave de licencia" aria-label="Clave de licencia"><button class="btn" data-premium="activate" ${a?.available ? '' : 'disabled'}>Activar</button></div>
        <p class="hint">Tras la compra recibirás la clave de licencia por correo.</p>` : ''}
      ${premium && a.licensed ? '<div class="row"><button class="btn" data-premium="deactivate">Desactivar en este ordenador</button></div>' : ''}`;
  };

  // ---------- temas ----------

  const drawTheme = () => {
    const box = root.querySelector('#themeCard');
    if (!box) return;
    const on = window.appTheme.get();
    box.innerHTML = `
      <h3>Temas</h3>
      <p>Elige cómo se ve la app. Se guarda en este ordenador.</p>
      <div class="themes">${THEMES.map((t) => `
        <button class="theme-tile${t.id === on ? ' on' : ''}" data-pick-theme="${t.id}" aria-pressed="${t.id === on}">
          <span class="theme-art${t.split ? ' split' : ''}" ${t.split ? '' : `style="--a:${t.a};--b:${t.b};--s:${t.s}"`}></span>
          <b>${esc(t.label)}</b><small>${esc(t.hint)}</small>
        </button>`).join('')}</div>`;
  };

  // ---------- idiomas ----------

  const drawLanguage = () => {
    const box = root.querySelector('#languageCard');
    if (!box) return;
    box.innerHTML = `
      <h3>Idiomas</h3>
      <p>Elige el idioma de la app.</p>
      <div class="themes">${LANGS.map(([code, name]) => `
        <button class="theme-tile lang-tile${code === lang ? ' on' : ''}" data-pick-lang="${code}" aria-pressed="${code === lang}" lang="${code}"><b>${esc(name)}</b></button>`).join('')}</div>`;
  };

  // ---------- backups: toda tu información en un archivo ----------

  const size = (n) => (n >= 1e9 ? `${(n / 1e9).toLocaleString(lang, { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

  const drawBackup = async () => {
    const box = root.querySelector('#backupCard');
    if (!box) return;
    const b = await api.backupInfo().catch(() => null);
    box.innerHTML = `
      <h3>Backups</h3>
      <p>Guarda toda tu información en un archivo de tu ordenador y recupérala cuando la necesites: bibliotecas, videos, rutinas y dibujos.</p>
      ${b ? `<p class="hint">Ahora mismo: ${b.videos.toLocaleString(lang)} videos y ${b.routines.toLocaleString(lang)} rutinas. El backup ocupará unos ${size(b.bytes)}.</p>` : ''}
      <div class="row wrap">
        <a class="btn primary" href="/api/backup" download>Exportar backup</a>
        <label class="btn" id="backupPick">Importar backup<input type="file" id="backupFile" accept=".tar" hidden></label>
      </div>
      <p class="hint" id="backupBusy" hidden><span class="spin"></span> Restaurando el backup. No cierres la app…</p>
      <p class="hint">Guarda el archivo fuera de este ordenador, por ejemplo en un disco externo. Importar sustituye lo que hay ahora; antes se aparta en la carpeta «antes-de-restaurar», por si necesitas volver atrás.</p>
      <p class="hint">Por seguridad, las sesiones de tus cuentas y la licencia Premium no se guardan en el backup: después de restaurar tendrás que volver a conectarlas.</p>`;
  };

  // ---------- menú lateral (como el de Configuración) ----------

  // «App» solo si es la app instalada (ahí es donde hay actualizaciones que buscar).
  const sections = () => [
    desk() && { id: 'app', label: 'App', icon: ICON.app, html: '<section class="set-card" id="appCard"></section>' },
    { id: 'account', label: 'Tu cuenta', icon: ICON.account, html: '<section class="set-card" id="googleCard"></section>' },
    { id: 'share', label: 'Compartir', icon: ICON.share, html: '<section class="set-card" id="collabCard"></section>' },
    { id: 'premium', label: 'Premium', icon: ICON.ai, html: '<section class="set-card" id="premiumCard"></section>' },
    { id: 'language', label: 'Idiomas', icon: ICON.language, html: '<section class="set-card" id="languageCard"></section>' },
    { id: 'models', label: 'Modelos IA', icon: ICON.models, html: `<section class="set-card">
      <h3>Modelos IA</h3>
      <p class="hint">Lo que usa la app por defecto al crear viñetas. Puedes cambiarlo también en cada dibujo.</p>
      <div class="set-models">
        <div class="field"><span>Dibujos</span>${modelPicker()}</div>
        <div class="field"><span>Cuadro de prompt</span>${modelPicker('promptModel')}</div>
      </div>
      ${styleTiles()}
    </section>` },
    { id: 'social', label: 'Redes sociales', icon: ICON.social, html: `<section class="set-card">
      <h3>Redes sociales</h3>
      <p class="hint">Instagram, YouTube, TikTok, Facebook y X: conecta tus cuentas e importa tus colecciones. Spotify: inicia sesión para oír las canciones enteras.</p>
      ${['instagram', 'youtube', 'tiktok', 'facebook', 'x'].map((net) => {
        const ig = net === 'instagram';
        const on = ig ? state.instagram?.connected : state.social?.[net]?.connected;
        const who = ig && state.instagram?.username ? ` como <b>@${esc(state.instagram.username)}</b>` : '';
        return `<section class="net-card" style="--net:${ig ? '#e1306c' : NET_INFO[net].color}">
          <h4>${ig ? ICON_IG : NET_ICON[net]}${ig ? 'Instagram' : esc(NET_INFO[net].name)}${on ? '<span class="badge b-auto">conectado</span>' : ''}</h4>
          <p class="hint">${on ? `Conectado${who}.` : SAVED_HINT[net]}</p>
          <button class="btn small ${on ? 'ghost' : 'primary'}" ${ig ? 'data-open-panel="instagram"' : `data-open-net="${net}"`}>${on ? 'Abrir' : 'Conectar cuenta'}</button>
        </section>`;
      }).join('')}
      ${spotifyCard()}
    </section>` },
    { id: 'cloud', label: 'Nube', icon: ICON.cloud, html: `<section class="set-card">
      <h3>Nube</h3>
      <p class="hint">Google Drive, Dropbox, OneDrive y MEGA: importa tus videos e imágenes desde tus servicios.</p>
      ${['gdrive', 'dropbox', 'onedrive', 'mega'].map((key) => {
        const on = key === 'gdrive' && state.google?.connected && state.google?.driveRead;
        return `<section class="net-card" style="--net:${CLOUDS[key].color}">
          <h4>${CLOUDS[key].icon}${CLOUDS[key].name}${on ? '<span class="badge b-auto">conectado</span>' : ''}</h4>
          ${key === 'gdrive'
            ? '<div id="gdriveBox"></div>'
            : key === 'mega' ? '<div data-mega-slot></div>'
            : `<p class="hint">Conectar la cuenta para sincronizar tus datos y usar su espacio llegará pronto.</p><button class="btn small" disabled>Conectar cuenta</button>`}
        </section>`;
      }).join('')}
    </section>` },
    { id: 'sidebar', label: 'Barra lateral', icon: ICON.sidebar, html: `<section class="set-card">
      <h3>Barra lateral</h3>
      <p class="hint">La barra de la derecha de Bibliotecas y Creador de rutinas.</p>
      <div class="set-radios">${OPTS_MODES.map(([k, label]) => `<label><input type="radio" name="optsMode" value="${k}" ${k === optsMode() ? 'checked' : ''}> ${label}</label>`).join('')}</div>
      <p class="hint">Si la ocultas por completo, sus botones (Subir, Mover, Borrar…) no estarán disponibles hasta que la vuelvas a mostrar.</p>
    </section>` },
    { id: 'keys', label: 'Atajos de teclado', icon: ICON.keys, html: keysPane() },
    { id: 'theme', label: 'Temas', icon: ICON.theme, html: '<section class="set-card" id="themeCard"></section>' },
    { id: 'backup', label: 'Backups', icon: ICON.backup, html: '<section class="set-card" id="backupCard"></section>' },
    { id: 'folder', label: 'Carpeta compartida', icon: ICON.folder, html: folderPane() },
    { id: 'about', label: 'Acerca de', icon: ICON.about, html: aboutPane() },
  ].filter(Boolean).map((x) => (globalThis.JR_WEB && WEB_OFF[x.id] ? { ...x, off: true, html: webNote(WEB_OFF[x.id]) + `<div class="web-off">${x.html}</div>` } : x));

  const draw = () => {
    const list = sections();
    if (!activeSection || !list.some((x) => x.id === activeSection)) activeSection = list[0].id;
    root.innerHTML = shell(`
      <div class="settings-shell">
        <nav class="settings-nav">
          ${list.map((x) => `<button class="set-nav-btn${x.id === activeSection ? ' active' : ''}" data-section="${x.id}">${x.icon}<span>${esc(x.label)}</span></button>`).join('')}
        </nav>
        <div class="settings-panes">
          ${list.map((x) => `<section class="set-pane${x.id === activeSection ? ' active' : ''}" data-pane="${x.id}">${x.html}</section>`).join('')}
        </div>
      </div>`);
  };

  // Google Drive dentro de Ajustes: conectar el permiso, ver tus carpetas e importarlas.
  let driveFolders = null; // null: sin pedir; [] o lista: ya pedidas
  const driveChecked = new Set();
  function drawDrive() {
    const box = root.querySelector('#gdriveBox');
    if (!box) return;
    const gs = state.google || g || {};
    if (!gs.connected) {
      box.innerHTML = '<p class="hint">Inicia sesión con tu cuenta de Google en <b>Tu cuenta</b> para conectar Drive.</p>';
      return;
    }
    if (!gs.driveRead) {
      box.innerHTML = `<p class="hint">Sin conectar</p><button class="btn small primary" data-drive="connect">Conectar cuenta</button>`;
      return;
    }
    const list = driveFolders === null
      ? '<button class="btn small" data-drive="list">Ver tus carpetas</button>'
      : !driveFolders.length ? '<p class="hint">No hay carpetas en tu Drive.</p>'
        : `<div class="drive-folders">${driveFolders.map((f) => `<label><input type="checkbox" data-drive-pick="${esc(f.id)}" ${driveChecked.has(f.id) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}</div>
          <div class="row wrap"><label class="inline">En <select id="driveTo">${shelves().map((l) => `<option value="${l.id}">${esc(shelfName(l))}</option>`).join('')}</select></label>
          <button class="btn small primary" data-drive="import" ${driveChecked.size ? '' : 'disabled'}>Importar ${driveChecked.size || ''}</button></div>
          <p class="hint" id="driveBusy"></p>`;
    box.innerHTML = `<p class="hint">Conectado.</p>${list}`;
  }

  root.addEventListener('change', (e) => {
    const id = e.target.dataset?.drivePick;
    if (!id) return;
    if (e.target.checked) driveChecked.add(id);
    else driveChecked.delete(id);
    drawDrive();
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-drive]')?.dataset.drive;
    if (!act) return;
    const btn = e.target.closest('button');
    try {
      if (act === 'connect') {
        globalThis.JR_WEB ? location.assign('api/google/login?drive=1') : window.open('/api/google/login?drive=1', '_blank');
        btn.disabled = true;
        btn.textContent = tr('Esperando el permiso en el navegador…');
        for (let i = 0; i < 150; i++) {
          await sleep(2000);
          const now = await api.google().catch(() => null);
          if (now?.driveRead) {
            g = now;
            state.google = { ...state.google, ...now };
            toast('Google Drive conectado');
            return drawDrive();
          }
        }
        drawDrive();
      } else if (act === 'list') {
        btn.disabled = true;
        driveFolders = (await api.driveFolders()).folders.map((f) => ({ id: f.id, name: f.name }));
        drawDrive();
      } else if (act === 'import') {
        btn.disabled = true;
        const shelf = libraryById(root.querySelector('#driveTo').value);
        const parentId = shelf?.root ? null : shelf?.id || null;
        const created = [];
        for (const f of driveFolders.filter((x) => driveChecked.has(x.id))) {
          root.querySelector('#driveBusy').textContent = tr(`Importando «${f.name}»…`);
          const r = await api.driveImport({ id: f.id, name: f.name }, parentId);
          upsert('libraries', r.library);
          r.created.forEach((v) => upsert('videos', v));
          created.push(...r.created);
          driveChecked.delete(f.id);
        }
        emit('data');
        queueDownload(created.filter(canDownload).map((v) => v.id));
        toast(tr(`${created.length} elemento${created.length === 1 ? '' : 's'} importado${created.length === 1 ? '' : 's'}`));
        drawDrive();
      }
    } catch (err) {
      toast(err.message, 'error');
      drawDrive();
    }
  });

  const load = async () => {
    try {
      [info, g, c, upd] = await Promise.all([api.settings(), api.google(), api.collab(), api.update()]);
      state.ai = await api.ai().catch(() => state.ai);
      emit('ai');
      draw();
      drawApp();
      drawGoogle();
      drawCollab();
      drawPremium();
      drawLanguage();
      drawTheme();
      drawBackup();
      drawDrive();
      const slot = root.querySelector('[data-mega-slot]');
      if (slot) mountMega(slot);
    } catch (e) {
      root.innerHTML = shell(`<div class="empty-state"><h2>No se pudieron leer los ajustes</h2><p>${esc(e.message)}</p></div>`);
    }
  };
  load();

  // Cerrar (la X) y cambiar de sección en el menú lateral.
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-settings]')) return root.close();
    const tile = e.target.closest('.style-tile');
    if (tile) {
      chooseAi(tile).then(() => root.querySelectorAll('.style-tile').forEach((b) => {
        b.classList.toggle('on', b === tile);
        b.setAttribute('aria-pressed', b === tile);
      }));
      return;
    }
    const net = e.target.closest('[data-open-net]')?.dataset.openNet;
    if (net) return openNet(net);
    const open = e.target.closest('[data-open-panel]')?.dataset.openPanel;
    if (open) {
      // Los paneles viven en Bibliotecas: se abre allí, también si ya estabas en ella.
      ui.openPanel = open;
      root.close();
      if (location.hash.startsWith('#/biblioteca')) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = '#/biblioteca';
      return;
    }
    const nav = e.target.closest('[data-section]');
    if (!nav) return;
    activeSection = nav.dataset.section;
    root.querySelectorAll('.set-nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.section === activeSection));
    root.querySelectorAll('.set-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === activeSection));
  });

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-premium]')?.dataset.premium;
    if (!act) return;
    try {
      if (act === 'buy-pack') {
        const pack = CREDIT_PACKS.find((c) => c.credits === +root.querySelector('#creditPack').value);
        if (pack?.url) window.open(pack.url, '_blank', 'noopener');
        return;
      }
      if (act === 'redeem') {
        state.ai = await api.aiCredits(root.querySelector('#packKey').value);
        emit('ai');
        toast('Créditos añadidos');
        return drawPremium();
      }
      if (act === 'activate') {
        state.ai = await api.aiActivate(root.querySelector('#licKey').value);
        emit('ai');
        toast('Premium activado');
      } else {
        if (!await ask('¿Desactivar Premium en este ordenador? Tu suscripción sigue activa y podrás volver a activarla con tu clave.')) return;
        state.ai = await api.aiDeactivate();
        emit('ai');
      }
      drawPremium();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.addEventListener('click', (e) => {
    const code = e.target.closest('[data-pick-lang]')?.dataset.pickLang;
    if (code && code !== lang) setLang(code);
  });

  root.addEventListener('click', (e) => {
    const id = e.target.closest('[data-pick-theme]')?.dataset.pickTheme;
    if (!id) return;
    window.appTheme.set(id);
    drawTheme();
  });

  root.addEventListener('change', (e) => {
    if (e.target.matches('select[data-ai-choice]')) chooseAi(e.target);
    if (e.target.name === 'optsMode') {
      applyOptsMode(e.target.value);
      try {
        localStorage.setItem('jr-opts-mode', e.target.value);
      } catch {
        /* solo esta vez */
      }
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'backupFile' || !e.target.files[0]) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (!await ask(`¿Restaurar «${file.name}»? Sustituirá todo lo que hay ahora en la app. Lo actual se aparta en la carpeta «antes-de-restaurar».`)) return;
    root.querySelector('#backupPick').hidden = true;
    root.querySelector('#backupBusy').hidden = false;
    try {
      await api.restoreBackup(file);
      location.reload();
    } catch (err) {
      toast(err.message, 'error');
      drawBackup();
    }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'gFile' || !e.target.files[0]) return;
    try {
      g = await api.googleClient(await e.target.files[0].text());
      changingClient = false;
      drawGoogle();
      toast('Identificador de Google guardado. Ahora inicia sesión.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-g]')?.dataset.g;
    if (!act) return;
    try {
      if (act === 'change-client' || act === 'cancel-client') {
        changingClient = act === 'change-client';
        drawGoogle();
      } else if (act === 'logout') {
        if (!await ask('¿Cerrar la sesión de Google en este ordenador? Tus datos se quedan aquí y en tu Drive; solo deja de sincronizar hasta que vuelvas a iniciar sesión.')) return;
        g = await api.googleLogout();
        try { localStorage.removeItem('jr-login-skip'); } catch { /* sin almacenamiento */ }
        return location.reload();
      } else if (act === 'sync') {
        g = { ...g, state: 'syncing' };
        drawGoogle();
        g = await api.googleSync();
        drawGoogle();
        if (g.state === 'idle') toast('Sincronizado');
      } else if (act === 'copy-rules') {
        const box = e.target.closest('.rules-box').querySelector('textarea');
        await navigator.clipboard.writeText(box.value).catch(() => (box.select(), document.execCommand('copy')));
        toast('Reglas copiadas: pégalas en Firestore → Reglas y pulsa Publicar');
      } else if (act === 'save-fb') {
        const text = root.querySelector('#fbConfig').value.trim();
        if (!text) return root.querySelector('#fbConfig').focus();
        g = await api.googleFirebase(text);
        changingFb = false;
        root.querySelector('#fbConfig').value = '';
        c = await api.collab();
        drawCollab();
        toast('Firebase configurado.' + (g.connected ? ' Ya puedes compartir.' : ' Ahora inicia sesión con Google.'));
      } else if (act === 'change-fb' || act === 'cancel-fb') {
        changingFb = act === 'change-fb';
        const typing = root.querySelector('#fbConfig');
        if (typing) typing.value = '';
        drawCollab();
      } else if (act === 'collab-sync') {
        c = { ...c, state: 'syncing' };
        drawCollab();
        c = { ...c, ...(await api.collabSync()) };
        drawCollab();
        if (c.state === 'idle') toast('Lo compartido está al día');
      }
    } catch (err) {
      toast(err.message, 'error');
      loadGoogle();
    }
  });

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-u]')?.dataset.u;
    if (!act) return;
    try {
      if (act === 'check') {
        upd = { ...upd, state: 'checking' };
        drawApp();
        upd = await api.checkUpdate();
        drawApp();
      } else if (act === 'install') {
        root.querySelector('#appCard').innerHTML = '<h3>Actualizando…</h3><p>La app se cerrará y se volverá a abrir sola en unos segundos.</p>';
        await api.installUpdate();
      }
    } catch (err) {
      toast(err.message, 'error');
      loadGoogle();
    }
  });

  // Tras cambiar de carpeta el servidor se reinicia: se espera a que vuelva y se recarga.
  async function waitRestart() {
    const busy = root.querySelector('#busy');
    await sleep(1500);
    for (let i = 0; i < 40; i++) {
      try {
        await api.version();
        location.hash = '#/biblioteca';
        return location.reload();
      } catch {
        if (busy) busy.textContent = 'Reiniciando la app…';
        await sleep(1000);
      }
    }
    if (busy) busy.textContent = 'La app no ha vuelto sola: cierra la ventana negra del servidor y ábrela otra vez con «Iniciar Diva Routine».';
  }

  async function change(dir) {
    const local = !dir;
    const msg = local
      ? 'Este ordenador volverá a usar su carpeta propia, con los datos que tenía antes de compartir (los cambios hechos en la compartida no estarán). ¿Seguir?'
      : `Se usará «${dir}».\n\n· Si esa carpeta ya tiene datos (de otro ordenador), se usarán esos; los de este ordenador se quedan donde están.\n· Si está vacía, se copiarán allí los de ahora (${info.sizeMB ?? '?'} MB, videos incluidos; puede tardar unos minutos).\n\nLa app se reiniciará. ¿Seguir?`;
    if (!await ask(msg)) return;
    root.querySelectorAll('button').forEach((b) => (b.disabled = true));
    root.querySelector('#busy').textContent = local ? 'Cambiando…' : 'Preparando la carpeta (si hay que copiar, puede tardar)…';
    try {
      const r = await api.setDataDir(dir);
      toast(r.adopted ? 'Esa carpeta ya tenía datos: se usan esos.' : local ? 'Vuelves a la carpeta de este ordenador.' : 'Datos copiados a la carpeta compartida.');
      waitRestart();
    } catch (e) {
      toast(e.message, 'error');
      root.querySelectorAll('button').forEach((b) => (b.disabled = false));
      root.querySelector('#busy').textContent = '';
    }
  }

  root.addEventListener('click', (e) => {
    const sug = e.target.closest('[data-dir]');
    if (sug) return (root.querySelector('#dir').value = sug.dataset.dir);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'use') {
      const dir = root.querySelector('#dir').value.trim();
      if (!dir) return toast('Escribe la carpeta compartida (o elige una de las encontradas)', 'error');
      change(dir);
    } else if (act === 'local') change('');
  });

  return () => clearInterval(poll);
}
