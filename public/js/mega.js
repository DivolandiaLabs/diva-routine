// Tu cuenta de MEGA.
// - Ajustes › Nube y panel Nube (mountMega): conectar con correo y contraseña (la contraseña no
//   se guarda), «Guardar también mis datos en MEGA» y desconectar.
// - Importar de Bibliotecas (openMegaPicker): una ventana con tus carpetas y archivos de MEGA
//   para marcar e importar en la carpeta elegida.
import { api } from './api.js';
import { esc, toast, emit, upsert, queueDownload, canDownload } from './store.js';
import { tr } from './i18n.js';

const loginForm = (mfa, busy) => `<p class="hint">Conecta tu cuenta de MEGA. Tu contraseña no se guarda.</p>
  <form class="mega-login" autocomplete="off">
    <input name="email" type="email" placeholder="Correo de MEGA" aria-label="Correo de MEGA" required>
    <input name="password" type="password" placeholder="Contraseña" aria-label="Contraseña" required>
    ${mfa ? '<input name="code" inputmode="numeric" placeholder="Código de verificación (6 cifras)" aria-label="Código de verificación" required>' : ''}
    <div class="row"><button class="btn small primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? esc(busy) : 'Conectar cuenta'}</button></div>
  </form>`;

/** Envía el formulario de entrar. Devuelve el estado nuevo, o null si falló ({ mfa } si pide código). */
async function submitLogin(form, ctx) {
  const email = form.email.value;
  const password = form.password.value;
  const code = form.code?.value;
  form.password.value = '';
  try {
    const info = await api.megaLogin(email, password, code);
    ctx.mfa = false;
    toast('MEGA conectado');
    return info;
  } catch (err) {
    if (/dos pasos/.test(err.message)) ctx.mfa = true;
    ctx.email = email;
    toast(err.message, 'error');
    return null;
  }
}

/** Tarjeta de MEGA en Ajustes / panel Nube: conectar, guardar datos, desconectar. */
export function mountMega(box) {
  let info = null;
  const ctx = { mfa: false, email: '' };
  let busy = '';

  const draw = () => {
    if (!info) return void (box.innerHTML = '<p class="hint">…</p>');
    if (!info.connected) {
      box.innerHTML = loginForm(ctx.mfa, busy);
      if (ctx.email) box.querySelector('[name=email]').value = ctx.email;
      return;
    }
    const keepNote = info.persistent ? '' : '<p class="hint">La sesión no se puede guardar cifrada aquí: al cerrar la app tendrás que volver a conectar.</p>';
    const syncState = info.sync
      ? `<p class="hint">${info.state === 'syncing' ? 'Sincronizando…' + (info.progress ? ` ${esc(info.progress.what)} ${info.progress.done}/${info.progress.total}` : '') : info.state === 'error' ? 'Error: ' + esc(info.error || '') : info.last ? 'Al día.' : ''}</p>`
      : '';
    box.innerHTML = `<p class="hint">Conectado${info.email ? ` como <b>${esc(info.email)}</b>` : ''}. Importa tus archivos de MEGA desde <b>Importar</b> en Bibliotecas.</p>${keepNote}
      <label class="inline"><input type="checkbox" data-mega-sync ${info.sync ? 'checked' : ''}> Guardar también mis datos en MEGA (carpeta «Diva Routine»)</label>
      ${syncState}
      <div class="row"><button class="btn small ghost danger" data-mega="logout">Desconectar</button></div>`;
  };

  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy = tr('Conectando…');
    draw();
    info = (await submitLogin(e.target, ctx)) || info;
    busy = '';
    draw();
  });
  box.addEventListener('change', async (e) => {
    if (!e.target.hasAttribute('data-mega-sync')) return;
    const on = e.target.checked;
    try {
      info = await api.megaSync(on);
      toast(on ? 'Tus datos se guardarán también en MEGA' : 'Ya no se guardan tus datos en MEGA');
    } catch (err) {
      toast(err.message, 'error');
      info = await api.mega().catch(() => info);
    }
    draw();
  });
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-mega]')?.dataset.mega !== 'logout') return;
    try {
      info = await api.megaLogout();
      toast('MEGA desconectado');
    } catch (err) {
      toast(err.message, 'error');
    }
    draw();
  });

  api.mega().then((i) => {
    info = i;
    draw();
  }).catch((err) => (box.innerHTML = `<p class="hint">${esc(err.message)}</p>`));
  draw();
}

/**
 * Ventana para elegir carpetas y archivos de tu MEGA e importarlos en `libraryId`.
 * `libraryName`: para el título. Termina cuando se cierra la ventana.
 */
