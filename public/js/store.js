// Estado compartido de la app, utilidades y trabajos en segundo plano
// (descargas, extracción automática y manual de ejercicios, creación de rutinas).
import { api } from './api.js';
import { figureSVG } from './figure.js';
import { samplePoses, detectPose, loadImage, videoDuration, capturePoster } from './pose.js';
import { analyze, segmentExercises } from './analysis.js';
import { illustratePhases } from './illustrate.js';

export const state = { libraries: [], videos: [], exercises: [], routines: [], ytdlp: false, instagram: { connected: false }, collab: { ready: false, spaces: [] }, version: '' };

export async function refresh() {
  Object.assign(state, await api.state());
}

/**
 * Se puede bajar el archivo: de su link (yt-dlp, o Instagram con tu cuenta conectada) o, si es
 * de una carpeta compartida, del Drive de quien lo añadió.
 */
export const canDownload = (v) => Boolean(v.source.drive) || v.source.platform === 'cloud' || (Boolean(v.source.url) && (state.ytdlp || (v.source.platform === 'instagram' && state.instagram.connected)));

// ---------- compartido con otras personas ----------

/** El espacio compartido de una carpeta, rutina o dibujo (type: folder|routine|drawing), si lo está. */
export const spaceFor = (type, id) => (state.collab?.spaces || []).find((s) => s.type === type && s.rootId === id) || null;
/** La carpeta compartida en la que está (o que es) esta carpeta. */
export function sharedFolderOf(libraryId) {
  for (let l = libraryById(libraryId), n = 0; l && !l.root && n < 100; l = libraryById(l.parentId), n++) {
    const sp = spaceFor('folder', l.id);
    if (sp) return sp;
  }
  return null;
}
/** Quién lo añadió, si fue otra persona (en lo compartido contigo). */
export const addedByOther = (r) => (r?.addedBy && state.collab?.email && r.addedBy !== state.collab.email ? r.addedBy : null);
/** «ana» de «ana@gmail.com». */
export const who = (email) => String(email || '').split('@')[0];
/** Texto para el aviso de algo compartido: con quién, o quién te lo compartió. */
export function sharedLabel(sp) {
  if (!sp) return '';
  const a = sp.type === 'drawing' ? 'o' : 'a'; // el dibujo; la carpeta, la rutina
  const others = sp.members.filter((m) => m !== state.collab?.email);
  if (!sp.mine) return `Te l${a} comparte ${sp.owner}`;
  return others.length ? `Compartid${a} con ${others.join(', ')}` : `Compartid${a} (aún sin nadie más)`;
}

/** Trae los posts nuevos de las colecciones de Instagram enlazadas a esas bibliotecas. */
export async function syncInstagram(libs) {
  const created = [];
  const errors = [];
  for (const lib of libs) {
    try {
      const r = await api.syncLibrary(lib.id);
      upsert('libraries', r.library);
      r.created.forEach((v) => upsert('videos', v));
      created.push(...r.created);
      errors.push(...r.errors);
    } catch (e) {
      errors.push(`${lib.name}: ${e.message}`);
      if (/sesión|conecta|verificación/i.test(e.message)) break;
    }
  }
  if (errors.length) state.instagram = await api.igStatus().catch(() => state.instagram);
  emit('data');
  queueDownload(created.filter(canDownload).map((v) => v.id));
  return { created, errors };
}

export const linkedLibraries = () => state.libraries.filter((l) => l.igCollections?.length || l.lists?.length);

// ---------- bibliotecas y carpetas ----------
// La biblioteca principal es la raíz de siempre (root): sus carpetas de arriba no tienen parentId.
// Las demás bibliotecas (shelf) guardan dentro lo suyo: sus carpetas de arriba tienen parentId = su id.
const mainLibrary = () => state.libraries.find((l) => l.root) || state.libraries[0];
export const isTop = (l) => Boolean(l?.root || l?.shelf);
/** Todas las bibliotecas, en el orden que les hayas dado (sin orden: la principal y luego por fecha). */
export const shelves = () => [mainLibrary(), ...state.libraries.filter((l) => l.shelf && !l.root)].filter(Boolean)
  .map((l, i) => [l, l.order ?? (l.root ? -1 : 1e6 + i)])
  .sort((a, b) => a[1] - b[1])
  .map(([l]) => l);
