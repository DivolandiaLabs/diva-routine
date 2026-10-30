// Apartado Rutinas: las rutinas montadas y, debajo, todos los dibujos creados. Se eligen
// dibujos (en orden) para montar una rutina, y se eligen rutinas para ponerlas en la página
// principal (o borrarlas). Menú de opciones a la derecha, como en la Biblioteca.
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import {
  state, refresh, emit, esc, toast, fmtTime, exerciseById, videoById, routineById, exerciseFigure,
  ui, drawings, routineFrom, pinRoutines, removeRoutine, spaceFor, addedByOther, who, sharedLabel,
} from './store.js';
import { openShare, SHARE_TAG } from './share.js';

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  create: svg('<path d="M9 6h11M9 12h11M9 18h6"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/><path d="M19 15v6M16 18h6"/>'),
  pin: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  selectAll: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  routine: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  share: SHARE_TAG,
};

// Señal de compartido (con quién, o quién te lo compartió) en un recuadro.
const shareTag = (type, r) => {
  const sp = spaceFor(type, r.id);
  if (sp) return `<i class="share-tag" title="${esc(sharedLabel(sp))}">${SHARE_TAG}${sp.members.length}</i>`;
  const by = addedByOther(r);
  return by ? `<span class="by" title="Lo añadió ${esc(by)}">de ${esc(who(by))}</span>` : '';
};

