// Biblioteca: cuadrícula de recuadros (carpetas, videos e imágenes) y, a la derecha, el menú de
// opciones (importar, subir, carpeta nueva, Instagram, seleccionar, rutina, mover, borrar).
// Cada opción abre su panel entre la cuadrícula y el menú.
import { api as baseApi, createApi } from './api.js';
import { mountMega, openMegaPicker } from './mega.js';
import { isClass, classItems, itemType, playable, skipped, inPlay, setSkipped, totalSecs, itemSecs, clock, chipText, openSegment, openSecs, rememberDuration } from './classtime.js';
const historyOwner = (() => {
  try {
    const id = sessionStorage.getItem('jr-library-undo') || crypto.randomUUID();
    sessionStorage.setItem('jr-library-undo', id);
    return id;
  } catch { return crypto.randomUUID(); }
})();
const api = createApi({ 'X-Library-Undo': historyOwner });
const actionApi = () => createApi({ 'X-Library-Undo': historyOwner, 'X-Library-Undo-Group': crypto.randomUUID() });
import {
  state, refresh, emit, esc, toast, upsert, libraryById, videoById, exerciseById, itemExercise, videosOf, exercisesOf, videoThumb, PLATFORM,
  jobs, queueDownload, isAnalyzing, canDownload, syncInstagram, linkedLibraries,
  selection, toggleSelected, selectedIndex, selectedVideos, extractSelection, ui, exerciseFigure, pinRoutines,
  removeVideos, removeLibraries, rootLibrary, folders, topParent, isTop, shelves, shelfName, shelfOf, activeShelf, setActiveShelf, libraryLabel, libraryChoices, needsExtraction, fmtTime,
  childFolders, folderPath, videosDeep, descendantIds, moveVideos, moveFolder,
  spaceFor, sharedFolderOf, addedByOther, who, sharedLabel,
  ask, isPinnedIn, routineById, pinnedShelves, isAudio,
} from './store.js';
import { openInstagram } from './instagram.js';
import { openNet, NET_INFO } from './redes.js';
import { openShare, SHARE_TAG } from './share.js';
import { VIEWS, VIEW_ICON, SORTS, PIN } from './views.js';
import { lang, tr } from './i18n.js';

