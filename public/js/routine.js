// Una rutina: tabla visual (se edita en la propia tabla y se imprime tal cual).
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import {
  esc, toast, fmtTime, debounce, upsert, refresh, emit, routineById, exerciseById, videoById, autoOrder, ui, removeRoutine, pinRoutines, CATEGORIES,
  spaceFor, sharedLabel,
  ask,
} from './store.js';
import { openShare, SHARE_TAG } from './share.js';

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
      <button class="btn small" data-act="auto-order" title="Calentamiento → centro → kicks → giros → saltos → diagonales → suelo → estiramientos">Ordenar automáticamente</button>
      <button class="btn small" data-act="add" title="Elegir más dibujos en Rutinas">+ Añadir ejercicios</button>
      <button class="btn small" data-act="pin" id="pinBtn"></button>
      <button class="btn small" data-act="share" title="Que otras personas puedan ver y cambiar esta rutina">${SHARE_TAG}Editores</button>
      <button class="btn primary" data-act="print">Imprimir / PDF</button>
      <button class="btn small ghost danger" data-act="del" id="delBtn">Eliminar</button>
    </div>
    <p class="share-line no-print" id="shareLine" hidden></p>
    <article class="sheet">
      <header class="sheet-head">
        <div><input id="rname" class="sheet-title" value="${esc(r.name)}" aria-label="Nombre de la rutina"><p id="rmeta"></p></div>
        <div class="legend" id="legend" hidden><span><i class="lg-r"></i> lado derecho</span><span><i class="lg-l"></i> lado izquierdo</span></div>
      </header>
      <div id="table"></div>
    </article>`;

  const $ = (s) => root.querySelector(s);
  // Solo se guarda si hubo cambios (al salir de la vista se fuerza el guardado pendiente).
  let dirty = false;
  const flushSave = debounce(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      upsert('routines', await api.updateRoutine(r.id, { name: r.name, items: r.items }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }, 400);
  const save = () => ((dirty = true), flushSave());

  function draw() {
    r.items = r.items.filter((it) => exerciseById(it.exerciseId));
    $('#rmeta').textContent = `${r.items.length} ejercicios · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    if (!r.items.length) {
      $('#table').innerHTML = '<div class="empty-state"><p>Esta rutina no tiene ejercicios. Pulsa <b>+ Añadir ejercicios</b>.</p></div>';
      return;
    }
    // La leyenda de colores solo hace falta si queda alguna figura dibujada (sin viñeta).
    $('#legend').hidden = !r.items.some((it) => (exerciseById(it.exerciseId).keyframes || []).some((k) => !k.img));
    let lastCat = null;
    $('#table').innerHTML = `
      <table class="routine-table">
        <thead><tr><th>#</th><th>Ejercicio</th><th>Secuencia</th><th>Técnica</th><th class="no-print"></th></tr></thead>
        <tbody>${r.items.map((it, i) => {
          const e = exerciseById(it.exerciseId);
          const v = videoById(e.videoId);
          const seq = (e.keyframes || []).length
            ? phasesSVG(e.keyframes, { size: 140 }).map((ph) => `<figure class="${ph.img ? 'is-img' : ''}">${ph.svg}<figcaption>${esc(ph.caption)}</figcaption></figure>`).join('')
            : v?.source.mediaType === 'image' ? `<figure><img src="/media/${esc(v.source.file)}" alt=""></figure>` : '<span class="hint">Sin dibujos</span>';
          // Como en los pósters de ejercicios: una banda de color al empezar cada sección.
          const cat = e.category || 'Otros';
          const ci = Math.max(0, CATEGORIES.indexOf(cat));
          const band = cat !== lastCat ? `<tr class="cat-row" style="--cat: var(--cat-${ci % 8})"><td colspan="5">${esc(cat)}</td></tr>` : '';
          lastCat = cat;
          return `${band}<tr class="ritem" draggable="true" data-i="${i}" style="--cat: var(--cat-${ci % 8})">
            <td class="c-num">${i + 1}</td>
            <td class="c-name">
              ${v ? `<a href="#/video/${e.videoId}" class="ex-link" title="Abrir el video para editar este ejercicio"><b>${esc(e.title)}</b></a>` : `<b>${esc(e.title)}</b>`}
              ${e.category ? `<small>${esc(e.category)}</small>` : ''}
              ${v ? `<small class="src">${esc(v.title)}${e.end != null && v.source.mediaType === 'video' ? ` · ${fmtTime(e.start)}–${fmtTime(e.end)}` : ''}</small>` : ''}
              <input class="reps" data-f="reps" data-i="${i}" value="${esc(it.reps)}" placeholder="Reps / tiempo">
            </td>
            <td class="c-seq"><div class="seq">${seq}</div></td>
            <td class="c-tech">
              ${e.technique?.summary ? `<p>${esc(e.technique.summary)}</p>` : ''}
              ${e.technique?.cues?.length ? `<ul>${e.technique.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
              <input class="note" data-f="notes" data-i="${i}" value="${esc(it.notes)}" placeholder="Notas (música, cuentas…)">
            </td>
            <td class="c-tools no-print">
              <span class="handle" title="Arrastra para reordenar">⋮⋮</span>
              <button data-mv="-1" data-i="${i}" title="Subir">↑</button>
              <button data-mv="1" data-i="${i}" title="Bajar">↓</button>
              <button data-rm="${i}" title="Quitar de la rutina">✕</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }
  draw();
  const drawPin = () => {
    const on = Boolean(routineById(r.id)?.pinned);
    $('#pinBtn').textContent = on ? 'Quitar de inicio' : 'Añadir a inicio';
    $('#pinBtn').title = on ? 'Quitar de la página principal' : 'Que se vea en la página principal';
  };
  drawPin();
  // Compartida: con quién (o quién te la compartió). Si te la compartieron, «Eliminar» es salir.
  const drawShare = () => {
    const sp = spaceFor('routine', r.id);
    $('#shareLine').hidden = !sp;
    $('#shareLine').innerHTML = sp ? `${SHARE_TAG}${esc(sharedLabel(sp))}. ${sp.members.length > 1 ? 'Los cambios de cualquiera se ven en todas las apps.' : ''}` : '';
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
    if (document.activeElement?.id !== 'rname') $('#rname').value = r.name;
    if (!root.contains(document.activeElement) || !document.activeElement.dataset.f) draw();
  };
  window.addEventListener('store', onStore);

  $('#rname').addEventListener('input', (e) => ((r.name = e.target.value), save()));
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    r.items[+e.target.dataset.i][f] = e.target.value;
    save();
  });

  root.addEventListener('click', async (e) => {
    const mv = e.target.closest('[data-mv]');
    const rm = e.target.closest('[data-rm]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (mv) {
      const i = +mv.dataset.i, j = i + +mv.dataset.mv;
      if (j < 0 || j >= r.items.length) return;
      [r.items[i], r.items[j]] = [r.items[j], r.items[i]];
    } else if (rm) {
      r.items.splice(+rm.dataset.rm, 1);
    } else if (act === 'auto-order') {
      const ordered = autoOrder(r.items.map((it) => ({ ...exerciseById(it.exerciseId), _it: it })));
      r.items = ordered.map((x) => x._it);
    } else if (act === 'print') {
      return window.print();
    } else if (act === 'add') {
      ui.routineTarget = r.id; // en Rutinas se propone añadir los dibujos elegidos a esta rutina
      location.hash = '#/rutinas';
      return;
    } else if (act === 'pin') {
      await pinRoutines([r.id], !routineById(r.id).pinned);
      drawPin();
      toast(routineById(r.id).pinned ? 'Rutina añadida a la página principal' : 'Rutina quitada de la página principal');
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
  let dragFrom = null;
  root.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.ritem');
    if (!row) return;
    dragFrom = +row.dataset.i;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (e) => {
    if (dragFrom == null) return;
    e.preventDefault();
    root.querySelectorAll('.ritem.over').forEach((x) => x.classList.remove('over'));
    e.target.closest('.ritem')?.classList.add('over');
  });
  root.addEventListener('drop', (e) => {
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
    root.querySelectorAll('.ritem.dragging, .ritem.over').forEach((x) => x.classList.remove('dragging', 'over'));
  });

  return () => {
    window.removeEventListener('store', onStore);
    flushSave.flush();
  };
}