export const shelfName = (l) => (l?.root && (!l.name || l.name === 'General') ? 'Biblioteca' : l?.name || 'Biblioteca');
/** La biblioteca abierta (se recuerda en este ordenador). */
export function activeShelf() {
  let id = null;
  try {
    id = localStorage.getItem('jr-shelf');
  } catch {
    /* sin almacenamiento: la principal */
  }
  const l = libraryById(id);
  return l?.shelf ? l : mainLibrary();
}
export function setActiveShelf(id) {
  try {
    localStorage.setItem('jr-shelf', id || '');
  } catch {
    /* solo esta vez */
  }
}
/** La biblioteca de un elemento: subiendo por sus carpetas hasta la de arriba. */
export function shelfOf(libraryId) {
  let l = libraryById(libraryId);
  for (let n = 0; l && !isTop(l) && n < 100; n++) l = libraryById(l.parentId) || mainLibrary();
  return l || mainLibrary();
}
/** Donde va lo suelto de la biblioteca abierta (sin carpeta). */
export const rootLibrary = () => activeShelf();
/** parentId de las carpetas de arriba de la biblioteca abierta. */
export const topParent = () => (activeShelf().root ? null : activeShelf().id);
export const folders = () => state.libraries.filter((l) => !isTop(l));
/** Carpetas que hay justo dentro de otra (null = las de arriba de la biblioteca abierta). */
// En el orden que les hayas dado arrastrándolas (las que no tienen, al final, como se crearon).
export const childFolders = (parentId) => {
  const key = parentId || topParent();
  return folders()
    .filter((l) => (l.parentId || null) === key)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
};
/** La carpeta y las de encima, de fuera hacia dentro: [jszz, giros]. */
export function folderPath(lib) {
  const out = [];
  for (let l = lib; l && !isTop(l) && !out.includes(l); l = libraryById(l.parentId)) out.unshift(l);
  return out;
}
/** Ids de las subcarpetas de una carpeta, a cualquier profundidad. */
export function descendantIds(id) {
  const out = [];
  const walk = (pid) => {
    for (const l of childFolders(pid)) {
      if (out.includes(l.id)) continue;
      out.push(l.id);
      walk(l.id);
    }
  };
  walk(id);
  return out;
}
/** Videos de una carpeta y de todas sus subcarpetas. */
export const videosDeep = (id) => {
  const ids = new Set([id, ...descendantIds(id)]);
  return state.videos.filter((v) => ids.has(v.libraryId)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
};
export const libraryLabel = (l) => {
  if (isTop(l)) return `${shelfName(l)} (sin carpeta)`;
  const path = folderPath(l).map((x) => x.name).join(' › ') || l?.name || '';
  return shelves().length > 1 ? `${shelfName(shelfOf(l?.id))} › ${path}` : path;
};

// ---------- borrar ----------

/** Quita de la selección y de las colas de trabajo lo que ya no existe. */
function forget(ids) {
  const gone = new Set(ids);
  for (let i = selection.length - 1; i >= 0; i--) if (gone.has(selection[i].id)) selection.splice(i, 1);
  jobs.downloads = jobs.downloads.filter((id) => !gone.has(id));
  jobs.analyses = jobs.analyses.filter((id) => !gone.has(id) || (waiting.get(id)?.reject(new Error('Borrado')), waiting.delete(id), false));
  if (gone.has(ui.routineTarget)) ui.routineTarget = null;
}

async function afterDelete(ids) {
  forget(ids);
  await refresh();
  emit('data');
  emit('selection');
  emit('job');
}

/** Borra videos (con sus ejercicios, que también salen de las rutinas). */
export async function removeVideos(ids) {
  if (!ids.length) return;
  await api.deleteVideos(ids);
  await afterDelete(ids);
}

/** Borra bibliotecas con todos sus videos. Si no queda ninguna, el servidor deja una «General» vacía. */
export async function removeLibraries(ids) {
  // Si se borran una carpeta y alguna de sus subcarpetas, basta con borrar la de fuera.
  const chosen = new Set(ids);
  const top = ids.filter((id) => !folderPath(libraryById(id)).slice(0, -1).some((a) => chosen.has(a.id)));
  const all = [...new Set(top.flatMap((id) => [id, ...descendantIds(id)]))];
  const videoIds = state.videos.filter((v) => all.includes(v.libraryId)).map((v) => v.id);
  for (const id of top) await api.deleteLibrary(id);
  await afterDelete([...all, ...videoIds]);
}

/** Mueve videos a una carpeta (o a la raíz). */
export async function moveVideos(ids, libraryId) {
  for (const id of ids) upsert('videos', await api.updateVideo(id, { libraryId }));
  emit('data');
}

/** Mete una carpeta dentro de otra (parentId null = en la Biblioteca). */
export async function moveFolder(id, parentId) {
  upsert('libraries', await api.updateLibrary(id, { parentId }));
  emit('data');
}

export async function removeRoutine(id) {
  await api.deleteRoutine(id);
  await afterDelete([id]);
}

/** Avisa a las vistas de que algo cambió: kind = 'data' | 'job'. */
export function emit(kind, id = null) {
  window.dispatchEvent(new CustomEvent('store', { detail: { kind, id } }));
}

// ---------- utilidades ----------

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Segundos -> "m:ss.s" */
export function fmtTime(t) {
  if (t == null || isNaN(t)) return '–';
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** "1:23.4", "83.4" o "1:23" -> segundos (NaN si no se entiende). */
export function parseTime(s) {
  const parts = String(s).trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || isNaN(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = () => {
    clearTimeout(t);
    fn();
  };
  return d;
}

let toastTimer;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), kind === 'error' ? 7000 : 3500);
}