const URL_RE = /^https?:\/\//i;
// Un link de la propia app (al arrastrar una pestaña o un recuadro) no es algo que importar.
const ownLink = (u) => {
  try {
    const url = new URL(u);
    return url.origin === location.origin || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return true;
  }
};
const importable = (u) => URL_RE.test(u) && !ownLink(u);

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/></svg>';
const FOLDER = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
const ICON = {
  sync: svg('<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  import: svg('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1"/>'),
  upload: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  folder: svg(FOLDER),
  newFolder: svg(FOLDER + '<path d="M12 10.5v6M9 13.5h6"/>'),
  // Clase: una carpeta que se reproduce seguida, como una lista.
  newClass: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor"/><path d="M3 9h3M3 15h3"/>'),
  classIcon: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor"/><path d="M3 9h3M3 15h3"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/>'),
  selectAll: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  draw: svg('<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  routine: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  move: svg(FOLDER + '<path d="M9 13.5h6m-2-2 2 2-2 2"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  share: SHARE_TAG,
  social: svg('<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>'),
  cloud: svg('<path d="M7 18h11.5a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.4-1.6A4.5 4.5 0 0 0 7 18z"/>'),
};
// Servicios en la nube: se importa pegando el link compartido de un archivo o una carpeta.
export const CLOUDS = {
  gdrive: { name: 'Google Drive', color: '#1fa463', icon: svg('<path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="M8 3l6 10H2M16 3 10 13h12M6 20l4-7"/>') },
  dropbox: { name: 'Dropbox', color: '#0061fe', icon: svg('<path d="m7 3-5 3.2L7 9.5l5-3.3zM17 3l-5 3.2 5 3.3 5-3.3zM2 12.8 7 16l5-3.2-5-3.3zM17 9.5l-5 3.3 5 3.2 5-3.2zM7 17.2l5 3.3 5-3.3-5-3.2z"/>') },
  onedrive: { name: 'OneDrive', color: '#0f78d4', icon: svg('<path d="M7 18h11.5a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.4-1.6A4.5 4.5 0 0 0 7 18z"/>') },
  mega: { name: 'MEGA', color: '#d9272e', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M8 15.5V9l4 4 4-4v6.5"/>') },
};

// Iconos de los filtros de tipo (vídeo, rutina, foto, carpeta).
const HIDE_ICON = {
  video: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'),
  routine: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  audio: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  class: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor"/><path d="M3 9h3M3 15h3"/>'),
};

export const NET_ICON = {
  youtube: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'),
  tiktok: svg('<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.3 4 5 4"/>'),
  facebook: svg('<path d="M14 8h3V4.5h-3a4 4 0 0 0-4 4V11H7.5v3.5H10V21h3.5v-6.5H17l.5-3.5h-4V9a1 1 0 0 1 1-1z"/>'),
  x: svg('<path d="M5 4l14 16M19 4 5 20"/>'),
  spotify: svg('<circle cx="12" cy="12" r="9"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.3-.4 7.3.8M8.6 15.5c2-.5 4-.3 5.6.6"/>'),
};

/** Tarjeta de Spotify en Redes sociales: iniciar sesión dentro de la app para oír canciones enteras. */
export const SPOTIFY_LOGIN = 'https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F';
export const spotifyCard = () => `<section class="net-card" style="--net:#1ed760">
  <h4>${NET_ICON.spotify}Spotify</h4>
  <p class="hint">Inicia sesión para que las canciones y listas suenen enteras (sin sesión, Spotify solo deja muestras de 30 s y pone un cartel encima). Se abre una ventana de Spotify; al terminar, ciérrala.</p>
  <a class="btn small primary" href="${SPOTIFY_LOGIN}" target="_blank" rel="noopener">Iniciar sesión en Spotify</a>
</section>`;

export const SAVED_HINT = {
  gdrive: 'Tus carpetas de Google Drive, con sus videos y fotos.',
  instagram: 'Tus colecciones de Guardados, también las privadas.',
  youtube: 'Tus listas, «Ver más tarde» y «Me gusta».',
  tiktok: 'Tus colecciones y perfiles.',
  facebook: 'Tus videos guardados.',
  x: 'Los videos de tus publicaciones guardadas.',
};
export const ICON_IG = ICON.instagram;

export function renderLibrary(root, libraryId) {
  const lib0 = libraryById(libraryId);
  const folder = lib0 && !isTop(lib0) ? lib0 : null; // null = lo de arriba de la biblioteca
  // La biblioteca abierta: la que se pidió, o la de la carpeta que se abre.
  if (libraryId && lib0) {
    const top = isTop(lib0) ? lib0 : shelfOf(lib0.id);
    setActiveShelf(top.root ? '' : top.id);
  }
  const shelf = activeShelf();
  const here = () => folder?.id || rootLibrary().id;
  const filters = { q: '' };
  // Pestañas con las bibliotecas: la abierta se ve grande; su nombre se cambia pulsándolo; + crea otra.
  // Se puede soltar en una pestaña lo que arrastras para llevarlo a esa biblioteca.
  // Barra fina con las bibliotecas (una línea; si no caben, se desliza) y, debajo, el nombre grande
  // de la abierta, que se cambia pulsándolo. Se puede soltar en una pestaña lo que arrastras.
  // Biblioteca compartida con otras personas (o que te compartieron).
  const shelfShared = (l) => {
    const sp = spaceFor('folder', l.id);
    return Boolean(sp && (sp.members.length > 1 || !sp.mine));
  };
  const shelfBar = () => `<nav class="shelf-bar" aria-label="Bibliotecas">${shelves().map((l) => `
      <a class="shelf-pill${l.id === shelf.id ? ' on' : ''}${shelfShared(l) ? ' shared' : ''}" href="#/biblioteca/${l.id}" data-drop-lib="${l.id}" data-shelf-pill="${l.id}" draggable="false" title="${l.id === shelf.id ? 'Doble clic para cambiar el nombre · mantén pulsado para moverla' : `Abrir «${esc(shelfName(l))}» (suelta aquí para llevar algo a ella)`}">${esc(shelfName(l))}</a>`).join('')}
      <button class="shelf-add" data-shelf-add title="Nueva biblioteca" aria-label="Nueva biblioteca">+</button>
    </nav>`;
  const shelfTitle = () => `<h2 class="shelf-tab on" data-drop-lib="${shelf.id}"><span class="shelf-name" data-shelf-name="${shelf.id}" title="Doble clic para cambiar el nombre">${esc(shelfName(shelf))}</span>${`<button class="shelf-share${shelfShared(shelf) ? ' on' : ''}" data-share-folder="${shelf.id}" title="Compartir esta biblioteca entera" aria-label="Compartir la biblioteca ${esc(shelfName(shelf))}">${SHARE_TAG}${shelfShared(shelf) ? `<span>${spaceFor('folder', shelf.id).members.length}</span>` : ''}</button>`}${shelf.root ? '' : `<button class="shelf-del" data-shelf-del="${shelf.id}" title="Borrar esta biblioteca" aria-label="Borrar la biblioteca ${esc(shelfName(shelf))}">✕</button>`}</h2>`;
  // Vistas como en el explorador de archivos (se recuerda la elegida). Ctrl + rueda cambia de una a otra.
  // Cómo se ordena lo de cada carpeta: el orden propio (arrastrando) o por fecha, nombre o tipo.
  let sortBy = 'custom';
  try {
    const saved = localStorage.getItem('jr-sort');
    if (SORTS.some(([k]) => k === saved)) sortBy = saved;
  } catch {
    /* sin almacenamiento: el orden propio */
  }
  const nameOf = (x) => (x.name ?? x.title ?? '').toLocaleLowerCase('es');
  const sortList = (list) => {
    const by = {
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      old: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      az: (a, b) => nameOf(a).localeCompare(nameOf(b), 'es', { numeric: true }),
      za: (a, b) => nameOf(b).localeCompare(nameOf(a), 'es', { numeric: true }),
      // Videos, luego fotos, luego lo que aún no se ha descargado; dentro, por nombre.
      type: (a, b) => typeRank(a) - typeRank(b) || nameOf(a).localeCompare(nameOf(b), 'es', { numeric: true }),
    }[sortBy];
    return by ? [...list].sort(by) : list;
  };
  const typeRank = (x) => (x.source ? (x.source.mediaType === 'video' ? 0 : x.source.mediaType === 'image' ? 1 : 2) : 0);
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
  // Acceso directo a lo anclado (como los mensajes fijados de Telegram): el pin ya no mueve nada
  // de sitio; solo se marca. Cada clic en el acceso salta al siguiente anclado, lo resalta y hace
  // scroll hasta él solo si no se ve ya en pantalla. El botón muestra el nombre del que toca.
  let pinCursor = -1;
  const setPinLabel = (tiles, at) => {
    const jump = $('#pinJump');
    if (!jump) return;
    jump.hidden = tiles.length === 0;
    if (!tiles.length) return;
    const name = tiles[at].querySelector('.name-edit')?.textContent || '';
    jump.querySelector('b').textContent = name;
    jump.title = jump.ariaLabel = tiles.length > 1 ? `Ir a «${name}» (anclado ${at + 1} de ${tiles.length})` : `Ir a «${name}»`;
  };
  // Un scroll suave hecho a mano: `scrollBy({behavior:'smooth'})` no siempre se anima bien
  // dentro de Electron, así que se anima el propio scrollY fotograma a fotograma. Si se salta
  // otra vez antes de que termine, esta sustituye a la anterior en vez de pelearse con ella.
  let scrollGen = 0;
  const smoothScrollBy = (delta) => {
    const myGen = ++scrollGen;
    const from = scrollY;
    const to = from + delta;
    const t0 = performance.now();
    const dur = 380;
    const ease = (p) => 1 - (1 - p) ** 3;
    const step = (now) => {
      if (myGen !== scrollGen) return;
      const p = Math.min(1, (now - t0) / dur);
      scrollTo(0, from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const jumpToPinned = () => {
    const tiles = [...root.querySelectorAll('#grid .tile.pinned')];
    if (!tiles.length) return;
    pinCursor = (pinCursor + 1) % tiles.length;
    const tile = tiles[pinCursor];
    tile.classList.remove('pin-flash');
    void tile.offsetWidth; // reinicia la animación si se vuelve a saltar al mismo
    tile.classList.add('pin-flash');
    tile.addEventListener('animationend', () => tile.classList.remove('pin-flash'), { once: true });
    setPinLabel(tiles, pinCursor);
    const barBottom = root.querySelector('.lib-top')?.getBoundingClientRect().bottom || 76;
    const rect = tile.getBoundingClientRect();
    if (rect.top < barBottom || rect.bottom > innerHeight) smoothScrollBy(rect.top - barBottom - 10);
  };

  // Dentro de una clase (o de algo que cuelga de ella) no se crean más clases.
  const inClass = () => { for (let l = folder, i = 0; l && i < 50; l = libraryById(l.parentId), i++) if (isClass(l)) return true; return false; };
  root.innerHTML = `
    <div class="lib2">
      <section class="lib-main" id="main">
        <div class="lib-sticky">
        ${shelves().length > 1 || !folder ? shelfBar() : ''}
        <header class="lib-top lib-bar">
          <nav class="crumbs">${folder
            ? `<a href="#/biblioteca/${shelf.id}" data-drop-lib="${shelf.id}" title="Suelta aquí para sacar a «${esc(shelfName(shelf))}»">${esc(shelfName(shelf))}</a><span>›</span>
               ${folderPath(folder).slice(0, -1).map((a) => `<a href="#/biblioteca/${a.id}" data-drop-lib="${a.id}" title="Suelta aquí para mover a «${esc(a.name)}»">${esc(a.name)}</a><span>›</span>`).join('')}
               <input id="libName" class="title-input" value="${esc(folder.name)}" aria-label="Nombre de la carpeta" title="Doble clic para cambiar el nombre" readonly>
               <button class="icon-btn" data-act="rename" title="Cambiar el nombre de la carpeta" aria-label="Cambiar el nombre">${PENCIL}</button><span id="folderShare"></span>`
            : shelfTitle()}</nav>
          <input id="q" type="search" placeholder="Buscar en todo…" aria-label="Buscar">
          <button class="mob-btn" id="qBtn" title="Buscar" aria-label="Buscar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
          <button class="mob-btn" id="toolsBtn" title="Orden, vista y filtros" aria-label="Orden, vista y filtros" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg></button>
          <div class="lib-tools">
            <button class="pin-jump" id="pinJump" data-pin-jump hidden title="Ir a lo anclado" aria-label="Ir a lo anclado">${PIN}<b></b></button>
            <span class="mob-head">Ordenar</span>
            <label class="sorter" title="Ordenar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>
              <select id="sortBy" aria-label="Ordenar">${SORTS.map(([k, label]) => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <span class="mob-head">Vista</span>
            <div class="views" id="views" role="group" aria-label="Vista">${VIEWS.map(([k, label]) => `<button class="view-btn" data-view="${k}" title="${label} (Ctrl + rueda del ratón para cambiar)" aria-label="${label}">${VIEW_ICON[k]}</button>`).join('')}</div>
            <span class="mob-head">Mostrar</span>
            <div class="hide-chips" id="hideChips" role="group" aria-label="Mostrar u ocultar">${[['video', 'Video'], ['routine', 'Rutina'], ['image', 'Foto'], ['audio', 'Audio'], ['folder', 'Carpeta'], ...(inClass() ? [] : [['class', 'Clase']])].map(([k, label]) => `<button class="hide-chip" data-hide="${k}" title="${label}" aria-label="${label}">${HIDE_ICON[k]}</button>`).join('')}</div>
          </div>
        </header>
        </div>
        <div class="ig-callout" id="igTuto" hidden></div>
        <div class="class-bar" id="classBar" hidden></div>
        <div class="ig-linked" id="igLinked" hidden></div>
        <div class="tiles" id="grid"></div>
        <p class="count lib-count" id="count"></p>
        <div class="drop-hint">Suelta aquí para importar${folder ? ` en «${esc(folder.name)}»` : ''}</div>
      </section>
      <aside class="panel" id="panel" hidden></aside>
      <nav class="opts" id="opts" aria-label="Opciones"></nav>
    </div>
    <input type="file" id="files" accept="video/*,image/*,audio/*,.txt" multiple hidden>`;

  const $ = (s) => root.querySelector(s);

  // ---------- menú de opciones ----------

  // Carpeta que se compartiría: en la que estás, o la única seleccionada.
  // La biblioteca principal se convierte en una normal (mismo nombre, sitio y contenido) y se comparte.
  const shareMain = async () => {
    const name = shelfName(shelf);
    if (!await ask(`¿Compartir la biblioteca «${name}» entera? Para poder compartirla, se convierte en una biblioteca normal: queda igual, con su nombre, su sitio y todo lo que tiene.`)) return;
    try {
      const { shelf: s } = await api.promoteMain();
      await refresh();
      setActiveShelf(s.id);
      emit('data');
      location.hash = `#/biblioteca/${s.id}`;
      setTimeout(() => openShare('folder', s.id), 300);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const shareTarget = () => {
    if (folder) return folder.id;
    // En lo de arriba de una biblioteca (no la principal), sin nada elegido: la biblioteca entera.
    if (!selection.length) return shelf.id;
    return selection.length === 1 && selection[0].type === 'library' ? selection[0].id : null;
  };

  let undoCount = 0, undoBusy = false;
  const updateUndo = async () => {
    try { undoCount = (await api.libraryUndoStatus()).count; } catch { undoCount = 0; }
    const button = root.querySelector('[data-menu="undo"]');
    if (button) button.disabled = undoBusy || !undoCount;
  };
  const undoLast = async () => {
    if (undoBusy || !undoCount) return;
    undoBusy = true; drawMenu();
    try {
      await api.undoLibrary();
      await refresh();
      selection.splice(0);
      emit('data');
      // Re-render the library tabs and title as well as its grid after a rename/order undo.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      toast('Cambio deshecho');
    } catch (err) { toast(err.message, 'error'); }
    finally { undoBusy = false; await updateUndo(); }
  };
  const isLinked = (l) => Boolean(l?.igCollections?.length || l?.lists?.length);
  const syncTargets = () => (folder
    ? [folder.id, ...descendantIds(folder.id)].map((id) => libraryById(id)).filter(isLinked)
    : linkedLibraries());
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
      inClass() ? '' : item('newClass', 'Clase', { title: 'Clase nueva: lo que pongas dentro se reproduce seguido, en su orden' }),
      item('share', 'Compartir', {
        disabled: !target,
        title: target ? `Compartir «${libraryById(target)?.name}» con otras personas (pueden añadir cosas)` : 'Entra en una carpeta (o selecciona una) para compartirla con otras personas',
      }),
      syncTargets().length ? item('sync', 'Sincronizar', {
        title: folder ? 'Traer lo nuevo de las listas enlazadas a esta carpeta (Instagram, YouTube, TikTok)' : 'Traer lo nuevo de todas las carpetas enlazadas a listas (Instagram, YouTube, TikTok)',
      }) : '',
      '<span class="opt-sep"></span>',
      item('selectAll', 'Todo', { title: 'Seleccionar o quitar todo lo que se ve' }),
      item('move', 'Mover', { badge: n, disabled: !n, title: 'Mover lo seleccionado a otra carpeta' }),
      item('copy', 'Copiar', { badge: n, disabled: !n, title: 'Copiar lo seleccionado en otra carpeta' }),
      item('trash', 'Borrar', { badge: n, disabled: !n, danger: true, title: 'Borrar lo seleccionado' }),
      item('undo', 'Deshacer', { disabled: undoBusy || !undoCount, title: 'Deshacer el último cambio' }),
    ].join('');
    updateUndo();
  };

  // ---------- paneles ----------

  // Todas las carpetas, con su ruta (jszz › giros) y en orden de árbol.
  const libraryOptions = (selected) => libraryChoices()
    .map((l) => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(libraryLabel(l))}</option>`).join('');

  const panelHead = (title) => `<header><h3>${title}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>`;

  // ---------- Redes sociales: lo guardado en cada cuenta ----------
  // savedCache[red] = { items } | { error } (sin leer: undefined). Lo marcado se recuerda al repintar.
  const savedOpen = new Set();
  const savedCache = {};
  const savedChecked = new Set();
  // Estas redes no dejan leer la lista de lo guardado: se pega el link.
  const NO_LIST = {
    tiktok: 'TikTok no deja ver tus guardados desde fuera: pega el link de una colección o de un perfil.',
    facebook: 'Facebook no deja ver tus guardados desde fuera: pega el link de cada video.',
    x: 'X no deja ver tus guardados desde fuera: pega el link de cada publicación con video.',
  };
  const netsOpen = () => ['instagram', 'cloud'].includes(panel);
  const isImported = (key, id) => state.libraries.some((l) => (key === 'instagram' ? l.igCollections?.some((c) => c.id === id) : key === 'gdrive' ? l.cloudFolders?.some((c) => c.id === id) : l.lists?.some((x) => x.url === id)));

  const savedBody = (key) => {
    if (NO_LIST[key]) {
      return `<p class="hint">${NO_LIST[key]}</p>
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
    if (NO_LIST[key] || savedCache[key]?.loading) return;
    savedStart[key] = Date.now();
    savedCache[key] = { loading: true };
    if (netsOpen()) drawPanel();
    tickProgress();
    try {
      if (key === 'instagram') {
        const { collections } = await api.igCollections();
        savedCache[key] = { items: collections.map((c) => ({ id: c.id, name: c.name, count: c.count ?? null })) };
      } else if (key === 'gdrive') {
        const { folders } = await api.driveFolders();
        savedCache[key] = { items: folders.map((x) => ({ id: x.id, name: x.name, count: null })) };
      } else {
        const { lists } = await api.youtubeLists();
        savedCache[key] = { items: lists.map((l) => ({ id: l.url, name: l.name, count: null })) };
      }
    } catch (e) {
      savedCache[key] = { error: e.message };
    }
    if (netsOpen()) drawPanel();
  };

  const connectDrive = async (btn) => {
    if (!state.google?.connected) return toast('Primero inicia sesión con tu cuenta de Google (Ajustes).', 'error');
    globalThis.JR_WEB ? location.assign('api/google/login?drive=1') : window.open('/api/google/login?drive=1', '_blank');
    btn.disabled = true;
    btn.textContent = 'Esperando el permiso en el navegador…';
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const g = await api.google().catch(() => null);
      if (g?.driveRead) {
        state.google = { ...state.google, ...g };
        toast('Google Drive conectado');
        if (netsOpen()) drawPanel();
        return;
      }
    }
    btn.disabled = false;
    btn.textContent = 'Conectar cuenta';
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
        const r = key === 'instagram' ? await api.igImport({ id: it.id, name: it.name }, null, topParent())
          : key === 'gdrive' ? await api.driveImport({ id: it.id, name: it.name }, topParent())
          : await api.importList(it.id, it.name, null, topParent());
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
      if (key === 'facebook' || key === 'x') {
        const r = await api.addLinks([url], here());
        const made = r.created || [];
        made.forEach((v) => upsert('videos', v));
        await finishImport(made, new Set());
      } else {
        const r = await api.importList(url, null, null, topParent());
        upsert('libraries', r.library);
        r.created.forEach((v) => upsert('videos', v));
        await finishImport(r.created, new Set([r.library.id]));
      }
    } catch (e) {
      btn.disabled = false;
      toast(e.message, 'error');
    }
  };

  const netCard = (key) => {
    const ig = key === 'instagram';
    const gd = key === 'gdrive';
    const n = ig ? { name: 'Instagram', color: '#e1306c' } : gd ? { name: 'Google Drive', color: CLOUDS.gdrive.color } : NET_INFO[key];
    const on = ig ? state.instagram.connected : gd ? Boolean(state.google?.connected && state.google?.driveRead) : state.social?.[key]?.connected;
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
      <h4>${ig ? ICON.instagram : gd ? CLOUDS.gdrive.icon : NET_ICON[key]}${n.name}${on ? '<span class="badge b-auto">conectado</span>' : ''}</h4>${body}</section>`;
  };

  const PANELS = {
    import: () => `
      ${panelHead('Importar')}
      <textarea id="links" rows="6" placeholder="Pega aquí links de YouTube, Instagram, TikTok, Spotify, Google Drive, Dropbox, OneDrive o MEGA (un archivo o una carpeta), una lista de reproducción… o una imagen (clic derecho → Pegar, o Ctrl+V). También puedes arrastrar a la cuadrícula videos, fotos, audio o un .txt con links."></textarea>
      <p class="hint" id="linkCount"></p>
      <div class="paste-thumbs" id="pasteThumbs"></div>
      <details class="imp-more">
        <summary>Añadir otro link</summary>
        <div class="row link-add"><input id="oneLink" placeholder="Pega un link y pulsa Añadir" aria-label="Link"><button class="btn" data-act="add-link">Añadir</button></div>
      </details>
      <details class="imp-more">
        <summary>Importar en <b id="targetName">${esc(libraryLabel(libraryById(here())))}</b></summary>
        <select id="target" aria-label="Importar en">${libraryOptions(here())}</select>
      </details>
      <div class="row wrap">
        <button class="btn primary" data-act="import">Importar</button>
        <button class="btn" data-act="upload">Subir archivos…</button>
        <button class="btn" data-act="mega" title="Elegir carpetas y archivos de tu cuenta de MEGA">${CLOUDS.mega.icon} MEGA…</button>
        <button class="btn" data-act="add-routines" title="Poner aquí rutinas que ya has creado">${ICON.routine} Rutinas…</button>
        <button class="btn" data-act="target-new" title="Crear una carpeta dentro de la elegida">+ Carpeta</button>
      </div>
      <div class="row link-add" id="targetNewRow" hidden><input id="targetNew" placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta"><button class="btn primary" data-act="target-create">Crear</button></div>
      ${state.ytdlp ? '' : '<p class="hint">Para descargar de YouTube instala <code>yt-dlp</code>.</p>'}`,

    newFolder: () => `
      ${panelHead(folder ? 'Subcarpeta nueva' : 'Carpeta nueva')}
      ${folder ? `<p class="hint">Se crea dentro de «${esc(folder.name)}». Luego arrastra ahí los videos que quieras.</p>` : ''}
      <input id="newLib" placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta">
      <div class="row"><button class="btn primary" data-act="new-lib">Crear carpeta</button></div>`,

    newClass: () => `
      ${panelHead('Clase nueva')}
      <p class="hint">Una clase es como una carpeta que se reproduce seguida: los videos (o el tramo que elijas), las fotos y las rutinas, en el orden en que los coloques. Se crea en «${esc(folder ? folder.name : shelfName(shelf))}».</p>
      <input id="newClassName" placeholder="Nombre de la clase" aria-label="Nombre de la clase">
      ${classPickList()}
      <div class="row"><button class="btn primary" data-act="new-class">Crear clase</button></div>`,

    // Redes sociales: sin conectar, un solo botón «Conectar cuenta» (abre el tutorial); conectada,
    // un desplegable con lo que tienes guardado en esa red para marcarlo e importarlo.
    instagram: () => `${panelHead('Redes sociales')}
      ${['instagram', 'youtube', 'tiktok', 'facebook', 'x'].map(netCard).join('')}
      ${spotifyCard()}`,

    cloud: () => `${panelHead('Nube')}
      ${netCard('gdrive')}
      <section class="net-card" style="--net:${CLOUDS.mega.color}">
        <h4>${CLOUDS.mega.icon}${CLOUDS.mega.name}</h4><div data-mega-slot></div>
      </section>
      ${['dropbox', 'onedrive'].map((key) => `<section class="net-card" style="--net:${CLOUDS[key].color}">
        <h4>${CLOUDS[key].icon}${CLOUDS[key].name}</h4>
        <p class="hint">Pega sus links compartidos (de un archivo o de una carpeta) en <b>Importar</b>. Enlazar la cuenta llegará pronto.</p>
      </section>`).join('')}
      <p class="hint">Los links compartidos de Google Drive, Dropbox, OneDrive y MEGA se pegan en <b>Importar</b>: una carpeta entra como carpeta nueva, con sus videos y fotos.</p>`,

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

    move: () => placePanel('Mover', 'move'),
    copy: () => placePanel('Copiar', 'copy'),
  };

  function placePanel(title, act) {
    const n = selection.filter((s) => s.type === 'video' || s.type === 'library').length;
    return `${panelHead(title)}
      <p>${tr(`${n} elemento${n === 1 ? '' : 's'}`)}</p>
      <label class="field">A la carpeta<select id="moveTo">${libraryOptions(here())}</select></label>
      <div class="row"><button class="btn primary" data-act="${act}" ${n ? '' : 'disabled'}>${title}</button></div>`;
  }

  // Importar y Clase nueva son ventanas: un clic fuera las cierra.
  root.addEventListener('mousedown', (e) => {
    if (!['import', 'newClass'].includes(panel) || e.target.closest('#panel, [data-tile-import], [data-menu="import"], [data-menu="newClass"]')) return;
    panel = null;
    drawPanel();
  });

  let megaCard = null;
  const drawPanel = () => {
    const box = $('#panel');
    box.hidden = !PANELS[panel];
    box.classList.toggle('popup', panel === 'import' || panel === 'newClass');
    if (box.hidden) return drawMenu();
    // Al repintar se conserva lo que ya estaba escrito o elegido.
    const keep = {};
    box.querySelectorAll('input, select, textarea').forEach((el) => el.id && (keep[el.id] = el.value));
    box.innerHTML = PANELS[panel]();
    // MEGA: la misma tarjeta (con la carpeta que estabas viendo) en cada repintado.
    const megaSlot = box.querySelector('[data-mega-slot]');
    if (megaSlot) {
      if (!megaCard) mountMega((megaCard = document.createElement('div')));
      megaSlot.replaceWith(megaCard);
    }
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

  // Lo de aquí que puede entrar ya en la clase nueva al crearla (plegado: se abre si se quiere).
  const classPickList = () => {
    const vids = videosOf(here());
    const rts = !folder ? state.routines.filter((r) => isPinnedIn(r, shelf.id)) : [];
    if (!vids.length && !rts.length) return '';
    const row = (kind, id, name, tag) => `<label><input type="checkbox" data-cls-pick="${kind}:${id}"><span class="rp-t">${esc(name)}</span><span class="rp-s">${tag}</span></label>`;
    return `<details class="ai-box cls-pick"><summary>Elegir lo que entra en la clase <small>(opcional)</small></summary>
      <div class="rp-pick-list">${rts.map((r) => row('routine', r.id, r.name, 'Rutina')).join('')}${vids.map((v) => row('video', v.id, v.title, isAudio(v) ? 'Audio' : v.source.mediaType === 'image' ? 'Foto' : 'Video')).join('')}</div></details>`;
  };

  // Las rutinas se ven en la biblioteca y dentro de una clase (cada sitio con su propio orden).
  const place = () => (folder ? folder.id : shelf.id);
  const visible = () => {
    const q = filters.q.trim().toLowerCase();
    if (q) return { libs: folders().filter((l) => l.name.toLowerCase().includes(q)), vids: state.videos.filter((v) => videoText(v).includes(q)) };
    return { libs: sortList(childFolders(folder?.id || null)), vids: sortList(videosOf(here())) };
  };
  // Todo lo de aquí en el orden en que se ve. En «Mi orden», carpetas y videos van mezclados según
  // los hayas colocado (lo que nunca se colocó: las carpetas antes y luego por fecha).
  const arranged = () => {
    const { libs, vids } = visible();
    const rts = !filters.q.trim() ? sortList(state.routines.filter((r) => isPinnedIn(r, place()))) : [];
    const items = [
      ...libs.map((x) => ({ kind: 'library', x })),
      ...rts.map((x) => ({ kind: 'routine', x })),
      ...vids.map((x) => ({ kind: 'video', x })),
    ];
    if (sortBy !== 'custom' || filters.q.trim()) return items;
    const KIND_RANK = { library: 0, routine: 1, video: 2 };
    // Una rutina recién anclada (aún sin colocar) sale al principio; lo demás sin colocar, al final.
    const rank = (it) => (it.kind === 'routine' ? it.x.orderIn?.[place()] ?? -1 : it.x.order ?? Infinity);
    return items.sort((a, b) => rank(a) - rank(b) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || String(a.x.createdAt).localeCompare(String(b.x.createdAt)));
  };

  const statusHtml = (v) => {
    if (jobs.analyzing?.id === v.id) return `<span class="badge b-busy">Analizando ${Math.round(jobs.analyzing.p * 100)}%</span>`;
    if (isAnalyzing(v.id)) return '<span class="badge b-busy">En cola</span>';
    if (jobs.downloading === v.id) return '<span class="badge b-busy">Descargando…</span>';
    if (jobs.downloads.includes(v.id)) return '<span class="badge b-busy">Por descargar</span>';
    if (v.source.mediaType === 'image') return '<span class="badge b-kind">Foto</span>';
    if (v.source.platform === 'spotify') return '<span class="badge b-kind b-spotify">Spotify</span>';
    if (v.source.mediaType === 'audio') return '<span class="badge b-kind">Audio</span>';
    if (v.source.file) return '<span class="badge b-kind">Video</span>';
    // Sin archivo: botón para bajar solo este (o volver a intentarlo si falló).
    const dl = canDownload(v) ? `<button class="dl-one" data-dl-video="${v.id}" title="${v.source.fetchError ? 'Volver a intentar la descarga' : 'Descargar solo este'}">${v.source.fetchError ? 'Reintentar' : 'Descargar'}</button>` : '';
    if (v.source.fetchError) return `<span class="badge b-error" title="${esc(v.source.fetchError)}">No se pudo descargar</span>${dl}`;
    return `<span class="badge b-link">Sin descargar</span>${dl}`;
  };

  // En una carpeta que te compartieron, lo que añadió otra persona solo lo quita ella o el dueño.
  const lockedIn = (r, libId) => {
    const sp = sharedFolderOf(libId);
    return Boolean(sp && !sp.mine && addedByOther(r));
  };
  const byTag = (r) => (addedByOther(r) ? `<span class="by" title="Lo añadió ${esc(r.addedBy)}">de ${esc(who(r.addedBy))}</span>` : '');

  // Opciones de un recuadro (pin, carátula, borrar): juntas en un menú tras el botón ⋮ de la esquina.
  const MORE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="18.5" r="1.9"/></svg>';
  const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>';
  const menuButton = () => `<button class="card-menu" data-card-menu title="Opciones" aria-label="Opciones" aria-haspopup="menu" aria-expanded="false">${MORE_ICON}</button>`;
  // Lo que está puesto se ve siempre (y con un clic se quita, como antes).
  const cardFlags = (pinAttr, pinned, coverId) => (pinned || coverId
    ? `<span class="card-flags">${coverId ? `<button class="card-flag" data-cover="${coverId}" title="Quitar de carátula de la clase" aria-label="Quitar de carátula de la clase">${COVER_ICON}</button>` : ''}${pinned ? `<button class="card-flag flag-pin" ${pinAttr} title="Quitar el pin" aria-label="Quitar el pin">${PIN}</button>` : ''}</span>`
    : '');
  const coverable = (v) => Boolean(folder && isClass(folder) && v.libraryId === folder.id && !isAudio(v) && v.source.platform !== 'spotify');
  const isCover = (v) => coverable(v) && libraryById(folder.id)?.cover === v.id; // la carpeta tal como está ahora
  function menuItems(kind, id) {
    const item = (attr, icon, text, danger = false) => `<button type="button" role="menuitem" class="${danger ? 'danger' : ''}" ${attr}>${icon}<span>${text}</span></button>`;
    if (kind === 'library') {
      const l = libraryById(id);
      if (!l) return '';
      const sp = spaceFor('folder', l.id);
      return (isLinked(l) ? item(`data-sync-lib="${l.id}"`, ICON.sync, 'Sincronizar') : '')
        + item(`data-pin-lib="${l.id}"`, PIN, l.pinnedTop ? 'Quitar el pin' : 'Fijar arriba')
        + (lockedIn(l, l.parentId) ? '' : item(`data-del-lib="${l.id}"`, TRASH_ICON, sp && !sp.mine ? 'Salir de esta carpeta compartida' : 'Borrar la carpeta', true));
    }
    const v = videoById(id);
    if (!v) return '';
    return item(`data-pin-video="${v.id}"`, PIN, v.pinnedTop ? 'Quitar el pin' : 'Fijar arriba')
      + (coverable(v) ? item(`data-cover="${v.id}"`, COVER_ICON, isCover(v) ? 'Quitar de carátula de la clase' : 'Poner de carátula de la clase') : '')
      + (lockedIn(v, v.libraryId) ? '' : item(`data-del-video="${v.id}"`, TRASH_ICON, 'Borrar', true));
  }
  let cardPop = null; // { el, btn } del menú abierto
  function closeCardMenu(focus = false) {
    if (!cardPop) return;
    const { el, btn } = cardPop;
    cardPop = null;
    el.remove();
    btn.setAttribute('aria-expanded', 'false');
    btn.closest('.tile')?.classList.remove('menu-open');
    if (focus && btn.isConnected) btn.focus({ preventScroll: true });
  }
  function openCardMenu(btn) {
    const tile = btn.closest('.tile');
    const html = tile && menuItems(tile.dataset.kind, tile.dataset.id);
    if (!html) return;
    const el = document.createElement('div');
    el.className = 'card-pop';
    el.setAttribute('role', 'menu');
    el.innerHTML = html;
    root.append(el);
    btn.setAttribute('aria-expanded', 'true');
    tile.classList.add('menu-open');
    cardPop = { el, btn };
    placeCardMenu();
    el.querySelector('button')?.focus({ preventScroll: true });
  }
  // Bajo el botón, alineado a su derecha; si no cabe abajo, encima. Al hacer scroll lo sigue
  // (y se cierra si el botón deja de verse o el recuadro se repinta).
  function placeCardMenu() {
    if (!cardPop) return;
    const { el, btn } = cardPop;
    const r = btn.getBoundingClientRect();
    if (!btn.isConnected || r.bottom < 0 || r.top > innerHeight) return closeCardMenu();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    el.style.top = `${r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  }
  const onPopOutside = (e) => {
    if (cardPop && !e.target.closest?.('.card-pop, [data-card-menu]')) closeCardMenu();
  };
  const onPopKey = (e) => {
    if (!cardPop) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return closeCardMenu(true);
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...cardPop.el.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };
  const onPopScroll = () => placeCardMenu();
  document.addEventListener('pointerdown', onPopOutside, true);
  document.addEventListener('keydown', onPopKey, true);
  window.addEventListener('scroll', onPopScroll, true);
  window.addEventListener('resize', onPopScroll);

  const folderTile = (l) => {
    const vids = videosOf(l.id);
    const subs = childFolders(l.id).length;
    // Carátula elegida (una foto o un video de dentro): se ve sola, en grande.
    const cover = l.cover && videoById(l.cover);
    const shown = cover && cover.libraryId === l.id ? [cover] : (vids.length ? vids : videosDeep(l.id)).slice(0, 4);
    const sp = spaceFor('folder', l.id);
    const received = sp && !sp.mine;
    return `
      <article class="tile tile-folder${isClass(l) ? ' tile-class' : ''}${l.pinnedTop ? ' pinned' : ''}" data-kind="library" data-id="${l.id}" data-drop-lib="${l.id}" draggable="false" title="Arrastra aquí videos para meterlos en «${esc(l.name)}»">
        <label class="sel" title="Seleccionar toda la carpeta para una rutina"><input type="checkbox" data-sel-lib="${l.id}"><b class="order"></b></label>
        ${cardFlags(`data-pin-lib="${l.id}"`, l.pinnedTop, null)}
        ${menuButton()}
        <a class="tile-thumb" href="#/biblioteca/${l.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((v) => `<span>${videoThumb(v)}</span>`).join('')}</span>`
          : `<span class="folder-empty">${isClass(l) ? ICON.classIcon : ICON.folder}</span>`}</a>
        <a class="tile-body" href="#/biblioteca/${l.id}">
          <h3>${isClass(l) ? ICON.classIcon : ICON.folder}<span class="name-edit" data-name="library:${l.id}" title="Haz clic para cambiar el nombre">${esc(l.name)}</span></h3>
          <div class="meta">${subs ? `<span>${subs} carpeta${subs === 1 ? '' : 's'}</span>` : ''}<span>${vids.length} elemento${vids.length === 1 ? '' : 's'}</span>${l.igCollections?.length ? '<i class="ig-tag" title="Sincronizada con Instagram">IG</i>' : ''}${(l.lists || []).some((x) => !/tiktok/i.test(x.url)) ? '<i class="ig-tag" title="Sincronizada con YouTube">YT</i>' : ''}${(l.lists || []).some((x) => /tiktok/i.test(x.url)) ? '<i class="ig-tag" title="Sincronizada con TikTok">TT</i>' : ''}${sp && (sp.members.length > 1 || !sp.mine) ? `<i class="share-tag" title="Carpeta colaborativa · ${esc(sharedLabel(sp))}">${SHARE_TAG}${sp.members.length}</i>` : byTag(l)}</div>
        </a>
      </article>`;
  };

  // ---------- audio en el recuadro: play, barra, tiempo, volumen y velocidad ----------
  // Un solo reproductor para toda la vista: al dar play en otro, el anterior se para.
  const audioFile = (v) => v.source.mediaType === 'audio' && Boolean(v.source.file);
  // Iconos dibujados (no letras): el triángulo con su centro óptico en el centro del círculo.
  const AUD_ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.2v11.6L18.2 12z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 6h3v12h-3zM13.5 6h3v12h-3z" fill="currentColor"/></svg>',
  };
  const AUDIO_SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
  const player = new Audio();
  let playingId = null;
  try {
    player.volume = Math.min(1, Math.max(0, Number(localStorage.getItem('jr-audio-vol') ?? 1)));
  } catch {
    /* volumen por defecto */
  }
  const audioPlayer = (v) => `
      <div class="tile-thumb aud" data-aud="${v.id}">
        <span class="aud-note" aria-hidden="true">♪</span>
        <button class="aud-play" data-aud-play="${v.id}" title="Reproducir" aria-label="Reproducir ${esc(v.title)}">${AUD_ICON.play}</button>
        <div class="aud-ctl">
          <input type="range" class="aud-seek" data-aud-seek min="0" max="1000" value="0" aria-label="Posición">
          <div class="aud-row">
            <span class="aud-time" data-aud-time>0:00</span>
            <label class="aud-vol" title="Volumen">🔊<input type="range" data-aud-vol min="0" max="100" value="${Math.round(player.volume * 100)}" aria-label="Volumen"></label>
            <select data-aud-rate title="Velocidad" aria-label="Velocidad">${AUDIO_SPEEDS.map((x) => `<option value="${x}" ${x === 1 ? 'selected' : ''}>${x === 1 ? '1×' : `${String(x).replace('.', ',')}×`}</option>`).join('')}</select>
          </div>
        </div>
      </div>`;
  const clockOf = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
  const audioBox = () => playingId && root.querySelector(`[data-aud="${playingId}"]`);
  const drawAudio = () => {
    root.querySelectorAll('[data-aud]').forEach((box) => {
      const on = box.dataset.aud === playingId;
      const btn = box.querySelector('[data-aud-play]');
      const icon = on && !player.paused ? 'pause' : 'play';
      if (btn.dataset.icon !== icon) (btn.innerHTML = AUD_ICON[icon]), (btn.dataset.icon = icon);
      btn.title = on && !player.paused ? 'Pausa' : 'Reproducir';
      box.classList.toggle('playing', on && !player.paused);
      if (!on) return;
      const dur = player.duration;
      if (document.activeElement !== box.querySelector('[data-aud-seek]')) box.querySelector('[data-aud-seek]').value = dur ? Math.round((player.currentTime / dur) * 1000) : 0;
      box.querySelector('[data-aud-time]').textContent = `${clockOf(player.currentTime)} / ${clockOf(dur)}`;
      box.querySelector('[data-aud-rate]').value = String(player.playbackRate);
    });
  };
  ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'ratechange'].forEach((ev) => player.addEventListener(ev, drawAudio));
  const startAudio = (id) => {
    const v = videoById(id);
    if (!v) return;
    if (playingId !== id) {
      playingId = id;
      player.src = `/media/${encodeURIComponent(v.source.file)}`;
      player.playbackRate = Number(root.querySelector(`[data-aud="${id}"] [data-aud-rate]`)?.value || 1);
    }
    if (player.paused) player.play().catch((err) => toast(err.message, 'error'));
    else player.pause();
  };
  root.addEventListener('click', (e) => {
    const play = e.target.closest('[data-aud-play]');
    if (play) {
      e.preventDefault();
      return startAudio(play.dataset.audPlay);
    }
  });
  root.addEventListener('input', (e) => {
    const box = e.target.closest('[data-aud]');
    if (!box) return;
    if (e.target.matches('[data-aud-vol]')) {
      player.volume = e.target.value / 100;
      root.querySelectorAll('[data-aud-vol]').forEach((x) => x !== e.target && (x.value = e.target.value));
      try {
        localStorage.setItem('jr-audio-vol', String(player.volume));
      } catch {
        /* solo esta vez */
      }
    } else if (e.target.matches('[data-aud-seek]')) {
      // Mover la barra de otra canción la pone a sonar desde ahí.
      if (playingId !== box.dataset.aud) startAudio(box.dataset.aud);
      const go = () => (player.currentTime = (e.target.value / 1000) * player.duration);
      if (player.duration) go();
      else player.addEventListener('loadedmetadata', go, { once: true });
    }
  });
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-aud]');
    if (!box || !e.target.matches('[data-aud-rate]')) return;
    if (playingId === box.dataset.aud) player.playbackRate = Number(e.target.value);
  });

  // En una clase, una foto o un video se puede poner de carátula de la clase.
  const COVER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M5 17.5l4.5-4.5 3 3 2.5-2.5 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const videoTile = (v, showFolder) => `
    <article class="tile tile-${isAudio(v) ? 'audio' : v.source.mediaType === 'image' ? 'image' : 'video'}${v.pinnedTop ? ' pinned' : ''}" data-kind="video" data-id="${v.id}" draggable="false">
      <label class="sel" title="Seleccionar para una rutina"><input type="checkbox" data-sel-video="${v.id}"><b class="order"></b></label>
      ${cardFlags(`data-pin-video="${v.id}"`, v.pinnedTop, isCover(v) ? v.id : null)}
      ${menuButton()}
      ${audioFile(v) ? audioPlayer(v) : `<a class="tile-thumb" href="#/video/${v.id}">${videoThumb(v)}</a>`}
      <${audioFile(v) ? 'div' : 'a'} class="tile-body" ${audioFile(v) ? '' : `href="#/video/${v.id}"`}>
        <h3><span class="name-edit" data-name="video:${v.id}" title="Haz clic para cambiar el nombre">${esc(v.title)}</span></h3>
        <div class="meta"><span class="vstatus">${statusHtml(v)}</span>${v.source.platform === 'spotify' ? '' : `<span>${esc(PLATFORM[v.source.platform] || '')}</span>`}${byTag(v)}${showFolder ? `<span>${esc(libraryLabel(libraryById(v.libraryId)))}</span>` : ''}</div>
      </${audioFile(v) ? 'div' : 'a'}>
    </article>`;

  // Rutina añadida a la página principal: se abre con un clic; la ✕ solo la quita de aquí.
  const routineTile = (r) => {
    const exs = r.items.map((it) => itemExercise(it)).filter(Boolean);
    const shown = exs.slice(0, 4);
    return `
      <article class="tile tile-routine" data-kind="routine" data-id="${r.id}">
        <button class="card-del" data-unpin="${r.id}" title="${isClass(folder) ? 'Quitar de la clase (la rutina no se borra)' : folder ? 'Quitar de esta carpeta (la rutina no se borra)' : 'Quitar de la página principal (la rutina no se borra)'}" aria-label="Quitar ${esc(r.name)} de la página principal">✕</button>
        <a class="tile-thumb" href="#/rutina/${r.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((e) => `<span>${exerciseFigure(e, 120)}</span>`).join('')}</span>`
          : '<span class="folder-empty">Vacía</span>'}</a>
        <a class="tile-body" href="#/rutina/${r.id}">
          <h3>${ICON.routine}<span class="name-edit" data-name="routine:${r.id}" title="Haz clic para cambiar el nombre">${esc(r.name)}</span></h3>
          <div class="meta"><span class="badge b-routine">Rutina</span><span>${exs.length} ejercicio${exs.length === 1 ? '' : 's'}</span></div>
        </a>
      </article>`;
  };

  // Siempre el último recuadro. Sin data-kind: no se selecciona, ni se arrastra, ni cuenta para el orden.
  const importTile = () => `
    <button class="tile tile-import" data-tile-import title="Importar links, imágenes o archivos">
      <span class="ti-in"><span class="ti-plus" aria-hidden="true">+</span>
      <span>Importar</span>
      <small>Haz clic o arrastra aquí</small></span>
    </button>`;

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

  // Dentro de una clase: barra para reproducirla (con su duración total), y en cada
  // recuadro un chip con el tramo (videos) o el tiempo en pantalla (fotos y rutinas).
  let classTotalRun = 0;
  const drawClass = () => {
    const bar = $('#classBar');
    if (!isClass(folder)) return void (bar.hidden = true);
    const lib = libraryById(folder.id);
    const items = classItems(lib);
    bar.hidden = false;
    bar.innerHTML = `
      <a class="btn primary" href="#/clase/${lib.id}" ${items.some((it) => inPlay(lib, it)) ? '' : 'aria-disabled="true"'}>▶ Reproducir clase</a>
      <span class="class-total"><span>Duración total</span> <b id="classTotal">…</b></span>`;
    const run = ++classTotalRun;
    totalSecs(lib).then((t) => run === classTotalRun && $('#classTotal') && ($('#classTotal').textContent = clock(t)));
    for (const it of items) {
      const tile = $(`#grid .tile[data-kind="${it.kind}"][data-id="${it.x.id}"]`);
      if (!tile || tile.querySelector('.cls-chip')) continue;
      const off = skipped(lib, it);
      tile.classList.toggle('cls-off', off);
      tile.insertAdjacentHTML('beforeend', `<button class="cls-skip${off ? ' on' : ''}" data-cls-skip="${it.x.id}" title="${off ? 'Volver a incluir en la clase' : 'Excluir de la clase: se queda en la carpeta, pero no se reproduce'}" aria-pressed="${off}">${off ? '↺' : '⊘'}</button>`);
      if (off) {
        tile.insertAdjacentHTML('beforeend', '<button class="cls-chip" disabled title="No se reproduce en la clase">Excluido</button>');
        continue;
      }
      const ok = playable(it);
      const type = itemType(it);
      tile.insertAdjacentHTML('beforeend', `<button class="cls-chip" data-cls-time="${it.kind}:${it.x.id}" ${ok ? '' : 'disabled'} title="${!ok ? 'Sin descargar: no entra en la clase' : type === 'video' ? 'Elegir el tramo que se reproduce en la clase' : 'Elegir cuánto tiempo se ve en la clase'}">⏱ ${ok ? esc(chipText(lib, it)) : 'Sin archivo'}</button>`);
      // Entero (sin tramo): en vez de «Todo el…», lo que dura (Spotify, cuando ya se sabe).
      const set = lib.classItems?.[it.x.id];
      const whole = ok && ['video', 'spotify'].includes(type) && !(set && (set.start != null || set.end != null));
      if (whole && (type === 'video' || set?.dur || it.x.source?.duration)) itemSecs(lib, it).then((t) => { const c = tile.querySelector('.cls-chip'); if (c && t) c.textContent = `⏱ ${clock(t)}`; });
      // Spotify importado antes de saber su duración: se le pregunta una vez y se apunta.
      else if (whole && type === 'spotify') api.spotifyCheck(it.x.source.url).then((r) => r?.duration && rememberDuration(lib, it.x.id, r.duration)).catch(() => {});
    }
  };

  const drawGrid = () => {
    setView(view);
    const { libs, vids } = visible();
    const searching = Boolean(filters.q.trim());
    const items = arranged();
    const nRt = items.filter((it) => it.kind === 'routine').length;
    const nCls = libs.filter(isClass).length;
    const nDirs = libs.length - nCls;
    $('#count').textContent = [
      nDirs && `${nDirs} carpeta${nDirs === 1 ? '' : 's'}`,
      nCls && `${nCls} clase${nCls === 1 ? '' : 's'}`,
      nRt && `${nRt} rutina${nRt === 1 ? '' : 's'}`,
      `${vids.length} elemento${vids.length === 1 ? '' : 's'}`,
    ].filter(Boolean).join(' · ');
    const tile = (it) => (it.kind === 'library' ? folderTile(it.x) : it.kind === 'routine' ? routineTile(it.x) : videoTile(it.x, searching));
    closeCardMenu(); // su recuadro se va a repintar
    $('#grid').innerHTML = (searching ? '' : importTile()) + (items.length
      ? items.map(tile).join('')
      : `<div class="empty-state"><h2>${searching ? 'Nada por aquí' : folder ? 'Carpeta vacía' : 'Tu biblioteca está vacía'}</h2>
          <p>Usa <b>Importar</b> en el menú de la derecha para pegar links o imágenes, o arrastra aquí videos y fotos.</p></div>`);
    drawClass();
    drawAudio();
    drawSelection();
    pinCursor = -1;
    setPinLabel([...$('#grid').querySelectorAll('.tile.pinned')], 0);
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
  // La rueda mueve de lado la barra de bibliotecas cuando no caben todas.
  root.addEventListener('wheel', (e) => {
    const bar = !e.ctrlKey && e.target.closest('.shelf-bar');
    if (!bar || bar.scrollWidth <= bar.clientWidth || !e.deltaY) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
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
    ].join(', ')}${last ? ` · última vez ${new Date(last).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
      ${cols.length === 1 && !lists.length && lib.nameLocked && lib.name !== lib.igCollections[0].name
        ? `<button class="btn small ghost" data-ig-name="${esc(lib.igCollections[0].name)}" title="La carpeta volverá a llamarse como la colección (y a cambiar si la renombras en Instagram)">Usar el nombre de Instagram</button>` : ''}
      <button class="btn small" data-act="ig-sync">Sincronizar</button>`;
  };

  // Carpeta compartida (esta o una de las de encima): con quién, y para gestionarlo.
  const drawShared = () => {
    // La carpeta compartida en sí lleva junto al nombre el mismo botón que las bibliotecas (con
    // cuántas personas hay); dentro de ella (compartido desde arriba) no sale nada.
    const sp = folder && sharedFolderOf(folder.id);
    const slot = $('#folderShare');
    if (slot) slot.innerHTML = sp && sp.rootId === folder.id
      ? `<button class="shelf-share${sp.members.length > 1 ? ' on' : ''}" data-share-folder="${sp.rootId}" title="${sp.mine ? 'Gestionar con quién se comparte' : 'Ver quién está'}" aria-label="${sp.mine ? 'Gestionar con quién se comparte' : 'Ver quién está'}">${SHARE_TAG}<span>${sp.members.length}</span></button>`
      : '';
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
    el.hidden = globalThis.JR_WEB || state.instagram.connected || off;
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

  // Rutinas ya creadas que se ponen en una biblioteca, carpeta o clase: una lista con casillas.
  const addRoutines = (target) => {
    const id = libraryById(target)?.root ? shelf.id : target;
    const lib = libraryById(id);
    if (!lib) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'ask cls-dlg';
    const list = [...state.routines].sort((a, b) => a.name.localeCompare(b.name));
    dlg.innerHTML = `<h3>Añadir rutinas a «${esc(libraryLabel(lib))}»</h3>
      ${list.length ? `<div class="cls-rt-list">${list.map((r) => `<label><input type="checkbox" value="${r.id}" ${isPinnedIn(r, id) ? 'checked disabled' : ''}> ${esc(r.name)}</label>`).join('')}</div>` : '<p>Aún no tienes rutinas.</p>'}
      <footer><button class="btn ghost" data-cancel type="button">Cancelar</button><button class="btn primary" data-save type="button">Añadir</button></footer>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    dlg.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) return dlg.close();
      if (!e.target.closest('[data-save]')) return;
      const ids = [...dlg.querySelectorAll('input:checked:not(:disabled)')].map((i) => i.value);
      dlg.close();
      try {
        for (const rid of ids) {
          upsert('routines', await api.updateRoutine(rid, { pinnedIn: [...new Set([...pinnedShelves(routineById(rid)), id])], pinned: true }));
        }
        emit('data');
        if (ids.length) toast(`${ids.length} rutina(s) añadida(s) a «${libraryLabel(lib)}»`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  };

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
    const media = files.filter((f) => /^(video|image|audio)\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|png|jpe?g|webp|gif|mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(f.name));
    for (const f of lists) await importLinks((await f.text()).split(/\s+/).filter(importable), target);
    if (!media.length) return lists.length || toast('Solo se aceptan videos, fotos, audio o un .txt con links', 'error');
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
    const urls = ($('#links')?.value || '').split(/\s+/).filter(importable).length;
    const parts = [urls && `${urls} link${urls === 1 ? '' : 's'}`, pasted.length && `${pasted.length} imagen${pasted.length === 1 ? '' : 'es'}`].filter(Boolean).map(tr);
    $('[data-act="import"]').textContent = parts.length ? `Importar ${parts.join(` ${tr('y')} `)}` : 'Importar';
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

  // Links de Google Drive, Dropbox, OneDrive o MEGA (un archivo o una carpeta entera).
  const CLOUD_RE = /drive\.google\.com|docs\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|sharepoint\.com|mega\.nz|mega\.co\.nz/i;
  // Varios links: se van añadiendo al cuadro, uno por línea, y se importan todos a la vez.
  function addLink() {
    const link = $('#oneLink').value.trim();
    if (!link) return $('#oneLink').focus();
    const box = $('#links');
    box.value = `${box.value.trim()}\n${link}`.trim();
    $('#oneLink').value = '';
    $('#oneLink').focus();
    countLinks();
  }
  function countLinks() {
    const n = $('#links')?.value.split(/\s+/).filter(importable).length || 0;
    const out = $('#linkCount');
    if (out) out.textContent = n ? tr(`${n} link${n === 1 ? '' : 's'} para importar`) : '';
  }

  // Carpeta nueva dentro de la elegida en «Importar en», que pasa a ser el destino.
  async function createTarget() {
    const name = $('#targetNew').value.trim();
    if (!name) return $('#targetNew').focus();
    const parent = libraryById($('#target').value);
    try {
      const lib = upsert('libraries', await api.createLibrary(name, parent?.root ? null : parent?.id || null));
      $('#target').innerHTML = libraryOptions(lib.id);
      $('#target').value = lib.id;
      $('#targetNew').value = '';
      $('#targetName').textContent = libraryLabel(lib);
      $('#targetNewRow').hidden = true;
      emit('data');
      toast(`Carpeta «${lib.name}» creada`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function importAll() {
    const all = $('#links').value.split(/\s+/).filter(importable);
    const clouds = all.filter((u) => CLOUD_RE.test(u));
    const urls = all.filter((u) => !CLOUD_RE.test(u));
    const files = pasted.map((p) => p.file);
    if (!all.length && !files.length) return toast('Pega links o una imagen en el cuadro', 'error');
    const target = importTarget();
    if (files.length) {
      clearPasted();
      await importFiles(files, target);
    }
    for (const u of clouds) {
      try {
        toast('Leyendo el link de la nube…');
        const r = await api.cloudImport(u, target);
        upsert('libraries', r.library);
        r.created.forEach((v) => upsert('videos', v));
        await finishImport(r.created, new Set());
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    if (urls.length) await importLinks(urls, target);
    if (clouds.length) $('#links').value = '';
    drawPasted();
  }

  // ---------- arrastrar videos y carpetas a otra carpeta ----------
  // Se sueltan sobre una carpeta (o sobre la ruta de arriba, para sacarlos). Si lo arrastrado
  // está seleccionado, se mueve todo lo seleccionado.

  let moving = null; // { videos: [ids], folders: [ids] }

  // Reordenar las bibliotecas: se mantiene pulsada una pestaña (medio segundo), se mueve y se suelta.
  // Con un clic normal solo se abre. Va con el puntero (no con arrastrar y soltar del navegador,
  // que decide al pulsar si algo se puede arrastrar y no deja esperar a mantenerla pulsada).
  let shelfDrag = null; // { id, pill, ghost } mientras se mueve una pestaña
  let hold = null;
  const clearPillMarks = () => root.querySelectorAll('.pill-before, .pill-after').forEach((x) => x.classList.remove('pill-before', 'pill-after'));
  const pillAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-shelf-pill]');
    if (!el || el.dataset.shelfPill === shelfDrag?.id) return null;
    const r = el.getBoundingClientRect();
    return { pill: el, after: x > r.left + r.width / 2 };
  };
  const endShelfDrag = async (drop) => {
    clearTimeout(hold?.timer);
    hold = null;
    if (!shelfDrag) return;
    const { id, pill, ghost } = shelfDrag;
    const at = drop && pillAt(drop.clientX, drop.clientY);
    shelfDrag = null;
    ghost.remove();
    pill.classList.remove('grab-ready', 'dragging');
    pill.dataset.held = '1'; // el clic que llega al soltar no abre ni renombra
    clearPillMarks();
    document.body.classList.remove('pill-moving');
    if (!at) return;
    const ids = shelves().map((l) => l.id).filter((x) => x !== id);
    ids.splice(ids.indexOf(at.pill.dataset.shelfPill) + (at.after ? 1 : 0), 0, id);
    try {
      const r = await api.orderLibraries(ids);
      r.libraries.forEach((l) => upsert('libraries', l));
      const bar = root.querySelector('.shelf-bar');
      if (bar) bar.outerHTML = shelfBar();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  root.addEventListener('pointerdown', (e) => {
    const pill = e.target.closest?.('[data-shelf-pill]');
    if (!pill || e.button !== 0 || e.target.closest('.tile-rename')) return;
    hold = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        // Ya se puede mover: la pestaña se levanta y una copia sigue al puntero.
        const r = pill.getBoundingClientRect();
        const ghost = pill.cloneNode(true);
        ghost.className = 'shelf-pill on pill-ghost';
        Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
        document.body.append(ghost);
        pill.classList.add('grab-ready', 'dragging');
        document.body.classList.add('pill-moving');
        shelfDrag = { id: pill.dataset.shelfPill, pill, ghost, dx: hold.x - r.left };
      }, 450),
    };
  });
  const onPillMove = (e) => {
    if (hold && !shelfDrag && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 6) {
      clearTimeout(hold.timer); // se movió antes de tiempo: no es mantener pulsado
      hold = null;
    }
    if (!shelfDrag) return;
    e.preventDefault();
    shelfDrag.ghost.style.left = e.clientX - shelfDrag.dx + 'px';
    clearPillMarks();
    const at = pillAt(e.clientX, e.clientY);
    if (at) at.pill.classList.add(at.after ? 'pill-after' : 'pill-before');
  };
  const onPillUp = (e) => endShelfDrag(e);
  const onPillEsc = (e) => e.key === 'Escape' && endShelfDrag(null);
  document.addEventListener('pointermove', onPillMove);
  document.addEventListener('pointerup', onPillUp);
  document.addEventListener('keydown', onPillEsc);
  // Tras mantenerla pulsada, soltar no la abre.
  root.addEventListener('click', (e) => {
    const pill = e.target.closest?.('[data-shelf-pill]');
    if (pill?.dataset.held) {
      e.preventDefault();
      e.stopImmediatePropagation();
      delete pill.dataset.held;
      return;
    }
  }, true);
  // Un clic abre; el nombre se cambia con doble clic (pestaña, título de la biblioteca o de la carpeta).
  const editName = () => {
    const input = $('#libName');
    input.readOnly = false;
    input.focus();
    input.select();
  };
  root.addEventListener('dblclick', (e) => {
    const pill = e.target.closest?.('[data-shelf-pill]');
    if (pill?.classList.contains('on') && !e.target.closest('.tile-rename')) return renameInline(pill, 'library', pill.dataset.shelfPill);
    const shelfNameEl = e.target.closest?.('[data-shelf-name]');
    if (shelfNameEl) return renameInline(shelfNameEl.closest('.shelf-tab'), 'library', shelfNameEl.dataset.shelfName);
    if (e.target.id === 'libName') editName();
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.id === 'libName') e.target.readOnly = true;
  });
  // Nombre de la carpeta o clase: Intro guarda y sale de la edición; Esc deja el que había.
  root.addEventListener('keydown', (e) => {
    if (e.target.id !== 'libName' || e.target.readOnly || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    e.preventDefault();
    if (e.key === 'Escape') e.target.value = libraryById(folder.id)?.name ?? e.target.value;
    e.target.blur();
  });
  // Las pestañas no se arrastran como links (eso las importaría como un video).
  root.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('[data-shelf-pill]')) e.preventDefault();
  }, true);

  // Arrastrar carpetas, videos y fotos. Va con el ratón (pulsar, mover y soltar), no con el
  // arrastrar y soltar del navegador, que en la app de Windows no siempre llega a soltar.
  //  · Sobre otro elemento de aquí: se recoloca delante o detrás y queda como «Mi orden».
  //  · En el centro de una carpeta, en la ruta de arriba o en la pestaña de otra biblioteca:
  //    se elige si moverlo o copiarlo ahí.
  const NO_DRAG = 'button, input, label, select, textarea, .tile-rename';
  let press = null; // dónde se pulsó (aún sin mover)
  let ghost = null; // la copia que sigue al ratón
  let dropTarget = null; // carpeta, ruta o pestaña bajo el ratón
  let suppressClick = false; // el clic que llega al soltar no abre nada

  // ¿Se puede soltar ahí? No en sí misma ni en sus subcarpetas, ni donde ya está todo.
  const canDropOn = (target) => {
    if (!moving) return false;
    // La biblioteca principal como destino: sus carpetas de arriba no tienen parentId.
    const tid = target && !libraryById(target)?.root ? target : null;
    if (moving.folders.some((f) => f === tid || descendantIds(f).includes(tid))) return false;
    // Una rutina se puede soltar en una carpeta o clase donde aún no esté.
    if (moving.routines.length) return Boolean(target && target !== place() && !moving.routines.some((id) => isPinnedIn(routineById(id), target)));
    const vidsHere = moving.videos.every((id) => videoById(id)?.libraryId === (target || rootLibrary().id));
    const libsHere = moving.folders.every((id) => (libraryById(id)?.parentId || null) === tid);
    return !(vidsHere && libsHere);
  };
  // Menú junto al ratón al soltar: Mover aquí / Copiar aquí (Esc o clic fuera, nada).
  const askCopyOrMove = (x, y) => new Promise((resolve) => {
    const menu = document.createElement('div');
    menu.className = 'drop-menu';
    menu.innerHTML = '<button data-how="move">Mover aquí</button><button data-how="copy">Copiar aquí</button><button data-how="" class="ghost">Cancelar</button>';
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    menu.querySelector('button').focus();
    const done = (how) => {
      menu.remove();
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', esc, true);
      resolve(how || null);
    };
    const outside = (ev) => !menu.contains(ev.target) && done(null);
    const esc = (ev) => ev.key === 'Escape' && done(null);
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-how]');
      if (b) done(b.dataset.how);
    });
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  });

  let reorderAt = null;
  // Sobre otro elemento de aquí: delante o detrás. Sobre una carpeta, solo en sus bordes (en el
  // centro se mete dentro); sobre un video o una foto, según la mitad.
  const ITEM = '#grid .tile[data-kind="video"], #grid .tile-folder, #grid .tile-routine';
  // En un hueco entre recuadros (o tras el último): el más cercano en esa fila.
  const nearestTile = (x, y) => {
    let best = null;
    for (const t of root.querySelectorAll(ITEM)) {
      const r = t.getBoundingClientRect();
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 4 + dx; // la fila manda
      if (!best || d < best.d) best = { t, d };
    }
    return best?.t || null;
  };
  const reorderOf = (under, x, y) => {
    if (!moving || moving.videos.length + moving.folders.length + moving.routines.length !== 1 || filters.q.trim()) return null;
    const draggedId = moving.videos[0] || moving.folders[0] || moving.routines[0];
    let t = under?.closest?.(ITEM);
    const inGap = !t && under?.closest?.('#grid') && !under.closest('[data-drop-lib]');
    if (inGap) {
      t = nearestTile(x, y);
      if (!t || t.dataset.id === draggedId) return null;
      const r = t.getBoundingClientRect();
      const rows = ['list', 'details'].includes(view);
      return { el: t, id: t.dataset.id, after: rows ? y > r.top + r.height / 2 : x > r.left + r.width / 2 };
    }
    if (!t || t.dataset.id === draggedId) return null;
    const r = t.getBoundingClientRect();
    const rows = ['list', 'details'].includes(view);
    const f = rows ? (y - r.top) / r.height : (x - r.left) / r.width;
    if (t.dataset.kind === 'library') return f < 0.3 ? { el: t, id: t.dataset.id, after: false } : f > 0.7 ? { el: t, id: t.dataset.id, after: true } : null;
    return { el: t, id: t.dataset.id, after: f > 0.5 };
  };
  const clearReorder = () => root.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  const endMove = () => {
    moving = null;
    pointer = null;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    reorderAt = null;
    dropTarget = null;
    press = null;
    ghost?.remove();
    ghost = null;
    clearReorder();
    root.classList.remove('drag-active');
    document.body.classList.remove('tile-moving');
    root.querySelectorAll('.drop-over, .dragging').forEach((x) => x.classList.remove('drop-over', 'dragging'));
  };

  const startMove = (tile, e) => {
    const kind = tile.dataset.kind;
    const inSel = selectedIndex(kind, tile.dataset.id) >= 0 && selection.length > 1;
    moving = kind === 'routine'
      ? { videos: [], folders: [], routines: [tile.dataset.id] }
      : inSel
        ? { videos: selection.filter((x) => x.type === 'video').map((x) => x.id), folders: selection.filter((x) => x.type === 'library').map((x) => x.id), routines: [] }
        : { videos: kind === 'video' ? [tile.dataset.id] : [], folders: kind === 'library' ? [tile.dataset.id] : [], routines: [] };
    window.getSelection()?.removeAllRanges();
    const r = tile.getBoundingClientRect();
    ghost = tile.cloneNode(true);
    ghost.classList.add('tile-ghost');
    ghost.classList.remove('on', 'dragging');
    const n = moving.videos.length + moving.folders.length + moving.routines.length;
    if (n > 1) ghost.insertAdjacentHTML('beforeend', `<b class="ghost-count">${n}</b>`);
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', transformOrigin: `${e.clientX - r.left}px ${e.clientY - r.top}px` });
    ghost.dataset.dx = e.clientX - r.left;
    ghost.dataset.dy = e.clientY - r.top;
    document.body.append(ghost);
    root.querySelectorAll('.tile[data-kind]').forEach((t) => t.classList.toggle('dragging', [...moving.videos, ...moving.folders, ...moving.routines].includes(t.dataset.id)));
    root.classList.add('drag-active');
    document.body.classList.add('tile-moving');
  };

  // En el móvil (dedo): mantener pulsado medio segundo selecciona el recuadro y ya se puede
  // arrastrar; si el dedo se mueve antes, es desplazar la página como siempre.
  let touchHold = null;
  let lastTouch = false;
  root.addEventListener('pointerdown', (e) => {
    lastTouch = e.pointerType === 'touch';
    if (e.button !== 0 || moving) return;
    const tile = e.target.closest?.('#grid .tile[data-kind="video"], #grid .tile[data-kind="library"], #grid .tile[data-kind="routine"]');
    if (!tile || e.target.closest(NO_DRAG)) return;
    if (lastTouch) {
      clearTimeout(touchHold?.timer);
      const hold = { x: e.clientX, y: e.clientY, tile, armed: false };
      hold.timer = setTimeout(() => {
        hold.armed = true;
        navigator.vibrate?.(15);
        const kind = tile.dataset.kind;
        if (kind !== 'routine' && selectedIndex(kind, tile.dataset.id) < 0) toggleSelected(kind, tile.dataset.id);
        suppressClick = true; // soltar sin arrastrar no abre el recuadro
        press = { x: hold.x, y: hold.y, tile };
      }, 450);
      touchHold = hold;
      return;
    }
    press = { x: e.clientX, y: e.clientY, tile };
  });
  const onHoldMove = (e) => {
    if (touchHold && !touchHold.armed && Math.hypot(e.clientX - touchHold.x, e.clientY - touchHold.y) > 8) {
      clearTimeout(touchHold.timer);
      touchHold = null;
    }
  };
  document.addEventListener('pointermove', onHoldMove);
  const endHold = () => {
    if (!touchHold) return;
    clearTimeout(touchHold.timer);
    if (touchHold.armed && !moving) setTimeout(() => (suppressClick = false), 400);
    touchHold = null;
  };
  document.addEventListener('pointerup', endHold);
  document.addEventListener('pointercancel', endHold);
  // Mientras se arrastra con el dedo, la página no se desplaza (si no, el navegador corta el arrastre).
  const onHoldTouch = (e) => {
    if (touchHold?.armed || moving) e.preventDefault();
  };
  document.addEventListener('touchmove', onHoldTouch, { passive: false });
  // Mantener pulsado no abre el menú del navegador (abrir imagen, descargar…).
  root.addEventListener('contextmenu', (e) => {
    if (lastTouch && e.target.closest?.('#grid .tile')) e.preventDefault();
  });
  let pointer = null; // dónde está el ratón mientras se arrastra
  let scrollRaf = 0;
  const retarget = (x, y) => {
    const under = document.elementFromPoint(x, y);
    clearReorder();
    root.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
    reorderAt = reorderOf(under, x, y);
    dropTarget = null;
    if (reorderAt) return reorderAt.el.classList.add(reorderAt.after ? 'drop-after' : 'drop-before');
    const t = under?.closest?.('[data-drop-lib]');
    if (t && root.contains(t) && canDropOn(t.dataset.dropLib)) {
      dropTarget = t;
      t.classList.add('drop-over');
    }
  };
  const autoScroll = () => {
    scrollRaf = 0;
    if (!moving || !pointer) return;
    const edge = 90;
    const v = pointer.y < edge ? -(edge - pointer.y) : pointer.y > innerHeight - edge ? pointer.y - (innerHeight - edge) : 0;
    if (!v) return;
    const before = scrollY;
    scrollBy(0, Math.round(v / 3));
    if (scrollY !== before) retarget(pointer.x, pointer.y);
    scrollRaf = requestAnimationFrame(autoScroll);
  };
  const onTileMove = (e) => {
    if (press && !moving && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) startMove(press.tile, e);
    if (!moving || !ghost) return;
    e.preventDefault();
    pointer = { x: e.clientX, y: e.clientY };
    ghost.style.transform = `translate(${e.clientX - ghost.dataset.dx}px, ${e.clientY - ghost.dataset.dy}px) scale(0.55)`;
    ghost.dataset.how = e.altKey ? 'Copiar' : e.ctrlKey ? 'Mover' : '';
    retarget(e.clientX, e.clientY);
    if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScroll);
  };
  const onTileUp = async (e) => {
    if (!moving) return (press = null);
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 300);
    const at = reorderAt;
    const t = dropTarget;
    const { videos, folders: libs, routines } = moving;
    endMove();
    // Alt + soltar en la misma carpeta (en un hueco o sobre otro recuadro): un duplicado aquí.
    const overGrid = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#grid');
    if (e.altKey && !t && overGrid && (videos.length || libs.length)) return moveOrCopy(place(), videos, libs, e.clientX, e.clientY, 'copy');
    if (at) return reorderTo(at, videos[0] || libs[0] || routines[0]);
    if (t && routines.length) return dropRoutines(routines, t.dataset.dropLib);
    // Alt + soltar copia y Ctrl + soltar mueve, sin preguntar; sin tecla, sale el menú.
    if (t) return moveOrCopy(t.dataset.dropLib || null, videos, libs, e.clientX, e.clientY, e.altKey ? 'copy' : e.ctrlKey ? 'move' : null);
  };
  // Rutina soltada en una clase: se añade (sigue también donde estaba). En otra carpeta: se mueve allí.
  const dropRoutines = async (ids, target) => {
    const lib = libraryById(target);
    if (!lib) return;
    const toClass = isClass(lib);
    try {
      for (const id of ids) {
        const now = pinnedShelves(routineById(id));
        const next = [...new Set([...(toClass ? now : now.filter((x) => x !== place())), lib.id])];
        upsert('routines', await api.updateRoutine(id, { pinnedIn: next, pinned: true }));
      }
      emit('data');
      toast(`Rutina ${toClass ? 'añadida a la clase' : 'movida a'} «${libraryLabel(lib)}»`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const onTileKey = (e) => e.key === 'Escape' && moving && endMove();
  document.addEventListener('pointermove', onTileMove);
  document.addEventListener('pointerup', onTileUp);
  document.addEventListener('pointercancel', endMove);
  document.addEventListener('keydown', onTileKey);
  root.addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  // Sin el arrastrar del navegador (imágenes y links de los recuadros).
  root.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('#grid .tile')) e.preventDefault();
  }, true);

  // Recolocar: se parte de cómo se ve ahora (sea cual sea el filtro) y queda como «Mi orden».
  const reorderTo = async ({ id, after }, dragged) => {
    const items = arranged().filter((it) => it.x.id !== dragged).map((it) => ({ kind: it.kind, id: it.x.id }));
    const at = items.findIndex((it) => it.id === id);
    items.splice(at + (after ? 1 : 0), 0, { kind: videoById(dragged) ? 'video' : routineById(dragged) ? 'routine' : 'library', id: dragged });
    try {
      const r = await api.orderItems(items, place());
      r.libraries.forEach((l) => upsert('libraries', l));
      r.videos.forEach((v) => upsert('videos', v));
      r.routines.forEach((x) => upsert('routines', x));
      if (sortBy !== 'custom') {
        sortBy = 'custom';
        try {
          localStorage.setItem('jr-sort', sortBy);
        } catch {
          /* solo esta vez */
        }
        const sel = root.querySelector('#sortBy');
        if (sel) sel.value = 'custom';
        toast('Colocado a mano: ahora se ordena por «Mi orden».');
      }
      emit('data');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // Llevar a otra carpeta o biblioteca: se elige mover o copiar.
  const moveOrCopy = async (target, videos, libs, x, y, chosen = null) => {
    const how = chosen || await askCopyOrMove(x, y);
    if (!how) return;
    const where = target ? libraryLabel(libraryById(target)) : shelfName(rootLibrary());
    const n = videos.length + libs.length;
    try {
      const client = actionApi();
      if (how === 'copy') {
        const r = await client.copyItems(videos, libs, target || rootLibrary().id);
        r.libraries.forEach((l) => upsert('libraries', l));
        r.videos.forEach((v) => upsert('videos', v));
        emit('data');
        queueDownload(r.videos.filter((v) => !v.source.file && canDownload(v)).map((v) => v.id));
        return toast(`${n === 1 ? 'Copiado' : `${n} copiados`} en «${where}»`);
      }
      if (videos.length) await moveVideos(videos, target || rootLibrary().id, client);
      for (const id of libs) await moveFolder(id, target, client);
      // Lo movido ya no está aquí: sale de la selección.
      for (let i = selection.length - 1; i >= 0; i--) if ([...videos, ...libs].includes(selection[i].id)) selection.splice(i, 1);
      emit('selection');
      toast(`${n === 1 ? 'Movido' : `${n} movidos`} a «${where}»`);
    } catch (err) {
      toast(err.message, 'error');
      await refresh();
      emit('data');
    }
  };

  // Arrastrar archivos o links a la cuadrícula.
  const main = $('#main');
  let dragDepth = 0;
  main.addEventListener('dragenter', (e) => {
    if (moving || shelfDrag) return; // se está arrastrando algo de la propia app
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
    if (text) importLinks(text.split(/\s+/).filter(importable), here());
  });
  $('#files').addEventListener('change', (e) => {
    importFiles([...e.target.files], panel === 'import' ? importTarget() : here());
    e.target.value = '';
  });

  // ---------- borrar ----------

  async function deleteItems(libs, videos) {
    const n = libs.reduce((a, l) => a + videosDeep(l.id).length, 0);
    const subs = libs.reduce((a, l) => a + descendantIds(l.id).length, 0);
    const inside = [subs && `${subs} subcarpeta${subs === 1 ? '' : 's'}`, n && `${n} elemento${n === 1 ? '' : 's'}`].filter(Boolean).map(tr);
    const parts = [];
    if (videos.length) parts.push(videos.length === 1 ? `«${videos[0].title}»` : tr(`${videos.length} elementos`));
    if (libs.length) parts.push(`${tr(libs.length === 1 ? `la carpeta «${libs[0].name}»` : `${libs.length} carpetas`)}${inside.length ? ` ${tr(`(con ${inside.join(` ${tr('y')} `)} dentro)`)}` : ''}`);
    if (!parts.length) return;
    // Carpetas que te compartieron: no se borran para nadie, sales de ellas.
    const leaving = libs.filter((l) => spaceFor('folder', l.id) && !spaceFor('folder', l.id).mine);
    if (leaving.length && leaving.length === libs.length && !videos.length) {
      const names = leaving.map((l) => `«${l.name}»`).join(', ');
      if (!await ask(`¿Salir de ${names}? Se quita de tu app (para los demás sigue igual). Lo que añadiste tú se queda en tu Biblioteca.`)) return;
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
    const sharing = libs.some((l) => [l.id, ...descendantIds(l.id)].some(id => spaceFor('folder', id)));
    const undoable = !sharing && !leaving.length;
    if (!await ask(`¿Borrar ${parts.join(` ${tr('y')} `)}? Las rutinas conservan sus ejercicios.${sharing ? ' Las personas con quienes la compartes dejarán de verla.' : ''} ${tr(undoable ? 'Puedes deshacerlo hasta cerrar la app.' : 'No se puede deshacer.')}`)) return;
    try {
      const client = undoable ? actionApi() : baseApi;
      await removeVideos(videos.map((v) => v.id), client);
      await removeLibraries(libs.map((l) => l.id), client);
      toast(`Borrado: ${parts.join(` ${tr('y')} `)}`);
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
    else if (t.id === 'sortBy') {
      sortBy = t.value;
      try {
        localStorage.setItem('jr-sort', sortBy);
      } catch {
        /* solo esta vez */
      }
      drawGrid();
    }
    else if (t.id === 'toRoutine') syncRoutineTarget();
    else if (t.id === 'libName') {
      api.renameLibrary(folder.id, t.value.trim() || folder.name).then((l) => (upsert('libraries', l), emit('data')));
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'links') (drawPasted(), countLinks());
    if (e.target.id === 'target') $('#targetName').textContent = libraryLabel(libraryById(e.target.value));
  });

  root.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !['newLib', 'newClassName'].includes(e.target.id)) return;
    e.preventDefault();
    if (e.target.id === 'newLib') createFolder();
    else createClass();
  });

  // La clase se crea en la biblioteca o carpeta que se está viendo.
  async function createClass() {
    if (inClass()) return;
    const name = $('#newClassName').value.trim();
    if (!name) return $('#newClassName').focus();
    try {
      const picked = [...root.querySelectorAll('[data-cls-pick]:checked')].map((c) => c.dataset.clsPick.split(':'));
      const lib = upsert('libraries', await api.createLibrary(name, folder?.id || topParent(), 'class'));
      // Lo elegido entra ya: los videos y fotos se mueven a la clase; las rutinas se añaden.
      const vids = picked.filter(([k]) => k === 'video').map(([, id]) => id);
      if (vids.length) await moveVideos(vids, lib.id, api);
      for (const [, id] of picked.filter(([k]) => k === 'routine')) {
        upsert('routines', await api.updateRoutine(id, { pinnedIn: [...new Set([...pinnedShelves(routineById(id)), lib.id])], pinned: true }));
      }
      panel = null;
      drawPanel();
      emit('data');
      toast(`Clase «${lib.name}» creada. Entra en ella y añade videos, fotos o rutinas.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function createFolder() {
    const name = $('#newLib').value.trim();
    if (!name) return $('#newLib').focus();
    const lib = upsert('libraries', await api.createLibrary(name, folder?.id || topParent()));
    $('#newLib').value = '';
    panel = null;
    emit('data');
    toast(`Carpeta «${lib.name}» creada`);
  }

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'oneLink') (e.preventDefault(), addLink());
    else if (e.target.id === 'targetNew') (e.preventDefault(), createTarget());
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && panel && !document.querySelector('dialog[open]')) ((panel = null), drawPanel());
  };
  document.addEventListener('keydown', onKey);

  // El nombre se escribe ahí mismo, sobre el recuadro (Enter guarda, Esc cancela). La app de
  // escritorio no tiene prompt().
  const RENAME = {
    library: { get: (id) => (isTop(libraryById(id)) ? shelfName(libraryById(id)) : libraryById(id)?.name), save: async (id, name) => upsert('libraries', await api.renameLibrary(id, name)), max: 60 },
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
        // La pestaña de la biblioteca no se repinta con los datos: se cambia aquí.
        root.querySelectorAll(`[data-shelf-name="${id}"], .shelf-pill[data-drop-lib="${id}"]`).forEach((el) => (el.textContent = name));
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

  /** Trae lo nuevo de las listas enlazadas a esas carpetas; el botón pulsado dice «Sincronizando…». */
  let syncing = false;
  async function syncFolders(libs, el) {
    libs = libs.filter(isLinked);
    if (!libs.length || syncing) return;
    syncing = true;
    const label = el?.querySelector('span') || el;
    const before = label?.textContent;
    if (el) el.disabled = true;
    if (label) label.textContent = tr('Sincronizando…');
    try {
      const { created, errors } = await syncInstagram(libs);
      if (errors.length) {
        toast(errors.slice(0, 3).join('\n'), 'error');
        if (!state.instagram.connected && libs.some((l) => l.igCollections?.length)) openInstagram({ view: 'connect', message: errors[0] });
      } else {
        toast(created.length ? `${created.length} publicación(es) nueva(s). Se descargan solas.` : 'Todo al día: no hay publicaciones nuevas.');
      }
    } finally {
      syncing = false;
      if (el?.isConnected) {
        el.disabled = false;
        if (label) label.textContent = before;
      }
      drawLinked();
    }
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const syncLib = t.closest('[data-sync-lib]');
    if (syncLib) {
      e.preventDefault();
      if (cardPop) closeCardMenu();
      return syncFolders([libraryById(syncLib.dataset.syncLib)], document.querySelector('[data-menu="sync"]'));
    }
    const more = t.closest('[data-card-menu]');
    if (more) {
      e.preventDefault();
      const again = cardPop?.btn === more;
      closeCardMenu();
      if (!again) openCardMenu(more);
      return;
    }
    if (cardPop && t.closest('.card-pop')) closeCardMenu();
    const dlOne = t.closest('[data-dl-video]');
    if (dlOne) {
      // Va dentro del enlace del recuadro: descarga sin abrir el video.
      e.preventDefault();
      const v = videoById(dlOne.dataset.dlVideo);
      if (!v) return;
      if (v.source.fetchError) upsert('videos', { ...v, source: { ...v.source, fetchError: null } });
      return queueDownload([v.id]);
    }
    const un = t.closest('[data-unpaste]');
    if (un) return clearPasted(+un.dataset.unpaste);
    if (t.closest('[data-close]')) return ((panel = null), drawPanel());
    const pick = t.closest('[data-pick-seg]');
    if (pick) {
      // Se va al video a elegir el tramo (el enlace navega); al volver, el panel sigue abierto.
      ui.returnToDraw = pick.dataset.pickSeg;
      return;
    }
    // Excluir de la clase (o volver a incluir).
    const clsSkip = t.closest('[data-cls-skip]');
    if (clsSkip && isClass(folder)) {
      e.preventDefault();
      const lib = libraryById(folder.id);
      const id = clsSkip.dataset.clsSkip;
      return setSkipped(lib, id, !lib.classItems?.[id]?.skip);
    }
    const clsTime = t.closest('[data-cls-time]');
    if (clsTime && isClass(folder)) {
      e.preventDefault();
      const [kind, id] = clsTime.dataset.clsTime.split(':');
      const lib = libraryById(folder.id);
      const it = classItems(lib).find((x) => x.kind === kind && x.x.id === id);
      if (it) (['video', 'spotify'].includes(itemType(it)) ? openSegment(lib, it.x) : openSecs(lib, it));
      return;
    }
    if (t.closest('[data-pin-jump]')) return jumpToPinned();
    if (t.closest('[data-tile-import]')) return panel === 'import' ? $('#links').focus() : openPanel('import');
    const unpin = t.closest('[data-unpin]');
    if (unpin) {
      await pinRoutines([unpin.dataset.unpin], false, place(), api);
      return toast(`Rutina quitada de «${folder ? folder.name : shelfName(shelf)}» (sigue en Rutinas)`);
    }
    const delVideo = t.closest('[data-del-video]');
    if (delVideo) return deleteItems([], [videoById(delVideo.dataset.delVideo)].filter(Boolean));
    const delLib = t.closest('[data-del-lib]');
    if (delLib) return deleteItems([libraryById(delLib.dataset.delLib)].filter(Boolean), []);
    const unlink = t.closest('[data-unlink]');
    if (unlink) {
      const lib = libraryById(folder.id);
      const col = lib.igCollections.find((c) => c.id === unlink.dataset.unlink);
      if (!await ask(`¿Dejar de sincronizar «${col.name}» con esta carpeta? Lo ya importado se queda.`)) return;
      upsert('libraries', await api.unlinkCollection(lib.id, col.id));
      return emit('data');
    }

    // Bibliotecas: crear otra, cambiar el nombre de la abierta o borrarla.
    if (t.closest('[data-shelf-add]')) {
      e.preventDefault();
      try {
        const l = upsert('libraries', await api.createShelf(tr('Nueva biblioteca')));
        // Al día ya: así la app no se repinta sola a los pocos segundos mientras escribes el nombre.
        await refresh();
        setActiveShelf(l.id);
        // Recién creada: en cuanto se abre, el nombre se escribe directamente.
        window.addEventListener('hashchange', () => setTimeout(() => document.querySelector(`[data-shelf-name="${l.id}"]`)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 150), { once: true });
        location.hash = `#/biblioteca/${l.id}`;
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    const shelfDel = t.closest('[data-shelf-del]');
    if (shelfDel) {
      e.preventDefault();
      const l = libraryById(shelfDel.dataset.shelfDel);
      const undoable = ![l.id, ...descendantIds(l.id)].some(id => spaceFor('folder', id));
      if (!await ask(`¿Borrar la biblioteca «${shelfName(l)}» con todas sus carpetas, videos y fotos? ${tr(undoable ? 'Puedes deshacerlo hasta cerrar la app.' : 'No se puede deshacer.')}`)) return;
      try {
        await removeLibraries([l.id], undoable ? actionApi() : baseApi);
        setActiveShelf('');
        location.hash = '#/biblioteca';
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    // Cambiar el nombre: pulsando el nombre de cualquier recuadro.
    // Pin: fija (o suelta) la carpeta o el video en la primera línea.
    const pinBtn = t.closest('[data-pin-lib], [data-pin-video]');
    if (pinBtn) {
      e.preventDefault();
      const isLib = Boolean(pinBtn.dataset.pinLib);
      const rec = isLib ? libraryById(pinBtn.dataset.pinLib) : videoById(pinBtn.dataset.pinVideo);
      try {
        if (isLib) upsert('libraries', await api.updateLibrary(rec.id, { pinnedTop: !rec.pinnedTop }));
        else upsert('videos', await api.updateVideo(rec.id, { pinnedTop: !rec.pinnedTop }));
        emit('data');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    // Carátula de la clase: la foto o el video elegido (otra vez, se quita).
    const coverEl = t.closest('[data-cover]');
    if (coverEl) {
      e.preventDefault();
      const id = coverEl.dataset.cover;
      try {
        upsert('libraries', await api.updateLibrary(folder.id, { cover: libraryById(folder.id)?.cover === id ? null : id }));
        emit('data');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    const nameEl = t.closest('[data-name]');
    if (nameEl) {
      e.preventDefault();
      const [kind, id] = nameEl.dataset.name.split(':');
      return renameInline(t.closest('.tile'), kind, id);
    }
    if (t.closest('[data-act="rename"]')) return editName();
    const igName = t.closest('[data-ig-name]');
    if (igName) {
      upsert('libraries', await api.updateLibrary(folder.id, { name: igName.dataset.igName, nameLocked: false }));
      $('#libName').value = igName.dataset.igName;
      return emit('data');
    }
    const netConnect = t.closest('[data-net-connect]');
    if (netConnect) {
      const key = netConnect.dataset.netConnect;
      if (key === 'gdrive') return connectDrive(netConnect);
      return key === 'instagram' ? openInstagram({ view: 'connect' }) : openNet(key);
    }
    const netOff = t.closest('[data-net-off]');
    if (netOff) {
      const key = netOff.dataset.netOff;
      if (key === 'gdrive') return toast('Para quitar el permiso de Drive, en Ajustes cierra la sesión de Google y vuelve a entrar.');
      const name = key === 'instagram' ? 'Instagram' : NET_INFO[key].name;
      if (!await ask(`¿Desconectar tu cuenta de ${name}? Lo importado se queda.`)) return;
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
      if (!await ask('¿Dejar de sincronizar esta lista con la carpeta? Lo ya importado se queda.')) return;
      upsert('libraries', await api.unlinkList(folder.id, unlinkList.dataset.unlinkList));
      return emit('data');
    }
    const shareBtn = t.closest('[data-share-folder]');
    if (shareBtn && libraryById(shareBtn.dataset.shareFolder)?.root) return shareMain();
    if (shareBtn) return openShare('folder', shareBtn.dataset.shareFolder);

    const menu = t.closest('[data-menu]')?.dataset.menu;
    if (menu === 'upload') return $('#files').click();
    if (menu === 'share') {
      // Si la carpeta está dentro de otra ya compartida, se gestiona esa.
      const id = shareTarget();
      if (id && libraryById(id)?.root) return shareMain();
      return id && openShare('folder', sharedFolderOf(id)?.rootId || id);
    }
    if (menu === 'selectAll') {
      const { libs, vids } = visible();
      const items = [...libs.map((l) => ['library', l.id]), ...vids.map((v) => ['video', v.id])];
      const all = items.length && items.every(([k, id]) => selectedIndex(k, id) >= 0);
      for (const [k, id] of items) if (all === selectedIndex(k, id) >= 0) toggleSelected(k, id);
      return;
    }
    if (menu === 'undo') return undoLast();
    if (menu === 'sync') return syncFolders(syncTargets(), t.closest('[data-menu]'));
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
    else if (act === 'add-link') addLink();
    else if (act === 'target-new') {
      $('#targetNewRow').hidden = false;
      $('#targetNew').focus();
    } else if (act === 'target-create') createTarget();
    else if (act === 'upload') $('#files').click();
    else if (act === 'mega') {
      const lib = libraryById($('#target')?.value || here());
      openMegaPicker(lib?.id || here(), lib ? libraryLabel(lib) : '');
    }
    else if (act === 'new-lib') createFolder();
    else if (act === 'add-routines') addRoutines(importTarget());
    else if (act === 'new-class') createClass();
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
      if (!await ask('¿Desconectar tu cuenta de Instagram? Lo importado se queda, pero no se podrá sincronizar hasta que vuelvas a conectar.')) return;
      state.instagram = await api.igDisconnect();
      emit('data');
      toast('Instagram desconectado');
    } else if (act === 'ig-sync' || act === 'ig-sync-all') {
      await syncFolders(act === 'ig-sync' ? [libraryById(folder.id)] : linkedLibraries(), el);
    } else if (act === 'clear-sel') {
      selection.length = 0;
      emit('selection');
    } else if (act === 'move' || act === 'copy') {
      const to = $('#moveTo').value;
      const videos = selection.filter((s) => s.type === 'video').map((s) => s.id);
      const libs = selection.filter((s) => s.type === 'library').map((s) => s.id);
      if (act === 'move' && libs.some((f) => f === to || descendantIds(f).includes(to))) return toast('Una carpeta no puede ir dentro de sí misma', 'error');
      el.disabled = true;
      await moveOrCopy(to === rootLibrary().id ? null : to, videos, libs, 0, 0, act);
      panel = null;
      emit('selection');
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

  // Filtros: lo iluminado se ve. Se recuerda entre vistas.
  const hideKinds = (() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('jr-hide-kinds')) || []);
    } catch {
      return new Set();
    }
  })();
  const drawHide = () => {
    root.querySelectorAll('.hide-chip').forEach((b) => {
      const hidden = hideKinds.has(b.dataset.hide);
      b.classList.toggle('on', !hidden);
      b.setAttribute('aria-pressed', !hidden);
      root.classList.toggle(`hide-${b.dataset.hide}`, hidden);
    });
  };
  $('#hideChips').addEventListener('click', (e) => {
    const k = e.target.closest('[data-hide]')?.dataset.hide;
    if (!k) return;
    if (!hideKinds.delete(k)) hideKinds.add(k);
    try {
      localStorage.setItem('jr-hide-kinds', JSON.stringify([...hideKinds]));
    } catch {
      /* solo esta vez */
    }
    drawHide();
  });
  drawHide();

  $('#q').addEventListener('input', (e) => ((filters.q = e.target.value), drawGrid()));
  // Móvil: el buscador se abre con la lupa; orden, vista y filtros van en un menú.
  const bar = $('.lib-bar');
  $('#qBtn').onclick = () => {
    const open = bar.classList.toggle('q-open');
    if (open) $('#q').focus();
    else if (!$('#q').value) bar.classList.remove('q-open');
  };
  $('#q').addEventListener('blur', () => { if (!$('#q').value) bar.classList.remove('q-open'); });
  const setTools = (on) => {
    bar.classList.toggle('tools-open', on);
    $('#toolsBtn').setAttribute('aria-expanded', String(on));
  };
  $('#toolsBtn').onclick = (e) => {
    e.stopPropagation();
    setTools(!bar.classList.contains('tools-open'));
  };
  document.addEventListener('pointerdown', function close(e) {
    if (!root.isConnected) return document.removeEventListener('pointerdown', close);
    if (bar.classList.contains('tools-open') && !e.target.closest('.lib-tools, #toolsBtn')) setTools(false);
  });

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
      if (['instagram', 'cloud', 'draw', 'move', 'copy'].includes(panel)) drawPanel();
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
      if (['draw', 'move', 'copy'].includes(panel)) drawPanel();
      else drawMenu();
    }
  };
  window.addEventListener('store', onStore);
  return () => {
    closeCardMenu();
    document.removeEventListener('pointerdown', onPopOutside, true);
    document.removeEventListener('keydown', onPopKey, true);
    window.removeEventListener('scroll', onPopScroll, true);
    window.removeEventListener('resize', onPopScroll);
    player.pause();
    window.removeEventListener('store', onStore);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointermove', onPillMove);
    document.removeEventListener('pointermove', onTileMove);
    document.removeEventListener('pointerup', onTileUp);
    document.removeEventListener('pointercancel', endMove);
    document.removeEventListener('keydown', onTileKey);
    document.removeEventListener('pointermove', onHoldMove);
    document.removeEventListener('pointerup', endHold);
    document.removeEventListener('pointercancel', endHold);
    document.removeEventListener('touchmove', onHoldTouch);
    endHold();
    endMove();
    document.removeEventListener('pointerup', onPillUp);
    document.removeEventListener('keydown', onPillEsc);
    endShelfDrag(null);
    clearTimeout(gridTimer);
    pasted.forEach((p) => URL.revokeObjectURL(p.url));
  };
}
