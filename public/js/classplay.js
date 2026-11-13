// Reproductor de una clase: todo lo que hay dentro, seguido y en su orden, como una lista.
// Videos: solo su tramo. Fotos y rutinas: el tiempo elegido en la clase.
import { esc, toast, upsert, libraryById, exerciseById, itemExercise, exerciseFigure, mountSpotify } from './store.js';
import { api } from './api.js';
import { classItems, itemType, inPlay, segmentOf, itemSecs, clock, rememberDuration } from './classtime.js';

export function renderClassPlay(root, id) {
  const lib = libraryById(id);
  if (!lib) {
    root.innerHTML = '<div class="empty-state"><h2>Esta clase ya no existe</h2></div>';
    return null;
  }
  const items = classItems(lib).filter((it) => inPlay(lib, it));
  root.innerHTML = `
    <div class="cls-play">
      <header class="cls-head">
        <a href="#/biblioteca/${lib.id}" class="back">← ${esc(lib.name)}</a>
        <h2>${esc(lib.name)}</h2>
        <span class="cls-time"><b id="clsNow">0:00</b> / <span id="clsTotal">…</span></span>
      </header>
      <div class="cls-screen" id="clsScreen">
      <div class="cls-stage" id="clsStage"></div>
      <div class="cls-overlay">
      <div class="cls-seek" id="clsSeek" title="Haz clic (o arrastra) para ir a ese momento"><div class="cls-bar"><span class="cls-segmark" id="clsSeg" hidden></span><div id="clsProgress"></div><span class="cls-loopmark" id="clsLoopMark" hidden></span><span class="cls-ticks" id="clsTicks"></span></div></div>
      <div class="cls-controls">
        <button class="btn" data-cls="prev" title="Elemento anterior (←)">⏮</button>
        <button class="btn" data-cls="back" title="10 s atrás (Mayús + ←)">⟲10</button>
        <button class="btn primary" data-cls="toggle" id="clsToggle" title="Pausa">⏸</button>
        <button class="btn" data-cls="fwd" title="10 s adelante (Mayús + →)">10⟳</button>
        <button class="btn" data-cls="next" title="Elemento siguiente (→)">⏭</button>
        <span class="cls-loopbox">
          <button class="btn" data-cls="loop" id="clsLoop" title="Repetir: este elemento vuelve a empezar al acabar, en vez de pasar al siguiente (L)">🔁</button>
          <button class="btn" data-cls="loopA" id="clsLoopA" title="Marca aquí dónde EMPIEZA el trozo que se repite">⇤</button>
          <button class="btn" data-cls="loopB" id="clsLoopB" title="Marca aquí dónde ACABA el trozo que se repite: desde ahí vuelve al inicio">⇥</button>
        </span>
        <span class="cls-label" id="clsLabel"></span>
        <select class="cls-speed" id="clsSpeed" title="Velocidad"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
        <label class="cls-vol" title="Volumen">🔊<input type="range" id="clsVol" min="0" max="1" step="0.05" value="1"></label>
        <button class="btn cls-barmode" data-cls="barmode" id="clsBarMode"></button>
        <button class="btn" data-cls="mirror" id="clsMirror" title="Espejo: ver el vídeo invertido, como en el espejo de clase (M)">⇆</button>
        <button class="btn" data-cls="full" title="Pantalla completa (F)">⛶</button>
      </div>
      </div>
      </div>
      <ol class="cls-list" id="clsList"></ol>
    </div>`;
  const $ = (s) => root.querySelector(s);
  if (!items.length) {
    $('#clsStage').innerHTML = '<div class="empty-state"><h2>Esta clase está vacía</h2><p>Añade videos descargados, fotos o rutinas a la clase.</p></div>';
    $('.cls-controls').hidden = true;
    return null;
  }

  let secs = items.map(() => 0); // lo que dura cada cosa en la clase
  let total = 0;
  let index = 0;
  let playing = true;
  let timer = null; // fotos y rutinas
  let shownAt = 0; // cuándo empezó a verse (fotos y rutinas)
  let spent = 0; // lo ya visto de la foto o rutina antes de una pausa
  let video = null;
  let segment = null;
  let gone = false;
  let finished = false;
  let volume = 1;
  let mirror = false; // imagen invertida, como un espejo (se recuerda)
  try { mirror = localStorage.getItem('jr-mirror') === '1'; } catch { /* sin almacenamiento */ }
  // Barra: 'item' (el elemento que suena entero, con su tramo en rojo) o 'all' (toda la clase).
  let barMode = 'item';
  try { barMode = localStorage.getItem('jr-cls-bar') === 'all' ? 'all' : 'item'; } catch { /* sin almacenamiento */ }
  let rate = 1; // velocidad: videos, audios, y el tiempo de fotos y rutinas
  // Bucle: repite el elemento que suena (o, en videos y audios, solo de A a B).
  let loop = false;
  let loopA = null;
  let loopB = null;
  let pendingAt = 0; // dónde empezar el próximo elemento (al saltar a él desde la barra)
  let loopSpan = null; // el trozo que se repite en la barra (en %), o null

  const nameOf = (it) => (it.kind === 'routine' ? it.x.name : it.x.title);
  const before = (i) => secs.slice(0, i).reduce((a, b) => a + b, 0);
  const elapsedHere = () => (video && segment ? Math.max(0, video.currentTime - segment.start) : spent + (playing && shownAt ? ((Date.now() - shownAt) / 1000) * rate : 0));

  const timedNow = () => Boolean(video && segment);
  // Tramo del elemento que suena: en videos y audios, segundos del archivo; en fotos y rutinas, de 0 a su tiempo.
  const segStart = () => (timedNow() ? segment.start : 0);
  const segEnd = () => {
    if (!timedNow()) return secs[index] || 0;
    if (Number.isFinite(segment.end)) return segment.end;
    return Number.isFinite(video.duration) ? video.duration : segment.start;
  };
  // Lo que ocupa la barra en modo elemento: el archivo entero (así se ve dónde cae el tramo).
  const itemLen = () => {
    if (!timedNow()) return secs[index] || 0;
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : segment.dur;
    return Number.isFinite(d) && d > 0 ? Math.max(d, segEnd()) : segEnd();
  };
  const curItem = () => (timedNow() ? video.currentTime : elapsedHere());
  /** Dónde cae en la barra (en %) un instante del elemento que suena. */
  const pct = (t) => {
    if (barMode === 'all') return total ? ((before(index) + Math.max(0, t - segStart())) / total) * 100 : 0;
    const len = itemLen();
    return len ? Math.max(0, Math.min(100, (t / len) * 100)) : 0;
  };
  const BAR_ICON = {
    item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12h18" opacity=".35"/><path d="M8 12h8" stroke-width="4"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 12h4M10 12h4M17 12h4"/></svg>',
  };
  const drawBarMode = () => {
    const b = $('#clsBarMode');
    b.innerHTML = BAR_ICON[barMode];
    b.classList.toggle('on', barMode === 'all');
    b.title = barMode === 'item'
      ? 'La barra muestra este elemento, con su tramo en rojo. Pulsa para ver toda la clase (T)'
      : 'La barra muestra toda la clase. Pulsa para ver solo este elemento, con su tramo en rojo (T)';
    const ticks = $('#clsTicks');
    ticks.hidden = barMode !== 'all';
    ticks.innerHTML = barMode === 'all' && total ? items.slice(1).map((_, i) => `<i style="left:${(before(i + 1) / total) * 100}%"></i>`).join('') : '';
  };
  function setBarMode(mode) {
    barMode = mode;
    try { localStorage.setItem('jr-cls-bar', mode); } catch { /* solo esta vez */ }
    drawBarMode();
    drawLoop();
  }
  const loopStart = () => (loopA ?? segment?.start ?? 0);
  const loopEnd = () => (loopB ?? segment?.end ?? Infinity);
  const drawLoop = () => {
    const timed = !!(video && segment);
    $('#clsLoop').classList.toggle('on', loop);
    $('#clsLoopA').classList.toggle('on', loopA != null);
    $('#clsLoopB').classList.toggle('on', loopB != null);
    $('#clsLoopA').disabled = $('#clsLoopB').disabled = !timed;
    const mark = $('#clsLoopMark');
    const end = Math.min(loopEnd(), segment && Number.isFinite(segment.end) ? segment.end : video?.duration || Infinity);
    if (!loop || !timed || !total || !Number.isFinite(end)) return ((mark.hidden = true), (loopSpan = null), tick());
    const at = pct;
    mark.hidden = false;
    loopSpan = [at(loopStart()), Math.max(at(loopStart()) + 0.5, at(end))];
    mark.style.left = `${loopSpan[0]}%`;
    mark.style.width = `${loopSpan[1] - loopSpan[0]}%`;
    tick();
    const lbl = loopA != null && loopB == null
      ? ` · 🔁 desde ${clock(loopStart() - segment.start)}: pulsa ⇥ donde acaba el trozo`
      : loopB != null ? ` · 🔁 repite ${clock(loopStart() - segment.start)}–${clock(end - segment.start)}` : ' · 🔁 repite este elemento';
    $('#clsLabel').textContent = `${index + 1} de ${items.length} · ${nameOf(items[index])}${lbl}`;
  };
  /** Ha llegado al final del tramo: con bucle vuelve al principio (o a A); si no, pasa al siguiente. */
  const reachedEnd = () => {
    if (!loop) return next();
    video.currentTime = loopStart();
    if (playing) video.play?.().catch(() => {});
  };
  function setLoop(on) {
    loop = on;
    if (!on) loopA = loopB = null;
    drawLoop();
    if (!on) $('#clsLabel').textContent = `${index + 1} de ${items.length} · ${nameOf(items[index])}`;
  }
  function markLoop(which) {
    if (!video || !segment) return;
    const t = video.currentTime;
    if (which === 'A') {
      loopA = t;
      if (loopB != null && loopB <= t + 0.2) loopB = null;
    } else {
      if (t <= loopStart() + 0.2) return toast('Primero lleva el vídeo hasta donde acaba el trozo (después de ⇤) y luego pulsa ⇥', 'error');
      loopB = t;
      video.currentTime = loopStart(); // empieza a repetir ya
    }
    setLoop(true);
    // Marcado el fin, el trozo se pone a sonar aunque se hubiera marcado en pausa.
    if (which === 'B' && !playing) toggle();
  }
  const drawList = () => {
    $('#clsList').innerHTML = items.map((it, i) => `
      <li class="${i === index ? 'on' : ''}" data-cls-go="${i}" title="Mantén pulsado y arrastra para cambiar el orden"><span class="cls-n">${i + 1}</span><span class="cls-t">${esc(nameOf(it))}</span><span class="cls-d">${clock(secs[i])}</span></li>`).join('');
  };
  const tick = () => {
    const now = finished ? total : Math.min(total, before(index) + elapsedHere());
    $('#clsNow').textContent = clock(now);
    // Con bucle, la barra solo marca lo que va del trozo que se repite: lo de antes y lo de
    // después quedan en gris, porque no se va a reproducir.
    const seg = $('#clsSeg');
    seg.hidden = barMode !== 'item' || finished;
    if (!seg.hidden) {
      seg.style.left = `${pct(segStart())}%`;
      seg.style.width = `${Math.max(0, pct(segEnd()) - pct(segStart()))}%`;
    }
    let a = 0;
    let b = 100;
    if (!finished) {
      a = barMode === 'all' ? 0 : pct(segStart());
      b = barMode === 'all' ? (total ? (now / total) * 100 : 0) : pct(Math.min(curItem(), segEnd()));
    }
    if (loopSpan) (a = loopSpan[0]), (b = Math.min(b, loopSpan[1]));
    const bar = $('#clsProgress');
    bar.style.marginLeft = `${a}%`;
    bar.style.width = `${Math.max(0, b - a)}%`;
  };
  const clearItem = () => {
    clearTimeout(timer);
    timer = null;
    if (video) video.pause();
    video = null;
    segment = null;
  };

  async function show(i) {
    const startAt = pendingAt;
    pendingAt = 0;
    clearItem();
    finished = false;
    index = Math.max(0, Math.min(items.length - 1, i));
    spent = 0;
    shownAt = 0;
    loop = false;
    loopA = loopB = null;
    const it = items[index];
    const type = itemType(it);
    $('#clsLabel').textContent = `${index + 1} de ${items.length} · ${nameOf(it)}`;
    drawList();
    drawLoop();
    const stage = $('#clsStage');
    if (type === 'video') {
      segment = await segmentOf(lib, it.x);
      if (gone || items[index] !== it) return;
      // Un archivo de audio suena con su nombre en pantalla; un video se ve.
      stage.innerHTML = it.x.source.mediaType === 'audio'
        ? `<div class="cls-audio"><span>♪</span><h3>${esc(nameOf(it))}</h3><audio src="/media/${esc(encodeURIComponent(it.x.source.file))}" controls></audio></div>`
        : `<video src="/media/${esc(encodeURIComponent(it.x.source.file))}" playsinline></video>`;
      video = stage.querySelector('video, audio');
      video.playbackRate = rate;
      video.volume = volume;
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(segment.start + startAt, (Number.isFinite(segment.end) ? segment.end : video.duration) - 0.1);
        video.playbackRate = rate;
        // Si el sistema no deja reproducir solo, queda en pausa y el botón ▶ lo arranca.
        if (playing) video.play().catch(() => setPaused());
      }, { once: true });
      video.addEventListener('timeupdate', () => {
        if (video && video.currentTime >= Math.min(segment.end, loopEnd()) - 0.05) reachedEnd();
      });
      video.addEventListener('ended', () => reachedEnd());
      drawLoop();
      // Si el archivo no se puede abrir (borrado o movido), se salta a lo siguiente.
      video.addEventListener('error', () => {
        toast(`No se pudo reproducir «${nameOf(it)}»: se salta`, 'error');
        next();
      }, { once: true });
      return;
    }
    if (type === 'spotify') {
      // Spotify: su tramo (por defecto la canción entera), como un video; si no arranca solo, con ▶.
      stage.innerHTML = `<div class="cls-audio"><h3>${esc(nameOf(it))}</h3><div class="spotify-slot"></div><p class="hint">Si no empieza sola, pulsa ▶.</p></div>`;
      segment = await segmentOf(lib, it.x);
      const media = await mountSpotify(stage.querySelector('.spotify-slot'), it.x.source.url);
      if (gone || items[index] !== it) return;
      if (!media) return; // lista personal o privada: se ve el aviso y se pasa con ⏭
      video = media;
      const set = lib.classItems?.[it.x.id] || {};
      media.addEventListener('loadedmetadata', () => {
        // Sin fin elegido, la canción entera (la que diga Spotify).
        if (set.end == null) segment.end = media.duration;
        rememberDuration(lib, it.x.id, media.duration);
        if (segment.start || startAt) media.currentTime = segment.start + startAt;
      }, { once: true });
      if (playing) media.play();
      media.addEventListener('timeupdate', () => {
        if (video === media && media.currentTime >= Math.min(segment.end, loopEnd()) - 0.3) reachedEnd();
      });
      media.addEventListener('ended', () => video === media && reachedEnd());
      drawLoop();
      return;
    } else if (type === 'image') {
      stage.innerHTML = `<img src="/media/${esc(encodeURIComponent(it.x.source.file))}" alt="">`;
    } else {
      const exs = it.x.items.map((x) => itemExercise(x)).filter(Boolean);
      stage.innerHTML = `<div class="cls-routine"><h3>${esc(it.x.name)}</h3><div class="cls-routine-grid">${exs.map((e, n) => `
        <figure><span class="cls-rn">${n + 1}</span>${exerciseFigure(e, 220)}<figcaption>${esc(e.title)}</figcaption></figure>`).join('')}</div></div>`;
    }
    spent = Math.min(startAt, Math.max(0, secs[index] - 0.1));
    if (playing) runTimer();
  }
  function runTimer() {
    shownAt = Date.now();
    // Fotos y rutinas: con bucle, vuelven a empezar su tiempo en vez de pasar al siguiente.
    timer = setTimeout(() => (loop ? ((spent = 0), runTimer()) : next()), Math.max(0, ((secs[index] - spent) * 1000) / rate));
  }
  /** Avanza o retrocede dentro del elemento que suena (sin salir de su tramo). */
  function seek(d) {
    if (video && segment) {
      const end = Math.min(loop ? loopEnd() : Infinity, Number.isFinite(segment.end) ? segment.end : video.duration || Infinity);
      video.currentTime = Math.max(loop ? loopStart() : segment.start, Math.min(end - 0.1, video.currentTime + d));
      return;
    }
    spent = Math.max(0, Math.min(secs[index] - 0.1, elapsedHere() + d));
    clearTimeout(timer);
    shownAt = 0;
    if (playing) runTimer();
    tick();
  }
  /** Va a un momento de la clase (en segundos desde el principio): el elemento que toca y su punto. */
  function seekTo(t, jump = true) {
    let i = 0;
    while (i < items.length - 1 && t >= before(i + 1)) i++;
    const off = Math.max(0, t - before(i));
    if (i !== index || finished) {
      if (!jump) return;
      pendingAt = off;
      return show(i);
    }
    if (video && segment) {
      const end = Number.isFinite(segment.end) ? segment.end : video.duration || Infinity;
      video.currentTime = Math.min(end - 0.1, segment.start + off);
    } else {
      spent = Math.min(secs[index] - 0.1, off);
      clearTimeout(timer);
      shownAt = 0;
      if (playing) runTimer();
    }
    tick();
  }
  function seekItem(t) {
    if (finished) return seekTo(before(index));
    const off = Math.max(0, Math.min(t, segEnd() - 0.1) - segStart());
    if (timedNow()) video.currentTime = segStart() + off;
    else {
      spent = Math.min(Math.max(0, secs[index] - 0.1), off);
      clearTimeout(timer);
      shownAt = 0;
      if (playing) runTimer();
    }
    tick();
  }
  function setRate(r) {
    spent = elapsedHere();
    rate = r;
    if (video && 'playbackRate' in video) video.playbackRate = r;
    else if (!video && playing) (clearTimeout(timer), runTimer());
  }
  function setMirror(on) {
    mirror = on;
    $('#clsStage').classList.toggle('mirror', mirror);
    $('#clsMirror').classList.toggle('on', mirror);
    try { localStorage.setItem('jr-mirror', mirror ? '1' : '0'); } catch { /* solo esta vez */ }
  }
  function fullscreen() {
    const box = root.querySelector('.cls-screen');
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen?.().catch(() => {});
  }
  function next() {
    if (index >= items.length - 1) {
      clearItem();
      playing = false;
      finished = true;
      $('#clsToggle').textContent = '▶';
      $('#clsNow').textContent = clock(total);
      return toast('Clase terminada');
    }
    show(index + 1);
  }
  function setPaused() {
    playing = false;
    $('#clsToggle').textContent = '▶';
    $('#clsToggle').title = 'Reproducir';
  }
  function toggle() {
    playing = !playing;
    $('#clsToggle').textContent = playing ? '⏸' : '▶';
    $('#clsToggle').title = playing ? 'Pausa' : 'Reproducir';
    if (video) return playing ? video.play().catch(() => {}) : video.pause();
    if (playing) runTimer();
    else {
      clearTimeout(timer);
      spent += (Date.now() - shownAt) / 1000;
      shownAt = 0;
    }
  }

  // ---------- Reordenar la lista: mantener pulsado (dedo o ratón) y arrastrar arriba o abajo ----------
  const HOLD_MS = 400;
  const SLOP = 8;
  let hold = null; // { li, x, y, timer }
  let lift = null; // { li, from }
  let swallow = false;
  const list = $('#clsList');
  const pressStart = (li, x, y) => {
    clearTimeout(hold?.timer);
    hold = { li, x, y, timer: setTimeout(() => {
      lift = { li, from: [...list.children].indexOf(li) };
      hold = null;
      li.classList.add('lifted');
      list.classList.add('sorting');
      navigator.vibrate?.(15);
    }, HOLD_MS) };
  };
  const pressMove = (x, y) => {
    if (hold && Math.hypot(x - hold.x, y - hold.y) > SLOP) (clearTimeout(hold.timer), (hold = null));
    if (!lift) return;
    // El elemento levantado se coloca donde está el dedo, entre los demás.
    const others = [...list.children].filter((el) => el !== lift.li);
    const after = others.find((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (after) { if (lift.li.nextElementSibling !== after) list.insertBefore(lift.li, after); }
    else if (list.lastElementChild !== lift.li) list.append(lift.li);
    // Cerca de los bordes de la pantalla, la página se desplaza sola.
    if (y < 80) window.scrollBy(0, -12);
    else if (y > innerHeight - 80) window.scrollBy(0, 12);
  };
  const pressEnd = () => {
    if (hold) (clearTimeout(hold.timer), (hold = null));
    if (!lift) return;
    const { li, from } = lift;
    lift = null;
    li.classList.remove('lifted');
    list.classList.remove('sorting');
    swallow = true;
    setTimeout(() => (swallow = false), 300);
    const to = [...list.children].indexOf(li);
    if (to !== from) reorder(from, to);
  };
  async function reorder(from, to) {
    const playingNow = items[index];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    const [s] = secs.splice(from, 1);
    secs.splice(to, 0, s);
    index = items.indexOf(playingNow);
    $('#clsLabel').textContent = `${index + 1} de ${items.length} · ${nameOf(items[index])}`;
    drawLoop();
    drawList();
    // Se guarda como el orden de la clase («Mi orden»); lo que no se puede reproducir conserva su hueco.
    const queue = [...items];
    const full = classItems(lib).map((x) => (inPlay(lib, x) ? queue.shift() : x)).map((x) => ({ kind: x.kind, id: x.x.id }));
    try {
      const r = await api.orderItems(full, lib.id);
      r.videos.forEach((v) => upsert('videos', v));
      r.routines.forEach((x) => upsert('routines', x));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return; // el dedo va por los eventos táctiles
    const li = e.target.closest('li');
    if (li) pressStart(li, e.clientX, e.clientY);
  });
  const onPointerMove = (e) => e.pointerType !== 'touch' && pressMove(e.clientX, e.clientY);
  const onPointerUp = (e) => e.pointerType !== 'touch' && pressEnd();
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  list.addEventListener('touchstart', (e) => {
    const li = e.target.closest('li');
    if (li && e.touches.length === 1) pressStart(li, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (lift) e.preventDefault(); // con algo levantado, la página no se desplaza con el dedo
    pressMove(t.clientX, t.clientY);
  }, { passive: false });
  list.addEventListener('touchend', pressEnd);
  list.addEventListener('touchcancel', pressEnd);
  list.addEventListener('contextmenu', (e) => e.preventDefault()); // ni el menú del navegador al mantener pulsado
  root.addEventListener('click', (e) => {
    if (swallow) return (swallow = false), e.preventDefault(), e.stopPropagation();
  }, true);

  root.addEventListener('click', (e) => {
    const go = e.target.closest('[data-cls-go]');
    if (go) return show(+go.dataset.clsGo);
    const act = e.target.closest('[data-cls]')?.dataset.cls;
    if (act === 'prev') show(index - 1);
    else if (act === 'next') next();
    else if (act === 'back') seek(-10);
    else if (act === 'fwd') seek(10);
    else if (act === 'full') fullscreen();
    else if (act === 'mirror') setMirror(!mirror);
    else if (act === 'barmode') setBarMode(barMode === 'item' ? 'all' : 'item');
    else if (act === 'loop') setLoop(!loop);
    else if (act === 'loopA') markLoop('A');
    else if (act === 'loopB') markLoop('B');
    else if (act === 'toggle') {
      // Acabada la clase, el botón vuelve a empezar.
      if (finished) return (playing = true), ($('#clsToggle').textContent = '⏸'), show(0);
      toggle();
    }
  });
  // Barra de progreso: clic (o arrastrar) para ir a ese momento de la clase.
  const seekBar = $('#clsSeek');
  const barFrac = (e) => {
    const r = seekBar.getBoundingClientRect();
    return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : null;
  };
  // Toda la clase: va al elemento que toque. Este elemento: se mueve dentro de su tramo.
  const barSeek = (e, jump = true) => {
    const f = barFrac(e);
    if (f === null) return;
    if (barMode === 'all') seekTo(f * total, jump);
    else seekItem(f * itemLen());
  };
  let scrubbing = false;
  seekBar.addEventListener('pointerdown', (e) => {
    if (!total || e.button > 0) return;
    e.preventDefault();
    scrubbing = true;
    seekBar.setPointerCapture?.(e.pointerId);
    barSeek(e);
  });
  // Mientras se arrastra, solo se mueve dentro del elemento que suena; al soltar, va donde sea.
  seekBar.addEventListener('pointermove', (e) => scrubbing && barSeek(e, false));
  const endScrub = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    barSeek(e);
  };
  seekBar.addEventListener('pointerup', endScrub);
  seekBar.addEventListener('pointercancel', () => (scrubbing = false));
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === ' ') (e.preventDefault(), toggle());
    else if (e.key === 'ArrowRight') e.shiftKey ? seek(10) : next();
    else if (e.key === 'ArrowLeft') e.shiftKey ? seek(-10) : show(index - 1);
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'm' || e.key === 'M') setMirror(!mirror);
    else if (e.key === 't' || e.key === 'T') setBarMode(barMode === 'item' ? 'all' : 'item');
    else if (e.key === 'l' || e.key === 'L') setLoop(!loop);
    else if (e.key === 'a' || e.key === 'A') markLoop('A');
    else if (e.key === 'b' || e.key === 'B') markLoop('B');
  };
  document.addEventListener('keydown', onKey);
  $('#clsSpeed').addEventListener('change', (e) => setRate(+e.target.value));
  $('#clsVol').addEventListener('input', (e) => {
    volume = +e.target.value;
    if (video && 'volume' in video) video.volume = volume;
  });
  // Los controles se esconden si el ratón está quieto (o fuera) y vuelven al moverlo.
  const screen = $('#clsScreen');
  let idle = null;
  const wake = () => {
    screen.classList.add('awake');
    clearTimeout(idle);
    idle = setTimeout(() => !screen.querySelector('.cls-overlay:hover, select:focus') && screen.classList.remove('awake'), 2500);
  };
  screen.addEventListener('mousemove', wake);
  screen.addEventListener('mouseleave', () => (clearTimeout(idle), screen.classList.remove('awake')));
  const ticker = setInterval(tick, 250);

  Promise.all(items.map((it) => itemSecs(lib, it))).then((list) => {
    secs = list;
    total = list.reduce((a, b) => a + b, 0);
    if (gone) return;
    $('#clsTotal').textContent = clock(total);
    setMirror(mirror);
    drawBarMode();
    show(0); // con las duraciones ya sabidas
  });

  return () => {
    gone = true;
    clearItem();
    clearInterval(ticker);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}

