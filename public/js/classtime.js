// Clases: carpetas que se reproducen seguidas, en su orden, como una lista. Aquí está lo común a la
// Biblioteca y al reproductor: qué hay en la clase, cuánto dura cada cosa y las ventanas para elegirlo.
// En lib.classItems[id] va el tramo de un video ({ start, end }) o el tiempo de una foto o rutina ({ secs }).
import { api } from './api.js';
import { state, esc, toast, upsert, emit, fmtTime, parseTime, pinnedShelves, mountSpotify } from './store.js';
import { tr } from './i18n.js';

export const IMAGE_SECS = 10;
export const ROUTINE_SECS = 30;
// Spotify suena incrustado (no se puede saber cuánto dura ni empezar solo): se elige el tiempo.
export const SPOTIFY_SECS = 60;
const defaultSecs = (type) => (type === 'image' ? IMAGE_SECS : type === 'spotify' ? SPOTIFY_SECS : ROUTINE_SECS);

export const isClass = (l) => l?.kind === 'class';

/** Lo que hay en la clase, en su orden propio («Mi orden»): rutinas añadidas, videos y fotos. */
export function classItems(lib) {
  const vids = state.videos.filter((v) => v.libraryId === lib.id);
  const rts = state.routines.filter((r) => pinnedShelves(r).includes(lib.id));
  const rank = (it) => (it.kind === 'routine' ? it.x.orderIn?.[lib.id] ?? -1 : it.x.order ?? Infinity);
  const KIND = { routine: 1, video: 2 };
  return [...rts.map((x) => ({ kind: 'routine', x })), ...vids.map((x) => ({ kind: 'video', x }))]
    .sort((a, b) => rank(a) - rank(b) || KIND[a.kind] - KIND[b.kind] || String(a.x.createdAt).localeCompare(String(b.x.createdAt)));
}

// 'video' también vale para los archivos de audio: se reproduce su tramo igual.
export const itemType = (it) => (it.kind === 'routine' ? 'routine' : it.x.source?.platform === 'spotify' ? 'spotify' : it.x.source?.mediaType === 'image' ? 'image' : 'video');
export const playable = (it) => it.kind === 'routine' || it.x.source?.platform === 'spotify' || Boolean(it.x.source?.file);

// Duración de cada archivo de video, leída una vez de sus datos (sin descargar nada más).
const durations = new Map();
export function videoDuration(v) {
  if (!v.source?.file) return Promise.resolve(0);
  if (!durations.has(v.id)) {
    durations.set(v.id, new Promise((resolve) => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.muted = true;
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
      el.onerror = () => resolve(0);
      el.src = `/media/${encodeURIComponent(v.source.file)}`;
    }));
  }
  return durations.get(v.id);
}

/** El tramo que se reproduce de un video: { start, end } (end ya resuelto con la duración). */
export async function segmentOf(lib, v) {
  const set = lib.classItems?.[v.id] || {};
  const dur = v.source?.platform === 'spotify' ? set.dur || v.source.duration || SPOTIFY_SECS : await videoDuration(v);
  const start = Math.min(set.start ?? 0, dur || Infinity);
  const end = set.end != null && set.end > start ? Math.min(set.end, dur || set.end) : dur;
  return { start, end, dur };
}

/** Segundos que ocupa una cosa en la clase (0 si no se puede reproducir). */
export async function itemSecs(lib, it) {
  if (!playable(it)) return 0;
  const type = itemType(it);
  if (type === 'video' || type === 'spotify') {
    const { start, end } = await segmentOf(lib, it.x);
    return Math.max(0, end - start);
  }
  return lib.classItems?.[it.x.id]?.secs || defaultSecs(type);
}

export async function totalSecs(lib) {
  const secs = await Promise.all(classItems(lib).map((it) => itemSecs(lib, it)));
  return secs.reduce((a, b) => a + b, 0);
}