// ---------- consultas ----------

const byIdIn = (list) => (id) => state[list].find((x) => x.id === id);
export const libraryById = byIdIn('libraries');
export const videoById = byIdIn('videos');
export const exerciseById = byIdIn('exercises');
export const routineById = byIdIn('routines');

export const videosOf = (libraryId) => state.videos.filter((v) => !libraryId || v.libraryId === libraryId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const exercisesOf = (videoId) => state.exercises.filter((e) => e.videoId === videoId).sort((a, b) => a.start - b.start);

export function upsert(list, item) {
  const i = state[list].findIndex((x) => x.id === item.id);
  if (i >= 0) state[list][i] = item;
  else state[list].push(item);
  return item;
}

// ---------- categorías y orden automático ----------

// Orden típico de una clase de jazz: de calentamiento a suelo y estiramientos.
export const CATEGORIES = ['Calentamiento / aislamientos', 'Centro', 'Kicks y extensiones', 'Giros', 'Saltos', 'Diagonales', 'Suelo', 'Estiramientos', 'Coreografía', 'Posición'];
export const categoryRank = (c) => {
  const i = CATEGORIES.indexOf(c);
  return i < 0 ? CATEGORIES.length : i;
};

/** Ordena ejercicios como una clase (estable: dentro de cada categoría se respeta el orden dado). */
export function autoOrder(exercises) {
  return exercises.map((e, i) => [e, i]).sort((a, b) => categoryRank(a[0].category) - categoryRank(b[0].category) || a[1] - b[1]).map((x) => x[0]);
}

// ---------- miniaturas ----------

export const PLATFORM = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', vimeo: 'Vimeo', web: 'Link', local: 'Archivo' , cloud: 'Nube' };

/** Dibujo representativo de un ejercicio (el momento clave del medio). */
export function exerciseFigure(ex, size = 120, opts = {}) {
  const kf = ex?.keyframes || [];
  const k = kf[Math.floor((kf.length - 1) / 2)];
  if (k?.img) return `<img class="phase-img" src="/media/${encodeURI(k.img)}" alt="${esc(k.label)}" loading="lazy">`;
  return k ? figureSVG(k.lms, { aspect: k.aspect, size, label: k.label, ...opts }) : figureSVG(null, { size, emptyText: 'Sin dibujo' });
}

export function youtubeId(url) {
  return (String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/) || [])[1] || null;
}