export function openMegaPicker(libraryId, libraryName = '') {
  const dlg = document.createElement('dialog');
  dlg.className = 'ask mega-pick';
  document.body.append(dlg);
  const ctx = { mfa: false, email: '' };
  let connected = null;
  let dir = null;
  let busy = '';
  const picked = new Map(); // id -> { kind, name }

  const draw = () => {
    const head = `<header class="mega-pick-head"><h3>Importar de MEGA${libraryName ? ` <span class="hint">en «${esc(libraryName)}»</span>` : ''}</h3>
      <button class="btn ghost small" data-mp="close" aria-label="Cerrar">✕</button></header>`;
    if (connected === null) return void (dlg.innerHTML = `${head}<p class="hint">Cargando…</p>`);
    if (!connected) {
      dlg.innerHTML = head + loginForm(ctx.mfa, busy);
      if (ctx.email) dlg.querySelector('[name=email]').value = ctx.email;
      return;
    }
    const crumbs = dir
      ? `<div class="mega-pick-path">${dir.id ? `<button class="btn ghost small" data-mp-go="${esc(dir.parent || '')}">← Atrás</button>` : ''}<b>${esc(dir.name)}</b></div>`
      : '';
    const rows = !dir ? '<p class="hint">Cargando…</p>' : [
      ...dir.folders.map((f) => `<div class="mega-row"><input type="checkbox" data-mp-pick="${esc(f.id)}" data-kind="folder" data-name="${esc(f.name)}" ${picked.has(f.id) ? 'checked' : ''} aria-label="Elegir ${esc(f.name)}">
        <button class="mega-name" data-mp-go="${esc(f.id)}">📁 ${esc(f.name)}</button>${f.libraries?.length ? '<span class="badge">importada</span>' : ''}</div>`),
      ...dir.files.map((f) => `<label class="mega-row"><input type="checkbox" data-mp-pick="${esc(f.id)}" data-kind="file" data-name="${esc(f.name)}" ${picked.has(f.id) ? 'checked' : ''}>
        <span class="mega-name">${/\.(jpe?g|png|gif|webp|heic|avif)$/i.test(f.name) ? '🖼️' : '🎬'} ${esc(f.name)}</span></label>`),
    ].join('') || '<p class="hint">Aquí no hay carpetas, videos ni fotos.</p>';
    dlg.innerHTML = `${head}${crumbs}<div class="mega-list">${rows}</div>
      <p class="hint">Marca carpetas (con todo lo que tienen dentro) o archivos sueltos. Una carpeta ya importada solo trae lo nuevo.</p>
      <footer><span class="hint">${esc(busy)}</span><button class="btn ghost" data-mp="close">Cancelar</button>
      <button class="btn primary" data-mp="import" ${picked.size && !busy ? '' : 'disabled'}>Importar${picked.size ? ` ${picked.size}` : ''}</button></footer>`;
  };

  const go = async (id) => {
    dir = null;
    draw();
    try {
      dir = await api.megaBrowse(id || null);
    } catch (err) {
      toast(err.message, 'error');
      if (/conecta|caduc/i.test(err.message)) connected = false;
      dir = dir || { id: null, name: 'MEGA', parent: null, folders: [], files: [] };
    }
    draw();
  };

  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy = tr('Conectando…');
    draw();
    const info = await submitLogin(e.target, ctx);
    busy = '';
    if (info?.connected) {
      connected = true;
      return go(null);
    }
    draw();
  });
  dlg.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.mpPick) return;
    if (t.checked) picked.set(t.dataset.mpPick, { kind: t.dataset.kind, name: t.dataset.name });
    else picked.delete(t.dataset.mpPick);
    draw();
  });
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close(); // clic fuera
    const goTo = e.target.closest('[data-mp-go]');
    if (goTo) return go(goTo.dataset.mpGo);
    const act = e.target.closest('[data-mp]')?.dataset.mp;
    if (act === 'close') return dlg.close();
    if (act !== 'import') return;
    const all = [...picked].map(([id, p]) => ({ id, ...p }));
    busy = tr('Importando…');
    draw();
    try {
      const r = await api.megaImport(all.filter((p) => p.kind === 'folder'), all.filter((p) => p.kind === 'file'), libraryId);
      r.libraries.forEach((l) => upsert('libraries', l));
      r.created.forEach((v) => upsert('videos', v));
      emit('data');
      queueDownload(r.created.filter(canDownload).map((v) => v.id));
      toast(tr(`${r.created.length} elemento${r.created.length === 1 ? '' : 's'} importado${r.created.length === 1 ? '' : 's'}`));
      dlg.close();
    } catch (err) {
      busy = '';
      toast(err.message, 'error');
      draw();
    }
  });
  dlg.addEventListener('close', () => dlg.remove());

  draw();
  dlg.showModal();
  api.mega().then((i) => {
    connected = Boolean(i.connected);
    if (connected) go(null);
    else draw();
  }).catch((err) => {
    toast(err.message, 'error');
    dlg.close();
  });
}
