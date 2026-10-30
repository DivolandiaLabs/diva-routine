// Ajustes: sincronizar entre ordenadores. Lo recomendado: iniciar sesión con Google (los datos
// se guardan en tu Google Drive y se juntan los cambios de todos tus ordenadores). Otra forma:
// que todos usen la misma carpeta compartida (un disco de la red, OneDrive…). Y, para compartir
// con otras personas, configurar Firebase.
import { api } from './api.js';
import { esc, toast, sleep, ask } from './store.js';

export function renderSettings(root) {
  root.innerHTML = '<div class="settings"><p class="hint">Cargando…</p></div>';
  let info = null;
  let g = null; // estado de la cuenta de Google
  let upd = null; // versión de la app instalada y si hay otra nueva
  let changingClient = false;
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

  const timeOf = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '');

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
          <a class="btn primary g-login" href="/api/google/login">Iniciar sesión con Google</a>
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
        <div class="row wrap">
          <button class="btn" data-g="sync" ${g.state === 'syncing' ? 'disabled' : ''}>Sincronizar ahora</button>
          <button class="btn ghost danger" data-g="logout">Cerrar sesión</button>
        </div>
        <p class="hint">Se sincroniza sola unos segundos después de cada cambio y cada minuto. En otro ordenador: ${desk() ? 'instala la app' : 'copia la app (sin <code>data</code>) y ábrela'}, y pulsa <b>Iniciar sesión con Google</b> con esta misma cuenta.</p>`;
    }
    box.innerHTML = `
      <h3>Tu cuenta</h3>
      ${err}${body}`;
  };

  // ---------- compartir con otras personas (Firebase) ----------

  let c = null; // estado de lo compartido (con las reglas de Firestore)
  let changingFb = false;

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
      const line = !g.connected ? 'Inicia sesión con Google (arriba) para compartir.'
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

  const draw = () => {
    const s = info;
    root.innerHTML = `
      <div class="settings">
        <header class="lib-top"><nav class="crumbs"><h2>Ajustes</h2></nav></header>
        <section class="set-card" id="appCard" hidden></section>
        <section class="set-card" id="googleCard"></section>
        <section class="set-card" id="collabCard"></section>
        <details class="set-card set-fold">
          <summary><h3>Otra forma: una carpeta compartida</h3></summary>
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
          ${s.suggestions.length ? `<div class="row wrap set-sugs"><span class="hint">Encontradas:</span>${s.suggestions.map((g) => `<button class="btn small" data-dir="${esc(g.dir)}" title="${esc(g.dir)}">${esc(g.label)}</button>`).join('')}</div>` : ''}
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
          </details>
        </details>
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
        </section>
      </div>`;
  };

  const load = async () => {
    try {
      [info, g, c, upd] = await Promise.all([api.settings(), api.google(), api.collab(), api.update()]);
      draw();
      drawApp();
      drawGoogle();
      drawCollab();
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><h2>No se pudieron leer los ajustes</h2><p>${esc(e.message)}</p></div>`;
    }
  };
  load();

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
        try { localStorage.removeItem("jr-login-skip"); } catch {}
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