/**
 * Miniatura del propio video o foto (en la Biblioteca no salen los dibujos: esos son de las
 * rutinas). Los videos se muestran con una imagen de portada, no con un <video>: pesa menos
 * y no le salen encima los controles que añaden algunas extensiones del navegador.
 */
export function videoThumb(v) {
  const ph = (label, cover = '') =>
    `<div class="ph ph-${esc(v.source.platform)}"><span>${esc(label)}</span>${cover ? `<img class="ph-cover" src="${esc(cover)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  if (v.source.mediaType === 'image' && v.source.file) return `<img src="/media/${esc(v.source.file)}" alt="" loading="lazy">`;
  if (v.poster) return `<img src="/media/${esc(v.poster)}" alt="" loading="lazy">`;
  if (v.source.mediaType === 'video') {
    // Mientras se hace su portada: la del post de Instagram si la hay, o un fondo neutro.
    requestPoster(v.id);
    return `<div class="ph ph-wait"><span>Video</span>${v.source.thumb ? `<img class="ph-cover" src="${esc(v.source.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  }
  const yt = v.source.platform === 'youtube' && youtubeId(v.source.url);
  if (yt) return `<img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="" referrerpolicy="no-referrer">`;
  // Aún sin descargar: la portada del post de Instagram, si la hay (si caducó, queda el rótulo).
  return ph(PLATFORM[v.source.platform] || 'Link', v.source.thumb);
}

// ---------- portadas ----------

const posterQueue = [];
const posterFailed = new Set();
let posterBusy = false;

/** Pide (en segundo plano, de una en una) la portada de un video descargado que aún no la tiene. */
export function requestPoster(id) {
  if (posterFailed.has(id) || posterQueue.includes(id)) return;
  posterQueue.push(id);
  setTimeout(pumpPosters);
}

async function pumpPosters() {
  if (posterBusy) return;
  posterBusy = true;
  while (posterQueue.length) {
    const id = posterQueue.shift();
    const v = videoById(id);
    if (!v || v.poster || v.source.mediaType !== 'video' || !v.source.file) continue;
    try {
      const { file } = await api.uploadFrame(await capturePoster(mediaSrc(v)), 'portada.jpg');
      upsert('videos', await api.updateVideo(id, { poster: file }));
      emit('poster', id);
    } catch (e) {
      posterFailed.add(id);
      console.warn('Sin portada para', v.title, e);
    }
  }
  posterBusy = false;
}

// ---------- trabajos en segundo plano ----------

export const jobs = {
  downloads: [], // ids en cola
  downloading: null,
  analyses: [],
  analyzing: null, // { id, p }
};
const waiting = new Map(); // id de video -> { promise, resolve, reject } (análisis)

export function jobsText() {
  const d = jobs.downloads.length + (jobs.downloading ? 1 : 0);
  const a = jobs.analyses.length + (jobs.analyzing ? 1 : 0);
  const parts = [];
  if (d) parts.push(`Descargando ${d}`);
  if (a) parts.push(`Analizando ${a}${jobs.analyzing ? ` (${Math.round(jobs.analyzing.p * 100)}%)` : ''}`);
  return parts.join(' · ');
}

/**
 * Retoma las descargas pendientes (la cola vive en esta pestaña: si se recargó o se reinició
 * la app a medias, aquí se recupera). Las que ya fallaron no se reintentan solas.
 */
export function resumeDownloads() {
  queueDownload(state.videos.filter((v) => !v.source.file && !v.source.fetchError && canDownload(v)).map((v) => v.id));
}

export function queueDownload(ids) {
  for (const id of ids) if (!jobs.downloads.includes(id) && jobs.downloading !== id) jobs.downloads.push(id);
  emit('job');
  pumpDownloads();
}

let downloadingNow = false;
const netRetries = new Map(); // id -> intentos tras cortes de conexión
async function pumpDownloads() {
  if (downloadingNow) return;
  downloadingNow = true;
  const failed = [];
  while (jobs.downloads.length) {
    const id = (jobs.downloading = jobs.downloads.shift());
    emit('job', id);
    const v = videoById(id);
    if (!v || v.source.file) continue;
    try {
      // Solo se descarga: los dibujos se sacan al crear una rutina con lo seleccionado.
      upsert('videos', await api.fetchVideo(id));
      requestPoster(id);
      emit('data', id);
    } catch (e) {
      // Sin respuesta del servidor (se reinició o se cortó la conexión): no es culpa del
      // video, se vuelve a intentar un poco después (hasta 3 veces).
      const tries = (netRetries.get(id) || 0) + 1;
      if (e instanceof TypeError && tries <= 3) {
        netRetries.set(id, tries);
        setTimeout(() => queueDownload([id]), 5000 * tries);
      } else {
        failed.push(`${v.title}: ${e.message}`);
        upsert('videos', { ...v, source: { ...v.source, fetchError: e.message } });
        emit('data', id);
      }
    }
    await sleep(500);
  }
  jobs.downloading = null;
  downloadingNow = false;
  emit('job');
  if (failed.length) toast(`No se pudieron descargar ${failed.length}:\n${failed.slice(0, 3).join('\n')}`, 'error');
}

/**
 * Pone videos en cola para sacar sus dibujos. La promesa termina cuando acaban todos.
 * Normal: los tramos marcados en el timeline, o todo el video si no hay ninguno.
 * force: extracción automática de todo el video (botón «Extraer automáticamente»).
 */
export function queueAnalysis(ids, { force = false } = {}) {
  const promises = ids.map((id) => {
    if (!waiting.has(id)) {
      let resolve, reject;
      const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
      waiting.set(id, { promise, resolve, reject, force });
      jobs.analyses.push(id);
    }
    return waiting.get(id).promise;
  });
  emit('job');
  pumpAnalyses();
  return Promise.all(promises);
}

let analyzingNow = false;
async function pumpAnalyses() {
  if (analyzingNow) return;
  analyzingNow = true;
  while (jobs.analyses.length) {
    const id = jobs.analyses.shift();
    const w = waiting.get(id);
    jobs.analyzing = { id, p: 0 };
    emit('job', id);
    try {
      const onProgress = (p) => {
        jobs.analyzing = { id, p };
        emit('job', id);
      };
      await (w.force ? autoExtract(id, onProgress) : extractVideo(id, onProgress));
      w.resolve();
    } catch (e) {
      toast(`No se pudo analizar «${videoById(id)?.title}»: ${e.message}`, 'error');
      w.reject(e);
    } finally {
      waiting.delete(id);
      emit('data', id);
    }
  }
  jobs.analyzing = null;
  analyzingNow = false;
  emit('job');
}

export const isAnalyzing = (id) => jobs.analyzing?.id === id || jobs.analyses.includes(id);

// ---------- extracción de ejercicios ----------

const mediaSrc = (v) => `/media/${v.source.file}`;

/**
 * Viñetas de las fases: la persona real de cada fase, recortada y dibujada (estilo póster).
 * Se guardan en el servidor y quedan en keyframe.img. Si fallan, se usan las figuras dibujadas.
 */
async function addIllustrations(v, keyframes, onProgress = () => {}) {
  try {
    const blobs = await illustratePhases(mediaSrc(v), keyframes, { isImage: v.source.mediaType === 'image', onProgress });
    for (let j = 0; j < keyframes.length; j++) {
      if (blobs[j]) keyframes[j].img = (await api.uploadFrame(blobs[j])).file;
    }
  } catch (e) {
    console.warn('No se pudieron hacer las viñetas:', e);
  }
  onProgress(1);
  return keyframes;
}

function dedupeTitles(list) {
  const seen = {};
  for (const e of list) {
    seen[e.title] = (seen[e.title] || 0) + 1;
    if (seen[e.title] > 1) e.title = `${e.title} ${seen[e.title]}`;
  }
  return list;
}

/**
 * Extracción automática: separa el video en ejercicios (pausas entre ellos) y saca de
 * cada uno sus momentos clave dibujados y su técnica. Sustituye los ejercicios
 * automáticos anteriores del video; los manuales se conservan.
 */
export async function autoExtract(videoId, onProgress = () => {}) {
  const v = videoById(videoId);
  if (!v?.source.file) throw new Error('el video aún no está descargado');
  const src = mediaSrc(v);
  const found = [];

  if (v.source.mediaType === 'image') {
    const pose = await detectPose(await loadImage(src));
    if (pose) {
      const r = analyze([{ t: 0, ...pose }], { count: 1 });
      found.push({ title: r.suggestedTitle || v.title, start: 0, end: 0, keyframes: r.keyframes, technique: r.technique, category: r.category });
    }
  } else {
    const duration = await videoDuration(src);
    // 1ª pasada (todo el video, más espaciada) para encontrar dónde empieza y acaba cada ejercicio.
    const MAX = 300;
    const step1 = Math.max(duration / MAX, 0.15);
    const pass1 = await samplePoses(src, { maxFrames: MAX, minStep: 0.15, onProgress: (p) => onProgress(p * 0.4) });
    const segs = segmentExercises(pass1.frames, { duration });
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      // 2ª pasada (solo el tramo, más densa) si la primera fue demasiado espaciada.
      const frames =
        step1 <= 0.25
          ? pass1.frames.filter((f) => f.t >= s.start && f.t <= s.end)
          : (await samplePoses(src, { start: s.start, end: s.end, maxFrames: 120, onProgress: (p) => onProgress(0.4 + (0.35 * (i + p)) / segs.length) })).frames;
      const r = analyze(frames, { count: 4 });
      if (!r.keyframes.length) continue;
      found.push({ title: r.suggestedTitle || `Ejercicio ${i + 1}`, start: s.start, end: s.end, keyframes: r.keyframes, technique: r.technique, category: r.category });
    }
  }
  if (!found.length) throw new Error('no se detectó a ninguna persona');
  for (let i = 0; i < found.length; i++) {
    await addIllustrations(v, found[i].keyframes, (p) => onProgress(0.75 + (0.25 * (i + p)) / found.length));
  }
  onProgress(1);
  await api.saveAuto(videoId, dedupeTitles(found));
  await refresh(); // también quita de las rutinas los ejercicios automáticos sustituidos
  return exercisesOf(videoId);
}

