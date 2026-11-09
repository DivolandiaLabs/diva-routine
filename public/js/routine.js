// Una rutina: tabla visual (se edita en la propia tabla y se imprime tal cual).
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import {
  esc, toast, fmtTime, debounce, upsert, refresh, emit, routineById, exerciseById, itemExercise, videoById, ui, removeRoutine, pinRoutines, CATEGORIES,
  spaceFor, sharedLabel,
  drawings, ask, pinnedShelves, setPinnedShelves, shelves, shelfName, libraryById, state, restoreDrawings, improveWithAi,
} from './store.js';
import { openShare, SHARE_TAG } from './share.js';
import { openSettings } from './settings.js';
import { lang, tr } from './i18n.js';
import { normalizeTableStyle, tableStylePicker } from './routine-styles.js';

// Lo que se escribe aquí es de esta rutina: el dibujo y las demás rutinas no cambian.
const editable = (attrs, text, tag = 'span') => `<${tag} contenteditable="plaintext-only" spellcheck="false" ${attrs}>${esc(text)}</${tag}>`;

export function renderRoutine(root, id) {
  let r = routineById(id);
  if (!r) {
    root.innerHTML = `<div class="empty-state"><h2>Rutina no encontrada</h2><a class="btn" href="#/rutinas">Volver</a></div>`;
    return;
  }

  root.innerHTML = `
    <div class="page-head no-print">
      <a href="#/rutinas" class="back">← Rutinas</a>
      <span class="spacer"></span>
      <button class="btn small" data-act="add" title="Elegir más secuencias en Rutinas">+ Añadir ejercicios</button>
      <button class="btn small" data-act="pin" id="pinBtn"></button>
      <button class="btn small" data-act="share" title="Que otras personas puedan ver y cambiar esta rutina">${SHARE_TAG}Editores</button>
      <button class="btn small icon-btn" data-act="undo" id="undoBtn" title="Deshacer el último cambio (Ctrl+Z)" aria-label="Deshacer" disabled><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>
      <button class="btn primary" data-act="print">Imprimir / PDF</button>
      <button class="btn small ghost danger" data-act="del" id="delBtn">Eliminar</button>
    </div>
    <p class="share-line no-print" id="shareLine" hidden></p>

    <article class="sheet" data-table-style="${normalizeTableStyle(r.tableStyle)}">
      <header class="sheet-head">
        <div><input id="rname" class="sheet-title" value="${esc(r.name)}" aria-label="Nombre de la rutina"><p id="rmeta" contenteditable="plaintext-only" spellcheck="false"></p></div>
        <div class="legend" id="legend" hidden><span><i class="lg-r"></i> lado derecho</span><span><i class="lg-l"></i> lado izquierdo</span></div>
      </header>
      <div id="table"></div>
    </article>
    <section class="rt-tray">
      <div class="rt-tray-head">
        <div class="rt-tray-tabs" role="tablist" aria-label="Herramientas de la rutina">
          <button type="button" role="tab" id="trayDrawingsTab" aria-controls="trayDrawingsPanel" aria-selected="true" data-tray-tab="drawings">Secuencias de ejercicios</button>
          <button type="button" role="tab" id="trayStylesTab" aria-controls="trayStylesPanel" aria-selected="false" tabindex="-1" data-tray-tab="styles">Estilo de tabla</button>
        </div>
        <input id="trayQ" type="search" placeholder="Buscar secuencias…" aria-label="Buscar secuencias…">
      </div>
      <div id="trayDrawingsPanel" role="tabpanel" aria-labelledby="trayDrawingsTab">
      <div class="rt-tray-list">${drawings().map((e) => `<figure draggable="true" data-tray="${e.id}" data-q="${esc(`${e.title} ${e.category || ''}`.toLocaleLowerCase(lang))}" title="${esc(e.title)}">${phasesSVG((e.keyframes || []).slice(0, 1), { size: 100, numbers: false })[0]?.svg || ''}<figcaption class="tray-name">${esc(e.title)}</figcaption></figure>`).join('')}</div>
      </div>
    <div id="trayStylesPanel" class="table-style-panel no-print" role="tabpanel" aria-labelledby="trayStylesTab" hidden>
      ${tableStylePicker(r.tableStyle)}
    </div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const trayTabs = [...root.querySelectorAll('[data-tray-tab]')];
  const selectTrayTab = (tab) => {
    const showDrawings = tab.dataset.trayTab === 'drawings';
    for (const button of trayTabs) {
      button.setAttribute('aria-selected', String(button === tab));
      button.tabIndex = button === tab ? 0 : -1;
    }
    $('#trayDrawingsPanel').hidden = !showDrawings;
    $('#trayStylesPanel').hidden = showDrawings;
    $('#trayQ').hidden = !showDrawings;
  };
  for (const tab of trayTabs) {
    tab.addEventListener('click', () => selectTrayTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? trayTabs.length - 1
        : (trayTabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + trayTabs.length) % trayTabs.length;
      selectTrayTab(trayTabs[index]);
      trayTabs[index].focus();
    });
  }
  // Solo se guarda si hubo cambios (al salir de la vista se fuerza el guardado pendiente).
  let dirty = false;
  const flushSave = debounce(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      upsert('routines', await api.updateRoutine(r.id, { name: r.name, subtitle: r.subtitle || '', items: r.items, tableStyle: normalizeTableStyle(r.tableStyle) }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }, 400);
  // Deshacer: cada cambio guarda cómo estaba la rutina antes (hasta 50 pasos).
  const snap = () => JSON.stringify({ name: r.name, subtitle: r.subtitle || '', items: r.items, tableStyle: r.tableStyle });
  const history = [];
  let last = snap();
  const drawUndo = () => { const b = root.querySelector('#undoBtn'); if (b) b.disabled = !history.length; };
  const save = () => {
    const now = snap();
    if (now !== last) {
      history.push(last);
      if (history.length > 50) history.shift();
      last = now;
      drawUndo();
    }
    dirty = true;
    flushSave();
  };
  const undo = () => {
    if (!history.length) return;
    const prev = history.pop();
    Object.assign(r, JSON.parse(prev));
    last = prev;
    dirty = true;
    flushSave();
    if (document.activeElement?.id !== 'rname') $('#rname').value = r.name;
    applyTableStyle();
    draw();
    drawUndo();
  };
  const applyTableStyle = () => {
    const style = normalizeTableStyle(r.tableStyle);
    $('.sheet').dataset.tableStyle = style;
    root.querySelectorAll('[data-table-style-choice]').forEach((input) => (input.checked = input.value === style));
  };
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-table-style-choice]')) return;
    r.tableStyle = normalizeTableStyle(e.target.value);
    applyTableStyle();
    save();
  });

  // Las viñetas de esta rutina: las del dibujo más las añadidas desde la bandeja (it.extra).
  // Viñetas marcadas: por ejercicio de la rutina, el conjunto de sus índices.
  const picked = new Map();
  const isPicked = (it, k) => Boolean(picked.get(it)?.has(k));
  const framesOf = (it, e) => [...(e.keyframes || []), ...(it.extra || [])];
  // El orden de las viñetas en esta rutina. Si el dibujo cambió, lo nuevo va al final.
  const phaseOrder = (it, e) => {
    const all = framesOf(it, e).map((_, k) => k).filter((k) => !it.hidden?.includes(k));
    const kept = (it.phases || []).filter((k) => all.includes(k));
    return [...kept, ...all.filter((k) => !kept.includes(k))];
  };
  const cuesOf = (it, e) => it.cues ?? e.technique?.cues ?? [];

  function draw() {
    r.items = r.items.filter((it) => itemExercise(it));
    if (document.activeElement?.id !== 'rmeta') $('#rmeta').textContent = r.subtitle || tr(`${r.items.length} ejercicios · ${new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })}`);
    if (!r.items.length) {
      $('#table').innerHTML = '<div class="empty-state"><p>Esta rutina no tiene ejercicios. Pulsa <b>+ Añadir ejercicios</b>.</p></div>';
      return;
    }
    // La leyenda de colores solo hace falta si queda alguna figura dibujada (sin viñeta).
    $('#legend').hidden = !r.items.some((it) => (itemExercise(it).keyframes || []).some((k) => !k.img));
    let lastCat = null;
    $('#table').innerHTML = `
      <table class="routine-table">
        <thead><tr><th>#</th><th>Ejercicio</th><th>Secuencia</th><th>Técnica</th><th class="no-print"></th></tr></thead>
        <tbody>${r.items.map((it, i) => {
          const e = itemExercise(it);
          const v = videoById(e.videoId);
          const order = phaseOrder(it, e);
          const seq = order.length
            ? phasesSVG(order.map((k) => framesOf(it, e)[k]), { size: 140 }).map((ph, n) => `<figure class="${ph.img ? 'is-img' : ''}${isPicked(it, order[n]) ? ' picked' : ''}" draggable="true" data-k="${order[n]}" title="Arrastra para cambiar el orden"><label class="seq-sel" title="Marcar esta viñeta"><input type="checkbox" data-seq-pick="${order[n]}" data-i="${i}" ${isPicked(it, order[n]) ? 'checked' : ''}></label><button class="seq-del" data-seq-del="${order[n]}" data-i="${i}" title="Quitar esta viñeta" aria-label="Quitar esta viñeta">✕</button>${ph.svg}${editable(`data-cap="${order[n]}" data-i="${i}"`, it.captions?.[order[n]] ?? tr(ph.caption), 'figcaption')}</figure>`).join('')
            : v?.source.mediaType === 'image' ? `<figure><img src="/media/${esc(v.source.file)}" alt=""></figure>` : '<span class="hint">Sin dibujos</span>';
          // Como en los pósters de ejercicios: una banda de color al empezar cada sección.
          const cat = e.category || 'Otros';
          const ci = Math.max(0, CATEGORIES.indexOf(cat));
          const band = cat !== lastCat ? `<tr class="cat-row" style="--cat: var(--cat-${ci % 8})"><td colspan="5">${esc(cat)}</td></tr>` : '';
          lastCat = cat;
          return `${band}<tr class="ritem" draggable="true" data-i="${i}" style="--cat: var(--cat-${ci % 8})">
            <td class="c-num">${i + 1}</td>
            <td class="c-name">
              ${editable(`class="ex-name" data-f="title" data-i="${i}"`, it.title ?? e.title, 'b')}
              ${e.category || it.catLabel ? editable(`data-f="catLabel" data-i="${i}"`, it.catLabel ?? tr(e.category), 'small') : ''}
              ${v ? editable(`class="src" data-f="srcLabel" data-i="${i}"`, it.srcLabel ?? `${v.title}${e.end != null && v.source.mediaType === 'video' ? ` · ${fmtTime(e.start)}–${fmtTime(e.end)}` : ''}`, 'small') : ''}
              <input class="reps" data-f="reps" data-i="${i}" value="${esc(it.reps)}" placeholder="Reps / tiempo">
            </td>
            <td class="c-seq"><div class="seq">${seq}</div></td>
            <td class="c-tech">
              ${it.summary ?? e.technique?.summary ? editable(`data-f="summary" data-i="${i}"`, it.summary ?? e.technique.summary, 'p') : ''}
              ${cuesOf(it, e).length ? `<ul>${cuesOf(it, e).map((c, n) => editable(`data-cue="${n}" data-i="${i}"`, c, 'li')).join('')}</ul>` : ''}
              <input class="note" data-f="notes" data-i="${i}" value="${esc(it.notes)}" placeholder="Notas (música, cuentas…)">
            </td>
            <td class="c-tools no-print">
              <span class="handle" title="Arrastra para reordenar">⋮⋮</span>
              <button data-mv="-1" data-i="${i}" title="Subir un puesto">↑</button>
              <button data-mv="1" data-i="${i}" title="Bajar un puesto">↓</button>
              <button data-rm="${i}" title="Quitar de la rutina">✕</button>
              ${v ? `<a class="tool-link" href="#/video/${e.videoId}" title="Abrir el video para editar este ejercicio">↗</a>` : ''}
              ${(e.keyframes || []).some((k) => k.img) ? `<button class="ai-btn" data-ai="${e.id}" title="Mejorar con IA las viñetas marcadas (sin ninguna marcada, toda la secuencia)">IA</button>` : ''}
              ${(e.keyframes || []).some((k) => k.origImg) ? `<button data-ai-undo="${e.id}" title="Volver a los dibujos originales">↺</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }
  draw();
  const drawPin = () => {
    const n = pinnedShelves(routineById(r.id)).length;
    $('#pinBtn').textContent = n ? `Anclada en ${n === 1 ? shelfName(libraryById(pinnedShelves(routineById(r.id))[0])) : tr(`${n} bibliotecas`)} ▾` : 'Anclar en biblioteca ▾';
    $('#pinBtn').title = 'Elige en qué bibliotecas se ve arriba esta rutina';
  };
  drawPin();
  // Compartida: con quién (o quién te la compartió). Si te la compartieron, «Eliminar» es salir.
  const drawShare = () => {
    const sp = spaceFor('routine', r.id);
    $('#shareLine').hidden = !sp;
    $('#shareLine').innerHTML = sp ? `${SHARE_TAG}${esc(tr(sharedLabel(sp)))}. ${sp.members.length > 1 ? tr('Los cambios de cualquiera se ven en todas las apps.') : ''}` : '';
    $('#delBtn').textContent = sp && !sp.mine ? 'Salir' : 'Eliminar';
    $('#delBtn').title = sp && !sp.mine ? 'Dejar de tener esta rutina compartida (para los demás sigue igual)' : '';
  };
  drawShare();

  // Llegan cambios (de otro ordenador o de otro editor): se ve la versión nueva, salvo si estás escribiendo.
  const onStore = (e) => {
    if (e.detail.kind !== 'data') return;
    const fresh = routineById(id);
    if (!fresh) return (location.hash = '#/rutinas');
    drawShare();
    drawPin();
    if (dirty || fresh === r) return;
    r = fresh;
    applyTableStyle();
    if (document.activeElement?.id !== 'rname') $('#rname').value = r.name;
    if (!document.activeElement?.closest?.('.sheet [contenteditable], .sheet [data-f]')) draw();
  };
  window.addEventListener('store', onStore);

  $('#rname').addEventListener('input', (e) => ((r.name = e.target.value), save()));
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'rmeta') {
      r.subtitle = el.textContent.trim();
      return save();
    }
    const it = r.items[+el.dataset.i];
    if (!it) return;
    const text = el.isContentEditable ? el.textContent.trim() : el.value;
    if (el.dataset.f) {
      if (el.isContentEditable && !text) delete it[el.dataset.f]; // vacío: vuelve el texto del dibujo
      else it[el.dataset.f] = text;
    } else if (el.dataset.cap) {
      it.captions = { ...it.captions, [el.dataset.cap]: text };
      if (!text) delete it.captions[el.dataset.cap];
    } else if (el.dataset.cue) {
      it.cues = [...cuesOf(it, itemExercise(it))];
      it.cues[+el.dataset.cue] = text;
    } else return;
    save();
  });
  // Intro termina de editar, salvo en los textos largos.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.isContentEditable && e.target.tagName !== 'P' && e.target.tagName !== 'LI' || (e.key === 'Enter' && e.target.id === 'rmeta')) {
      e.preventDefault();
      e.target.blur();
    }
  });
  // Mientras se escribe, ni la fila ni la viñeta se arrastran: así se puede seleccionar texto.
  root.addEventListener('mousedown', (e) => {
    const writing = Boolean(e.target.closest?.('[contenteditable], input'));
    for (const el of [e.target.closest?.('.ritem'), e.target.closest?.('.seq figure')]) if (el) el.draggable = !writing;
  });

  async function improve(ex, targets = null) {
    if (!state.ai?.premium) {
      toast('Mejorar dibujos con IA es una función Premium');
      return openSettings('premium');
    }
    const label = (text) => root.querySelectorAll(`[data-ai="${ex.id}"]`).forEach((b) => ((b.textContent = text), (b.disabled = true)));
    await improveWithAi(ex, (i, total) => label(`${i}/${total}`), targets);
    draw();
  }

  root.addEventListener('click', async (e) => {
    const aiEx = e.target.closest('[data-ai]');
    if (aiEx) {
      const it = r.items[+aiEx.closest('.ritem').dataset.i];
      const own = itemExercise(it);
      // Con viñetas marcadas, solo esas; sin ninguna, toda la secuencia de la fila (las que se ven y tienen imagen).
      const marked = [...(picked.get(it) || [])];
      const ks = marked.length ? marked : phaseOrder(it, own).filter((k) => framesOf(it, own)[k]?.img);
      if (!ks.length) return toast('Esta secuencia no tiene viñetas que mejorar con IA', 'error');
      const n = (own.keyframes || []).length;
      // Una viñeta añadida se redibuja en su dibujo de origen y se copia aquí.
      const origin = (k) => state.exercises.flatMap((x) => (x.keyframes || []).map((f, i) => ({ ex: x, i, f }))).find((o) => o.f.img === it.extra[k - n]?.img);
      const targets = ks.map((k) => (k < n ? { ex: own, i: k } : origin(k))).filter(Boolean);
      if (!targets.length) return toast('Esa viñeta ya no tiene dibujo de origen', 'error');
      await improve(own, targets);
      for (const k of ks.filter((x) => x >= n)) {
        const o = origin(k);
        if (o) it.extra[k - n] = { ...exerciseById(o.ex.id).keyframes[o.i] };
      }
      picked.delete(it);
      draw();
      return save();
    }
    const undo = e.target.closest('[data-ai-undo]');
    if (undo) {
      if (!await ask('¿Volver a los dibujos originales? Se borran los hechos con IA.')) return;
      try {
        await restoreDrawings(undo.dataset.aiUndo);
      } catch (err) {
        toast(err.message, 'error');
      }
      return draw();
    }
    const mv = e.target.closest('[data-mv]');
    const rm = e.target.closest('[data-rm]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (mv) {
      const i = +mv.dataset.i, j = i + +mv.dataset.mv;
      if (j < 0 || j >= r.items.length) return;
      [r.items[i], r.items[j]] = [r.items[j], r.items[i]];
    } else if (rm) {
      r.items.splice(+rm.dataset.rm, 1);
    } else if (act === 'print') {
      return window.print();
    } else if (act === 'add') {
      ui.routineTarget = r.id; // en Rutinas se propone añadir los dibujos elegidos a esta rutina
      location.hash = '#/rutinas';
      return;
    } else if (act === 'pin') {
      // Menú con una casilla por biblioteca: se ancla en las marcadas.
      document.querySelector('.pin-menu')?.remove();
      const menu = document.createElement('div');
      menu.className = 'pin-menu drop-menu';
      const on = new Set(pinnedShelves(routineById(r.id)));
      const own = (state.routineTabs || []).filter((t) => !t.libraryId);
      const mine = new Set(routineById(r.id).tabs || []);
      menu.innerHTML = `<b>Que se vea arriba en…</b>${shelves().map((l) => `<label><input type="checkbox" value="${l.id}" ${on.has(l.id) ? 'checked' : ''}> ${esc(shelfName(l))}</label>`).join('')}
        ${own.length ? `<b>Pestañas de rutinas</b>${own.map((t) => `<label><input type="checkbox" data-tab value="${t.id}" ${mine.has(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}` : ''}`;
      const btn = e.target.closest('[data-act]');
      const b = btn.getBoundingClientRect();
      menu.style.top = b.bottom + 6 + 'px';
      menu.style.left = Math.max(8, Math.min(b.left, innerWidth - 240)) + 'px';
      document.body.append(menu);
      menu.addEventListener('change', async () => {
        const ids = [...menu.querySelectorAll('input:checked:not([data-tab])')].map((i) => i.value);
        const tabs = [...menu.querySelectorAll('input[data-tab]:checked')].map((i) => i.value);
        await setPinnedShelves(r.id, ids);
        upsert('routines', await api.updateRoutine(r.id, { tabs }));
        drawPin();
      });
      const away = (ev) => {
        if (menu.contains(ev.target) || btn.contains(ev.target)) return;
        menu.remove();
        document.removeEventListener('mousedown', away, true);
      };
      document.addEventListener('mousedown', away, true);
      return;
    } else if (act === 'share') {
      flushSave.flush();
      return openShare('routine', r.id);
    } else if (act === 'del') {
      const sp = spaceFor('routine', r.id);
      if (sp && !sp.mine) {
        if (!await ask(`¿Salir de «${r.name}»? Se quita de tu app; para los demás sigue igual.`)) return;
        dirty = false;
        try {
          await api.leaveSpace(sp.id);
          await refresh();
          emit('data');
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }
      if (!await ask(`¿Eliminar la rutina «${r.name}»?${sp ? ' Las personas con quienes la compartes dejarán de verla.' : ''}`)) return;
      dirty = false;
      await removeRoutine(r.id);
      location.hash = '#/rutinas';
      return;
    } else return;
    draw();
    save();
  });

  // Arrastrar y soltar filas para reordenar.
  root.addEventListener('change', (e) => {
    const k = e.target.dataset?.seqPick;
    if (k == null) return;
    const it = r.items[+e.target.dataset.i];
    const ks = picked.get(it) || new Set();
    if (e.target.checked) ks.add(+k);
    else ks.delete(+k);
    if (ks.size) picked.set(it, ks);
    else picked.delete(it);
    e.target.closest('figure').classList.toggle('picked', e.target.checked);
  });
  root.addEventListener('click', (e) => {
    const del = e.target.closest('[data-seq-del]');
    if (!del) return;
    const it = r.items[+del.dataset.i];
    const k = +del.dataset.seqDel;
    // Si está marcada, se quitan todas las marcadas.
    if (isPicked(it, k)) {
      for (const [item, ks] of picked) item.hidden = [...(item.hidden || []), ...ks];
      picked.clear();
    } else it.hidden = [...(it.hidden || []), k];
    draw();
    save();
  });

  // Bandeja de dibujos: sobre una secuencia se añaden sus viñetas a ese ejercicio; se sueltan sobre la rutina, en el sitio de la fila que haya debajo.
  let dragTray = null;
  root.addEventListener('dragstart', (e) => {
    dragTray = e.target.closest?.('[data-tray]')?.dataset.tray || null;
    if (dragTray) e.dataTransfer.effectAllowed = 'copy';
  });
  root.addEventListener('dragover', (e) => {
    if (!dragTray) return;
    const sheet = e.target.closest('.sheet');
    root.querySelector('.sheet').classList.toggle('drop-on', Boolean(sheet));
    root.querySelectorAll('.ritem.over').forEach((x) => x.classList.remove('over'));
    if (!sheet) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.target.closest('.ritem')?.classList.add('over');
  });
  root.addEventListener('drop', (e) => {
    if (!dragTray || !e.target.closest('.sheet')) return;
    e.preventDefault();
    const row = e.target.closest('.ritem');
    if (row && e.target.closest('.seq')) {
      const it = r.items[+row.dataset.i];
      it.extra = [...(it.extra || []), ...(exerciseById(dragTray).keyframes || [])];
      dragTray = null;
      root.querySelector('.sheet').classList.remove('drop-on');
      draw();
      return save();
    }
    const at = row ? +row.dataset.i + (e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? 1 : 0) : r.items.length;
    r.items.splice(at, 0, { exerciseId: dragTray, reps: '', notes: '' });
    dragTray = null;
    root.querySelector('.sheet').classList.remove('drop-on');
    draw();
    save();
  });
  root.addEventListener('dragend', () => {
    dragTray = null;
    root.querySelector('.sheet').classList.remove('drop-on');
  });
  root.querySelector('#trayQ').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLocaleLowerCase(lang);
    root.querySelectorAll('[data-tray]').forEach((f) => (f.hidden = !f.dataset.q.includes(q)));
  });

  let dragFrom = null;
  let dragPhase = null; // { i, k }: la viñeta que se cambia de sitio dentro de su ejercicio
  root.addEventListener('dragstart', (e) => {
    const fig = e.target.closest?.('.seq figure[data-k]');
    if (fig) {
      dragPhase = { i: +fig.closest('.ritem').dataset.i, k: +fig.dataset.k };
      fig.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      return;
    }
    const row = e.target.closest?.('.ritem');
    if (!row) return;
    dragFrom = +row.dataset.i;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  // La secuencia de otro ejercicio bajo el cursor, mientras se arrastra una viñeta.
  const otherSeq = (e) => {
    const seq = dragPhase && e.target.closest?.('.seq');
    return seq && +seq.closest('.ritem').dataset.i !== dragPhase.i ? seq : null;
  };
  // Pasa la viñeta a otro ejercicio de la rutina: allí queda donde se suelte, con su texto.
  const movePhase = (e) => {
    const to = r.items[+e.target.closest('.ritem').dataset.i];
    const toEx = itemExercise(to);
    const start = r.items[dragPhase.i];
    const moving = isPicked(start, dragPhase.k)
      ? [...picked].flatMap(([it, ks]) => (it === to ? [] : [...ks].map((k) => ({ it, k }))))
      : [{ it: start, k: dragPhase.k }];
    const added = [];
    for (const { it: from, k } of moving) {
      to.extra = [...(to.extra || []), framesOf(from, itemExercise(from))[k]];
      const n = framesOf(to, toEx).length - 1;
      const caption = from.captions?.[k];
      if (caption) to.captions = { ...to.captions, [n]: caption };
      from.hidden = [...(from.hidden || []), k];
      added.push(n);
    }
    const order = phaseOrder(to, toEx).filter((k) => !added.includes(k));
    const fig = e.target.closest('.seq figure[data-k]');
    const box = fig?.getBoundingClientRect();
    const at = fig && order.includes(+fig.dataset.k) ? order.indexOf(+fig.dataset.k) + (e.clientX > box.left + box.width / 2 ? 1 : 0) : order.length;
    order.splice(at, 0, ...added);
    to.phases = order;
    picked.clear();
  };
  const phaseTarget = (e) => {
    const fig = dragPhase && e.target.closest?.('.seq figure[data-k]');
    return fig && +fig.closest('.ritem').dataset.i === dragPhase.i && +fig.dataset.k !== dragPhase.k ? fig : null;
  };
  root.addEventListener('dragover', (e) => {
    if (dragPhase) {
      const other = otherSeq(e);
      root.querySelectorAll('.seq.over').forEach((x) => x !== other && x.classList.remove('over'));
      if (other) {
        e.preventDefault();
        other.classList.add('over');
        return;
      }
      const fig = phaseTarget(e);
      root.querySelectorAll('.seq figure.over').forEach((x) => x !== fig && x.classList.remove('over'));
      if (fig) {
        e.preventDefault();
        fig.classList.add('over');
      }
      return;
    }
    if (dragFrom == null) return;
    e.preventDefault();
    root.querySelectorAll('.ritem.over').forEach((x) => x.classList.remove('over'));
    e.target.closest('.ritem')?.classList.add('over');
  });
  root.addEventListener('drop', (e) => {
    if (dragPhase && otherSeq(e)) {
      e.preventDefault();
      movePhase(e);
      dragPhase = null;
      draw();
      return save();
    }
    if (dragPhase) {
      const fig = phaseTarget(e);
      if (fig) {
        e.preventDefault();
        const it = r.items[dragPhase.i];
        const group = isPicked(it, dragPhase.k) ? [...picked.get(it)] : [dragPhase.k];
        if (group.includes(+fig.dataset.k)) {
          dragPhase = null;
          return;
        }
        const order = phaseOrder(it, itemExercise(it)).filter((k) => !group.includes(k));
        const box = fig.getBoundingClientRect();
        order.splice(order.indexOf(+fig.dataset.k) + (e.clientX > box.left + box.width / 2 ? 1 : 0), 0, ...group);
        it.phases = order;
        draw();
        save();
      }
      dragPhase = null;
      return;
    }
    const row = e.target.closest('.ritem');
    if (dragFrom == null || !row) return;
    e.preventDefault();
    const [moved] = r.items.splice(dragFrom, 1);
    r.items.splice(+row.dataset.i, 0, moved);
    dragFrom = null;
    draw();
    save();
  });
  root.addEventListener('dragend', () => {
    dragFrom = null;
    dragPhase = null;
    root.querySelectorAll('.ritem.dragging, .ritem.over, .seq.over, .seq figure.dragging, .seq figure.over').forEach((x) => x.classList.remove('dragging', 'over'));
  });

  const onUndoKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
    if (e.target.closest?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
    e.preventDefault();
    undo();
  };
  document.addEventListener('keydown', onUndoKey);
  root.addEventListener('click', (e) => e.target.closest('[data-act="undo"]') && undo());

  return () => {
    document.removeEventListener('keydown', onUndoKey);
    window.removeEventListener('store', onStore);
    flushSave.flush();
  };
}
