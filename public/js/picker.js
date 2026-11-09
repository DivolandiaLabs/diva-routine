// Buscador de lo importado, para sacar dibujos desde el Creador de rutinas: al elegir un video o
// una foto se abre su página, que es donde se marcan los tramos.
import { state, esc, exercisesOf, libraryById, libraryLabel, videoThumb, isAudio } from './store.js';

const MAX_SHOWN = 200; // con la búsqueda se llega a lo demás

const where = (v) => libraryLabel(libraryById(v.libraryId));
const newestFirst = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export function openLibraryPicker() {
  document.getElementById('libPick')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'libPick';
  dlg.className = 'ig-dialog lib-pick';
  dlg.innerHTML = `
    <header><h2>Elige de tus bibliotecas</h2><button class="x" data-pick-close aria-label="Cerrar">✕</button></header>
    <p class="hint">Elige un video o una foto para sacar sus dibujos.</p>
    <input id="pickQ" type="search" placeholder="Buscar en tus bibliotecas…" aria-label="Buscar en tus bibliotecas" autocomplete="off">
    <ul class="lib-pick-list" id="pickList"></ul>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector('#pickQ');
  const list = dlg.querySelector('#pickList');

  const found = () => {
    const q = input.value.trim().toLowerCase();
    // Solo videos y fotos: de un audio (archivo o Spotify) no se sacan dibujos.
    return state.videos
      .filter((v) => !isAudio(v))
      .filter((v) => !q || `${v.title} ${where(v)}`.toLowerCase().includes(q))
      .sort(newestFirst);
  };

  const row = (v) => {
    const n = exercisesOf(v.id).length;
    return `
      <li><button class="lib-pick-row" data-pick="${esc(v.id)}">
        <span class="lib-pick-thumb">${videoThumb(v)}</span>
        <span class="lib-pick-text">
          <b class="lib-pick-name">${esc(v.title)}</b>
          <small class="lib-pick-where">${esc(where(v))}</small>
        </span>
        ${n ? `<small class="lib-pick-count">${n} dibujo${n === 1 ? '' : 's'}</small>` : ''}
      </button></li>`;
  };

  const draw = () => {
    const items = found();
    list.innerHTML = items.length
      ? items.slice(0, MAX_SHOWN).map(row).join('')
      : `<li class="hint">${state.videos.length ? 'Nada coincide con la búsqueda.' : 'Aún no has importado videos ni fotos.'}</li>`;
  };

  const open = (id) => {
    dlg.close();
    location.hash = `#/video/${id}`;
  };

  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = found()[0];
    if (first) open(first.id);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-pick-close]')) return dlg.close();
    const id = e.target.closest('[data-pick]')?.dataset.pick;
    if (id) open(id);
  });
  dlg.addEventListener('close', () => dlg.remove());
  draw();
  dlg.showModal();
  input.focus();
}