/** Tramos marcados en el timeline que aún no tienen dibujos. */
export const markedSegments = (videoId) => exercisesOf(videoId).filter((e) => e.mode === 'manual' && !e.keyframes?.length);

/** Lo que falta por sacar de un video: sus tramos marcados, o todo el video si no tiene nada. */
export const needsExtraction = (v) => Boolean(v.source.file) && (!exercisesOf(v.id).length || markedSegments(v.id).length > 0);

async function extractVideo(videoId, onProgress = () => {}) {
  const v = videoById(videoId);
  if (!v?.source.file) throw new Error('el video aún no está descargado');
  const marked = v.source.mediaType === 'video' ? markedSegments(videoId) : [];
  if (marked.length) {
    const failed = [];
    for (let i = 0; i < marked.length; i++) {
      const e = marked[i];
      try {
        await manualExtract(videoId, e.start, e.end ?? e.start + 3, { exerciseId: e.id, onProgress: (p) => onProgress((i + p) / marked.length) });
      } catch (err) {
        failed.push(`${fmtTime(e.start)}–${fmtTime(e.end)}: ${err.message}`);
      }
    }
    if (failed.length === marked.length) throw new Error(failed.join('; '));
    if (failed.length) toast(`«${v.title}»: ${failed.join('; ')}`, 'error');
    return exercisesOf(videoId);
  }
  if (!exercisesOf(videoId).length) return autoExtract(videoId, onProgress);
  return exercisesOf(videoId);
}

