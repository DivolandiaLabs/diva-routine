// Biblioteca: cuadrícula de recuadros (carpetas, videos e imágenes) y, a la derecha, el menú de
// opciones (importar, subir, carpeta nueva, Instagram, seleccionar, rutina, mover, borrar).
// Cada opción abre su panel entre la cuadrícula y el menú.
import { api } from './api.js';
import {
  state, refresh, emit, esc, toast, upsert, libraryById, videoById, exerciseById, videosOf, exercisesOf, videoThumb, PLATFORM,
  jobs, queueDownload, isAnalyzing, canDownload, syncInstagram, linkedLibraries,
  selection, toggleSelected, selectedIndex, selectedVideos, extractSelection, ui, exerciseFigure, pinRoutines,
  removeVideos, removeLibraries, rootLibrary, folders, libraryLabel, needsExtraction, fmtTime,
  childFolders, folderPath, videosDeep, descendantIds, moveVideos, moveFolder,
  spaceFor, sharedFolderOf, addedByOther, who, sharedLabel,
} from './store.js';
import { openInstagram } from './instagram.js';
import { openNet, NET_INFO } from './redes.js';
import { openShare, SHARE_TAG } from './share.js';

const URL_RE = /^https?:\/\//i;

const sq = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.5"/>`;
const VIEW_ICON = {
  xl: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${sq(4, 4, 16)}</svg>`,
  l: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${sq(3, 3, 8) + sq(13, 3, 8) + sq(3, 13, 8) + sq(13, 13, 8)}</svg>`,
  m: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => sq(x, y, 4.5))).join('')}</svg>`,
  s: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${[3, 8, 13, 18].flatMap((y) => [3, 8, 13, 18].map((x) => `<rect x="${x}" y="${y}" width="3" height="3" rx="0.6"/>`)).join('')}</svg>`,
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><rect x="3" y="4.5" width="3" height="3" rx="0.6"/><rect x="3" y="10.5" width="3" height="3" rx="0.6"/><rect x="3" y="16.5" width="3" height="3" rx="0.6"/></svg>',
  details: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h18M3 10h18M3 15h18M3 20h18M10 3v19"/></svg>',
};

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/></svg>';
const FOLDER = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
const ICON = {
  import: svg('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1"/>'),
  upload: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  folder: svg(FOLDER),
  newFolder: svg(FOLDER + '<path d="M12 10.5v6M9 13.5h6"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/>'),
  selectAll: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  draw: svg('<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  routine: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  move: svg(FOLDER + '<path d="M9 13.5h6m-2-2 2 2-2 2"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  share: SHARE_TAG,
  social: svg('<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>'),
};
const NET_ICON = {
  youtube: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'),
  tiktok: svg('<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.3 4 5 4"/>'),
  facebook: svg('<path d="M14 8h3V4.5h-3a4 4 0 0 0-4 4V11H7.5v3.5H10V21h3.5v-6.5H17l.5-3.5h-4V9a1 1 0 0 1 1-1z"/>'),
};

export function renderLibrary(root, libraryId) {
  const lib0 = libraryById(libraryId);
  const folder = lib0 && !lib0.root ? lib0 : null; // null = la raíz
  const here = () => folder?.id || rootLibrary().id;
  const filters = { q: '' };
  // Vistas como en el explorador de archivos (se recuerda la elegida). Ctrl + rueda cambia de una a otra.
  const VIEWS = [
    ['xl', 'Iconos muy grandes'], ['l', 'Iconos grandes'], ['m', 'Iconos medianos'],
    ['s', 'Iconos pequeños'], ['list', 'Lista'], ['details', 'Detalles'],
  ];
  let view = 'm';
  try {
    const saved = localStorage.getItem('jr-view');
    if (VIEWS.some(([k]) => k === saved)) view = saved;
  } catch {
    /* sin almacenamiento: la de siempre */
  }
  // Opción abierta. Al volver de elegir el tramo de un video (por donde sea), sigue «Sacar dibujos».
  let panel = ui.returnToDraw ? 'draw' : ui.openPanel;
  ui.openPanel = null;
  ui.returnToDraw = null;
  let creating = null; // texto de avance mientras se sacan los dibujos
  const pasted = []; // imágenes pegadas en el cuadro de links: { file, url }

  root.innerHTML = `
    <div class="lib2">
      <section class="lib-main" id="main">
        <header class="lib-top">
          <nav class="crumbs">${folder
            ? `<a href="#/biblioteca" data-drop-lib="" title="Suelta aquí para sacar a la Biblioteca">Biblioteca</a><span>›</span>
               ${folderPath(folder).slice(0, -1).map((a) => `<a href="#/biblioteca/${a.id}" data-drop-lib="${a.id}" title="Suelta aquí para mover a «${esc(a.name)}»">${esc(a.name)}</a><span>›</span>`).join('')}
               <input id="libName" class="title-input" value="${esc(folder.name)}" aria-label="Nombre de la carpeta" title="Haz clic para cambiar el nombre">
               <button class="icon-btn" data-act="rename" title="Cambiar el nombre de la carpeta" aria-label="Cambiar el nombre">${PENCIL}</button>`
            : '<h2>Biblioteca</h2>'}</nav>
          <input id="q" type="search" placeholder="Buscar en todo…" aria-label="Buscar">
          <span class="count" id="count"></span>
          <div class="views" id="views" role="group" aria-label="Vista">${VIEWS.map(([k, label]) => `<button class="view-btn" data-view="${k}" title="${label} (Ctrl + rueda del ratón para cambiar)" aria-label="${label}">${VIEW_ICON[k]}</button>`).join('')}</div>
        </header>
        <div class="ig-callout" id="igTuto" hidden></div>
        <div class="ig-linked share-bar" id="shareBar" hidden></div>
        <div class="ig-linked" id="igLinked" hidden></div>
        <div class="tiles" id="grid"></div>
        <div class="drop-hint">Suelta aquí para importar${folder ? ` en «${esc(folder.name)}»` : ''}</div>
      </section>
      <aside class="panel" id="panel" hidden></aside>
      <nav class="opts" id="opts" aria-label="Opciones"></nav>
    </div>
    <input type="file" id="files" accept="video/*,image/*,.txt" multiple hidden>`;

  const $ = (s) => root.querySelector(s);

  // ---------- menú de opciones ----------

  // Carpeta que se compartiría: en la que estás, o la única seleccionada.
  const shareTarget = () => {
    if (folder) return folder.id;
    return selection.length === 1 && selection[0].type === 'library' ? selection[0].id : null;
  };

  const drawMenu = () => {
    const n = selection.length;
    const nVideos = selection.filter((s) => s.type === 'video').length;
    const target = shareTarget();
    const item = (key, label, { badge = 0, disabled = false, danger = false, ready = false, title = '', icon = '' } = {}) => `
      <button class="opt ${panel === key ? 'on' : ''} ${danger ? 'danger' : ''} ${ready ? 'ready' : ''}" data-menu="${key}" title="${esc(title || label)}" ${disabled ? 'disabled' : ''}>
        ${icon || ICON[key]}<span>${label}</span>${badge ? `<b class="order">${badge}</b>` : ''}
      </button>`;
    $('#opts').innerHTML = [
      item('import', 'Importar', { title: 'Pegar links o imágenes' }),
      item('upload', 'Subir', { title: 'Subir videos o fotos del ordenador' }),
      item('newFolder', 'Carpeta', { title: 'Carpeta nueva' }),
      item('instagram', 'Redes', { icon: ICON.social, title: 'Redes sociales: Instagram, YouTube, TikTok y Facebook' }),
      item('share', 'Compartir', {
        disabled: !target,
        title: target ? `Compartir «${libraryById(target)?.name}» con otras personas (pueden añadir cosas)` : 'Entra en una carpeta (o selecciona una) para compartirla con otras personas',
      }),
      '<span class="opt-sep"></span>',
      item('selectAll', 'Todo', { title: 'Seleccionar o quitar todo lo que se ve' }),
      item('draw', 'Dibujos', { badge: n, ready: n > 0 && panel !== 'draw', title: 'Sacar los dibujos de lo seleccionado (van a Rutinas)' }),
      item('move', 'Mover', { badge: nVideos, disabled: !nVideos, title: 'Mover los videos seleccionados a otra carpeta' }),
      item('trash', 'Borrar', { badge: n, disabled: !n, danger: true, title: 'Borrar lo seleccionado' }),
    ].join('');
  };

  // ---------- paneles ----------

  // Todas las carpetas, con su ruta (jszz › giros) y en orden de árbol.
  const libraryOptions = (selected) => [rootLibrary(), ...folders().sort((a, b) => libraryLabel(a).localeCompare(libraryLabel(b)))]
    .map((l) => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(libraryLabel(l))}</option>`).join('');

  const panelHead = (title) => `<header><h3>${title}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>`;

  // ---------- Redes sociales: lo guardado en cada cuenta ----------
  // savedCache[red] = { items } | { error } (sin leer: undefined). Lo marcado se recuerda al repintar.
  const savedOpen = new Set();
  const savedCache = {};
  const savedChecked = new Set();
  const SAVED_HINT = {
    instagram: 'Tus colecciones de Guardados, también las privadas.',
    youtube: 'Tus listas, «Ver más tarde» y «Me gusta».',
    tiktok: 'Tus colecciones y perfiles.',
    facebook: 'Tus videos guardados.',
  };
  const isImported = (key, id) => state.libraries.some((l) => (key === 'instagram' ? l.igCollections?.some((c) => c.id === id) : l.lists?.some((x) => x.url === id)));

  const savedBody = (key) => {
    if (key === 'tiktok' || key === 'facebook') {
      // Estas redes no dejan leer la lista de lo guardado: se pega el link.
      return `<p class="hint">${key === 'tiktok' ? 'TikTok no deja ver tus guardados desde fuera: pega el link de una colección o de un perfil.' : 'Facebook no deja ver tus guardados desde fuera: pega el link de cada video.'}</p>
        <div class="row ig-add"><input id="savedUrl-${key}" placeholder="Pega el link" aria-label="Link de ${NET_INFO[key].name}"><button class="btn small primary" data-saved-url="${key}">Importar</button></div>`;
    }
    const c = savedCache[key];
    if (!c || c.loading) return `<div class="saved-progress" data-progress="${key}"><div class="bar"><i style="width:${savedPct(key)}%"></i></div><span class="hint">Leyendo tus guardados… <b>${savedSecs(key)} s</b></span></div>`;
    if (c.error) return `<p class="ig-msg error">${esc(c.error)}</p><button class="btn small" data-saved-retry="${key}">Reintentar</button>`;
    if (!c.items.length) return '<p class="hint">No hay nada guardado.</p>';
    const n = c.items.filter((it) => savedChecked.has(`${key}|${it.id}`)).length;
    return `<ul class="saved-list">${c.items.map((it) => `
        <li><label><input type="checkbox" data-saved-check="${esc(`${key}|${it.id}`)}" ${savedChecked.has(`${key}|${it.id}`) ? 'checked' : ''}>
          <span class="saved-name">${esc(it.name)}</span>${it.count != null ? `<span class="hint">${it.count}</span>` : ''}${isImported(key, it.id) ? '<span class="badge">importada</span>' : ''}</label></li>`).join('')}</ul>
      <div class="row wrap"><button class="btn small primary" data-saved-import="${key}" ${n ? '' : 'disabled'}>Importar${n ? ` (${n})` : ''}</button><span class="hint" id="savedBusy-${key}"></span></div>
      <p class="hint">Cada una va a su carpeta; si ya está importada, trae solo lo nuevo.</p>`;
  };

  // Barra de progreso al leer: no se sabe cuánto hay, así que avanza con el tiempo (cada vez más
  // despacio, sin llegar al final) y se completa cuando llega la respuesta.
  const savedStart = {};
  const savedSecs = (key) => Math.floor((Date.now() - (savedStart[key] || Date.now())) / 1000);
  const savedPct = (key) => Math.round(92 * (1 - Math.exp(-(Date.now() - (savedStart[key] || Date.now())) / 6000)));
  let progressTimer = null;
  const tickProgress = () => {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      const bars = root.querySelectorAll('[data-progress]');
      if (!bars.length) return clearInterval(progressTimer);
      bars.forEach((el) => {
        const key = el.dataset.progress;
        el.querySelector('.bar i').style.width = savedPct(key) + '%';
        el.querySelector('b').textContent = savedSecs(key) + ' s';
      });
    }, 250);
  };

  const loadSaved = async (key) => {
    if (key === 'tiktok' || key === 'facebook' || savedCache[key]?.loading) return;
    savedStart[key] = Date.now();
    savedCache[key] = { loading: true };
    if (panel === 'instagram') drawPanel();
    tickProgress();
    try {
      if (key === 'instagram') {
        const { collections } = await api.igCollections();
        savedCache[key] = { items: collections.map((c) => ({ id: c.id, name: c.name, count: c.count ?? null })) };
      } else {
        const { lists } = await api.youtubeLists();
        savedCache[key] = { items: lists.map((l) => ({ id: l.url, name: l.name, count: null })) };
      }
    } catch (e) {
      savedCache[key] = { error: e.message };
    }
    if (panel === 'instagram') drawPanel();
  };

  const finishImport = async (created, libs) => {
    await refresh();
    emit('data');
    queueDownload(created.filter(canDownload).map((v) => v.id));
    toast(created.length ? `${created.length} video(s) importado(s). Se descargan solos.` : 'No había nada nuevo.');
    if (libs.size === 1) location.hash = `#/biblioteca/${[...libs][0]}`;
  };

  const importSaved = async (key, btn) => {
    const items = savedCache[key].items.filter((it) => savedChecked.has(`${key}|${it.id}`));
    btn.disabled = true;
    const created = [];
    const libs = new Set();
    try {
      for (const [i, it] of items.entries()) {
        $(`#savedBusy-${key}`).textContent = `Importando «${it.name}» (${i + 1} de ${items.length})…`;
        const r = key === 'instagram' ? await api.igImport({ id: it.id, name: it.name }, null) : await api.importList(it.id, it.name);
        upsert('libraries', r.library);
        r.created.forEach((v) => upsert('videos', v));
        created.push(...r.created);
        libs.add(r.library.id);
        savedChecked.delete(`${key}|${it.id}`);
      }
    } catch (e) {
      toast(e.message, 'error');
    }
    await finishImport(created, libs);
  };

  const importSavedUrl = async (key, btn) => {
    const input = $(`#savedUrl-${key}`);
    const url = input.value.trim();
    if (!URL_RE.test(url)) return input.focus();
    btn.disabled = true;
    try {
      if (key === 'facebook') {
        const r = await api.addLinks([url], here());
        const made = r.created || [];
        made.forEach((v) => upsert('videos', v));
        await finishImport(made, new Set());
      } else {
        const r = await api.importList(url, null);
        upsert('libraries', r.library);
        r.created.forEach((v) => upsert('videos', v));
        await finishImport(r.created, new Set([r.library.id]));
      }
    } catch (e) {
      btn.disabled = false;
      toast(e.message, 'error');
    }
  };

  const PANELS = {
    import: () => `
      ${panelHead('Importar')}
      <textarea id="links" rows="6" placeholder="Pega aquí links de YouTube o Instagram, una lista de reproducción, una colección de tus Guardados… o una imagen (clic derecho → Pegar, o Ctrl+V)"></textarea>
      <div class="paste-thumbs" id="pasteThumbs"></div>
      <label class="field">Importar en<select id="target">${libraryOptions(here())}</select></label>
      <div class="row wrap">
        <button class="btn primary" data-act="import">Importar</button>
        <button class="btn" data-act="upload">Subir archivos…</button>
      </div>
      <p class="hint">También puedes arrastrar a la cuadrícula videos, fotos o un .txt con links.${state.ytdlp ? '' : ' Para descargar de YouTube instala <code>yt-dlp</code>.'}</p>`,

    newFolder: () => `
      ${panelHead(folder ? 'Subcarpeta nueva' : 'Carpeta nueva')}
      ${folder ? `<p class="hint">Se crea dentro de «${esc(folder.name)}». Luego arrastra ahí los videos que quieras.</p>` : ''}
      <input id="newLib" placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta">
      <div class="row"><button class="btn primary" data-act="new-lib">Crear carpeta</button></div>`,

    // Redes sociales: sin conectar, un solo botón «Conectar cuenta» (abre el tutorial); conectada,
    // un desplegable con lo que tienes guardado en esa red para marcarlo e importarlo.
    instagram: () => {
      const linked = linkedLibraries();
      const card = (key) => {
        const ig = key === 'instagram';
        const n = ig ? { name: 'Instagram', color: '#e1306c' } : NET_INFO[key];
        const on = ig ? state.instagram.connected : state.social?.[key]?.connected;
        const expired = ig && state.instagram.expired;
        const who = ig && state.instagram.username ? ` como <b>@${esc(state.instagram.username)}</b>` : '';
        const body = on
          ? `<p class="hint">Conectado${who}.</p>
             <details class="net-saved" data-saved="${key}" ${savedOpen.has(key) ? 'open' : ''}>
               <summary>Tus guardados</summary>
               <div class="saved-body">${savedBody(key)}</div>
             </details>
             <button class="btn small ghost danger net-off" data-net-off="${key}">Desconectar</button>`
          : `<p class="hint">${expired ? 'La sesión caducó: vuelve a conectarla.' : SAVED_HINT[key]}</p>
             <div class="row"><button class="btn primary small" data-net-connect="${key}">${expired ? 'Volver a conectar' : 'Conectar cuenta'}</button></div>`;
        return `<section class="net-card" style="--net:${n.color}">
          <h4>${ig ? ICON.instagram : NET_ICON[key]}${n.name}${on ? '<span class="badge b-auto">conectado</span>' : ''}</h4>${body}</section>`;
      };
      return `${panelHead('Redes sociales')}
        ${['instagram', 'youtube', 'tiktok', 'facebook'].map(card).join('')}
        ${linked.length ? `<h4 class="sh-sub">Carpetas enlazadas</h4>
          <ul class="panel-list">${linked.map((l) => `<li><a href="#/biblioteca/${l.id}">${esc(libraryLabel(l))}</a> <span class="hint">← ${[...(l.igCollections || []).map((c) => c.name), ...(l.lists || []).map((x) => x.name)].map((x) => `«${esc(x)}»`).join(', ')}</span></li>`).join('')}</ul>
          <div class="row"><button class="btn small" data-act="ig-sync-all">Sincronizar todo</button></div>` : ''}`;
    },

    draw: () => {
      const videos = selectedVideos();
      const pending = videos.filter(needsExtraction).length;
      // De cada video: de dónde saldrán los dibujos, y el enlace para elegir su tramo.
      const source = (v) => {
        if (v.source.mediaType === 'image') return 'Foto';
        if (!v.source.file) return 'Sin descargar: no se incluirá';
        const exs = exercisesOf(v.id);
        const manual = exs.filter((e) => e.mode === 'manual');
        if (manual.length) return `Tramo${manual.length === 1 ? '' : 's'} ${manual.map((e) => `${fmtTime(e.start)}–${fmtTime(e.end)}`).join(', ')}`;
        if (exs.length) return `${exs.length} ejercicio(s) ya sacados`;
        return 'Todo el video (la IA lo separa)';
      };
      return `${panelHead('Sacar dibujos')}
        ${selection.length
          ? `<p><b>${selection.length}</b> seleccionado(s) · ${videos.length} video(s) o foto(s).</p>
             <ol class="rp-list">${videos.map((v) => `
               <li><span class="rp-t">${esc(v.title)}</span><span class="rp-s">${esc(source(v))}</span>${v.source.mediaType === 'video' && v.source.file ? `<a href="#/video/${v.id}" data-pick-seg="${v.id}">Elegir tramo</a>` : ''}</li>`).join('')}</ol>
             <p class="hint">${pending ? `Al pulsar el botón se sacan los dibujos de ${pending === videos.length ? 'todo' : `${pending} de ellos`} (puede tardar un poco).` : 'Todo lo seleccionado ya tiene sus dibujos.'} Los verás en <b>Rutinas</b>, ya seleccionados, para montar la rutina.</p>`
          : '<p class="hint">Marca en su casilla las carpetas, videos o imágenes de los que quieres sacar los dibujos. Si quieres, elige el tramo exacto de cada video. Los dibujos van al apartado <b>Rutinas</b>, donde se eligen para montar las rutinas.</p>'}
        <div class="row wrap">${creating
          ? `<button class="btn primary" data-act="extract" disabled>${esc(creating)}</button>`
          : `<button class="btn primary" data-act="extract" ${selection.length ? '' : 'disabled'}>${selection.length && !pending ? 'Ver sus dibujos' : 'Sacar dibujos'}</button>
             ${selection.length ? '<button class="btn ghost" data-act="clear-sel">Quitar selección</button>' : ''}`}
        </div>`;
    },

    move: () => {
      const n = selection.filter((s) => s.type === 'video').length;
      return `${panelHead('Mover')}
        <p>${n} video(s) o imagen(es) seleccionado(s).${selection.some((s) => s.type === 'library') ? ' Las carpetas seleccionadas no se mueven.' : ''}</p>
        <label class="field">A la carpeta<select id="moveTo">${libraryOptions(here())}</select></label>
        <div class="row"><button class="btn primary" data-act="move" ${n ? '' : 'disabled'}>Mover</button></div>`;
    },
  };

  const drawPanel = () => {
    const box = $('#panel');
    box.hidden = !PANELS[panel];
    if (box.hidden) return drawMenu();
    // Al repintar se conserva lo que ya estaba escrito o elegido.
    const keep = {};
    box.querySelectorAll('input, select, textarea').forEach((el) => el.id && (keep[el.id] = el.value));
    box.innerHTML = PANELS[panel]();
    for (const [id, value] of Object.entries(keep)) {
      const el = box.querySelector('#' + id);
      if (el && [...(el.options || [{ value }])].some((o) => o.value === value)) el.value = value;
    }
    if (panel === 'import') drawPasted();
    box.querySelectorAll('details.net-saved').forEach((d) => {
      const key = d.dataset.saved;
      d.addEventListener('toggle', () => {
        if (!d.open) return savedOpen.delete(key);
        savedOpen.add(key);
        if (!savedCache[key]) loadSaved(key);
      });
      if (d.open && !savedCache[key]) loadSaved(key);
      if (savedCache[key]?.loading) tickProgress();
    });
    drawMenu();
  };

  const openPanel = (key) => {
    panel = panel === key ? null : key;
    drawPanel();
    if (panel) $('#panel').querySelector('textarea, input:not([type="checkbox"])')?.focus();
  };

  // ---------- recuadros ----------

  const videoText = (v) => [v.title, v.source.url, ...exercisesOf(v.id).flatMap((e) => [e.title, e.category, ...(e.technique?.tags || [])])].join(' ').toLowerCase();

  const visible = () => {
    const q = filters.q.trim().toLowerCase();
    if (q) return { libs: folders().filter((l) => l.name.toLowerCase().includes(q)), vids: state.videos.filter((v) => videoText(v).includes(q)) };
    return { libs: childFolders(folder?.id || null), vids: videosOf(here()) };
  };

  const statusHtml = (v) => {
    if (jobs.analyzing?.id === v.id) return `<span class="badge b-busy">Analizando ${Math.round(jobs.analyzing.p * 100)}%</span>`;
    if (isAnalyzing(v.id)) return '<span class="badge b-busy">En cola</span>';
    if (jobs.downloading === v.id) return '<span class="badge b-busy">Descargando…</span>';
    if (jobs.downloads.includes(v.id)) return '<span class="badge b-busy">Por descargar</span>';
    if (v.source.mediaType === 'image') return '<span class="badge b-kind">Foto</span>';
    if (v.source.file) return '<span class="badge b-kind">Video</span>';
    if (v.source.fetchError) return `<span class="badge b-error" title="${esc(v.source.fetchError)}">No se pudo descargar</span>`;
    return '<span class="badge b-link">Sin descargar</span>';
  };

  // En una carpeta que te compartieron, lo que añadió otra persona solo lo quita ella o el dueño.
  const lockedIn = (r, libId) => {
    const sp = sharedFolderOf(libId);
    return Boolean(sp && !sp.mine && addedByOther(r));
  };
  const byTag = (r) => (addedByOther(r) ? `<span class="by" title="Lo añadió ${esc(r.addedBy)}">de ${esc(who(r.addedBy))}</span>` : '');

  const folderTile = (l) => {
    const vids = videosOf(l.id);
    const subs = childFolders(l.id).length;
    const shown = (vids.length ? vids : videosDeep(l.id)).slice(0, 4);
    const sp = spaceFor('folder', l.id);
    const received = sp && !sp.mine;
    return `
      <article class="tile tile-folder" data-kind="library" data-id="${l.id}" data-drop-lib="${l.id}" draggable="true" title="Arrastra aquí videos para meterlos en «${esc(l.name)}»">
        <label class="sel" title="Seleccionar toda la carpeta para una rutina"><input type="checkbox" data-sel-lib="${l.id}"><b class="order"></b></label>
        ${lockedIn(l, l.parentId) ? '' : `<button class="card-del" data-del-lib="${l.id}" title="${received ? 'Salir de esta carpeta compartida' : 'Borrar la carpeta y todo lo que tiene'}" aria-label="${received ? 'Salir de' : 'Borrar'} la carpeta ${esc(l.name)}">✕</button>`}
        <a class="tile-thumb" href="#/biblioteca/${l.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((v) => `<span>${videoThumb(v)}</span>`).join('')}</span>`
          : `<span class="folder-empty">${ICON.folder}</span>`}</a>
        <a class="tile-body" href="#/biblioteca/${l.id}">
          <h3>${ICON.folder}<span class="name-edit" data-name="library:${l.id}" title="Haz clic para cambiar el nombre">${esc(l.name)}</span></h3>
          <div class="meta">${subs ? `<span>${subs} carpeta${subs === 1 ? '' : 's'}</span>` : ''}<span>${vids.length} elemento${vids.length === 1 ? '' : 's'}</span>${l.igCollections?.length ? '<i class="ig-tag" title="Sincronizada con Instagram">IG</i>' : ''}${sp && (sp.members.length > 1 || !sp.mine) ? `<i class="share-tag" title="Carpeta colaborativa · ${esc(sharedLabel(sp))}">${SHARE_TAG}${sp.members.length}</i>` : byTag(l)}</div>
        </a>
      </article>`;
  };

  const videoTile = (v, showFolder) => `
    <article class="tile tile-${v.source.mediaType === 'image' ? 'image' : 'video'}" data-kind="video" data-id="${v.id}" draggable="true">
      <label class="sel" title="Seleccionar para una rutina"><input type="checkbox" data-sel-video="${v.id}"><b class="order"></b></label>
      ${lockedIn(v, v.libraryId) ? '' : `<button class="card-del" data-del-video="${v.id}" title="Borrar" aria-label="Borrar ${esc(v.title)}">✕</button>`}
      <a class="tile-thumb" href="#/video/${v.id}">${videoThumb(v)}</a>
      <a class="tile-body" href="#/video/${v.id}">
        <h3><span class="name-edit" data-name="video:${v.id}" title="Haz clic para cambiar el nombre">${esc(v.title)}</span></h3>
        <div class="meta"><span class="vstatus">${statusHtml(v)}</span><span>${esc(PLATFORM[v.source.platform] || '')}</span>${byTag(v)}${showFolder ? `<span>${esc(libraryLabel(libraryById(v.libraryId)))}</span>` : ''}</div>
      </a>
    </article>`;

  // Rutina añadida a la página principal: se abre con un clic; la ✕ solo la quita de aquí.
  const routineTile = (r) => {
    const exs = r.items.map((it) => exerciseById(it.exerciseId)).filter(Boolean);
    const shown = exs.slice(0, 4);
    return `
      <article class="tile tile-routine" data-kind="routine" data-id="${r.id}">
        <button class="card-del" data-unpin="${r.id}" title="Quitar de la página principal (la rutina no se borra)" aria-label="Quitar ${esc(r.name)} de la página principal">✕</button>
        <a class="tile-thumb" href="#/rutina/${r.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((e) => `<span>${exerciseFigure(e, 120)}</span>`).join('')}</span>`
          : '<span class="folder-empty">Vacía</span>'}</a>
        <a class="tile-body" href="#/rutina/${r.id}">
          <h3>${ICON.routine}<span class="name-edit" data-name="routine:${r.id}" title="Haz clic para cambiar el nombre">${esc(r.name)}</span></h3>
          <div class="meta"><span class="badge b-routine">Rutina</span><span>${exs.length} ejercicio${exs.length === 1 ? '' : 's'}</span></div>
        </a>
      </article>`;
  };

  const setView = (v) => {
    view = v;
    try {
      localStorage.setItem('jr-view', v);
    } catch {
      /* solo esta vez */
    }
    $('#grid').className = `tiles view-${v}`;
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  };

  const drawGrid = () => {
    setView(view);
    const { libs, vids } = visible();
    const searching = Boolean(filters.q.trim());
    const pinned = !folder && !searching ? state.routines.filter((r) => r.pinned) : [];
    $('#count').textContent = `${libs.length ? `${libs.length} carpeta${libs.length === 1 ? '' : 's'} · ` : ''}${vids.length} elemento${vids.length === 1 ? '' : 's'}`;
    $('#grid').innerHTML = pinned.length || libs.length || vids.length
      ? pinned.map(routineTile).join('') + libs.map(folderTile).join('') + vids.map((v) => videoTile(v, searching)).join('')
      : `<div class="empty-state"><h2>${searching ? 'Nada por aquí' : folder ? 'Carpeta vacía' : 'Tu biblioteca está vacía'}</h2>
          <p>Usa <b>Importar</b> en el menú de la derecha para pegar links o imágenes, o arrastra aquí videos y fotos.</p></div>`;
    drawSelection();
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setView(b.dataset.view);
  });
  // Ctrl + rueda: hacia arriba, iconos más grandes; hacia abajo, más pequeños, lista y detalles.
  let wheelAt = 0;
  root.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !e.target.closest('#main')) return;
    e.preventDefault();
    if (Date.now() - wheelAt < 180) return; // un paso por golpe de rueda
    wheelAt = Date.now();
    const i = VIEWS.findIndex(([k]) => k === view) + (e.deltaY > 0 ? 1 : -1);
    if (i >= 0 && i < VIEWS.length) setView(VIEWS[i][0]);
  }, { passive: false });

  let gridTimer = null;
  const drawGridSoon = () => {
    clearTimeout(gridTimer);
    gridTimer = setTimeout(drawGrid, 400);
  };

  const drawStatus = () => {
    root.querySelectorAll('.tile[data-kind="video"]').forEach((tile) => {
      const v = videoById(tile.dataset.id);
      if (v) tile.querySelector('.vstatus').innerHTML = statusHtml(v);
    });
  };

  const drawSelection = () => {
    root.querySelectorAll('.tile[data-kind="video"], .tile[data-kind="library"]').forEach((tile) => {
      const k = selectedIndex(tile.dataset.kind, tile.dataset.id);
      tile.classList.toggle('on', k >= 0);
      tile.querySelector('input[type="checkbox"]').checked = k >= 0;
      tile.querySelector('.order').textContent = k >= 0 ? k + 1 : '';
    });
  };

  // Carpeta enlazada a colecciones de Instagram: cuáles, desenlazar y sincronizar.
  const drawLinked = () => {
    const el = $('#igLinked');
    const lib = folder && libraryById(folder.id);
    const cols = lib?.igCollections || [];
    const lists = lib?.lists || [];
    el.hidden = !cols.length && !lists.length;
    if (el.hidden || el.querySelector('[disabled]')) return;
    const last = [...cols, ...lists].map((c) => c.syncedAt).sort().pop();
    const netName = (u) => (/tiktok/.test(u) ? 'TikTok' : 'YouTube');
    el.innerHTML = `<span>Sincronizada con ${[
      ...cols.map((c) => `<b class="ig-col-link">«${esc(c.name)}» <small>(Instagram)</small><button class="row-del" data-unlink="${esc(c.id)}" title="Dejar de sincronizar «${esc(c.name)}» (lo importado se queda)" aria-label="Dejar de sincronizar ${esc(c.name)}">✕</button></b>`),
      ...lists.map((x) => `<b class="ig-col-link">«${esc(x.name)}» <small>(${netName(x.url)})</small><button class="row-del" data-unlink-list="${esc(x.url)}" title="Dejar de sincronizar «${esc(x.name)}» (lo importado se queda)" aria-label="Dejar de sincronizar ${esc(x.name)}">✕</button></b>`),
    ].join(', ')}${last ? ` · última vez ${new Date(last).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
      ${cols.length === 1 && !lists.length && lib.nameLocked && lib.name !== lib.igCollections[0].name
        ? `<button class="btn small ghost" data-ig-name="${esc(lib.igCollections[0].name)}" title="La carpeta volverá a llamarse como la colección (y a cambiar si la renombras en Instagram)">Usar el nombre de Instagram</button>` : ''}
      <button class="btn small" data-act="ig-sync">Sincronizar</button>`;
  };

  // Carpeta compartida (esta o una de las de encima): con quién, y para gestionarlo.
  const drawShared = () => {
    const el = $('#shareBar');
    const sp = folder && sharedFolderOf(folder.id);
    el.hidden = !sp;
    if (!sp) return;
    const top = libraryById(sp.rootId);
    el.innerHTML = `<span>${SHARE_TAG}${esc(sharedLabel(sp))}${sp.rootId !== folder.id ? ` (desde «${esc(top?.name || sp.name)}»)` : ''}.
      ${sp.mine ? 'Pueden añadir cosas aquí.' : 'Puedes añadir cosas; lo de los demás solo lo quitan ellos o quien la comparte.'}</span>
      <button class="btn small" data-share-folder="${sp.rootId}">${sp.mine ? 'Gestionar' : 'Ver quién está'}</button>`;
  };

  // Sin Instagram conectado: aviso con el tutorial para conectarlo (se puede cerrar).
  const drawIgTuto = () => {
    const el = $('#igTuto');
    let off = false;
    try {
      off = localStorage.getItem('jr-ig-tuto-off') === '1';
    } catch {
      /* sin almacenamiento: se enseña */
    }
    el.hidden = state.instagram.connected || off;
    if (el.hidden) return;
    el.innerHTML = `<span>${ICON.instagram} ${state.instagram.expired ? '<b>Tu sesión de Instagram caducó.</b> Vuelve a conectarla para sincronizar tus colecciones y descargar sus videos.' : '<b>Conecta tu Instagram</b> para importar tus colecciones de Guardados (también las privadas) y descargar sus videos.'}</span>
      <button class="btn small primary" data-act="ig-connect">Ver cómo (2 min)</button>
      <button class="x" data-act="ig-tuto-off" title="No volver a mostrar" aria-label="Cerrar">✕</button>`;
  };

  drawGrid();
  drawIgTuto();
  drawShared();
  drawLinked();
  drawPanel();

  // ---------- importar ----------

  const importTarget = () => $('#target')?.value || here();

  async function importLinks(urls, target) {
    if (!urls.length) return;
    toast(urls.some((u) => /playlist\?|\/saved\b/.test(u)) ? 'Leyendo la lista o colección…' : 'Importando…');
    try {
      const { created, errors } = await api.addLinks(urls, target);
      created.forEach((v) => upsert('videos', v));
      if ($('#links')) $('#links').value = errors.map((e) => e.split(': ')[0]).join('\n'); // los que fallaron, para reintentar
      if (errors.length) toast(`${created.length} importado(s). No se pudieron importar ${errors.length}:\n${errors.slice(0, 3).join('\n')}`, 'error');
      else toast(`${created.length} elemento(s) importado(s)${created.some(canDownload) ? '. Se descargan solos.' : ''}`);
      queueDownload(created.filter(canDownload).map((v) => v.id));
      if (created.length) await refresh(); // puede haber una carpeta nueva (colección de Instagram)
      emit('data');
      if (errors.some((e) => /Conectar Instagram/.test(e))) openInstagram({ view: 'connect', message: 'Para importar colecciones privadas, conecta primero tu cuenta.' });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function importFiles(files, target = here()) {
    const lists = files.filter((f) => /\.txt$/i.test(f.name));
    const media = files.filter((f) => /^(video|image)\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|png|jpe?g|webp|gif)$/i.test(f.name));
    for (const f of lists) await importLinks((await f.text()).split(/\s+/).filter((u) => URL_RE.test(u)), target);
    if (!media.length) return lists.length || toast('Solo se aceptan videos, fotos o un .txt con links', 'error');
    for (let i = 0; i < media.length; i++) {
      toast(`Subiendo ${i + 1} de ${media.length}: ${media[i].name}`);
      try {
        upsert('videos', await api.upload(media[i], target));
        emit('data');
      } catch (e) {
        toast(`${media[i].name}: ${e.message}`, 'error');
      }
    }
  }

  // Imágenes pegadas en el cuadro de links (clic derecho → Pegar, o Ctrl+V). Se suben al pulsar Importar.
  const drawPasted = () => {
    const box = $('#pasteThumbs');
    if (!box) return;
    box.innerHTML = pasted.map((p, i) => `<figure><img src="${p.url}" alt="Imagen pegada ${i + 1}"><button class="x" data-unpaste="${i}" title="Quitar">✕</button></figure>`).join('');
    const urls = ($('#links')?.value || '').split(/\s+/).filter((u) => URL_RE.test(u)).length;
    const parts = [urls && `${urls} link${urls === 1 ? '' : 's'}`, pasted.length && `${pasted.length} imagen${pasted.length === 1 ? '' : 'es'}`].filter(Boolean);
    $('[data-act="import"]').textContent = parts.length ? `Importar ${parts.join(' y ')}` : 'Importar';
  };

  const clearPasted = (i = null) => {
    for (const p of i == null ? pasted.splice(0) : pasted.splice(i, 1)) URL.revokeObjectURL(p.url);
    drawPasted();
  };

  root.addEventListener('paste', (e) => {
    if (e.target.id !== 'links') return;
    const images = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!images.length) return setTimeout(drawPasted); // texto: se pega normal
    e.preventDefault();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    images.forEach((it) => {
      const blob = it.getAsFile();
      const n = pasted.length;
      const file = new File([blob], `imagen-pegada-${stamp}${n ? '-' + n : ''}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: blob.type });
      pasted.push({ file, url: URL.createObjectURL(file) });
    });
    drawPasted();
  });

  async function importAll() {
    const urls = $('#links').value.split(/\s+/).filter((u) => URL_RE.test(u));
    const files = pasted.map((p) => p.file);
    if (!urls.length && !files.length) return toast('Pega links o una imagen en el cuadro', 'error');
    const target = importTarget();
    if (files.length) {
      clearPasted();
      await importFiles(files, target);
    }
    await importLinks(urls, target);
    drawPasted();
  }

  // ---------- arrastrar videos y carpetas a otra carpeta ----------
  // Se sueltan sobre una carpeta (o sobre la ruta de arriba, para sacarlos). Si lo arrastrado
  // está seleccionado, se mueve todo lo seleccionado.

  const MOVE_TYPE = 'application/x-jazz-mover';
  let moving = null; // { videos: [ids], folders: [ids] }

  root.addEventListener('dragstart', (e) => {
    const tile = e.target.closest?.('.tile[data-kind="video"], .tile[data-kind="library"]');
    if (!tile) return;
    const kind = tile.dataset.kind;
    const inSel = selectedIndex(kind, tile.dataset.id) >= 0 && selection.length > 1;
    moving = inSel
      ? { videos: selection.filter((s) => s.type === 'video').map((s) => s.id), folders: selection.filter((s) => s.type === 'library').map((s) => s.id) }
      : { videos: kind === 'video' ? [tile.dataset.id] : [], folders: kind === 'library' ? [tile.dataset.id] : [] };
    // Solo este tipo de dato: así no se toma por un link que importar.
    e.dataTransfer.clearData();
    e.dataTransfer.setData(MOVE_TYPE, JSON.stringify(moving));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(tile, 40, 40);
    root.querySelectorAll('.tile[data-kind]').forEach((t) => t.classList.toggle('dragging', [...moving.videos, ...moving.folders].includes(t.dataset.id)));
    root.classList.add('drag-active');
  });

  // ¿Se puede soltar ahí? No en sí misma ni en sus subcarpetas, ni donde ya está todo.
  const canDropOn = (target) => {
    if (!moving) return false;
    const tid = target || null;
    if (moving.folders.some((f) => f === tid || descendantIds(f).includes(tid))) return false;
    const vidsHere = moving.videos.every((id) => videoById(id)?.libraryId === (tid || rootLibrary().id));
    const libsHere = moving.folders.every((id) => (libraryById(id)?.parentId || null) === tid);
    return !(vidsHere && libsHere);
  };
  const dropOf = (e) => e.target.closest?.('[data-drop-lib]');
  // Una carpeta arrastrada al borde de otra del mismo sitio se coloca antes o después de ella
  // (reordenar); en el centro, se mete dentro.
  let reorderAt = null;
  const reorderOf = (e) => {
    if (!moving || moving.videos.length || moving.folders.length !== 1) return null;
    const t = e.target.closest?.('.tile-folder');
    const dragged = libraryById(moving.folders[0]);
    const over = t && libraryById(t.dataset.id);
    if (!over || over.id === dragged.id || (over.parentId || null) !== (dragged.parentId || null) || filters.q.trim()) return null;
    const r = t.getBoundingClientRect();
    const rows = ['list', 'details'].includes(view);
    const f = rows ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    return f < 0.3 ? { el: t, id: over.id, after: false } : f > 0.7 ? { el: t, id: over.id, after: true } : null;
  };
  const clearReorder = () => root.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  root.addEventListener('dragover', (e) => {
    reorderAt = reorderOf(e);
    clearReorder();
    if (reorderAt) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      root.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
      return reorderAt.el.classList.add(reorderAt.after ? 'drop-after' : 'drop-before');
    }
    const t = dropOf(e);
    if (!t || !canDropOn(t.dataset.dropLib)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.drop-over').forEach((x) => x !== t && x.classList.remove('drop-over'));
    t.classList.add('drop-over');
  });
  root.addEventListener('dragleave', (e) => {
    const t = dropOf(e);
    if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-over');
  });
  const endMove = () => {
    moving = null;
    reorderAt = null;
    clearReorder();
    root.classList.remove('drag-active');
    root.querySelectorAll('.drop-over, .dragging').forEach((x) => x.classList.remove('drop-over', 'dragging'));
  };
  root.addEventListener('dragend', endMove);
  root.addEventListener('drop', async (e) => {
    if (reorderAt && moving) {
      e.preventDefault();
      const { id, after } = reorderAt;
      const dragged = moving.folders[0];
      endMove();
      const ids = childFolders(libraryById(dragged).parentId || null).map((l) => l.id).filter((x) => x !== dragged);
      ids.splice(ids.indexOf(id) + (after ? 1 : 0), 0, dragged);
      try {
        const r = await api.orderLibraries(ids);
        r.libraries.forEach((l) => upsert('libraries', l));
        emit('data');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    const t = dropOf(e);
    if (!t || !moving) return;
    e.preventDefault();
    const target = t.dataset.dropLib || null;
    if (!canDropOn(target)) return endMove();
    const { videos, folders: libs } = moving;
    endMove();
    try {
      if (videos.length) await moveVideos(videos, target || rootLibrary().id);
      for (const id of libs) await moveFolder(id, target);
      // Lo movido ya no está aquí: sale de la selección.
      for (let i = selection.length - 1; i >= 0; i--) if ([...videos, ...libs].includes(selection[i].id)) selection.splice(i, 1);
      emit('selection');
      const n = videos.length + libs.length;
      toast(`${n === 1 ? 'Movido' : `${n} movidos`} a «${target ? libraryLabel(libraryById(target)) : 'Biblioteca'}»`);
    } catch (err) {
      toast(err.message, 'error');
      await refresh();
      emit('data');
    }
  });

  // Arrastrar archivos o links a la cuadrícula.
  const main = $('#main');
  let dragDepth = 0;
  main.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list')) return;
    dragDepth++;
    main.classList.add('dropping');
  });
  main.addEventListener('dragleave', () => --dragDepth <= 0 && ((dragDepth = 0), main.classList.remove('dropping')));
  main.addEventListener('dragover', (e) => main.classList.contains('dropping') && e.preventDefault());
  main.addEventListener('drop', (e) => {
    if (!main.classList.contains('dropping')) return;
    e.preventDefault();
    dragDepth = 0;
    main.classList.remove('dropping');
    const files = [...e.dataTransfer.files];
    if (files.length) return importFiles(files);
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (text) importLinks(text.split(/\s+/).filter((u) => URL_RE.test(u)), here());
  });
  $('#files').addEventListener('change', (e) => {
    importFiles([...e.target.files], panel === 'import' ? importTarget() : here());
    e.target.value = '';
  });

  // ---------- borrar ----------

  async function deleteItems(libs, videos) {
    const n = libs.reduce((a, l) => a + videosDeep(l.id).length, 0);
    const subs = libs.reduce((a, l) => a + descendantIds(l.id).length, 0);
    const inside = [subs && `${subs} subcarpeta${subs === 1 ? '' : 's'}`, n && `${n} elemento${n === 1 ? '' : 's'}`].filter(Boolean);
    const parts = [];
    if (videos.length) parts.push(videos.length === 1 ? `«${videos[0].title}»` : `${videos.length} elementos`);
    if (libs.length) parts.push(`${libs.length === 1 ? `la carpeta «${libs[0].name}»` : `${libs.length} carpetas`}${inside.length ? ` (con ${inside.join(' y ')} dentro)` : ''}`);
    if (!parts.length) return;
    // Carpetas que te compartieron: no se borran para nadie, sales de ellas.
    const leaving = libs.filter((l) => spaceFor('folder', l.id) && !spaceFor('folder', l.id).mine);
    if (leaving.length && leaving.length === libs.length && !videos.length) {
      const names = leaving.map((l) => `«${l.name}»`).join(', ');
      if (!confirm(`¿Salir de ${names}? Se quita de tu app (para los demás sigue igual). Lo que añadiste tú se queda en tu Biblioteca.`)) return;
      try {
        for (const l of leaving) await api.leaveSpace(spaceFor('folder', l.id).id);
        await refresh();
        emit('data');
        toast(`Has salido de ${names}`);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    const sharing = libs.some((l) => spaceFor('folder', l.id)?.mine);
    if (!confirm(`¿Borrar ${parts.join(' y ')}? Sus ejercicios también saldrán de las rutinas.${sharing ? ' Las personas con quienes la compartes dejarán de verla.' : ''} No se puede deshacer.`)) return;
    try {
      await removeVideos(videos.map((v) => v.id));
      await removeLibraries(libs.map((l) => l.id));
      toast(`Borrado: ${parts.join(' y ')}`);
      if (folder && !libraryById(folder.id)) location.hash = '#/biblioteca';
    } catch (err) {
      toast(err.message, 'error');
      await refresh();
      emit('data');
    }
  }

  // ---------- acciones ----------

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.selVideo) toggleSelected('video', t.dataset.selVideo);
    else if (t.dataset.selLib) toggleSelected('library', t.dataset.selLib);
    else if (t.dataset.savedCheck) {
      t.checked ? savedChecked.add(t.dataset.savedCheck) : savedChecked.delete(t.dataset.savedCheck);
      const key = t.dataset.savedCheck.split('|')[0];
      const n = [...savedChecked].filter((k) => k.startsWith(key + '|')).length;
      const btn = root.querySelector(`[data-saved-import="${key}"]`);
      btn.disabled = !n;
      btn.textContent = n ? `Importar (${n})` : 'Importar';
    }
    else if (t.id === 'toRoutine') syncRoutineTarget();
    else if (t.id === 'libName') {
      api.renameLibrary(folder.id, t.value.trim() || folder.name).then((l) => (upsert('libraries', l), emit('data')));
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'links') drawPasted();
  });

  root.addEventListener('keydown', async (e) => {
    if (e.target.id !== 'newLib' || e.key !== 'Enter') return;
    e.preventDefault();
    createFolder();
  });

  async function createFolder() {
    const name = $('#newLib').value.trim();
    if (!name) return $('#newLib').focus();
    const lib = upsert('libraries', await api.createLibrary(name, folder?.id || null));
    $('#newLib').value = '';
    panel = null;
    emit('data');
    toast(`Carpeta «${lib.name}» creada`);
  }

  const onKey = (e) => {
    if (e.key === 'Escape' && panel && !document.querySelector('dialog[open]')) ((panel = null), drawPanel());
  };
  document.addEventListener('keydown', onKey);

  // El nombre se escribe ahí mismo, sobre el recuadro (Enter guarda, Esc cancela). La app de
  // escritorio no tiene prompt().
  const RENAME = {
    library: { get: (id) => libraryById(id)?.name, save: async (id, name) => upsert('libraries', await api.renameLibrary(id, name)), max: 60 },
    video: { get: (id) => videoById(id)?.title, save: async (id, name) => upsert('videos', await api.updateVideo(id, { title: name, titleLocked: true })), max: 120 },
    routine: { get: (id) => state.routines.find((r) => r.id === id)?.name, save: async (id, name) => upsert('routines', await api.updateRoutine(id, { name })), max: 80 },
  };
  const renameInline = (tile, kind, id) => {
    const how = RENAME[kind];
    const current = how?.get(id);
    if (!tile || current == null || tile.querySelector('.tile-rename')) return;
    const input = document.createElement('input');
    input.className = 'tile-rename';
    input.value = current;
    input.maxLength = how.max;
    input.setAttribute('aria-label', 'Nuevo nombre');
    tile.classList.add('renaming');
    tile.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      input.remove();
      tile.classList.remove('renaming');
      if (!save || !name || name === current) return;
      try {
        await how.save(id, name);
        emit('data');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (ev) => ev.stopPropagation());
  };

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const un = t.closest('[data-unpaste]');
    if (un) return clearPasted(+un.dataset.unpaste);
    if (t.closest('[data-close]')) return ((panel = null), drawPanel());
    const pick = t.closest('[data-pick-seg]');
    if (pick) {
      // Se va al video a elegir el tramo (el enlace navega); al volver, el panel sigue abierto.
      ui.returnToDraw = pick.dataset.pickSeg;
      return;
    }
    const unpin = t.closest('[data-unpin]');
    if (unpin) {
      await pinRoutines([unpin.dataset.unpin], false);
      return toast('Rutina quitada de la página principal (sigue en Rutinas)');
    }
    const delVideo = t.closest('[data-del-video]');
    if (delVideo) return deleteItems([], [videoById(delVideo.dataset.delVideo)].filter(Boolean));
    const delLib = t.closest('[data-del-lib]');
    if (delLib) return deleteItems([libraryById(delLib.dataset.delLib)].filter(Boolean), []);
    const unlink = t.closest('[data-unlink]');
    if (unlink) {
      const lib = libraryById(folder.id);
      const col = lib.igCollections.find((c) => c.id === unlink.dataset.unlink);
      if (!confirm(`¿Dejar de sincronizar «${col.name}» con esta carpeta? Lo ya importado se queda.`)) return;
      upsert('libraries', await api.unlinkCollection(lib.id, col.id));
      return emit('data');
    }

    // Cambiar el nombre: pulsando el nombre de cualquier recuadro.
    const nameEl = t.closest('[data-name]');
    if (nameEl) {
      e.preventDefault();
      const [kind, id] = nameEl.dataset.name.split(':');
      return renameInline(t.closest('.tile'), kind, id);
    }
    if (t.closest('[data-act="rename"]')) {
      const input = $('#libName');
      input.focus();
      return input.select();
    }
    const igName = t.closest('[data-ig-name]');
    if (igName) {
      upsert('libraries', await api.updateLibrary(folder.id, { name: igName.dataset.igName, nameLocked: false }));
      $('#libName').value = igName.dataset.igName;
      return emit('data');
    }
    const netConnect = t.closest('[data-net-connect]');
    if (netConnect) {
      const key = netConnect.dataset.netConnect;
      return key === 'instagram' ? openInstagram({ view: 'connect' }) : openNet(key);
    }
    const netOff = t.closest('[data-net-off]');
    if (netOff) {
      const key = netOff.dataset.netOff;
      const name = key === 'instagram' ? 'Instagram' : NET_INFO[key].name;
      if (!confirm(`¿Desconectar tu cuenta de ${name}? Lo importado se queda.`)) return;
      if (key === 'instagram') state.instagram = await api.igDisconnect();
      else {
        await api.socialDisconnect(key);
        state.social = await api.socialStatus();
      }
      delete savedCache[key];
      emit('data');
      return toast(`${name} desconectado`);
    }
    const savedImport = t.closest('[data-saved-import]');
    if (savedImport) return importSaved(savedImport.dataset.savedImport, savedImport);
    const savedUrl = t.closest('[data-saved-url]');
    if (savedUrl) return importSavedUrl(savedUrl.dataset.savedUrl, savedUrl);
    const savedRetry = t.closest('[data-saved-retry]');
    if (savedRetry) {
      delete savedCache[savedRetry.dataset.savedRetry];
      drawPanel();
      return loadSaved(savedRetry.dataset.savedRetry);
    }
    const netBtn = t.closest('[data-net], [data-net-lists]');
    if (netBtn) return netBtn.dataset.netLists ? openNet(netBtn.dataset.netLists, { view: 'lists' }) : openNet(netBtn.dataset.net, { view: state.social?.[netBtn.dataset.net]?.connected && NET_INFO[netBtn.dataset.net].lists ? 'lists' : null });
    const unlinkList = t.closest('[data-unlink-list]');
    if (unlinkList) {
      if (!confirm('¿Dejar de sincronizar esta lista con la carpeta? Lo ya importado se queda.')) return;
      upsert('libraries', await api.unlinkList(folder.id, unlinkList.dataset.unlinkList));
      return emit('data');
    }
    const shareBtn = t.closest('[data-share-folder]');
    if (shareBtn) return openShare('folder', shareBtn.dataset.shareFolder);

    const menu = t.closest('[data-menu]')?.dataset.menu;
    if (menu === 'upload') return $('#files').click();
    if (menu === 'share') {
      // Si la carpeta está dentro de otra ya compartida, se gestiona esa.
      const id = shareTarget();
      return id && openShare('folder', sharedFolderOf(id)?.rootId || id);
    }
    if (menu === 'selectAll') {
      const { libs, vids } = visible();
      const items = [...libs.map((l) => ['library', l.id]), ...vids.map((v) => ['video', v.id])];
      const all = items.length && items.every(([k, id]) => selectedIndex(k, id) >= 0);
      for (const [k, id] of items) if (all === selectedIndex(k, id) >= 0) toggleSelected(k, id);
      return;
    }
    if (menu === 'trash') {
      const libs = selection.filter((s) => s.type === 'library').map((s) => libraryById(s.id)).filter(Boolean);
      const videos = selection
        .filter((s) => s.type === 'video')
        .map((s) => videoById(s.id))
        .filter((v) => v && !libs.some((l) => l.id === v.libraryId)); // ya se borran con su carpeta
      return deleteItems(libs, videos);
    }
    if (menu) return openPanel(menu);

    const el = t.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'import') importAll();
    else if (act === 'upload') $('#files').click();
    else if (act === 'new-lib') createFolder();
    else if (act === 'ig-connect') openInstagram({ view: 'connect' });
    else if (act === 'ig-tuto-off') {
      try {
        localStorage.setItem('jr-ig-tuto-off', '1');
      } catch {
        /* se oculta solo por ahora */
      }
      $('#igTuto').hidden = true;
      toast('Puedes conectarlo cuando quieras desde Instagram, en el menú de la derecha');
    }
    else if (act === 'ig-collections') openInstagram({ view: 'collections' });
    else if (act === 'ig-disconnect') {
      if (!confirm('¿Desconectar tu cuenta de Instagram? Lo importado se queda, pero no se podrá sincronizar hasta que vuelvas a conectar.')) return;
      state.instagram = await api.igDisconnect();
      emit('data');
      toast('Instagram desconectado');
    } else if (act === 'ig-sync' || act === 'ig-sync-all') {
      const label = el.textContent;
      el.disabled = true;
      el.textContent = 'Sincronizando…';
      const { created, errors } = await syncInstagram(act === 'ig-sync' ? [libraryById(folder.id)] : linkedLibraries());
      el.disabled = false;
      el.textContent = label;
      drawLinked();
      if (errors.length) {
        toast(errors.slice(0, 3).join('\n'), 'error');
        if (!state.instagram.connected) openInstagram({ view: 'connect', message: errors[0] });
      } else {
        toast(created.length ? `${created.length} publicación(es) nueva(s). Se descargan solas.` : 'Todo al día: no hay publicaciones nuevas.');
      }
    } else if (act === 'clear-sel') {
      selection.length = 0;
      emit('selection');
    } else if (act === 'move') {
      const to = $('#moveTo').value;
      const ids = selection.filter((s) => s.type === 'video').map((s) => s.id);
      el.disabled = true;
      try {
        for (const id of ids) upsert('videos', await api.updateVideo(id, { libraryId: to }));
        for (let i = selection.length - 1; i >= 0; i--) if (selection[i].type === 'video') selection.splice(i, 1);
        panel = null;
        emit('data');
        emit('selection');
        toast(`${ids.length} movido(s) a «${libraryLabel(libraryById(to))}»`);
      } catch (err) {
        toast(err.message, 'error');
        el.disabled = false;
      }
    } else if (act === 'extract') {
      const setStatus = (s) => {
        creating = s;
        const btn = $('[data-act="extract"]');
        if (btn) ((btn.disabled = true), (btn.textContent = s));
      };
      setStatus('Preparando…');
      try {
        const { exercises, unusable } = await extractSelection({ onStatus: setStatus });
        if (unusable.length) toast(`${unusable.length} video(s) sin descargar no tienen dibujos. Ábrelos y sube el archivo.`, 'error');
        selection.length = 0;
        creating = null;
        // A Rutinas, con estos dibujos ya elegidos (en este orden) para montar la rutina.
        ui.newDrawings = exercises.map((x) => x.id);
        location.hash = '#/rutinas';
      } catch (err) {
        toast(err.message, 'error');
        creating = null;
        drawPanel();
      }
    }
  });

  $('#q').addEventListener('input', (e) => ((filters.q = e.target.value), drawGrid()));

  const onStore = (e) => {
    const { kind } = e.detail;
    if (kind === 'data') {
      if (folder && !libraryById(folder.id)) return (location.hash = '#/biblioteca');
      // El nombre pudo cambiar al sincronizar con Instagram (o en otro ordenador).
      const nameInput = $('#libName');
      if (nameInput && document.activeElement !== nameInput) nameInput.value = libraryById(folder.id).name;
      drawGrid();
      drawIgTuto();
      drawShared();
      drawLinked();
      if (['instagram', 'draw', 'move'].includes(panel)) drawPanel();
      else drawMenu();
    } else if (kind === 'poster') {
      // Llegó la portada de un video: se cambia solo su miniatura (y el mosaico de las carpetas).
      const v = videoById(e.detail.id);
      const thumb = v && root.querySelector(`.tile[data-kind="video"][data-id="${v.id}"] .tile-thumb`);
      if (thumb) thumb.innerHTML = videoThumb(v);
      else if (!folder) drawGridSoon();
    } else if (kind === 'job') drawStatus();
    else if (kind === 'selection') {
      drawSelection();
      if (['draw', 'move'].includes(panel)) drawPanel();
      else drawMenu();
    }
  };
  window.addEventListener('store', onStore);
  return () => {
    window.removeEventListener('store', onStore);
    document.removeEventListener('keydown', onKey);
    clearTimeout(gridTimer);
    pasted.forEach((p) => URL.revokeObjectURL(p.url));
  };
}