/** 1:05:09 o 5:09. */
export function clock(t) {
  t = Math.max(0, Math.round(t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Tiempo con décimas solo si las hay: 0:02, 0:04.5.
const exact = (t) => fmtTime(t).replace(/\.0$/, '');

/** Texto corto del chip de cada recuadro: el tramo de un video o el tiempo de una foto o rutina. */
export function chipText(lib, it) {
  const set = lib.classItems?.[it.x.id];
  const type = itemType(it);
  if (type === 'video' || type === 'spotify') return set && (set.start != null || set.end != null) ? `${exact(set.start || 0)}–${set.end != null ? exact(set.end) : 'fin'}` : type === 'video' && it.x.source?.mediaType !== 'audio' ? 'Todo el video' : 'Todo el audio';
  return `${set?.secs || defaultSecs(type)} s`;
}

/** Apunta la duración de una canción de Spotify cuando se sabe (sin tocar su tramo). */
export async function rememberDuration(lib, id, dur) {
  const set = lib.classItems?.[id] || {};
  if (!dur || Math.abs((set.dur || 0) - dur) < 0.5) return;
  await save(lib, id, { ...set, dur });
}

async function save(lib, id, value) {
  const items = { ...(lib.classItems || {}) };
  if (value) items[id] = value;
  else delete items[id];
  try {
    upsert('libraries', await api.updateLibrary(lib.id, { classItems: items }));
    emit('data');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function dialog(html) {
  const dlg = document.createElement('dialog');
  dlg.className = 'ask cls-dlg';
  // ✕ arriba a la derecha; ✕ y Cancelar cierran siempre (aunque lo demás no haya cargado).
  dlg.innerHTML = `<button class="dlg-x" type="button" data-cancel title="Cerrar" aria-label="Cerrar">✕</button>${html}`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target.closest('[data-cancel]') && dlg.close());
  dlg.showModal();
  return dlg;
}

/** Ventana para elegir el tramo de un video que entra en la clase. */
export async function openSegment(lib, v) {
  const set = lib.classItems?.[v.id] || {};
  const spotify = v.source?.platform === 'spotify';
  const dlg = dialog(`
    <h3>Tramo de «${esc(v.title)}»</h3>
    ${spotify ? '<div class="spotify-slot"></div><p class="hint">Pulsa ▶ para que Spotify cargue la canción y poder elegir el tramo.</p>' : `<video src="/media/${esc(encodeURIComponent(v.source.file))}" controls preload="metadata" playsinline></video>`}
    <div class="seg-tl" title="Arrastra las asas para elegir el tramo; clic en la barra para ir a ese momento">
      <div class="seg-sel"><span class="seg-h" data-h="start" title="Inicio"></span><span class="seg-h" data-h="end" title="Fin"></span></div>
      <div class="seg-play"></div>
    </div>
    <div class="seg-scale"><span data-scale="0">0:00</span><span data-scale="1"></span></div>
    <div class="cls-seg">
      <label>Inicio <input data-f="start" value="${set.start != null ? fmtTime(set.start) : '0:00.0'}" inputmode="decimal"></label>
      <button class="btn small" data-mark="start" type="button" title="El momento que se ve ahora en el video">Aquí</button>
      <label>Fin <input data-f="end" value="${set.end != null ? fmtTime(set.end) : ''}" placeholder="final" inputmode="decimal"></label>
      <button class="btn small" data-mark="end" type="button" title="El momento que se ve ahora en el video">Aquí</button>
    </div>
    <p class="hint" data-len></p>
    <footer>
      <button class="btn ghost" data-all type="button">${spotify || v.source?.mediaType === 'audio' ? 'Todo el audio' : 'Todo el video'}</button>
      <button class="btn ghost" data-cancel type="button">Cancelar</button>
      <button class="btn primary" data-save type="button">Guardar</button>
    </footer>`);
  // Un <video> (o audio) o el reproductor de Spotify, que se usa igual.
  const video = spotify ? await mountSpotify(dlg.querySelector('.spotify-slot'), v.source.url) : dlg.querySelector('video');
  if (!video) {
    // Spotify no deja ver esta lista: queda el aviso y solo se puede cerrar.
    dlg.querySelectorAll('.seg-tl, .seg-scale, .cls-seg, [data-len], .spotify-slot + .hint, [data-all], [data-save]').forEach((el) => el.remove());
    dlg.querySelector('[data-cancel].btn').textContent = tr('Cerrar');
    return;
  }
  const field = (k) => dlg.querySelector(`[data-f="${k}"]`);
  const read = () => {
    const start = parseTime(field('start').value || '0');
    const end = field('end').value.trim() ? parseTime(field('end').value) : null;
    return { start: Number.isNaN(start) ? 0 : start, end: Number.isNaN(end) ? null : end };
  };
  const tl = dlg.querySelector('.seg-tl');
  const pct = (t) => `${video.duration ? Math.max(0, Math.min(100, (t / video.duration) * 100)) : 0}%`;
  const drawTl = () => {
    const { start, end } = read();
    const stop = end ?? video.duration ?? 0;
    const sel = dlg.querySelector('.seg-sel');
    sel.style.left = pct(start);
    sel.style.width = `calc(${pct(stop)} - ${pct(start)})`;
    dlg.querySelector('.seg-play').style.left = pct(video.currentTime);
  };
  const showLen = () => {
    const { start, end } = read();
    const stop = end ?? video.duration;
    dlg.querySelector('[data-len]').textContent = Number.isFinite(stop) ? `Se reproducen ${clock(Math.max(0, stop - start))}.` : '';
    drawTl();
  };
  video.addEventListener('loadedmetadata', () => {
    video.currentTime = read().start;
    dlg.querySelector('[data-scale="1"]').textContent = clock(video.duration);
    showLen();
  });
  video.addEventListener('timeupdate', drawTl);
  // Arrastrar un asa mueve el inicio o el fin (y el video va a ese momento); un clic en la barra, solo el video.
  const timeAt = (x) => {
    const r = tl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * (video.duration || 0);
  };
  let dragging = null;
  tl.addEventListener('pointerdown', (e) => {
    if (!video.duration) return;
    e.preventDefault();
    const h = e.target.closest('[data-h]')?.dataset.h;
    if (!h) return (video.currentTime = timeAt(e.clientX)), drawTl();
    dragging = h;
    tl.setPointerCapture(e.pointerId);
  });
  tl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const { start, end } = read();
    let t = timeAt(e.clientX);
    if (dragging === 'start') t = Math.min(t, (end ?? video.duration) - 0.1);
    else t = Math.max(t, start + 0.1);
    field(dragging).value = fmtTime(Math.max(0, t));
    video.currentTime = t;
    showLen();
  });
  const stopDrag = () => (dragging = null);
  tl.addEventListener('pointerup', stopDrag);
  tl.addEventListener('pointercancel', stopDrag);
  dlg.addEventListener('input', showLen);
  dlg.addEventListener('click', async (e) => {
    const mark = e.target.closest('[data-mark]')?.dataset.mark;
    if (mark) return (field(mark).value = fmtTime(video.currentTime)), showLen();
    if (e.target.closest('[data-cancel]')) return dlg.close();
    if (e.target.closest('[data-all]')) return dlg.close(), save(lib, v.id, spotify && Number.isFinite(video.duration) ? { dur: video.duration } : null);
    if (e.target.closest('[data-save]')) {
      const { start, end } = read();
      if (end != null && end <= start) return toast('El fin tiene que ir después del inicio', 'error');
      dlg.close();
      const dur = spotify && Number.isFinite(video.duration) ? video.duration : null;
      await save(lib, v.id, { ...(start ? { start } : {}), ...(end != null ? { end } : {}), ...(dur ? { dur } : {}) });
    }
  });
}

/** Ventana para elegir cuánto tiempo se ve una foto o una rutina en la clase. */
export function openSecs(lib, it) {
  const type = itemType(it);
  const current = lib.classItems?.[it.x.id]?.secs || defaultSecs(type);
  const name = it.kind === 'routine' ? it.x.name : it.x.title;
  const dlg = dialog(`
    <h3>Tiempo en pantalla</h3>
    <p>«${esc(name)}» se verá durante:</p>
    <label class="cls-secs"><input type="number" min="1" max="3600" step="1" value="${current}" data-secs> segundos</label>
    <footer>
      <button class="btn ghost" data-cancel type="button">Cancelar</button>
      <button class="btn primary" data-save type="button">Guardar</button>
    </footer>`);
  const input = dlg.querySelector('[data-secs]');
  input.select();
  const done = async () => {
    const secs = Math.round(+input.value);
    if (!(secs >= 1 && secs <= 3600)) return toast('Pon entre 1 y 3600 segundos', 'error');
    dlg.close();
    await save(lib, it.x.id, { secs });
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), done()));
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancel]')) dlg.close();
    else if (e.target.closest('[data-save]')) done();
  });
}
