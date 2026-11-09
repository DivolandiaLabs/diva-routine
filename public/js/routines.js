// Apartado Rutinas: las rutinas montadas y, debajo, todos los dibujos creados. Se eligen
// dibujos (en orden) para montar una rutina, y se eligen rutinas para ponerlas en la página
// principal (o borrarlas). Menú de opciones a la derecha, como en la Biblioteca.
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import {
  state, refresh, emit, esc, toast, fmtTime, exerciseById, itemExercise, videoById, routineById, exerciseFigure,
  ui, drawings, routineFrom, pinRoutines, removeRoutine, spaceFor, addedByOther, who, sharedLabel,
  usedInRoutines, ask, shelves, shelfName, libraryById, pinnedShelves, setPinnedShelves, upsert,
} from './store.js';
import { openShare, SHARE_TAG } from './share.js';
import { openLibraryPicker } from './picker.js';
import { VIEWS, viewButtons, SORTS, SORT_ICON, PIN } from './views.js';
import { lang, tr } from './i18n.js';
import { normalizeTableStyle, tableStylePicker } from './routine-styles.js';

const FOLDER_ICON = '<svg class="fold-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  folder: svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M12 11v6M9 14h6"/>'),
  create: svg('<path d="M9 6h11M9 12h11M9 18h6"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/><path d="M19 15v6M16 18h6"/>'),
  pin: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  move: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13.5h6m-2-2 2 2-2 2"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  selectAll: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  routine: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  share: SHARE_TAG,
};

// Lo que Deshacer puede volver atrás: lo último, arriba.
const undoStack = [];

// Señal de compartido (con quién, o quién te lo compartió) en un recuadro.
const shareTag = (type, r) => {
  const sp = spaceFor(type, r.id);
  if (sp) return `<i class="share-tag" title="${esc(sharedLabel(sp))}">${SHARE_TAG}${sp.members.length}</i>`;
  const by = addedByOther(r);
  return by ? `<span class="by" title="Lo añadió ${esc(by)}">de ${esc(who(by))}</span>` : '';
};

