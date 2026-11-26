// Importar de Google Drive (botón «Google Drive…» de Bibliotecas): una ventana para recorrer tu
// Drive (Mi unidad y Compartido conmigo), marcar carpetas o archivos sueltos e importarlos en la
// carpeta elegida. Usa la misma sesión de Google de la app, con el permiso de ver tu Drive.
import { api } from './api.js';
import { esc, toast, emit, upsert, queueDownload, canDownload, state, sleep } from './store.js';
import { tr } from './i18n.js';

const isImage = (f) => /^image\//.test(f.mimeType || '') || /\.(jpe?g|png|gif|webp|heic|avif)$/i.test(f.name);

export function openDrivePicker(libraryId, libraryName = '') {
  const dlg = document.createElement('dialog');
  dlg.className = 'ask mega-pick';
  document.body.append(dlg);
  let dir = null;
  let busy = '';
  let waiting = false;
  const trail = []; // carpetas por las que has entrado (para «Atrás»)
  const picked = new Map(); // id -> { kind, name }

  const head = () => `<header class="mega-pick-head"><h3>${tr('Importar de Google Drive')}${libraryName ? ` <span class="hint">→ «${esc(libraryName)}»</span>` : ''}</h3>
    <button class="btn ghost small" data-gd="close" aria-label="${tr('Cerrar')}">✕</button></header>`;

  const draw = () => {
    const g = state.google || {};
    if (!g.connected) {
      dlg.innerHTML = `${head()}<p class="hint">${tr('Inicia sesión con tu cuenta de Google en Ajustes › Tu cuenta para poder importar de Drive.')}</p>
        <footer><button class="btn ghost" data-gd="close">${tr('Cerrar')}</button></footer>`;
      return;
    }
    if (!g.driveRead) {
      dlg.innerHTML = `${head()}<p class="hint">${tr('Para ver tus carpetas, la app necesita permiso para ver tu Google Drive. Se abrirá Google: marca la casilla de Drive y acepta.')}</p>
        <footer><button class="btn ghost" data-gd="close">${tr('Cancelar')}</button>
        <button class="btn primary" data-gd="connect" ${waiting ? 'disabled' : ''}>${waiting ? tr('Esperando el permiso en el navegador…') : tr('Conectar Google Drive')}</button></footer>`;
      return;
    }
    const crumbs = dir
      ? `<div class="mega-pick-path">${trail.length > 1 ? `<button class="btn ghost small" data-gd="back">← ${tr('Atrás')}</button>` : ''}<b>${esc(tr(dir.name))}</b></div>`
      : '';
    const shared = dir && !dir.id
      ? `<div class="mega-row"><span style="width:13px"></span><button class="mega-name" data-gd-go="shared">👥 ${tr('Compartido conmigo')}</button></div>`
      : '';
    const rows = !dir ? `<p class="hint">${tr('Cargando…')}</p>` : shared + [
      ...dir.folders.map((f) => `<div class="mega-row"><input type="checkbox" data-gd-pick="${esc(f.id)}" data-kind="folder" data-name="${esc(f.name)}" ${picked.has(f.id) ? 'checked' : ''} aria-label="${esc(f.name)}">
        <button class="mega-name" data-gd-go="${esc(f.id)}" title="${tr('Abrir carpeta')}">📁 ${esc(f.name)}</button>${f.libraries?.length ? `<span class="badge">${tr('importada')}</span>` : ''}</div>`),
      ...dir.files.map((f) => `<label class="mega-row"><input type="checkbox" data-gd-pick="${esc(f.id)}" data-kind="file" data-name="${esc(f.name)}" ${picked.has(f.id) ? 'checked' : ''}>
        <span class="mega-name">${isImage(f) ? '🖼️' : '🎬'} ${esc(f.name)}</span></label>`),
    ].join('') || `<p class="hint">${tr('Aquí no hay carpetas, videos ni fotos.')}</p>`;
    dlg.innerHTML = `${head()}${crumbs}<div class="mega-list">${rows}</div>
      <p class="hint">${tr('Marca carpetas (con todo lo que tienen dentro) o archivos sueltos. Una carpeta ya importada solo trae lo nuevo.')}</p>
      <footer><span class="hint">${esc(busy)}</span><button class="btn ghost" data-gd="close">${tr('Cancelar')}</button>
      <button class="btn primary" data-gd="import" ${picked.size && !busy ? '' : 'disabled'}>${tr('Importar')}${picked.size ? ` ${picked.size}` : ''}</button></footer>`;
  };

  const load = async (id) => {
    dir = null;
    draw();
    try {
      dir = await api.driveBrowse(id || null);
    } catch (err) {
      toast(err.message, 'error');
      dir = { id: id || null, name: id ? '' : 'Mi unidad', folders: [], files: [] };
    }
    if (!dlg.open) return;
    draw();
  };
  const go = (id) => {
    trail.push(id || null);
    return load(id);
  };

  const connect = async () => {
    globalThis.JR_WEB ? location.assign('api/google/login?drive=1') : window.open('/api/google/login?drive=1', '_blank');
    waiting = true;
    draw();
    for (let i = 0; i < 150 && dlg.open; i++) {
      await sleep(2000);
      const now = await api.google().catch(() => null);
      if (now?.driveRead) {
        state.google = { ...state.google, ...now };
        emit('google');
        waiting = false;
        toast(tr('Google Drive conectado'));
        return go(null);
      }
    }
    waiting = false;
    if (dlg.open) draw();
  };

  dlg.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.gdPick) return;
    if (t.checked) picked.set(t.dataset.gdPick, { kind: t.dataset.kind, name: t.dataset.name });
    else picked.delete(t.dataset.gdPick);
    draw();
  });
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close(); // clic fuera
    const goTo = e.target.closest('[data-gd-go]');
    if (goTo) return go(goTo.dataset.gdGo);
    const act = e.target.closest('[data-gd]')?.dataset.gd;
    if (act === 'close') return dlg.close();
    if (act === 'connect') return connect();
    if (act === 'back') {
      trail.pop();
      return load(trail[trail.length - 1]);
    }
    if (act !== 'import') return;
    const all = [...picked].map(([id, p]) => ({ id, ...p }));
    busy = tr('Importando…');
    draw();
    try {
      const r = await api.drivePick(all.filter((p) => p.kind === 'folder'), all.filter((p) => p.kind === 'file'), libraryId);
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
  api.google().then((g) => {
    state.google = { ...state.google, ...g };
    if (g.connected && g.driveRead) go(null);
    else draw();
  }).catch(() => draw());
}
