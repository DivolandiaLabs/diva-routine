// Todas las rutinas desplegadas en una sola página, con buscador, orden y modos de vista.
import { phasesSVG } from './figure.js';
import { api } from './api.js';
import { state, esc, exerciseById, itemExercise, videoById, fmtTime, CATEGORIES, upsert, removeRoutine, refresh, toast, ask } from './store.js';
import { lang, tr } from './i18n.js';
import { SORT_ICON } from './views.js';
import { normalizeTableStyle } from './routine-styles.js';

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const OPT_ICON = {
  share: svg('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.8 7.4-4.4M8.3 13.2l7.4 4.4"/>'),
  all: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
};

const SORTS = [
  ['new', 'Más recientes'], ['old', 'Más antiguos'], ['az', 'Nombre A–Z'], ['za', 'Nombre Z–A'], ['cat', 'Categoría'],
];
const MODES = [['full', 'Completa'], ['compact', 'Compacta'], ['draw', 'Solo dibujos'], ['list', 'Lista']];

const icon = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// Completa: ficha con dibujo y texto; compacta: filas finas; solo dibujos: cuadrícula; lista: renglones.
const MODE_ICON = {
  full: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6" y="7" width="5" height="5" rx="1"/><path d="M14 8h4M14 11h4M6 16h12"/>'),
  compact: icon('<rect x="3" y="5" width="4" height="4" rx="1"/><rect x="3" y="15" width="4" height="4" rx="1"/><path d="M10 7h11M10 17h11"/>'),
  draw: icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  list: icon('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
};

const stored = (key, list, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return list.some(([k]) => k === v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const remember = (key, v) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* solo esta vez */
  }
};

// Los ejercicios de la rutina con lo que se editó en ella (textos y orden de viñetas).
const itemsOf = (r) => r.items.map((it) => ({ it, e: itemExercise(it) })).filter((x) => x.e);
const categoryOf = (r) => itemsOf(r).map((x) => x.it.catLabel ?? x.e.category).find(Boolean) || '';
const phases = ({ it, e }) => {
  const frames = [...(e.keyframes || []), ...(it.extra || [])];
  const all = frames.map((_, k) => k).filter((k) => !it.hidden?.includes(k));
  const kept = (it.phases || []).filter((k) => all.includes(k));
  const order = [...kept, ...all.filter((k) => !kept.includes(k))];
  return phasesSVG(order.map((k) => frames[k]), { size: 140 }).map((ph, n) => ({ ...ph, caption: it.captions?.[order[n]] ?? ph.caption }));
};

export function renderAllRoutines(root) {
  let q = '';
  let sort = stored('jr-all-sort', SORTS, 'new');
  let mode = stored('jr-all-mode', MODES, 'full');

  root.innerHTML = `
    <div class="lib2"><div class="all-rt lib-main">
      <div class="all-bar">
        <h2>Rutinas</h2>
        <input id="allQ" type="search" placeholder="Buscar Rutina" aria-label="Buscar Rutina">
        <label class="sorter" title="Ordenar">${SORT_ICON}<select id="allSort" aria-label="Ordenar">${SORTS.map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="views all-modes" role="group" aria-label="Vista">${MODES.map(([k, l]) => `<button class="view-btn" data-mode="${k}" title="${l}" aria-label="${l}">${MODE_ICON[k]}</button>`).join('')}</div>
        <button class="btn primary" id="allPrint">Imprimir / PDF</button>
      </div>
      <div id="allList"></div>
    </div>
    <nav class="opts all-opts no-print" id="allOpts" aria-label="Opciones"></nav></div>`;
  const $ = (s) => root.querySelector(s);

  const exercise = (x, i) => {
    const { it, e } = x;
    const seq = phases(x).map((ph) => `<figure>${ph.svg}<figcaption>${esc(ph.caption)}</figcaption></figure>`).join('');
    if (mode === 'draw') return seq;
    const title = `<b>${i + 1}. ${esc(it.title ?? e.title)}</b>`;
    if (mode === 'list') return `<li>${title}</li>`;
    const summary = it.summary ?? e.technique?.summary;
    const cues = it.cues ?? e.technique?.cues ?? [];
    return `<div class="all-ex">
      <div class="all-name">${title}<small>${esc(it.catLabel ?? tr(e.category || ''))}</small>${it.reps ? `<small>${esc(it.reps)}</small>` : ''}</div>
      <div class="seq">${seq}</div>
      ${mode !== 'draw' ? `<div class="all-tech">${summary ? `<p>${esc(summary)}</p>` : ''}${cues.length ? `<ul>${cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${it.notes ? `<p><i>${esc(it.notes)}</i></p>` : ''}</div>` : ''}
    </div>`;
  };

  // La misma tabla que al abrir la rutina en el Creador, para leer.
  const table = (items) => {
    let lastCat = null;
    return `<table class="routine-table">
      <thead><tr><th>#</th><th>Ejercicio</th><th>Secuencia</th><th>Técnica</th></tr></thead>
      <tbody>${items.map((x, i) => {
        const { it, e } = x;
        const v = videoById(e.videoId);
        const cat = e.category || 'Otros';
        const ci = Math.max(0, CATEGORIES.indexOf(cat));
        const band = cat !== lastCat ? `<tr class="cat-row" style="--cat: var(--cat-${ci % 8})"><td colspan="4">${esc(tr(cat))}</td></tr>` : '';
        lastCat = cat;
        const seq = phases(x).map((ph) => `<figure class="${ph.img ? 'is-img' : ''}">${ph.svg}<figcaption>${esc(ph.caption)}</figcaption></figure>`).join('');
        const src = it.srcLabel ?? (v ? `${v.title}${e.end != null && v.source.mediaType === 'video' ? ` · ${fmtTime(e.start)}–${fmtTime(e.end)}` : ''}` : '');
        const summary = it.summary ?? e.technique?.summary;
        const cues = it.cues ?? e.technique?.cues ?? [];
        return `${band}<tr class="ritem" style="--cat: var(--cat-${ci % 8})">
          <td class="c-num">${i + 1}</td>
          <td class="c-name"><b class="ex-name">${esc(it.title ?? e.title)}</b><small>${esc(it.catLabel ?? tr(e.category || ''))}</small>${src ? `<small class="src">${esc(src)}</small>` : ''}${it.reps ? `<small><b>${esc(it.reps)}</b></small>` : ''}</td>
          <td class="c-seq"><div class="seq">${seq}</div></td>
          <td class="c-tech">${summary ? `<p>${esc(summary)}</p>` : ''}${cues.length ? `<ul>${cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${it.notes ? `<p><i>${esc(it.notes)}</i></p>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  };

  const sheet = (r) => {
    const items = itemsOf(r);
    const body = mode === 'full' ? table(items) : items.map(exercise).join('');
    return `<article class="sheet ${mode === 'full' ? '' : 'all-sheet'} mode-${mode}${picked.has(r.id) ? ' picked' : ''}" data-rt="${r.id}" ${mode === 'full' ? `data-table-style="${normalizeTableStyle(r.tableStyle)}"` : ''}>
      <div class="sheet-head"><div><h2><a href="#/rutina/${r.id}">${esc(r.name)}</a></h2><p>${esc(r.subtitle || tr(`${items.length} ejercicios`))}</p></div></div>
      ${mode === 'list' ? `<ol>${body}</ol>` : mode === 'draw' ? `<div class="seq">${body}</div>` : body}
    </article>`;
  };

  const draw = () => {
    const text = q.trim().toLocaleLowerCase(lang);
    const name = (r) => String(r.name).toLocaleLowerCase(lang);
    const sorter = {
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      old: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      az: (a, b) => name(a).localeCompare(name(b), lang),
      za: (a, b) => name(b).localeCompare(name(a), lang),
      cat: (a, b) => categoryOf(a).localeCompare(categoryOf(b), lang) || name(a).localeCompare(name(b), lang),
    }[sort];
    const list = state.routines
      .filter((r) => !text || [r.name, ...itemsOf(r).flatMap((x) => [x.it.title ?? x.e.title, x.e.category])].join(' ').toLocaleLowerCase(lang).includes(text))
      .sort(sorter);
    $('#allList').innerHTML = list.length ? list.map(sheet).join('') : '<div class="empty-state small"><p>No hay rutinas.</p></div>';
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    shown = list.map((r) => r.id);
    drawOpts();
  };

  // ---------- barra de opciones (abajo): compartir, todo, copiar, borrar, deshacer ----------
  const picked = new Set();
  const undoStack = [];
  let shown = [];
  const opt = (key, label, { badge = 0, disabled = false, danger = false, title = '' } = {}) => `
    <button class="opt ${danger ? 'danger' : ''}" data-opt="${key}" title="${esc(title || label)}" ${disabled ? 'disabled' : ''}>
      ${OPT_ICON[key]}<span>${label}</span>${badge ? `<b class="order">${badge}</b>` : ''}
    </button>`;
  function drawOpts() {
    for (const id of [...picked]) if (!state.routines.some((r) => r.id === id)) picked.delete(id);
    const n = picked.size;
    $('#allOpts').innerHTML = [
      opt('share', 'Compartir', { badge: n, disabled: !n, title: 'Enviar las rutinas elegidas por WhatsApp, correo u otra app' }),
      '<span class="opt-sep"></span>',
      opt('all', 'Todo', { title: 'Elegir o quitar todas las que se ven' }),
      opt('copy', 'Copiar', { badge: n, disabled: !n, title: 'Duplicar las rutinas elegidas' }),
      opt('trash', 'Borrar', { badge: n, disabled: !n, danger: true, title: 'Borrar las rutinas elegidas' }),
      opt('undo', 'Deshacer', { disabled: !undoStack.length, title: 'Deshacer el último cambio' }),
    ].join('');
  }

  // Texto de una rutina para enviarla: nombre y ejercicios con sus reps y notas.
  const asText = (r) => [
    r.name,
    ...itemsOf(r).map(({ it, e }, i) => `${i + 1}. ${it.title ?? e.title}${it.reps ? ` (${it.reps})` : ''}${it.notes ? ` · ${it.notes}` : ''}`),
  ].join('\n');

  async function share() {
    const text = state.routines.filter((r) => picked.has(r.id)).map(asText).join('\n\n');
    try {
      if (navigator.share) return await navigator.share({ title: 'Diva Routine', text });
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
    // Sin el menú del sistema (la app de escritorio en Windows): WhatsApp, correo o copiar.
    const dlg = document.createElement('dialog');
    dlg.className = 'ask share-to';
    dlg.innerHTML = `<p><b>Compartir</b></p>
      <div class="share-to-list">
        <button class="btn" value="wa">WhatsApp</button>
        <button class="btn" value="mail">Correo</button>
        <button class="btn" value="copy">Copiar texto</button>
      </div>
      <footer><button class="btn ghost" value="no">Cancelar</button></footer>`;
    document.body.append(dlg);
    dlg.addEventListener('click', async (e) => {
      const v = e.target === dlg ? 'no' : e.target.closest('button')?.value;
      if (!v) return;
      if (v === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      if (v === 'mail') window.open(`mailto:?subject=${encodeURIComponent('Diva Routine')}&body=${encodeURIComponent(text)}`, '_blank');
      if (v === 'copy') {
        try {
          await navigator.clipboard.writeText(text);
          toast('Rutinas copiadas: pégalas en WhatsApp, el correo o donde quieras');
        } catch {
          toast('No se pudo compartir', 'error');
        }
      }
      dlg.close();
      dlg.remove();
    });
    dlg.showModal();
  }

  async function copyPicked() {
    const made = [];
    for (const id of picked) {
      const r = state.routines.find((x) => x.id === id);
      made.push(upsert('routines', await api.createRoutine({ name: `${r.name} (${tr('copia')})`, subtitle: r.subtitle || '', items: r.items, notes: r.notes, tabs: r.tabs || [] })).id);
    }
    undoStack.push(async () => {
      for (const id of made) if (state.routines.some((r) => r.id === id)) await removeRoutine(id);
    });
    picked.clear();
    toast('Copiado');
    draw();
  }

  async function trashPicked() {
    const gone = state.routines.filter((r) => picked.has(r.id));
    if (!await ask(tr(`¿Borrar ${gone.length} rutina${gone.length === 1 ? '' : 's'}? Puedes deshacerlo hasta cerrar la app.`))) return;
    for (const r of gone) await removeRoutine(r.id);
    undoStack.push(async () => {
      for (const r of gone) upsert('routines', await api.createRoutine({ ...r }));
    });
    picked.clear();
    await refresh();
    draw();
  }

  // Un clic en la rutina la elige (o la quita); el título sigue abriéndola.
  $('#allList').addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, select')) return;
    const card = e.target.closest('[data-rt]');
    if (!card) return;
    const id = card.dataset.rt;
    if (!picked.delete(id)) picked.add(id);
    card.classList.toggle('picked', picked.has(id));
    drawOpts();
  });
  $('#allOpts').addEventListener('click', async (e) => {
    const key = e.target.closest('[data-opt]')?.dataset.opt;
    if (!key) return;
    try {
      if (key === 'share') await share();
      else if (key === 'all') {
        const all = shown.length && shown.every((id) => picked.has(id));
        for (const id of shown) all ? picked.delete(id) : picked.add(id);
        draw();
      } else if (key === 'copy') await copyPicked();
      else if (key === 'trash') await trashPicked();
      else if (key === 'undo') {
        await undoStack.pop()?.();
        await refresh();
        toast('Cambio deshecho');
        draw();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#allPrint').addEventListener('click', () => window.print());
  $('#allQ').addEventListener('input', (e) => ((q = e.target.value), draw()));
  $('#allSort').addEventListener('change', (e) => {
    sort = e.target.value;
    remember('jr-all-sort', sort);
    draw();
  });
  root.querySelector('.all-modes').addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (!m) return;
    mode = m;
    remember('jr-all-mode', mode);
    draw();
  });
  draw();
}