export function renderRoutines(root) {
  const filters = { q: '' };
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
        <header class="lib-top">
          <nav class="crumbs"><h2>Rutinas</h2></nav>
          <input id="q" type="search" placeholder="Buscar dibujos o rutinas…" aria-label="Buscar">
        </header>
        <h3 class="sec-title">Rutinas <small id="nRt"></small></h3>
        <div class="tiles" id="rtGrid"></div>
        <h3 class="sec-title">Dibujos <small id="nEx"></small></h3>
        <p class="hint" id="exHint"></p>
        <div class="tiles" id="exGrid"></div>
      </section>
      <aside class="panel" id="panel" hidden></aside>
      <nav class="opts" id="opts" aria-label="Opciones"></nav>
    </div>`;
  const $ = (s) => root.querySelector(s);

  const matches = (text) => !filters.q.trim() || text.toLowerCase().includes(filters.q.trim().toLowerCase());
  const visibleRoutines = () => state.routines.filter((r) => matches(r.name));
  const visibleDrawings = () =>
    drawings().filter((e) => matches([e.title, e.category, videoById(e.videoId)?.title, ...(e.technique?.tags || [])].join(' ')));

  // ---------- recuadros ----------

  const routineTile = (r) => {
    const exs = r.items.map((it) => exerciseById(it.exerciseId)).filter(Boolean);
    const shown = exs.slice(0, 4);
    return `
      <article class="tile tile-routine" data-kind="routine" data-id="${r.id}">
        <label class="sel" title="Elegir (para la página principal o para borrar)"><input type="checkbox" data-sel-rt="${r.id}"><b class="order"></b></label>
        <button class="card-del" data-del-rt="${r.id}" title="Borrar esta rutina" aria-label="Borrar ${esc(r.name)}">✕</button>
        <a class="tile-thumb" href="#/rutina/${r.id}">${shown.length
          ? `<span class="mosaic m${shown.length}">${shown.map((e) => `<span>${exerciseFigure(e, 120)}</span>`).join('')}</span>`
          : '<span class="folder-empty">Vacía</span>'}</a>
        <a class="tile-body" href="#/rutina/${r.id}">
          <h3>${ICON.routine}<span>${esc(r.name)}</span></h3>
          <div class="meta"><span>${exs.length} ejercicio${exs.length === 1 ? '' : 's'}</span>${r.pinned ? '<span class="badge b-routine" title="Se ve en la página principal">En inicio</span>' : ''}${shareTag('routine', r)}</div>
        </a>
      </article>`;
  };

  // Recuadro donde soltar dibujos para crear una rutina nueva con ellos (o clic: panel de crear).
  const newRoutineTile = () => `
    <button class="tile tile-new-routine" data-new-routine title="Suelta aquí dibujos para crear una rutina nueva con ellos">
      <span class="nr-plus">+</span><span>Nueva rutina</span><small>Arrastra aquí dibujos</small>
    </button>`;

  const drawingTile = (e) => {
    const v = videoById(e.videoId);
    const phases = phasesSVG(e.keyframes, { size: 120, numbers: false }).slice(0, 4);
    // Sin su video aquí (un dibujo que te compartieron): no hay video que abrir.
    const link = v ? `href="#/video/${e.videoId}" title="Abrir el video (para cambiar el tramo)"` : `data-share-ex="${e.id}" title="${esc(sharedLabel(spaceFor('drawing', e.id)) || 'Dibujo compartido contigo')}"`;
    return `
      <article class="tile tile-drawing ${fresh.has(e.id) ? 'new' : ''}" data-kind="drawing" data-id="${e.id}" draggable="true" title="Arrastra a una rutina para añadirlo">
        <label class="sel" title="Elegir para la rutina (el número es su orden)"><input type="checkbox" data-sel-ex="${e.id}"><b class="order"></b></label>
        <button class="card-del" data-del-ex="${e.id}" title="Borrar este dibujo (sale también de las rutinas)" aria-label="Borrar ${esc(e.title)}">✕</button>
        <a class="tile-thumb" ${link}><span class="mosaic m${phases.length}">${phases.map((p) => `<span>${p.svg}</span>`).join('')}</span></a>
        <a class="tile-body" ${link}>
          <h3><span>${esc(e.title)}</span></h3>
          <div class="meta">${e.category ? `<span>${esc(e.category)}</span>` : ''}${v ? `<span>${esc(v.title.slice(0, 28))}${v.source.mediaType === 'video' && e.end != null ? ` · ${fmtTime(e.start)}–${fmtTime(e.end)}` : ''}</span>` : ''}${shareTag('drawing', e)}</div>
        </a>
      </article>`;
  };

  const drawGrids = () => {
    const rts = visibleRoutines();
    const exs = visibleDrawings();
    $('#nRt').textContent = `(${rts.length})`;
    $('#nEx').textContent = `(${exs.length})`;
    $('#rtGrid').innerHTML = rts.map(routineTile).join('') + newRoutineTile()
      + (!rts.length && state.routines.length ? '<p class="hint">Ninguna rutina coincide con la búsqueda.</p>' : '');
    $('#exHint').innerHTML = drawings().length
      ? '<b>Arrastra</b> un dibujo hasta una rutina para añadirlo (si tienes varios marcados, van todos, en su orden), o márcalos en orden y pulsa <b>Rutina</b>.'
      : 'Aún no hay dibujos. En la <a href="#/biblioteca">Biblioteca</a> selecciona videos o carpetas y pulsa <b>Dibujos</b>.';
    $('#exGrid').innerHTML = exs.map(drawingTile).join('');
    drawPicks();
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
      item('create', 'Rutina', { badge: pickedEx.length, ready: pickedEx.length > 0 && panel !== 'create', title: 'Montar una rutina con los dibujos elegidos' }),
      item('pin', allPinned ? 'Quitar' : 'Inicio', { badge: pickedRt.length, disabled: !pickedRt.length, title: allPinned ? 'Quitar las rutinas elegidas de la página principal' : 'Añadir las rutinas elegidas a la página principal' }),
      item('share', 'Compartir', {
        disabled: !target,
        title: !target ? 'Elige un dibujo o una rutina para compartirlo con otras personas'
          : target.type === 'routine' ? 'Añadir editores a esta rutina' : 'Compartir este dibujo con otras personas',
      }),
      '<span class="opt-sep"></span>',
      item('selectAll', 'Todo', { title: 'Elegir o quitar todos los dibujos que se ven' }),
      item('trash', 'Borrar', { badge: pickedEx.length + pickedRt.length, disabled: !pickedEx.length && !pickedRt.length, danger: true, title: 'Borrar lo elegido' }),
    ].join('');
  };

  let busy = null; // texto mientras se crea la rutina
  const drawPanel = () => {
    const box = $('#panel');
    box.hidden = panel !== 'create';
    if (box.hidden) return drawMenu();
    const keep = {};
    box.querySelectorAll('input, select').forEach((el) => el.id && (keep[el.id] = el.value));
    const target = ui.routineTarget && routineById(ui.routineTarget);
    const names = pickedEx.map(exerciseById).filter(Boolean);
    box.innerHTML = `
      <header><h3>${target ? `Añadir a «${esc(target.name)}»` : 'Crear rutina'}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
      ${names.length
        ? `<ol class="rp-list">${names.map((e) => `<li><span class="rp-t">${esc(e.title)}</span><span class="rp-s">${esc(e.category || '')}</span></li>`).join('')}</ol>`
        : '<p class="hint">Marca abajo, en <b>Dibujos</b>, los que quieras en la rutina, en orden.</p>'}
      <label class="field">Orden<select id="order">
        <option value="manual">Como los he elegido</option>
        <option value="auto">Automático (como una clase)</option>
      </select></label>
      <label class="field">En<select id="toRoutine"><option value="">Rutina nueva</option>${state.routines.map((r) => `<option value="${r.id}" ${r.id === target?.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field" id="rnameField">Nombre<input id="rname" value="${esc(`Rutina ${new Date().toLocaleDateString('es-ES')}`)}"></label>
      <div class="row wrap">
        <button class="btn primary" data-act="create" ${names.length && !busy ? '' : 'disabled'}>${busy ? esc(busy) : 'Crear rutina'}</button>
        ${names.length ? '<button class="btn ghost" data-act="clear">Quitar selección</button>' : ''}
      </div>`;
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
    $('#rnameField').hidden = Boolean(sel.value);
    if (!busy) $('[data-act="create"]').textContent = sel.value ? 'Añadir a la rutina' : 'Crear rutina';
  };

  drawGrids();
  drawPanel();
  if (fresh.size) {
    toast(`${fresh.size} dibujo(s) listos y ya elegidos. Ordénalos si quieres y pulsa «Crear rutina».`);
    setTimeout(() => $('.tile.new')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }

  // ---------- acciones ----------

  async function deletePicked(exIds, rtIds) {
    const parts = [];
    if (exIds.length) parts.push(`${exIds.length} dibujo${exIds.length === 1 ? '' : 's'}`);
    if (rtIds.length) parts.push(`${rtIds.length} rutina${rtIds.length === 1 ? '' : 's'}`);
    if (!parts.length) return;
    // Lo que te compartieron no se borra para nadie: sales de ello.
    const received = (type, id) => (spaceFor(type, id) && !spaceFor(type, id).mine ? spaceFor(type, id) : null);
    const nLeave = exIds.filter((id) => received('drawing', id)).length + rtIds.filter((id) => received('routine', id)).length;
    const shared = exIds.some((id) => spaceFor('drawing', id)?.mine) || rtIds.some((id) => spaceFor('routine', id)?.mine);
    if (!confirm(`¿Borrar ${parts.join(' y ')}?${exIds.length ? ' Los dibujos borrados salen también de las rutinas (los videos no se borran).' : ''}${nLeave ? ` De ${nLeave === 1 ? 'lo que te compartieron' : `las ${nLeave} cosas que te compartieron`}, solo sales tú.` : ''}${shared ? ' Lo que compartes dejará de verse para los demás.' : ''} No se puede deshacer.`)) return;
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
      toast(`Borrado: ${parts.join(' y ')}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  root.addEventListener('change', (e) => {
    const t = e.target;
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

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return ((panel = null), drawPanel());
    if (t.closest('[data-new-routine]')) return ((panel = 'create'), drawPanel());
    const shareEx = t.closest('[data-share-ex]');
    if (shareEx) return openShare('drawing', shareEx.dataset.shareEx);
    const delEx = t.closest('[data-del-ex]');
    if (delEx) return deletePicked([delEx.dataset.delEx], []);
    const delRt = t.closest('[data-del-rt]');
    if (delRt) return deletePicked([], [delRt.dataset.delRt]);

    const menu = t.closest('[data-menu]')?.dataset.menu;
    if (menu === 'create') return ((panel = panel === 'create' ? null : 'create'), drawPanel());
    if (menu === 'pin') {
      const allPinned = pickedRt.every((id) => routineById(id)?.pinned);
      const n = pickedRt.length;
      await pinRoutines([...pickedRt], !allPinned);
      pickedRt.length = 0;
      drawGrids();
      return toast(allPinned ? `${n} rutina(s) quitada(s) de la página principal` : `${n} rutina(s) añadida(s) a la página principal`);
    }
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
          name: $('#rname').value.trim() || 'Rutina',
          order: $('#order').value,
          routineId: $('#toRoutine').value || null,
        });
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

  root.addEventListener('dragstart', (e) => {
    const tile = e.target.closest?.('.tile-drawing');
    if (!tile) return;
    // Si el dibujo está entre los marcados, se llevan todos los marcados (en su orden).
    dragged = pickedEx.includes(tile.dataset.id) && pickedEx.length > 1 ? [...pickedEx] : [tile.dataset.id];
    e.dataTransfer.clearData();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged));
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setDragImage(tile, 40, 40);
    root.querySelectorAll('.tile-drawing').forEach((t) => t.classList.toggle('dragging', dragged.includes(t.dataset.id)));
    root.classList.add('drag-active');
  });

  const dropTarget = (e) => e.target.closest?.('.tile-routine, .tile-new-routine');
  root.addEventListener('dragover', (e) => {
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
    root.classList.remove('drag-active');
    root.querySelectorAll('.drop-over, .dragging').forEach((x) => x.classList.remove('drop-over', 'dragging'));
  };
  root.addEventListener('dragend', endDrag);

  root.addEventListener('drop', async (e) => {
    const t = dropTarget(e);
    if (!t || !dragged) return;
    e.preventDefault();
    const ids = dragged.filter((id) => exerciseById(id));
    endDrag();
    try {
      if (t.matches('.tile-new-routine')) {
        const r = await routineFrom(ids, { name: `Rutina ${new Date().toLocaleDateString('es-ES')}` });
        emit('data');
        flash(r.id);
        toast(`Rutina nueva «${r.name}» con ${ids.length} dibujo(s). Ábrela para ponerle nombre, reps y notas.`);
      } else {
        const r = routineById(t.dataset.id);
        const already = new Set(r.items.map((it) => it.exerciseId));
        const add = ids.filter((id) => !already.has(id));
        if (!add.length) return toast(`Ya estaba${ids.length === 1 ? '' : 'n'} en «${r.name}»`);
        await routineFrom(add, { routineId: r.id });
        emit('data');
        flash(r.id);
        toast(`${add.length} dibujo(s) añadido(s) a «${r.name}»${add.length < ids.length ? ` (${ids.length - add.length} ya estaba${ids.length - add.length === 1 ? '' : 'n'})` : ''}`);
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
  };
}