export function renderRoutines(root) {
  const filters = { q: '' };
  let sortBy = 'custom';
  try {
    const saved = localStorage.getItem('jr-sort-rutinas');
    if (SORTS.some(([k]) => k === saved)) sortBy = saved;
  } catch {
    /* sin almacenamiento */
  }
  // Dibujos elegidos para la rutina (en orden) y rutinas elegidas. Los recién sacados en la
  // Biblioteca llegan ya elegidos.
  const pickedEx = (ui.newDrawings || []).filter((id) => exerciseById(id));
  const fresh = new Set(pickedEx);
  ui.newDrawings = null;
  const pickedRt = [];
  let panel = ui.routineTarget || pickedEx.length ? 'create' : null;

  root.innerHTML = `
    <div class="lib2">
      <section class="lib-main">
        <div class="lib-sticky">
        <nav class="shelf-bar" id="rtTabs" aria-label="Grupos de rutinas"></nav>
        <header class="lib-top">
          <nav class="crumbs" id="rtTitle"></nav>
          <input id="q" type="search" placeholder="Buscar secuencias o rutinas…" aria-label="Buscar">
          <div class="lib-tools rt-tools">
            <button class="pin-jump" id="pinJump" data-pin-jump disabled title="Ir a lo anclado" aria-label="Ir a lo anclado">${PIN}<b></b></button>
            <label class="sorter" title="Ordenar">${SORT_ICON}<select id="sortBy" aria-label="Ordenar">${SORTS.map(([k, label]) => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <div class="views" id="views" role="group" aria-label="Vista">${viewButtons()}</div>
          </div>
        </header>
        </div>
        <h3 class="sec-title">Rutinas <small id="nRt"></small></h3>
        <div class="tiles" id="rtGrid"></div>
        <h3 class="sec-title"><span id="exTitle">Secuencias de ejercicios</span> <small id="nEx"></small></h3>
        <p class="hint" id="exHint"></p>
        <div class="tiles" id="exGrid"></div>
      </section>
      <aside class="panel" id="panel" hidden></aside>
      <nav class="opts" id="opts" aria-label="Opciones"></nav>
    </div>`;
  const $ = (s) => root.querySelector(s);

  const matches = (text) => !filters.q.trim() || text.toLowerCase().includes(filters.q.trim().toLowerCase());
  const sorted = (list, nameOf, typeOf) => {
    const name = (x) => String(nameOf(x) || '').toLocaleLowerCase(lang);
    const sorter = {
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      old: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      az: (a, b) => name(a).localeCompare(name(b), lang),
      za: (a, b) => name(b).localeCompare(name(a), lang),
      type: (a, b) => typeOf(a).localeCompare(typeOf(b), lang) || name(a).localeCompare(name(b), lang),
    }[sortBy];
    return sorter ? [...list].sort(sorter) : list;
  };

  // Pestañas de grupos: con libraryId, lo anclado a esa biblioteca; sin él, las rutinas que se le añadan.
  let activeTab = '';
  try {
    activeTab = localStorage.getItem('jr-rt-tab') || '';
  } catch {
    /* sin almacenamiento */
  }
  const tabs = () => (state.routineTabs || []).filter((t) => !t.libraryId || libraryById(t.libraryId))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const tabName = (t) => (t.libraryId ? shelfName(libraryById(t.libraryId)) : t.name);
  const tabNow = () => tabs().find((t) => t.id === activeTab) || null;
  const inTab = (r, t) => (t.libraryId ? pinnedShelves(r).includes(t.libraryId) : Boolean(r.tabs?.includes(t.id)));
  const visibleRoutines = () => {
    const tab = tabNow();
    return sorted(state.routines.filter((r) => matches(r.name) && (!tab || inTab(r, tab))), (r) => r.name, () => '');
  };
  const remember = (undo) => {
    undoStack.push(undo);
    drawMenu();
  };
  // Para volver a dejar las rutinas en las pestañas y bibliotecas donde estaban.
  const snapshot = (ids) => {
    const was = ids.map((id) => ({ id, tabs: routineById(id)?.tabs || [], shelves: pinnedShelves(routineById(id)) }));
    return async () => {
      for (const w of was) {
        if (!routineById(w.id)) continue;
        await setPinnedShelves(w.id, w.shelves);
        upsert('routines', await api.updateRoutine(w.id, { tabs: w.tabs }));
      }
    };
  };

  async function undoLast() {
    const undo = undoStack.pop();
    if (!undo) return;
    try {
      await undo();
      toast('Cambio deshecho');
    } catch (err) {
      toast(err.message, 'error');
    }
    drawGrids();
  }

  // El archivo de la viñeta se duplica: al borrar un dibujo se borran los suyos.
  async function ownImage(file) {
    const blob = await fetch(`/media/${encodeURI(file)}`).then((r) => r.blob());
    return (await api.uploadFrame(blob, file)).file;
  }

  async function copyPicked() {
    const made = { routines: [], exercises: [] };
    try {
      for (const id of pickedRt) {
        const r = routineById(id);
        const copy = upsert('routines', await api.createRoutine({ name: `${r.name} (${tr('copia')})`, subtitle: r.subtitle || '', items: r.items, notes: r.notes, tabs: r.tabs || [], tableStyle: normalizeTableStyle(r.tableStyle) }));
        made.routines.push(copy.id);
      }
      for (const id of pickedEx) {
        const e = exerciseById(id);
        const keyframes = [];
        for (const k of e.keyframes || []) {
          const c = { ...k };
          if (k.img) c.img = await ownImage(k.img);
          if (k.origImg) c.origImg = await ownImage(k.origImg);
          keyframes.push(c);
        }
        const { id: _id, pinnedTop: _pin, ...rest } = e;
        const copy = upsert('exercises', await api.createExercise({ ...rest, title: `${e.title} (${tr('copia')})`, keyframes }));
        made.exercises.push(copy.id);
      }
      toast('Copiado');
    } catch (err) {
      toast(err.message, 'error');
    }
    if (made.routines.length || made.exercises.length) remember(async () => {
      for (const id of made.routines) if (routineById(id)) await removeRoutine(id);
      for (const id of made.exercises) if (exerciseById(id)) await api.deleteExercise(id);
      await refresh();
    });
    pickedRt.length = pickedEx.length = 0;
    drawGrids();
  }

  // Sale de la pestaña en la que estás y entra en la elegida.
  function moveMenu(btn) {
    document.querySelector('.pin-menu')?.remove();
    const ids = [...pickedRt];
    const from = tabNow();
    const menu = document.createElement('div');
    menu.className = 'pin-menu drop-menu';
    menu.innerHTML = `<b>Mover a…</b>${tabs().filter((t) => t.id !== from?.id).map((t) => `<button data-to-tab="${t.id}">${esc(tabName(t))}</button>`).join('')}`;
    document.body.append(menu);
    const b = btn.getBoundingClientRect();
    menu.style.top = `${Math.min(b.top, innerHeight - menu.offsetHeight - 12)}px`;
    menu.style.left = `${Math.max(8, b.left - menu.offsetWidth - 8)}px`;
    const close = () => {
      menu.remove();
      document.removeEventListener('mousedown', away, true);
    };
    const away = (ev) => {
      if (!menu.contains(ev.target) && !btn.contains(ev.target)) close();
    };
    document.addEventListener('mousedown', away, true);
    menu.addEventListener('click', async (e) => {
      const to = tabs().find((t) => t.id === e.target.closest('[data-to-tab]')?.dataset.toTab);
      if (!to) return;
      close();
      try {
        remember(snapshot(ids));
        for (const id of ids) {
          const r = routineById(id);
          if (from?.libraryId) await setPinnedShelves(id, pinnedShelves(r).filter((x) => x !== from.libraryId));
          else if (from) upsert('routines', await api.updateRoutine(id, { tabs: (r.tabs || []).filter((x) => x !== from.id) }));
          await putInTab(id, to);
        }
        toast(`Movido a «${tabName(to)}»`);
      } catch (err) {
        toast(err.message, 'error');
      }
      pickedRt.length = 0;
      drawGrids();
    });
  }

  // Menú con una casilla por biblioteca: las rutinas marcadas se ven arriba en las elegidas.
  function shelfMenu(btn) {
    document.querySelector('.pin-menu')?.remove();
    const ids = [...pickedRt];
    const has = (l) => ids.every((id) => pinnedShelves(routineById(id)).includes(l.id));
    const menu = document.createElement('div');
    menu.className = 'pin-menu drop-menu';
    menu.innerHTML = `<b>Que se vea arriba en…</b>${shelves().map((l) => `<label><input type="checkbox" value="${l.id}" ${has(l) ? 'checked' : ''}> ${esc(shelfName(l))}</label>`).join('')}`;
    document.body.append(menu);
    const b = btn.getBoundingClientRect();
    menu.style.top = `${Math.min(b.top, innerHeight - menu.offsetHeight - 12)}px`;
    menu.style.left = `${Math.max(8, b.left - menu.offsetWidth - 8)}px`;
    menu.addEventListener('change', async (e) => {
      try {
        remember(snapshot(ids));
        for (const id of ids) {
          const now = pinnedShelves(routineById(id)).filter((x) => x !== e.target.value);
          await setPinnedShelves(id, e.target.checked ? [...now, e.target.value] : now);
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    const away = (ev) => {
      if (menu.contains(ev.target) || btn.contains(ev.target)) return;
      menu.remove();
      document.removeEventListener('mousedown', away, true);
    };
    document.addEventListener('mousedown', away, true);
  }

  async function putInTab(id, tab) {
    const r = routineById(id);
    if (!r || inTab(r, tab)) return;
    if (tab.libraryId) await setPinnedShelves(id, [...pinnedShelves(r), tab.libraryId]);
    else upsert('routines', await api.updateRoutine(id, { tabs: [...(r.tabs || []), tab.id] }));
  }

  // Carpetas de secuencias: la abierta se recuerda. Al buscar se ve todo, esté donde esté.
  let openFolder = '';
  try {
    openFolder = localStorage.getItem('jr-seq-folder') || '';
  } catch {
    /* sin almacenamiento */
  }
  const seqFolders = () => [...(state.seqFolders || [])].sort((a, b) => a.name.localeCompare(b.name, lang));
  const folderNow = () => seqFolders().find((f) => f.id === openFolder) || null;
  const setFolder = (id) => {
    openFolder = id || '';
    try {
      localStorage.setItem('jr-seq-folder', openFolder);
    } catch {
      /* solo esta vez */
    }
    drawGrids();
  };
  const searching = () => Boolean(filters.q.trim());
  const inFolderNow = (e) => {
    const f = folderNow();
    const own = seqFolders().some((x) => x.id === e.folderId) ? e.folderId : '';
    return (f ? f.id : '') === own;
  };
  const exInTab = (e, t) => Boolean(e.tabs?.includes(t.id));
  const visibleDrawings = () => {
    const tab = tabNow();
    return sorted(drawings().filter((e) => (!tab || exInTab(e, tab)) && (searching() || inFolderNow(e)) && matches([e.title, e.category, videoById(e.videoId)?.title, ...(e.technique?.tags || [])].join(' '))), (e) => e.title, (e) => e.category || '');
  };

  // ---------- recuadros ----------

  const routineTile = (r) => {
    const exs = r.items.map((it) => itemExercise(it)).filter(Boolean);
    const shown = exs.slice(0, 4);
    return `
      <article class="tile tile-routine" data-kind="routine" data-id="${r.id}" draggable="true">
        <label class="sel" title="Elegir (para la página principal o para borrar)"><input type="checkbox" data-sel-rt="${r.id}"><b class="order"></b></label>
        <button class="card-pin${r.pinnedTop ? ' on' : ''}" data-pin-rt="${r.id}" title="${r.pinnedTop ? 'Quitar el pin' : 'Fijar arriba'}" aria-label="${r.pinnedTop ? 'Quitar el pin de' : 'Fijar arriba'} ${esc(r.name)}" aria-pressed="${Boolean(r.pinnedTop)}">${PIN}</button>
        <button class="card-del" data-del-rt="${r.id}" title="Borrar esta rutina" aria-label="Borrar ${esc(r.name)}">✕</button>
        <a class="tile-thumb" href="#/rutina/${r.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((e) => `<span>${exerciseFigure(e, 120)}</span>`).join('')}</span>`
          : '<span class="folder-empty">Vacía</span>'}</a>
        <a class="tile-body" href="#/rutina/${r.id}">
          <h3>${ICON.routine}<span data-edit-rt contenteditable="plaintext-only" spellcheck="false" title="Clic para cambiar el nombre">${esc(r.name)}</span></h3>
          <div class="meta"><span>${exs.length} ejercicio${exs.length === 1 ? '' : 's'}</span>${shareTag('routine', r)}</div>
        </a>
      </article>`;
  };

  // Recuadro donde soltar dibujos para crear una rutina nueva con ellos (o clic: una vacía).
  const newRoutineTile = () => `
    <button class="tile tile-new-routine" data-new-routine title="Clic: crea una rutina vacía · suelta aquí secuencias de ejercicios para crear una con ellas">
      <span class="nr-plus">+</span><span>Nueva rutina</span><small>Arrastra aquí secuencias</small>
    </button>`;

  // Primer recuadro de Dibujos: abre el buscador de lo importado.
  const addDrawingTile = () => `
    <button class="tile tile-new-routine tile-add-drawing" data-pick-library title="Busca en tus bibliotecas un video o una foto para sacar sus dibujos">
      <span class="nr-plus">+</span><span>Añadir secuencia</span><small>Elige de tus bibliotecas</small>
    </button>`;

  // Carpeta de secuencias: clic para abrirla; suelta encima secuencias para guardarlas dentro.
  const folderTile = (f) => {
    const inside = drawings().filter((e) => e.folderId === f.id);
    const phases = inside.slice(0, 4).map((e) => phasesSVG(e.keyframes, { size: 120, numbers: false })[0]).filter(Boolean);
    return `
      <article class="tile tile-seq-folder" data-seq-folder="${f.id}" title="Clic para abrir · suelta aquí secuencias para guardarlas en la carpeta">
        <button class="card-del" data-del-seq-folder="${f.id}" title="Quitar la carpeta (sus secuencias no se borran: salen fuera)" aria-label="Quitar la carpeta ${esc(f.name)}">✕</button>
        <div class="tile-thumb seq-folder-thumb">${phases.length ? `<span class="mosaic m${phases.length}">${phases.map((p) => `<span>${p.svg}</span>`).join('')}</span>` : FOLDER_ICON}</div>
        <div class="tile-body">
          <h3>${FOLDER_ICON}<span data-edit-seq-folder="${f.id}" contenteditable="plaintext-only" spellcheck="false" title="Clic para cambiar el nombre">${esc(f.name)}</span></h3>
          <div class="meta"><span>${inside.length} secuencia${inside.length === 1 ? '' : 's'}</span></div>
        </div>
      </article>`;
  };
  const newFolderTile = () => `
    <button class="tile tile-new-routine tile-new-seq-folder" data-new-seq-folder title="Crear una carpeta para ordenar secuencias">
      <span class="nr-plus">+</span><span>Nueva carpeta</span><small>Arrastra aquí secuencias</small>
    </button>`;
  // Dentro de una carpeta: volver a todas (y soltar aquí para sacar secuencias de la carpeta).
  const backTile = () => `
    <button class="tile tile-new-routine tile-seq-back" data-seq-folder="" title="Volver a todas las secuencias · suelta aquí para sacarlas de la carpeta">
      <span class="nr-plus">←</span><span>Todas las secuencias</span><small>Suelta aquí para sacarlas</small>
    </button>`;

  const drawingTile = (e) => {
    const v = videoById(e.videoId);
    const phases = phasesSVG(e.keyframes, { size: 120, numbers: false }).slice(0, 4);
    // Sin su video aquí (un dibujo que te compartieron): no hay video que abrir.
    const link = v ? `href="#/video/${e.videoId}" title="Abrir el video (para cambiar el tramo)"` : `data-share-ex="${e.id}" title="${esc(sharedLabel(spaceFor('drawing', e.id)) || 'Secuencia compartida contigo')}"`;
    return `
      <article class="tile tile-drawing ${fresh.has(e.id) ? 'new' : ''}" data-kind="drawing" data-id="${e.id}" draggable="true" title="Arrastra a una rutina para añadirla, o sobre otra secuencia para cambiar su orden">
        <label class="sel" title="Elegir para la rutina (el número es su orden)"><input type="checkbox" data-sel-ex="${e.id}"><b class="order"></b></label>
        <button class="card-pin${e.pinnedTop ? ' on' : ''}" data-pin-ex="${e.id}" title="${e.pinnedTop ? 'Quitar el pin' : 'Fijar arriba'}" aria-label="${e.pinnedTop ? 'Quitar el pin de' : 'Fijar arriba'} ${esc(e.title)}" aria-pressed="${Boolean(e.pinnedTop)}">${PIN}</button>
        <button class="card-del" data-del-ex="${e.id}" title="Borrar esta secuencia (sale también de las rutinas)" aria-label="Borrar ${esc(e.title)}">✕</button>
        <a class="tile-thumb" ${link}><span class="mosaic m${phases.length}">${phases.map((p) => `<span>${p.svg}</span>`).join('')}</span></a>
        <div class="tile-body">
          <h3><span data-edit-ex="title" contenteditable="plaintext-only" spellcheck="false" title="Clic para editar">${esc(e.title)}</span></h3>
          <div class="meta">${e.category ? `<span data-edit-ex="category" contenteditable="plaintext-only" spellcheck="false" title="Clic para editar">${esc(tr(e.category))}</span>` : ''}${v || e.srcLabel ? `<span class="tile-src" data-edit-ex="srcLabel" contenteditable="plaintext-only" spellcheck="false" title="Clic para editar">${esc(e.srcLabel ?? `${v.title.slice(0, 28)}${v.source.mediaType === 'video' && e.end != null ? ` · ${fmtTime(e.start)}–${fmtTime(e.end)}` : ''}`)}</span>` : ''}${shareTag('drawing', e)}</div>
        </div>
      </article>`;
  };

  // La misma barra que Bibliotecas. Una pestaña con biblioteca se llama como ella: su nombre se cambia allí.
  const drawTabs = () => {
    const tab = tabNow();
    $('#rtTabs').innerHTML = `
      <button class="shelf-pill${tab ? '' : ' on'}" data-rt-tab="" data-drop-all title="Suelta aquí secuencias para sacarlas de la pestaña abierta">${esc(tr('Todas las Rutinas'))}</button>
      ${tabs().map((t) => `<button class="shelf-pill${t === tab ? ' on' : ''}" data-rt-tab="${t.id}" data-drop-tab="${t.id}" draggable="true" title="${t === tab && !t.libraryId ? 'Haz clic para cambiar el nombre · arrastra para moverla' : 'Arrastra para moverla'}">${esc(tabName(t))}</button>`).join('')}
      <button class="shelf-add" data-rt-tab-add title="Añadir pestaña de rutinas" aria-label="Añadir pestaña de rutinas">+</button>`;
    $('#rtTitle').innerHTML = tab
      ? `<h2 class="shelf-tab on"><span class="shelf-name" id="rtName"${tab.libraryId ? '' : ' data-rt-rename title="Haz clic para cambiar el nombre"'}>${esc(tabName(tab))}</span><button class="shelf-del" data-rt-tab-del="${tab.id}" title="Quitar pestaña" aria-label="Quitar pestaña">✕</button></h2>`
      : '<h2>Todas las Rutinas</h2>';
  };

  function renameTab(tab) {
    if (!tab || tab.libraryId) return;
    const title = $('#rtTitle .shelf-tab');
    if (!title || title.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'tile-rename';
    input.value = tab.name;
    input.maxLength = 40;
    input.setAttribute('aria-label', 'Nuevo nombre');
    title.classList.add('renaming');
    title.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      try {
        if (save && name && name !== tab.name) upsert('routineTabs', await api.renameRoutineTab(tab.id, name));
      } catch (err) {
        toast(err.message, 'error');
      }
      drawTabs();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function moveTab(id, beforeId) {
    const ids = tabs().map((t) => t.id).filter((x) => x !== id);
    ids.splice(ids.indexOf(beforeId), 0, id);
    ids.forEach((tabId, i) => (state.routineTabs.find((t) => t.id === tabId).order = i));
    drawTabs();
    try {
      await api.orderRoutineTabs(ids);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const selectTab = (id) => {
    activeTab = id;
    try {
      localStorage.setItem('jr-rt-tab', id);
    } catch {
      /* solo esta vez */
    }
    drawTabs();
    drawGrids();
  };

  async function addTab(data) {
    try {
      const tab = await api.createRoutineTab(data);
      state.routineTabs ||= [];
      upsert('routineTabs', tab);
      selectTab(tab.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openTabMenu(btn) {
    document.getElementById('rtTabMenu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'rtTabMenu';
    menu.className = 'drop-menu rt-tab-menu';
    const taken = new Set(tabs().map((t) => t.libraryId));
    const libs = shelves().filter((l) => !taken.has(l.id));
    menu.innerHTML = `${libs.map((l) => `<button class="rt-menu-lib" data-tab-lib="${l.id}">${esc(shelfName(l))}</button>`).join('')}
      ${libs.length ? '<span class="opt-sep"></span>' : ''}
      <button data-tab-new>Nueva pestaña de rutinas</button>`;
    document.body.append(menu);
    const b = btn.getBoundingClientRect();
    menu.style.left = `${Math.min(b.left, innerWidth - menu.offsetWidth - 12)}px`;
    menu.style.top = `${b.bottom + 6}px`;
    const away = (ev) => {
      if (menu.contains(ev.target)) return;
      close();
    };
    const close = () => {
      menu.remove();
      document.removeEventListener('mousedown', away, true);
    };
    document.addEventListener('mousedown', away, true);
    menu.addEventListener('click', (e) => {
      const lib = e.target.closest('[data-tab-lib]')?.dataset.tabLib;
      if (lib) {
        close();
        return addTab({ libraryId: lib });
      }
      if (!e.target.closest('[data-tab-new]')) return;
      menu.innerHTML = '<input id="rtTabName" maxlength="40" placeholder="Nombre de la pestaña" aria-label="Nombre de la pestaña">';
      const input = menu.querySelector('#rtTabName');
      input.focus();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') close();
        if (ev.key !== 'Enter' || !input.value.trim()) return;
        close();
        addTab({ name: input.value });
      });
    });
  }

  const setSort = (v) => {
    sortBy = v;
    $('#sortBy').value = v;
    try {
      localStorage.setItem('jr-sort-rutinas', v);
    } catch {
      /* solo esta vez */
    }
  };

  const drawGrids = () => {
    const rts = visibleRoutines();
    const exs = visibleDrawings();
    $('#nRt').textContent = `(${rts.length})`;
    $('#nEx').textContent = `(${exs.length})`;
    $('#rtGrid').innerHTML = newRoutineTile() + rts.map(routineTile).join('')
      + (!rts.length && state.routines.length ? '<p class="hint">Ninguna rutina coincide con la búsqueda.</p>' : '');
    // Con secuencias no hace falta explicación; sin ninguna, se dice cómo sacarlas.
    const tabEmpty = drawings().length > 0 && tabNow() && !exs.length && !searching();
    $('#exHint').hidden = drawings().length > 0 && !tabEmpty;
    $('#exHint').innerHTML = tabEmpty
      ? `Aún no hay secuencias en «${esc(tabName(tabNow()))}». Ve a «Todas las Rutinas» y arrastra secuencias a esta pestaña de la barra de arriba.`
      : drawings().length
      ? ''
      : 'Aún no hay secuencias de ejercicios. Abre un video o una foto de la <a href="#/biblioteca">Biblioteca</a> y crea sus viñetas.';
    const folder = folderNow();
    $('#exTitle').innerHTML = folder && !searching()
      ? `<a href="javascript:void 0" data-seq-folder="">${esc(tr('Secuencias de ejercicios'))}</a> › ${esc(folder.name)}`
      : esc(tr('Secuencias de ejercicios'));
    $('#exGrid').innerHTML = searching() ? exs.map(drawingTile).join('')
      : folder ? backTile() + exs.map(drawingTile).join('')
      : addDrawingTile() + seqFolders().map(folderTile).join('') + exs.map(drawingTile).join('');
    drawPicks();
    drawJump();
  };

  // Acceso a lo anclado, como en Bibliotecas: cada clic salta al siguiente y lo resalta.
  let pinCursor = -1;
  const pinnedTiles = () => [...root.querySelectorAll('#rtGrid .tile:has(.card-pin.on), #exGrid .tile:has(.card-pin.on)')];
  const drawJump = (at = 0) => {
    const tiles = pinnedTiles();
    const jump = $('#pinJump');
    jump.disabled = !tiles.length;
    if (!tiles.length) {
      jump.querySelector('b').textContent = tr('Nada anclado');
      jump.title = jump.ariaLabel = tr('Pasa el ratón por una rutina o una secuencia y pulsa su pin');
      return;
    }
    const name = tiles[Math.min(at, tiles.length - 1)].querySelector('h3 span')?.textContent || '';
    jump.querySelector('b').textContent = name;
    jump.title = jump.ariaLabel = tiles.length > 1 ? `Ir a «${name}» (anclado ${Math.min(at, tiles.length - 1) + 1} de ${tiles.length})` : `Ir a «${name}»`;
  };
  const jumpToPinned = () => {
    const tiles = pinnedTiles();
    if (!tiles.length) return;
    pinCursor = (pinCursor + 1) % tiles.length;
    const tile = tiles[pinCursor];
    tile.classList.remove('pin-flash');
    void tile.offsetWidth; // reinicia la animación si se vuelve a saltar al mismo
    tile.classList.add('pin-flash');
    tile.addEventListener('animationend', () => tile.classList.remove('pin-flash'), { once: true });
    drawJump(pinCursor);
    tile.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const drawPicks = () => {
    root.querySelectorAll('.tile[data-kind]').forEach((tile) => {
      const list = tile.dataset.kind === 'routine' ? pickedRt : pickedEx;
      const k = list.indexOf(tile.dataset.id);
      tile.classList.toggle('on', k >= 0);
      tile.querySelector('input[type="checkbox"]').checked = k >= 0;
      tile.querySelector('.order').textContent = k >= 0 && tile.dataset.kind === 'drawing' ? k + 1 : '';
    });
    drawMenu();
  };

  // ---------- menú y panel ----------

  // Lo que se compartiría: un único dibujo o una única rutina elegidos.
  const shareTarget = () => {
    if (pickedEx.length + pickedRt.length !== 1) return null;
    return pickedRt.length ? { type: 'routine', id: pickedRt[0] } : { type: 'drawing', id: pickedEx[0] };
  };

  const drawMenu = () => {
    const allPinned = pickedRt.length && pickedRt.every((id) => routineById(id)?.pinned);
    const target = shareTarget();
    const item = (key, label, { badge = 0, disabled = false, danger = false, ready = false, title = '' } = {}) => `
      <button class="opt ${panel === key ? 'on' : ''} ${danger ? 'danger' : ''} ${ready ? 'ready' : ''}" data-menu="${key}" title="${esc(title || label)}" ${disabled ? 'disabled' : ''}>
        ${ICON[key]}<span>${label}</span>${badge ? `<b class="order">${badge}</b>` : ''}
      </button>`;
    $('#opts').innerHTML = [
      item('create', 'Rutina', { badge: pickedEx.length, ready: pickedEx.length > 0 && panel !== 'create', title: 'Montar una rutina con las secuencias elegidas' }),
      item('folder', 'Carpeta', { badge: pickedEx.length, title: pickedEx.length ? 'Crear una carpeta con las secuencias marcadas' : 'Crear una carpeta de secuencias' }),
      item('pin', 'Bibliotecas', { badge: pickedRt.length, disabled: !pickedRt.length, title: 'Elegir en qué bibliotecas se ven las rutinas marcadas' }),
      item('copy', 'Copiar', { badge: pickedEx.length + pickedRt.length, disabled: !(pickedEx.length + pickedRt.length), title: 'Duplicar las rutinas y secuencias marcadas' }),
      item('move', 'Mover', { badge: pickedRt.length, disabled: !pickedRt.length, title: 'Mover las rutinas marcadas a otra pestaña' }),
      item('undo', 'Deshacer', { disabled: !undoStack.length, title: 'Deshacer el último cambio' }),
      item('share', 'Compartir', {
        disabled: !target,
        title: !target ? 'Elige una secuencia o una rutina para compartirla con otras personas'
          : target.type === 'routine' ? 'Añadir editores a esta rutina' : 'Compartir esta secuencia con otras personas',
      }),
      '<span class="opt-sep"></span>',
      item('selectAll', 'Todo', { title: 'Elegir o quitar todas las secuencias que se ven' }),
      item('trash', 'Borrar', { badge: pickedEx.length + pickedRt.length, disabled: !pickedEx.length && !pickedRt.length, danger: true, title: 'Borrar lo elegido' }),
    ].join('');
  };

  let busy = null; // texto mientras se crea la rutina
  let createTableStyle = 'classic';
  // Orden, pestaña, destino y estilo de tabla van plegados en «Opciones»; se recuerda si lo abres.
  let optsOpen = false;
  root.addEventListener('change', (e) => {
    if (e.target.matches('[name="newRoutineTableStyle"]')) createTableStyle = normalizeTableStyle(e.target.value);
  });
  let pickQ = '';
  const filterPick = () => {
    const q = pickQ.trim().toLocaleLowerCase(lang);
    root.querySelectorAll('.rp-pick-list label').forEach((l) => (l.hidden = !l.dataset.q.includes(q)));
  };

  const drawPanel = () => {
    const box = $('#panel');
    box.hidden = panel !== 'create';
    if (box.hidden) return drawMenu();
    const keep = {};
    box.querySelectorAll('input, select').forEach((el) => el.id && (keep[el.id] = el.value));
    const pickScroll = box.querySelector('.rp-pick-list')?.scrollTop || 0;
    optsOpen = box.querySelector('.rp-opts')?.open ?? optsOpen;
    const target = ui.routineTarget && routineById(ui.routineTarget);
    const names = pickedEx.map(exerciseById).filter(Boolean);
    box.innerHTML = `
      <header>
        <input id="rname" class="panel-title-input" value="${esc(tr(`Rutina ${new Date().toLocaleDateString(lang)}`))}" aria-label="Nombre de la rutina nueva" title="Haz clic para cambiar el nombre">
        <h3 id="addTitle" hidden></h3>
        <button class="x" data-close aria-label="Cerrar">✕</button></header>
      <div class="rp-pick">
        <input id="pickQ" type="search" placeholder="Buscar" aria-label="Buscar" value="${esc(pickQ)}">
        <div class="rp-pick-list">${drawings().map((e) => `<label data-q="${esc(`${e.title} ${e.category || ''}`.toLocaleLowerCase(lang))}"><input type="checkbox" data-sel-ex="${e.id}" ${pickedEx.includes(e.id) ? 'checked' : ''}><span class="rp-t">${esc(e.title)}</span><span class="rp-s">${esc(e.category || '')}</span></label>`).join('')}</div>
      </div>
      <details class="ai-box rp-opts" ${optsOpen ? 'open' : ''}>
      <summary>Opciones</summary>
      <label class="field">Orden<select id="order">
        <option value="manual">Como los he elegido</option>
        <option value="auto">Automático (como una clase)</option>
      </select></label>
      <label class="field" id="toTabBox">Pestaña<select id="toTab"><option value="">Todas las Rutinas</option>${tabs().map((t) => `<option value="${t.id}" ${t.id === activeTab ? 'selected' : ''}>${esc(tabName(t))}</option>`).join('')}</select></label>
      <input type="hidden" id="toRoutine" value="${target?.id || ''}">
      <div id="newRoutineStyle">${tableStylePicker(createTableStyle, 'newRoutineTableStyle')}</div>
      </details>
      <div class="row wrap">
        <button class="btn primary" data-act="create" ${names.length && !busy ? '' : 'disabled'}>${busy ? esc(busy) : 'Crear rutina'}</button>
      </div>`;
    box.querySelector('.rp-pick-list').scrollTop = pickScroll;
    filterPick();
    for (const [id, value] of Object.entries(keep)) {
      const el = box.querySelector('#' + id);
      if (el && [...(el.options || [{ value }])].some((o) => o.value === value)) el.value = value;
    }
    syncTarget();
    drawMenu();
  };

  const syncTarget = () => {
    const sel = $('#toRoutine');
    if (!sel) return;
    $('#toTabBox').hidden = Boolean(sel.value);
    // Rutina nueva: su nombre, editable, de título. Si se añade a una que ya existe, a cuál.
    $('#rname').hidden = Boolean(sel.value);
    $('#addTitle').hidden = !sel.value;
    $('#addTitle').textContent = sel.value ? `Añadir a «${routineById(sel.value)?.name || ''}»` : '';
    $('#newRoutineStyle').hidden = Boolean(sel.value);
    if (!busy) $('[data-act="create"]').textContent = sel.value ? 'Añadir a la rutina' : 'Crear rutina';
  };

  drawGrids();
  drawPanel();
  if (fresh.size) {
    toast(`${fresh.size} secuencia(s) lista(s) y ya elegida(s). Ordénalas si quieres y pulsa «Crear rutina».`);
    setTimeout(() => $('.tile.new')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }

  // ---------- acciones ----------

  async function deletePicked(exIds, rtIds) {
    const parts = [];
    if (exIds.length) parts.push(tr(`${exIds.length} secuencia${exIds.length === 1 ? '' : 's'}`));
    if (rtIds.length) parts.push(tr(`${rtIds.length} rutina${rtIds.length === 1 ? '' : 's'}`));
    if (!parts.length) return;
    // Lo que te compartieron no se borra para nadie: sales de ello.
    const received = (type, id) => (spaceFor(type, id) && !spaceFor(type, id).mine ? spaceFor(type, id) : null);
    const nLeave = exIds.filter((id) => received('drawing', id)).length + rtIds.filter((id) => received('routine', id)).length;
    const shared = exIds.some((id) => spaceFor('drawing', id)?.mine) || rtIds.some((id) => spaceFor('routine', id)?.mine);
    if (!await ask([
      tr(`¿Borrar ${parts.join(` ${tr('y')} `)}?`),
      exIds.length && tr('Las secuencias borradas salen también de las rutinas (los videos no se borran).'),
      tr(usedInRoutines(exIds)),
      nLeave && tr(`De ${nLeave === 1 ? 'lo que te compartieron' : `las ${nLeave} cosas que te compartieron`}, solo sales tú.`),
      shared && tr('Lo que compartes dejará de verse para los demás.'),
      tr(nLeave || shared ? 'No se puede deshacer.' : 'Puedes deshacerlo hasta cerrar la app.'),
    ].filter(Boolean).join(' '))) return;
    const undoable = !nLeave && !shared;
    const goneEx = exIds.map(exerciseById).filter(Boolean);
    const goneRt = rtIds.map(routineById).filter(Boolean);
    const touched = state.routines.filter((r) => !rtIds.includes(r.id) && r.items.some((it) => exIds.includes(it.exerciseId))).map((r) => ({ id: r.id, items: r.items }));
    try {
      for (const id of exIds) {
        const sp = received('drawing', id);
        await (sp ? api.leaveSpace(sp.id) : api.deleteExercise(id));
      }
      for (const id of rtIds) {
        const sp = received('routine', id);
        await (sp ? api.leaveSpace(sp.id) : removeRoutine(id));
      }
      await refresh();
      for (const list of [pickedEx, pickedRt]) for (let i = list.length - 1; i >= 0; i--) if (!exerciseById(list[i]) && !routineById(list[i])) list.splice(i, 1);
      emit('data');
      toast(`Borrado: ${parts.join(` ${tr('y')} `)}`);
      if (undoable) remember(async () => {
        await api.restoreFrames(goneEx.flatMap((e) => (e.keyframes || []).flatMap((k) => [k.img, k.origImg])).filter(Boolean));
        // Vuelven con otro id: las rutinas apuntan al nuevo.
        const ids = {};
        for (const e of goneEx) ids[e.id] = upsert('exercises', await api.createExercise(e)).id;
        const mapped = (items) => items.map((it) => ({ ...it, exerciseId: ids[it.exerciseId] || it.exerciseId }));
        for (const r of goneRt) upsert('routines', await api.createRoutine({ ...r, items: mapped(r.items) }));
        for (const r of touched) if (routineById(r.id)) upsert('routines', await api.updateRoutine(r.id, { items: mapped(r.items) }));
        await refresh();
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'sortBy') {
      setSort(t.value);
      return drawGrids();
    }
    const toggle = (list, id) => {
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else list.push(id);
      drawPicks();
      if (panel === 'create') drawPanel();
    };
    if (t.dataset.selEx) toggle(pickedEx, t.dataset.selEx);
    else if (t.dataset.selRt) toggle(pickedRt, t.dataset.selRt);
    else if (t.id === 'toRoutine') syncTarget();
  });

  root.addEventListener('input', (e) => {
    if (e.target.id !== 'pickQ') return;
    pickQ = e.target.value;
    filterPick();
  });

  root.addEventListener('click', async (e) => {
    const delF = e.target.closest('[data-del-seq-folder]');
    if (delF) {
      const f = seqFolders().find((x) => x.id === delF.dataset.delSeqFolder);
      if (!f || !await ask(`¿Quitar la carpeta «${f.name}»? Sus secuencias no se borran: salen fuera de la carpeta.`)) return;
      try {
        await api.deleteSeqFolder(f.id);
        state.seqFolders = (state.seqFolders || []).filter((x) => x.id !== f.id);
        for (const x of drawings()) if (x.folderId === f.id) delete x.folderId;
        if (openFolder === f.id) openFolder = '';
        drawGrids();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (e.target.closest('[data-new-seq-folder]')) return newFolder();
    const openF = e.target.closest('[data-seq-folder]');
    if (openF && !e.target.closest('[data-edit-seq-folder]')) {
      e.preventDefault();
      return setFolder(openF.dataset.seqFolder);
    }
    const t = e.target;
    if (t.closest('[data-close]')) return ((panel = null), drawPanel());
    // Nueva rutina: se crea vacía y se queda aquí, sin pasar por el panel de crear.
    if (t.closest('[data-new-routine]')) {
      try {
        const r = upsert('routines', await api.createRoutine({ name: tr(`Rutina ${new Date().toLocaleDateString(lang)}`), items: [], tableStyle: 'classic' }));
        if (tabNow()) await putInTab(r.id, tabNow());
        emit('data');
        root.querySelector(`.tile-routine[data-id="${r.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        flash(r.id);
        toast(`Rutina nueva «${r.name}». Arrastra secuencias hasta ella o ábrela para añadirlas.`);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (t.closest('[data-pick-library]')) return openLibraryPicker();
    if (t.closest('[data-pin-jump]')) return jumpToPinned();
    const pin = t.closest('[data-pin-rt], [data-pin-ex]');
    if (pin) {
      e.preventDefault();
      try {
        if (pin.dataset.pinRt) upsert('routines', await api.updateRoutine(pin.dataset.pinRt, { pinnedTop: !routineById(pin.dataset.pinRt).pinnedTop }));
        else upsert('exercises', await api.updateExercise(pin.dataset.pinEx, { pinnedTop: !exerciseById(pin.dataset.pinEx).pinnedTop }));
        pinCursor = -1;
        drawGrids();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (t.closest('[data-rt-tab-add]')) return openTabMenu(t.closest('[data-rt-tab-add]'));
    const delTab = t.closest('[data-rt-tab-del]')?.dataset.rtTabDel;
    if (delTab) {
      if (!await ask('¿Quitar esta pestaña? Las rutinas no se borran.')) return;
      try {
        await api.deleteRoutineTab(delTab);
        state.routineTabs = state.routineTabs.filter((x) => x.id !== delTab);
        for (const r of [...state.routines, ...drawings()]) if (r.tabs?.includes(delTab)) r.tabs = r.tabs.filter((x) => x !== delTab);
        return selectTab(activeTab === delTab ? '' : activeTab);
      } catch (err) {
        return toast(err.message, 'error');
      }
    }
    if (t.closest('[data-rt-rename]')) return renameTab(tabNow());
    const tabBtn = t.closest('[data-rt-tab]');
    if (tabBtn) {
      if (tabBtn.dataset.rtTab && tabBtn.dataset.rtTab === activeTab) return renameTab(tabNow());
      return selectTab(tabBtn.dataset.rtTab);
    }
    const shareEx = t.closest('[data-share-ex]');
    if (shareEx) return openShare('drawing', shareEx.dataset.shareEx);
    const delEx = t.closest('[data-del-ex]');
    if (delEx) return deletePicked([delEx.dataset.delEx], []);
    const delRt = t.closest('[data-del-rt]');
    if (delRt) return deletePicked([], [delRt.dataset.delRt]);

    const menu = t.closest('[data-menu]')?.dataset.menu;
    if (menu === 'create') return ((panel = panel === 'create' ? null : 'create'), drawPanel());
    if (menu === 'pin') return shelfMenu(t.closest('[data-menu]'));
    if (menu === 'copy') return copyPicked();
    if (menu === 'folder') return newFolder([...pickedEx]);
    if (menu === 'move') return moveMenu(t.closest('[data-menu]'));
    if (menu === 'undo') return undoLast();
    if (menu === 'selectAll') {
      const ids = visibleDrawings().map((x) => x.id);
      const all = ids.length && ids.every((id) => pickedEx.includes(id));
      if (all) pickedEx.splice(0, pickedEx.length, ...pickedEx.filter((id) => !ids.includes(id)));
      else for (const id of ids) if (!pickedEx.includes(id)) pickedEx.push(id);
      drawPicks();
      if (panel === 'create') drawPanel();
      return;
    }
    if (menu === 'trash') return deletePicked([...pickedEx], [...pickedRt]);
    if (menu === 'share') {
      const target = shareTarget();
      return target && openShare(target.type, target.id);
    }

    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'clear') {
      pickedEx.length = 0;
      drawPicks();
      drawPanel();
    } else if (act === 'create') {
      busy = 'Creando…';
      drawPanel();
      try {
        const routine = await routineFrom([...pickedEx], {
          name: $('#rname').value.trim() || tr(`Rutina ${new Date().toLocaleDateString(lang)}`),
          order: $('#order').value,
          routineId: $('#toRoutine').value || null,
          tableStyle: createTableStyle,
        });
        const chosen = tabs().find((x) => x.id === $('#toTab').value);
        if (chosen) await putInTab(routine.id, chosen);
        ui.routineTarget = null;
        location.hash = `#/rutina/${routine.id}`;
      } catch (err) {
        toast(err.message, 'error');
        busy = null;
        drawPanel();
      }
    }
  });

  // ---------- arrastrar dibujos a una rutina ----------

  const DRAG_TYPE = 'application/x-jazz-dibujos';
  let dragged = null; // ids que se están arrastrando
  let draggedRt = null; // rutina que se lleva a una pestaña
  let draggedTab = null; // pestaña que se cambia de sitio

  // Los textos de un dibujo, y el nombre de una rutina, se editan encima: Intro guarda, Esc deja lo que había.
  let editStart = '';
  const editing = (el) => Boolean(el?.dataset && (el.dataset.editEx || 'editRt' in el.dataset));
  root.addEventListener('focusin', (e) => {
    if (editing(e.target)) editStart = e.target.textContent;
  });
  root.addEventListener('mousedown', (e) => {
    const tile = e.target.closest?.('.tile-drawing, .tile-routine');
    if (tile) tile.draggable = !editing(e.target);
  });
  // El nombre de la rutina va dentro del enlace que la abre: un clic en él edita, no abre.
  root.addEventListener('focusout', async (e) => {
    const el = e.target.closest?.('[data-edit-seq-folder]');
    if (!el) return;
    const f = seqFolders().find((x) => x.id === el.dataset.editSeqFolder);
    const name = el.textContent.trim();
    if (!f || !name || name === f.name) return (el.textContent = f?.name || '');
    try {
      Object.assign(f, await api.renameSeqFolder(f.id, name));
    } catch (err) {
      toast(err.message, 'error');
      el.textContent = f.name;
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.closest?.('[data-edit-seq-folder]') && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      e.target.blur();
    }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-edit-rt]')) e.preventDefault();
  });
  root.addEventListener('keydown', (e) => {
    if (!editing(e.target) || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    e.preventDefault();
    if (e.key === 'Escape') e.target.textContent = editStart;
    e.target.blur();
  });
  root.addEventListener('focusout', async (e) => {
    if (e.target.dataset && 'editRt' in e.target.dataset) {
      const tile = e.target.closest('.tile-routine');
      tile.draggable = true;
      const name = e.target.textContent.trim();
      if (!name || name === editStart.trim()) return void (e.target.textContent = editStart);
      const id = tile.dataset.id;
      const before = routineById(id).name;
      try {
        upsert('routines', await api.updateRoutine(id, { name }));
        remember(async () => upsert('routines', await api.updateRoutine(id, { name: before })));
      } catch (err) {
        e.target.textContent = editStart;
        toast(err.message, 'error');
      }
      return;
    }
    const field = e.target.dataset?.editEx;
    if (!field) return;
    e.target.closest('.tile-drawing').draggable = true;
    const text = e.target.textContent.trim();
    if (!text || text === editStart.trim()) {
      e.target.textContent = editStart;
      return;
    }
    const patch = { [field]: text };
    if (field === 'title') patch.titleLocked = true;
    if (field === 'category') patch.categoryLocked = true;
    try {
      const id = e.target.closest('.tile-drawing').dataset.id;
      const old = exerciseById(id);
      const back = Object.fromEntries(Object.keys(patch).map((k) => [k, old[k] ?? (k === 'srcLabel' ? null : false)]));
      upsert('exercises', await api.updateExercise(id, patch));
      remember(async () => upsert('exercises', await api.updateExercise(id, back)));
    } catch (err) {
      e.target.textContent = editStart;
      toast(err.message, 'error');
    }
  });

  root.addEventListener('dragstart', (e) => {
    const pill = e.target.closest?.('[data-drop-tab]');
    if (pill) {
      draggedTab = pill.dataset.dropTab;
      e.dataTransfer.effectAllowed = 'move';
      return;
    }
    const rt = e.target.closest?.('.tile-routine');
    if (rt) {
      draggedRt = rt.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      root.classList.add('drag-tab');
      return;
    }
    const tile = e.target.closest?.('.tile-drawing');
    if (!tile) return;
    // Si el dibujo está entre los marcados, se llevan todos los marcados (en su orden).
    dragged = pickedEx.includes(tile.dataset.id) && pickedEx.length > 1 ? [...pickedEx] : [tile.dataset.id];
    e.dataTransfer.clearData();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged));
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setDragImage(tile, 40, 40);
    root.querySelectorAll('.tile-drawing').forEach((t) => t.classList.toggle('dragging', dragged.includes(t.dataset.id)));
    root.classList.add('drag-active');
  });

  const dropTarget = (e) => e.target.closest?.('.tile-routine, [data-new-routine], [data-seq-folder], [data-new-seq-folder]');
  /** Pone secuencias en una pestaña (tab null: las saca de la pestaña abierta). */
  async function putSeqInTab(ids, tab) {
    const from = tabNow();
    if (!tab && !from) return toast('Abre una pestaña para sacar de ella secuencias');
    try {
      const was = ids.map((id) => ({ id, tabs: exerciseById(id).tabs || [] }));
      let n = 0;
      for (const id of ids) {
        const now = exerciseById(id).tabs || [];
        const next = tab ? (now.includes(tab.id) ? now : [...now, tab.id]) : now.filter((x) => x !== from.id);
        if (next.length === now.length) continue;
        upsert('exercises', await api.updateExercise(id, { tabs: next }));
        n++;
      }
      if (n) remember(async () => {
        for (const w of was) if (exerciseById(w.id)) upsert('exercises', await api.updateExercise(w.id, { tabs: w.tabs }));
      });
      toast(tab ? (n ? `${n} secuencia(s) en «${tabName(tab)}»` : `Ya estaba${ids.length === 1 ? '' : 'n'} en «${tabName(tab)}»`) : `${n} secuencia(s) fuera de «${tabName(from)}»`);
    } catch (err) {
      toast(err.message, 'error');
    }
    drawGrids();
  }
  /** Guarda secuencias en una carpeta ('' = fuera de las carpetas). */
  async function putInFolder(ids, folderId) {
    for (const id of ids) {
      const e = exerciseById(id);
      if (!e || (e.folderId || '') === folderId) continue;
      e.folderId = folderId || null;
      upsert('exercises', await api.updateExercise(id, { folderId: folderId || null }));
    }
    drawGrids();
  }
  async function newFolder(ids = []) {
    const name = await askName(tr('Nombre de la carpeta'));
    if (!name) return;
    const f = await api.createSeqFolder(name);
    (state.seqFolders ||= []).push(f);
    if (ids.length) await putInFolder(ids, f.id);
    else drawGrids();
    toast(ids.length ? `${ids.length} secuencia(s) en «${f.name}»` : `Carpeta «${f.name}» creada`);
  }
  /** Pide un nombre en una ventanita (Enter acepta, Esc cancela). */
  const askName = (label) => new Promise((done) => {
    const d = document.createElement('dialog');
    d.className = 'dlg name-dlg';
    d.innerHTML = `<form><label class="field">${esc(label)}<input maxlength="60" autofocus></label><div class="row"><button type="button" class="btn" data-no>Cancelar</button><button type="submit" class="btn primary">Crear</button></div></form>`;
    let answered = false;
    const finish = (v) => {
      if (answered) return;
      answered = true;
      d.close();
      d.remove();
      done(v);
    };
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      finish(d.querySelector('input').value.trim());
    });
    d.querySelector('[data-no]').addEventListener('click', () => finish(''));
    d.addEventListener('cancel', () => finish(''));
    document.body.append(d);
    d.showModal();
  });

  // Soltar sobre otro dibujo lo coloca antes o después de él, según el lado.
  const drawingTarget = (e) => {
    const t = dragged && e.target.closest?.('.tile-drawing');
    return t && !dragged.includes(t.dataset.id) ? t : null;
  };
  const clearSlots = (keep) => root.querySelectorAll('.drop-before, .drop-after').forEach((x) => x !== keep && x.classList.remove('drop-before', 'drop-after'));
  async function placeDrawings(ids, targetId, after) {
    setSort('custom'); // colocar a mano es «Mi orden»
    const rest = drawings().map((d) => d.id).filter((id) => !ids.includes(id));
    rest.splice(rest.indexOf(targetId) + (after ? 1 : 0), 0, ...ids);
    rest.forEach((id, i) => (exerciseById(id).drawOrder = i));
    drawGrids();
    try {
      await api.orderExercises(rest);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const tabTarget = (e) => (draggedRt || draggedTab ? e.target.closest?.('[data-drop-tab]')
    : dragged ? e.target.closest?.('[data-drop-tab], [data-drop-all]') : null);
  // Arrastrando un dibujo cerca del borde de arriba (bajo las barras fijas) o de abajo, la página
  // se desplaza sola, más deprisa cuanto más cerca del borde: así se llega a las rutinas.
  let dragY = null;
  let dragAt = 0;
  let edgeRaf = 0;
  const EDGE = 110;
  const edgeScroll = () => {
    // Sin dragover reciente el arrastre ya acabó (aunque no llegara el dragend): se para.
    if (dragY == null || Date.now() - dragAt > 400) return (edgeRaf = 0);
    const top = $('.lib-sticky')?.getBoundingClientRect().bottom || 0;
    const v = dragY < top + EDGE ? -Math.min(28, Math.ceil((top + EDGE - dragY) / 5))
      : dragY > innerHeight - EDGE ? Math.min(28, Math.ceil((dragY - innerHeight + EDGE) / 5)) : 0;
    if (v) scrollBy(0, v);
    edgeRaf = requestAnimationFrame(edgeScroll);
  };
  const onDragEdge = (e) => {
    if (!dragged) return;
    dragY = e.clientY;
    dragAt = Date.now();
    if (!edgeRaf) edgeRaf = requestAnimationFrame(edgeScroll);
  };
  document.addEventListener('dragover', onDragEdge);
  root.addEventListener('dragover', (e) => {
    const pill = tabTarget(e);
    if (pill) {
      e.preventDefault();
      if (dragged) {
        e.dataTransfer.dropEffect = 'copy';
        root.querySelectorAll('.drop-over').forEach((x) => x !== pill && x.classList.remove('drop-over'));
        pill.classList.add('drop-over');
        return;
      }
    }
    const slot = drawingTarget(e);
    clearSlots(slot);
    if (slot) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const box = slot.getBoundingClientRect();
      const after = view === 'details' ? e.clientY > box.top + box.height / 2 : e.clientX > box.left + box.width / 2;
      slot.classList.toggle('drop-after', after);
      slot.classList.toggle('drop-before', !after);
      return;
    }
    const t = dropTarget(e);
    if (!t || !dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    root.querySelectorAll('.drop-over').forEach((x) => x !== t && x.classList.remove('drop-over'));
    t.classList.add('drop-over');
  });
  root.addEventListener('dragleave', (e) => {
    const t = dropTarget(e);
    if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-over');
  });
  const endDrag = () => {
    dragged = null;
    dragY = null;
    cancelAnimationFrame(edgeRaf);
    edgeRaf = 0;
    draggedRt = null;
    draggedTab = null;
    root.classList.remove('drag-tab');
    root.classList.remove('drag-active');
    root.querySelectorAll('.drop-over, .dragging').forEach((x) => x.classList.remove('drop-over', 'dragging'));
    clearSlots();
  };
  root.addEventListener('dragend', endDrag);

  root.addEventListener('drop', async (e) => {
    const tabEl = tabTarget(e);
    if (tabEl && dragged) {
      e.preventDefault();
      const ids = dragged.filter((x) => exerciseById(x));
      endDrag();
      return putSeqInTab(ids, tabEl.matches('[data-drop-all]') ? null : tabs().find((x) => x.id === tabEl.dataset.dropTab));
    }
    if (tabEl) {
      e.preventDefault();
      const id = draggedRt;
      const moved = draggedTab;
      const tab = tabs().find((x) => x.id === tabEl.dataset.dropTab);
      endDrag();
      if (moved) return moved !== tab.id && moveTab(moved, tab.id);
      try {
        await putInTab(id, tab);
        toast(`Añadida a «${tabName(tab)}»`);
      } catch (err) {
        toast(err.message, 'error');
      }
      return drawGrids();
    }
    const slot = drawingTarget(e);
    if (slot) {
      e.preventDefault();
      const ids = [...dragged];
      const after = slot.classList.contains('drop-after');
      endDrag();
      return placeDrawings(ids, slot.dataset.id, after);
    }
    const t = dropTarget(e);
    if (!t || !dragged) return;
    e.preventDefault();
    const ids = dragged.filter((id) => exerciseById(id));
    endDrag();
    try {
      if (t.matches('[data-new-seq-folder]')) return await newFolder(ids);
      if (t.matches('[data-seq-folder]')) {
        const f = seqFolders().find((x) => x.id === t.dataset.seqFolder);
        await putInFolder(ids, f ? f.id : '');
        return toast(f ? `${ids.length} secuencia(s) en «${f.name}»` : `${ids.length} secuencia(s) fuera de la carpeta`);
      }
      if (t.matches('[data-new-routine]')) {
        const r = await routineFrom(ids, { name: tr(`Rutina ${new Date().toLocaleDateString(lang)}`) });
        if (tabNow()) await putInTab(r.id, tabNow());
        emit('data');
        flash(r.id);
        toast(`Rutina nueva «${r.name}» con ${ids.length} secuencia(s). Ábrela para ponerle nombre, reps y notas.`);
      } else {
        const r = routineById(t.dataset.id);
        const already = new Set(r.items.map((it) => it.exerciseId));
        const add = ids.filter((id) => !already.has(id));
        if (!add.length) return toast(`Ya estaba${ids.length === 1 ? '' : 'n'} en «${r.name}»`);
        await routineFrom(add, { routineId: r.id });
        emit('data');
        flash(r.id);
        toast(`${add.length} secuencia(s) añadida(s) a «${r.name}»${add.length < ids.length ? ` (${ids.length - add.length} ya estaba${ids.length - add.length === 1 ? '' : 'n'})` : ''}`);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // La rutina que acaba de recibir dibujos parpadea un momento.
  const flash = (id) => {
    const tile = root.querySelector(`.tile-routine[data-id="${id}"]`);
    if (!tile) return;
    tile.classList.add('got-drop');
    setTimeout(() => tile.classList.remove('got-drop'), 1200);
  };

  $('#q').addEventListener('input', (e) => ((filters.q = e.target.value), drawGrids()));

  // Vista de las dos cuadrículas (se recuerda aparte de la de Bibliotecas). Ctrl + rueda cambia de una a otra.
  let view = 'm';
  try {
    const saved = localStorage.getItem('jr-view-rutinas');
    if (VIEWS.some(([k]) => k === saved)) view = saved;
  } catch {
    /* sin almacenamiento */
  }
  const setView = (v) => {
    view = v;
    try {
      localStorage.setItem('jr-view-rutinas', v);
    } catch {
      /* solo esta vez */
    }
    $('#rtGrid').className = `tiles view-${v}`;
    $('#exGrid').className = `tiles view-${v}`;
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  };
  setView(view);
  drawTabs();
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setView(b.dataset.view);
  });
  let wheelAt = 0;
  root.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !e.target.closest('.lib-main')) return;
    e.preventDefault();
    if (Date.now() - wheelAt < 180) return; // un paso por golpe de rueda
    wheelAt = Date.now();
    const i = VIEWS.findIndex(([k]) => k === view) + (e.deltaY > 0 ? 1 : -1);
    if (i >= 0 && i < VIEWS.length) setView(VIEWS[i][0]);
  }, { passive: false });
  // La rueda mueve de lado la fila de rutinas; al llegar a un extremo, sigue la página.
  root.addEventListener('wheel', (e) => {
    const row = !e.ctrlKey && e.target.closest('#rtGrid');
    if (!row || row.scrollWidth <= row.clientWidth || !e.deltaY) return;
    const end = row.scrollWidth - row.clientWidth;
    if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= end - 1)) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }, { passive: false });

  const onKey = (e) => {
    if (e.key === 'Escape' && panel) ((panel = null), drawPanel());
  };
  document.addEventListener('keydown', onKey);

  const onStore = (e) => {
    if (e.detail.kind !== 'data') return;
    for (let i = pickedEx.length - 1; i >= 0; i--) if (!exerciseById(pickedEx[i])) pickedEx.splice(i, 1);
    for (let i = pickedRt.length - 1; i >= 0; i--) if (!routineById(pickedRt[i])) pickedRt.splice(i, 1);
    drawGrids();
    if (panel === 'create' && !busy) drawPanel();
  };
  window.addEventListener('store', onStore);
  return () => {
    window.removeEventListener('store', onStore);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('dragover', onDragEdge);
  };
}