/**
 * Extracción manual de un tramo elegido en el timeline. Con exerciseId rehace ese
 * ejercicio (respetando título y categoría si se editaron a mano); si no, crea uno nuevo.
 */
export async function manualExtract(videoId, start, end, { count = 4, exerciseId = null, onProgress } = {}) {
  const v = videoById(videoId);
  const { frames } = await samplePoses(mediaSrc(v), { start, end, maxFrames: 150, minStep: 0.1, onProgress: (p) => onProgress?.(p * 0.8) });
  if (!frames.length) throw new Error('no se detecta a ninguna persona en ese tramo');
  const r = analyze(frames, { count });
  await addIllustrations(v, r.keyframes, (p) => onProgress?.(0.8 + p * 0.2));
  const data = { start, end, mode: 'manual', keyframes: r.keyframes, technique: r.technique };
  const old = exerciseId && exerciseById(exerciseId);
  if (old) {
    if (!old.titleLocked) data.title = r.suggestedTitle || old.title;
    if (!old.categoryLocked) data.category = r.category;
    return upsert('exercises', await api.updateExercise(old.id, data));
  }
  const n = exercisesOf(videoId).length + 1;
  return upsert('exercises', await api.createExercise({ videoId, title: r.suggestedTitle || `Ejercicio ${n}`, category: r.category, ...data }));
}

// ---------- selección y rutinas ----------

/** Preferencias de la interfaz entre vistas (p. ej. a qué rutina añadir desde la biblioteca). */
// returnToDraw: se fue a un video a elegir su tramo desde el panel de sacar dibujos.
// newDrawings: dibujos recién sacados, que Rutinas muestra ya seleccionados.
export const ui = { routineTarget: null, openPanel: null, returnToDraw: null, newDrawings: null };

/** Lo seleccionado en la biblioteca, en el orden en que se marcó: [{ type: 'library'|'video', id }]. */
export const selection = [];

export function toggleSelected(type, id) {
  const i = selection.findIndex((s) => s.type === type && s.id === id);
  if (i >= 0) selection.splice(i, 1);
  else selection.push({ type, id });
  emit('selection');
}
/** Posición en la selección (0, 1, …) o -1 si no está seleccionado. */
export const selectedIndex = (type, id) => selection.findIndex((s) => s.type === type && s.id === id);

/** Videos de la selección, en orden y sin repetir. */
export function selectedVideos() {
  const out = [];
  for (const s of selection) {
    const list = s.type === 'library' ? videosDeep(s.id) : [videoById(s.id)].filter(Boolean);
    for (const v of list) if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Saca los dibujos de lo seleccionado en la Biblioteca (sus tramos marcados, o todo el video).
 * Los que ya los tienen no se repiten. Devuelve { exercises (con dibujos, en orden), unusable }.
 */
export async function extractSelection({ onStatus = () => {} } = {}) {
  const videos = selectedVideos();
  const pending = videos.filter(needsExtraction);
  const unusable = videos.filter((v) => !v.source.file && !exercisesOf(v.id).length);
  if (pending.length) {
    // Aquí (y solo aquí, o en el botón de cada video) se sacan los ejercicios y sus dibujos.
    const ids = pending.map((v) => v.id);
    const tick = () => {
      const done = ids.filter((id) => !isAnalyzing(id)).length;
      const p = ids.includes(jobs.analyzing?.id) ? jobs.analyzing.p : 0;
      onStatus(`Sacando dibujos: ${Math.min(done + 1, ids.length)} de ${ids.length} (${Math.round(p * 100)}%)…`);
    };
    window.addEventListener('store', tick);
    try {
      const all = queueAnalysis(ids).catch(() => {});
      tick();
      await all;
    } finally {
      window.removeEventListener('store', tick);
    }
  }
  const exercises = videos.flatMap((v) => exercisesOf(v.id)).filter((e) => e.keyframes?.length);
  if (!exercises.length) throw new Error('No se pudo sacar ningún dibujo de lo seleccionado (¿videos sin descargar o sin nadie bailando en el tramo?)');
  return { exercises, unusable };
}

/** Ejercicios con dibujos (los que se ven en Rutinas → Dibujos), del más nuevo al más viejo. */
export const drawings = () => state.exercises.filter((e) => e.keyframes?.length).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

/**
 * Crea una rutina (o añade a una existente) con esos dibujos.
 * order: 'manual' (el orden en que se eligieron) | 'auto' (como una clase).
 */
export async function routineFrom(exerciseIds, { name, order = 'manual', routineId = null }) {
  let exs = exerciseIds.map(exerciseById).filter(Boolean);
  if (!exs.length) throw new Error('Elige al menos un dibujo');
  if (order === 'auto') exs = autoOrder(exs);
  const items = exs.map((e) => ({ exerciseId: e.id, reps: '', notes: '' }));
  let routine;
  if (routineId) {
    const r = routineById(routineId);
    routine = await api.updateRoutine(routineId, { items: [...r.items, ...items] });
  } else {
    routine = await api.createRoutine({ name, items });
  }
  upsert('routines', routine);
  return routine;
}

// ---------- rutinas ancladas arriba en las bibliotecas ----------

/** Bibliotecas donde se ve la rutina (las de antes, con pinned, en la principal). */
export function pinnedShelves(r) {
  const ids = r?.pinnedIn ?? (r?.pinned ? [mainLibrary()?.id] : []);
  return ids.filter((id) => libraryById(id));
}
export const isPinnedIn = (r, shelfId) => pinnedShelves(r).includes(shelfId);
/** Ancla la rutina justo en esas bibliotecas. */
export async function setPinnedShelves(id, shelfIds) {
  upsert('routines', await api.updateRoutine(id, { pinnedIn: shelfIds, pinned: shelfIds.length > 0 }));
  emit('data');
}
/** Pone (en la biblioteca abierta) o quita (de todas, o de shelfId) unas rutinas. */
export async function pinRoutines(ids, pinned, shelfId = null) {
  for (const id of ids) {
    const r = state.routines.find((x) => x.id === id);
    const now = pinnedShelves(r);
    const next = pinned ? [...new Set([...now, activeShelf().id])] : shelfId ? now.filter((x) => x !== shelfId) : [];
    upsert('routines', await api.updateRoutine(id, { pinnedIn: next, pinned: next.length > 0 }));
  }
  emit('data');
}

// ---------- pregunta antes de algo importante (en vez del confirm() de Windows) ----------

/**
 * Diálogo con el estilo de la app. Devuelve true si se acepta. El botón dice lo que se va a
 * hacer («Borrar», «Desconectar»…) y va en rojo si es algo que no se deshace.
 */
export function ask(message) {
  return new Promise((resolve) => {
    const verb = /^¿?\s*(Borrar|Eliminar|Quitar|Desconectar|Salir|Cerrar|Dejar)/i.exec(message)?.[1];
    const danger = /^(Borrar|Eliminar|Quitar)$/i.test(verb || '') || /no se puede deshacer/i.test(message);
    const label = verb ? verb[0].toUpperCase() + verb.slice(1).toLowerCase() : 'Aceptar';
    const dlg = document.createElement('dialog');
    dlg.className = 'ask';
    dlg.innerHTML = `<p>${esc(message)}</p>
      <footer><button class="btn ghost" value="no">Cancelar</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" value="yes">${esc(label)}</button></footer>`;
    document.body.append(dlg);
    const done = (ok) => {
      dlg.close();
      dlg.remove();
      resolve(ok);
    };
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) return done(false); // clic fuera
      const b = e.target.closest('button');
      if (b) done(b.value === 'yes');
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    dlg.showModal();
    dlg.querySelector(danger ? '[value="no"]' : '[value="yes"]').focus();
  });
}
