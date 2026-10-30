// Vista de un video: reproductor, timeline para elegir el tramo exacto de un ejercicio,
// extracción automática (IA) o manual, y lista de ejercicios del video.
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import { detectPose, captureFrames } from './pose.js';
import { labelPose } from './analysis.js';
import {
  state, refresh, emit, esc, toast, fmtTime, parseTime, debounce, upsert,
  videoById, libraryById, libraryLabel, isTop, shelfName, exercisesOf, exerciseById, PLATFORM, CATEGORIES, youtubeId,
  jobs, queueDownload, queueAnalysis, isAnalyzing, manualExtract, canDownload, removeVideos, ui,
  ask,
} from './store.js';

function embedUrl(src) {
  const url = src.url || '';
  let m;
  if (src.platform === 'instagram' && (m = url.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i))) {
    return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/`;
  }
  if (src.platform === 'youtube' && youtubeId(url)) return `https://www.youtube.com/embed/${youtubeId(url)}`;
  if (src.platform === 'tiktok' && (m = url.match(/video\/(\d+)/))) return `https://www.tiktok.com/embed/v2/${m[1]}`;
  if (src.platform === 'vimeo' && (m = url.match(/vimeo\.com\/(\d+)/))) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

const NICE_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function renderVideo(root, id) {
  const v = videoById(id);
  if (!v) {
    root.innerHTML = `<div class="empty-state"><h2>Video no encontrado</h2><a class="btn" href="#/biblioteca">Volver a la biblioteca</a></div>`;
    return;
  }
  const isVideo = v.source.mediaType === 'video';
  const isImage = v.source.mediaType === 'image';
  const lib = libraryById(v.libraryId);
  const embed = !v.source.file ? embedUrl(v.source) : null;

  root.innerHTML = `
    ${ui.returnToDraw ? `
      <div class="callout return-bar">
        <span><b>Elige el tramo</b> del que se sacarán los dibujos: márcalo en el timeline y pulsa <b>Marcar este tramo</b> (puedes marcar varios). Si no marcas ninguno, se usa todo el video.</span>
        <button class="btn primary small" data-act="back-draw">← Volver a sacar dibujos</button>
      </div>` : ''}
    <div class="vhead">
      <a href="#/biblioteca/${v.libraryId}" class="back">← ${esc(lib && !isTop(lib) ? lib.name : shelfName(lib))}</a>
      <input id="vtitle" class="title-input" value="${esc(v.title)}" aria-label="Nombre del video">
      <select id="vlib" title="Mover a otra carpeta">${state.libraries.map((l) => `<option value="${l.id}" ${l.id === v.libraryId ? 'selected' : ''}>${esc(libraryLabel(l))}</option>`).join('')}</select>
      <button class="btn small ghost danger" data-act="del-video">Eliminar</button>
    </div>
    <div class="vgrid">
      <section class="vplayer-col">
        <div class="player ${embed ? 'embed' : ''}">
          ${isVideo ? `<video id="video" controls playsinline preload="auto" src="/media/${esc(v.source.file)}"></video>`
            : isImage ? `<img id="photo" src="/media/${esc(v.source.file)}" alt="">`
            : embed ? `<iframe src="${esc(embed)}" allowfullscreen loading="lazy" title="Video original"></iframe>`
            : `<div class="ph big ph-${esc(v.source.platform)}"><span>${esc(PLATFORM[v.source.platform] || 'Link')}</span></div>`}
        </div>
        ${v.source.url ? `<a class="source-link" href="${esc(v.source.url)}" target="_blank" rel="noopener">Abrir original en ${esc(PLATFORM[v.source.platform] || 'la web')} ↗</a>` : ''}
        <div id="nofile"></div>
        ${isVideo ? `
          <div class="timeline-box">
            <div class="tl" id="tl" tabindex="0" aria-label="Timeline: arrastra para elegir el tramo del ejercicio">
              <div class="tl-strip" id="strip"></div>
              <div class="tl-sel" id="sel"><span class="tl-h" data-h="start" title="Inicio"></span><span class="tl-h" data-h="end" title="Fin"></span></div>
              <div class="tl-play" id="play"></div>
            </div>
            <div class="tl-lane" id="lane" title="Ejercicios ya extraídos: clic para cargar su tramo"></div>
            <div class="tl-scale" id="scale"></div>
            <div class="tl-overview" id="ov" title="Todo el video: arrastra la ventana para moverte cuando hay zoom">
              <div class="tl-ov-sel" id="ovSel"></div><div class="tl-ov-win" id="ovWin"></div>
            </div>
            <div class="tl-bar">
              <span class="tl-zoom">
                <button class="btn small ghost" data-act="zoom-out" title="Alejar (o rueda del ratón hacia abajo sobre el timeline)">−</button>
                <span class="tl-zoom-txt" id="zoomTxt" title="Cuánto zoom hay">×1</span>
                <button class="btn small ghost" data-act="zoom-in" title="Acercar (o rueda del ratón hacia arriba sobre el timeline)">+</button>
                <button class="btn small ghost" data-act="zoom-sel">Ajustar al tramo</button>
                <button class="btn small ghost" data-act="zoom-all">Ver todo</button>
              </span>
              <span class="hint" id="now"></span>
            </div>
            <div class="tl-fields">
              <label class="tfield">Inicio
                <button class="btn small ghost" data-nudge="start:-0.1">−</button><input id="tStart" inputmode="decimal"><button class="btn small ghost" data-nudge="start:0.1">+</button>
                <button class="btn small" data-act="mark-start" title="Atajo: I">⟦ aquí</button></label>
              <label class="tfield">Fin
                <button class="btn small ghost" data-nudge="end:-0.1">−</button><input id="tEnd" inputmode="decimal"><button class="btn small ghost" data-nudge="end:0.1">+</button>
                <button class="btn small" data-act="mark-end" title="Atajo: O">aquí ⟧</button></label>
              <span class="hint" id="dur"></span>
              <button class="btn small" data-act="play-sel">▶ Ver tramo</button>
            </div>
            <div class="seg-preview">
              <div class="sp-head"><b>Vista previa del tramo</b><span class="hint" id="spInfo"></span></div>
              <div class="sp-frames" id="spFrames"></div>
            </div>
          </div>` : ''}
        ${v.source.file ? `
          <div class="extract">
            ${isVideo ? '<button class="btn primary" data-act="mark-seg">Marcar este tramo</button>' : ''}
            <button class="btn ${isVideo ? 'ghost' : 'primary'}" data-act="auto">${isVideo ? 'Sacar dibujos de todo el video (IA)' : 'Sacar dibujo'}</button>
            ${isVideo ? `<label class="inline">Fases por ejercicio <select id="kcount">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
          </div>
          ${isVideo ? '<p class="hint">Elige el tramo exacto del ejercicio: arrastra en el timeline (o mueve las asas), afina con los tiempos y pulsa <b>Marcar este tramo</b>. Los dibujos de ese tramo se sacan al crear la rutina; sin tramos marcados, la IA separa el video en ejercicios ella sola. Teclas: ← → mueven 0,1 s (con Mayús 1 s), I / O marcan inicio y fin, espacio reproduce.</p>' : ''}
          <div class="progress" id="progress" hidden><div class="bar"><div id="bar"></div></div><span id="progText"></span></div>` : ''}
      </section>
      <section class="vex-col">
        <div class="vex-head">
          <h3>Tramos y ejercicios <span class="count" id="exCount"></span></h3>
          <button class="btn small ghost danger" data-act="ex-del-all" id="exDelAll" hidden>Borrar todos</button>
        </div>
        <div id="exList"></div>
      </section>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const video = $('#video');
  let activeId = null; // ejercicio resaltado
  let busyManual = false;

  // ---------- sin archivo (solo link) ----------

  const drawNoFile = () => {
    const box = $('#nofile');
    if (v.source.file) return (box.innerHTML = '');
    const downloading = jobs.downloading === v.id || jobs.downloads.includes(v.id);
    box.innerHTML = `
      <div class="callout">
        <p><strong>Para sacar los dibujos necesito el archivo del video.</strong>${v.source.platform === 'instagram' && !state.instagram.connected ? ' Instagram casi siempre pide sesión para descargar: conecta tu cuenta en la Biblioteca (botón «Conectar Instagram») o descárgalo desde el móvil y súbelo.' : ''}</p>
        ${v.source.fetchError && !downloading ? `<p class="ig-msg error">La última descarga falló: ${esc(v.source.fetchError)}</p>` : ''}
        <div class="row wrap">
          ${canDownload(v) ? `<button class="btn primary" data-act="fetch" ${downloading ? 'disabled' : ''}>${downloading ? 'Descargando…' : 'Descargar del link'}</button>` : ''}
          <label class="btn">Subir el archivo<input type="file" id="attach" accept="video/*,image/*" hidden></label>
        </div>
        ${canDownload(v) ? '' : '<p class="hint">Para descargar de YouTube o Instagram instala yt-dlp (<code>pip install yt-dlp</code>) y reinicia el servidor.</p>'}
      </div>`;
  };
  drawNoFile();

  // ---------- timeline ----------

  const tl = { duration: 0, v0: 0, v1: 0, sel: null, stripToken: 0 };
  let playSel = () => {}; // reproduce solo el tramo marcado (se define con el video)

  const width = () => $('#tl').clientWidth || 1;
  const tToX = (t) => ((t - tl.v0) / (tl.v1 - tl.v0)) * 100;
  const xToT = (clientX) => {
    const r = $('#tl').getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return tl.v0 + f * (tl.v1 - tl.v0);
  };
  const clampT = (t) => Math.min(tl.duration, Math.max(0, Math.round(t * 100) / 100));

  function setSel(start, end, { seekTo } = {}) {
    start = clampT(start);
    end = clampT(end);
    if (end - start < 0.1) end = Math.min(tl.duration, start + 0.1);
    tl.sel = { start, end };
    if (seekTo != null) video.currentTime = seekTo;
    drawSel();
    drawOverview();
    drawPreview();
  }

  // Vista previa del tramo: sus fotogramas, de inicio a fin, en grande (de ahí salen los dibujos).
  const PREVIEW_N = 6;
  let previewToken = 0;
  const drawPreview = debounce(async () => {
    const box = $('#spFrames');
    if (!box || !tl.sel || !v.source.file) return;
    const token = ++previewToken;
    const { start, end } = tl.sel;
    // (justo al final del video no hay imagen: el último, un instante antes)
    const times = Array.from({ length: PREVIEW_N }, (_, i) => Math.min(start + ((end - start) * i) / (PREVIEW_N - 1), tl.duration - 0.08));
    box.style.setProperty('--ar', `${video?.videoWidth || 9} / ${video?.videoHeight || 16}`); // la forma del video
    $('#spInfo').textContent = `${fmtTime(start)} → ${fmtTime(end)} · ${(end - start).toFixed(1)} s. Son los fotogramas de los que se sacarán los dibujos; clic en uno para verlo en el video.`;
    box.innerHTML = times.map((t, i) => `<figure class="sp-f loading"><i></i><figcaption>${i === 0 ? 'Inicio' : i === PREVIEW_N - 1 ? 'Fin' : fmtTime(t)}</figcaption></figure>`).join('');
    try {
      const imgs = await captureFrames(`/media/${v.source.file}`, times, 220);
      if (token !== previewToken) return;
      box.innerHTML = imgs.map((src, i) => `
        <figure class="sp-f" data-seek="${times[i]}" title="Ir a ${fmtTime(times[i])}">
          <img src="${src}" alt=""><figcaption>${i === 0 ? `Inicio · ${fmtTime(times[i])}` : i === PREVIEW_N - 1 ? `Fin · ${fmtTime(times[i])}` : fmtTime(times[i])}</figcaption>
        </figure>`).join('');
    } catch {
      /* sin vista previa: el resto funciona igual */
    }
  }, 350);

  // Debajo: todo el video, con la parte que se ve (ventana) y el tramo marcado.
  function drawOverview() {
    if (!tl.duration || !$('#ov')) return;
    const pct = (t) => (t / tl.duration) * 100;
    $('#ovWin').style.left = pct(tl.v0) + '%';
    $('#ovWin').style.width = Math.max(1, pct(tl.v1) - pct(tl.v0)) + '%';
    $('#ov').classList.toggle('zoomed', tl.v1 - tl.v0 < tl.duration - 0.01);
    if (tl.sel) {
      $('#ovSel').style.left = pct(tl.sel.start) + '%';
      $('#ovSel').style.width = Math.max(0.5, pct(tl.sel.end) - pct(tl.sel.start)) + '%';
    }
    const z = tl.duration / (tl.v1 - tl.v0);
    $('#zoomTxt').textContent = `×${z < 10 ? z.toFixed(1).replace('.0', '') : Math.round(z)}`;
  }

  function drawSel() {
    if (!tl.sel) return;
    const el = $('#sel');
    const a = tToX(tl.sel.start), b = tToX(tl.sel.end);
    el.style.left = a + '%';
    el.style.width = Math.max(0, b - a) + '%';
    if (document.activeElement !== $('#tStart')) $('#tStart').value = fmtTime(tl.sel.start);
    if (document.activeElement !== $('#tEnd')) $('#tEnd').value = fmtTime(tl.sel.end);
    $('#dur').textContent = `Duración ${(tl.sel.end - tl.sel.start).toFixed(1)} s`;
  }

  function drawPlayhead() {
    if (!video) return;
    const t = video.currentTime;
    const x = tToX(t);
    $('#play').style.left = x + '%';
    $('#play').hidden = x < 0 || x > 100;
    $('#now').textContent = `${fmtTime(t)} / ${fmtTime(tl.duration)}`;
  }

  function drawScale() {
    const span = tl.v1 - tl.v0;
    const step = NICE_STEPS.find((s) => span / s <= 8) || 600;
    const first = Math.ceil(tl.v0 / step) * step;
    let html = '';
    for (let t = first; t <= tl.v1 + 1e-6; t += step) {
      html += `<span style="left:${tToX(t)}%">${fmtTime(t).replace(/\.0$/, '')}</span>`;
    }
    $('#scale').innerHTML = html;
  }

  function drawLane() {
    $('#lane').innerHTML = exercisesOf(v.id)
      .filter((e) => e.end != null && e.end > tl.v0 && e.start < tl.v1)
      .map((e) => {
        const n = exercisesOf(v.id).indexOf(e) + 1;
        const a = Math.max(0, tToX(e.start)), b = Math.min(100, tToX(e.end));
        return `<button class="tl-seg ${e.mode} ${e.id === activeId ? 'on' : ''}" style="left:${a}%;width:${Math.max(0.8, b - a)}%" data-load="${e.id}" title="${n}. ${esc(e.title)} (${fmtTime(e.start)} → ${fmtTime(e.end)})">${n}</button>`;
      })
      .join('');
  }

  // Tira de miniaturas del tramo visible (se regenera al hacer zoom).
  const drawStrip = debounce(async () => {
    const token = ++tl.stripToken;
    const n = Math.max(4, Math.min(24, Math.floor(width() / 72)));
    const span = tl.v1 - tl.v0;
    const times = Array.from({ length: n }, (_, i) => tl.v0 + ((i + 0.5) * span) / n);
    $('#strip').innerHTML = times.map(() => '<i></i>').join('');
    try {
      const imgs = await captureFrames(`/media/${v.source.file}`, times, 168); // nítidas aunque el timeline sea alto
      if (token !== tl.stripToken) return;
      $('#strip').innerHTML = imgs.map((src) => `<img src="${src}" alt="">`).join('');
    } catch {
      /* sin miniaturas: el timeline funciona igual */
    }
  }, 250);

  function drawTimeline() {
    drawScale();
    drawLane();
    drawSel();
    drawPlayhead();
    drawOverview();
    drawStrip();
  }

  function setView(v0, v1) {
    const minSpan = Math.min(tl.duration, 0.5); // hasta medio segundo a lo ancho: para afinar el fotograma
    let span = Math.max(minSpan, v1 - v0);
    v0 = Math.max(0, Math.min(v0, tl.duration - span));
    tl.v0 = v0;
    tl.v1 = Math.min(tl.duration, v0 + span);
    drawTimeline();
  }

  function zoom(factor) {
    const center = tl.sel && factor < 1 ? (tl.sel.start + tl.sel.end) / 2 : video.currentTime;
    const span = (tl.v1 - tl.v0) * factor;
    setView(center - span / 2, center + span / 2);
  }

  // Zoom alrededor de un instante (el que está bajo el ratón), sin que ese punto se mueva.
  function zoomAt(t, factor) {
    const span = tl.v1 - tl.v0;
    const f = (t - tl.v0) / span;
    const next = Math.min(tl.duration, Math.max(Math.min(tl.duration, 0.5), span * factor));
    setView(t - f * next, t - f * next + next);
  }

  if (video) {
    video.addEventListener('loadedmetadata', () => {
      tl.duration = Number.isFinite(video.duration) ? video.duration : 0;
      tl.v1 = tl.duration;
      setSel(0, tl.duration);
      drawTimeline();
    });
    let stopAt = null;
    const tick = () => {
      if (stopAt != null && video.currentTime >= stopAt) {
        video.pause();
        stopAt = null;
      }
      drawPlayhead();
    };
    video.addEventListener('timeupdate', tick);
    video.addEventListener('seeked', tick);
    let raf;
    const loop = () => (tick(), (raf = requestAnimationFrame(loop)));
    video.addEventListener('play', () => (raf = requestAnimationFrame(loop)));
    video.addEventListener('pause', () => cancelAnimationFrame(raf));
    playSel = () => {
      if (!tl.sel) return;
      video.currentTime = tl.sel.start;
      stopAt = tl.sel.end;
      video.play();
    };

    // Arrastre en el timeline: asas = mover inicio/fin; en cualquier otro sitio = marcar
    // un tramo nuevo. Un clic sin arrastrar solo mueve el cabezal. El video sigue al puntero
    // para ver el fotograma exacto donde empieza o acaba el ejercicio.
    $('#tl').addEventListener('pointerdown', (e) => {
      if (!tl.duration) return;
      e.preventDefault();
      $('#tl').setPointerCapture(e.pointerId);
      const t0 = xToT(e.clientX);
      const handle = e.target.dataset?.h;
      let moved = false;
      const onMove = (ev) => {
        const t = xToT(ev.clientX);
        if (!moved && Math.abs(ev.clientX - e.clientX) < 3) return;
        moved = true;
        if (handle === 'start') setSel(Math.min(t, tl.sel.end - 0.1), tl.sel.end, { seekTo: t });
        else if (handle === 'end') setSel(tl.sel.start, Math.max(t, tl.sel.start + 0.1), { seekTo: t });
        else setSel(Math.min(t0, t), Math.max(t0, t), { seekTo: t });
      };
      const onUp = () => {
        $('#tl').removeEventListener('pointermove', onMove);
        $('#tl').removeEventListener('pointerup', onUp);
        if (!moved) video.currentTime = t0;
      };
      $('#tl').addEventListener('pointermove', onMove);
      $('#tl').addEventListener('pointerup', onUp);
    });

    // Rueda del ratón sobre el timeline: arriba acerca y abajo aleja (en el punto del ratón);
    // con Mayús, o con la rueda horizontal del touchpad, se mueve a los lados.
    const onWheel = (e) => {
      if (!tl.duration) return;
      e.preventDefault();
      const span = tl.v1 - tl.v0;
      const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (sideways) {
        const d = (e.shiftKey ? e.deltaY : e.deltaX) || e.deltaY;
        return setView(tl.v0 + (d / 400) * span, tl.v1 + (d / 400) * span);
      }
      zoomAt(xToT(e.clientX), e.deltaY < 0 ? 0.8 : 1.25);
    };
    $('#tl').addEventListener('wheel', onWheel, { passive: false });

    // La barra de todo el video: clic o arrastre para mover la parte que se ve; rueda = zoom.
    $('#ov').addEventListener('pointerdown', (e) => {
      if (!tl.duration) return;
      e.preventDefault();
      const ov = $('#ov');
      ov.setPointerCapture(e.pointerId);
      const at = (clientX) => {
        const r = ov.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * tl.duration;
      };
      const span = tl.v1 - tl.v0;
      const t = at(e.clientX);
      const grab = t >= tl.v0 && t <= tl.v1 ? t - tl.v0 : span / 2; // si se coge la ventana, por donde se cogió
      const move = (ev) => setView(at(ev.clientX) - grab, at(ev.clientX) - grab + span);
      move(e);
      const up = () => {
        ov.removeEventListener('pointermove', move);
        ov.removeEventListener('pointerup', up);
      };
      ov.addEventListener('pointermove', move);
      ov.addEventListener('pointerup', up);
    });
    $('#ov').addEventListener('wheel', (e) => {
      if (!tl.duration) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.8 : 1.25);
    }, { passive: false });

    // Vista previa: clic en un fotograma = ir a él en el video.
    $('#spFrames').addEventListener('click', (e) => {
      const f = e.target.closest('[data-seek]');
      if (!f) return;
      video.pause();
      video.currentTime = Number(f.dataset.seek);
    });

    // Tiempos exactos escritos a mano.
    const fromInput = (which) => {
      const t = parseTime($(which === 'start' ? '#tStart' : '#tEnd').value);
      if (isNaN(t)) return drawSel();
      if (which === 'start') setSel(Math.min(t, tl.sel.end - 0.1), tl.sel.end, { seekTo: t });
      else setSel(tl.sel.start, Math.max(t, tl.sel.start + 0.1), { seekTo: t });
    };
    $('#tStart').addEventListener('change', () => fromInput('start'));
    $('#tEnd').addEventListener('change', () => fromInput('end'));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target.id === 'tStart' || e.target.id === 'tEnd')) e.target.blur();
    });
  }

  const onKey = (e) => {
    if (!video || !tl.sel || e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      video.pause();
      video.currentTime = clampT(video.currentTime + (e.key === 'ArrowLeft' ? -step : step));
    } else if (e.key === 'i' || e.key === 'I') setSel(Math.min(video.currentTime, tl.sel.end - 0.1), tl.sel.end);
    else if (e.key === 'o' || e.key === 'O') setSel(tl.sel.start, Math.max(video.currentTime, tl.sel.start + 0.1));
    else if (e.key === ' ') {
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    }
  };
  document.addEventListener('keydown', onKey);
  const onResize = debounce(() => tl.duration && drawStrip(), 300);
  window.addEventListener('resize', onResize);

  // ---------- lista de ejercicios ----------

  const saveEx = {}; // guardados con retardo por ejercicio
  function saveExercise(id, patch) {
    Object.assign(exerciseById(id), patch);
    (saveEx[id] ||= debounce(async () => {
      const ex = exerciseById(id);
      if (!ex) return;
      try {
        upsert('exercises', await api.updateExercise(id, ex));
      } catch (e) {
        toast(e.message, 'error');
      }
    }, 600))();
  }

  function drawExercises() {
    const list = exercisesOf(v.id);
    $('#exCount').textContent = `(${list.length})`;
    $('#exDelAll').hidden = list.length < 2;
    $('#exList').innerHTML = list.length
      ? list.map((e, i) => `
        <article class="excard ${e.id === activeId ? 'on' : ''}" data-ex="${e.id}">
          <div class="excard-head">
            <span class="num">${i + 1}</span>
            <input class="ex-title" data-f="title" value="${esc(e.title)}" aria-label="Nombre del ejercicio">
          </div>
          ${isVideo ? `<button class="range" data-load="${e.id}" title="Cargar este tramo en el timeline">${fmtTime(e.start)} → ${fmtTime(e.end)}</button>` : ''}
          ${e.keyframes?.length ? `<div class="kf-row">${phasesSVG(e.keyframes, { size: 104 }).map((ph, j) => `
            <figure class="kf" data-k="${j}">
              <button class="kf-fig" data-act="seek-kf" title="${isVideo ? 'Ver este momento' : ''}">${ph.svg}</button>
              <figcaption>${esc(ph.caption)}</figcaption>
              <button class="kf-del" data-act="del-kf" title="Quitar esta fase">✕</button>
            </figure>`).join('')}</div>`
            : `<p class="hint pending">Tramo marcado: sus dibujos se sacan al crear la rutina.</p>`}
          <div class="row wrap ex-tools">
            ${isVideo ? `<button class="btn small" data-act="ex-reextract" title="Cambia el tramo de este ejercicio por el que está marcado ahora en el timeline">Usar tramo del timeline</button>` : ''}
            ${isVideo && !e.keyframes?.length ? '<button class="btn small ghost" data-act="ex-extract" title="Saca ya los dibujos de este tramo, sin esperar a crear la rutina">Sacar dibujos ahora</button>' : ''}
            ${isVideo && e.keyframes?.length ? '<button class="btn small ghost" data-act="ex-frame" title="Añade el fotograma actual del video como fase">+ Fotograma actual</button>' : ''}
            <button class="btn small ghost danger" data-act="ex-del">Eliminar</button>
          </div>
          <details class="ex-details">
            <summary>Técnica y categoría</summary>
            <label class="field">Categoría
              <select data-f="category">${[...new Set([...CATEGORIES, e.category].filter(Boolean))].map((c) => `<option ${c === e.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field">Técnica<textarea data-f="summary" rows="3">${esc(e.technique?.summary)}</textarea></label>
            <label class="field">Claves técnicas <small>(una por línea)</small><textarea data-f="cues" rows="4">${esc((e.technique?.cues || []).join('\n'))}</textarea></label>
          </details>
        </article>`).join('')
      : `<div class="empty-state small"><p>${v.source.file
          ? isAnalyzing(v.id) ? 'Sacando los dibujos…' : 'Aún no hay tramos. Marca en el timeline el tramo del ejercicio y pulsa «Marcar este tramo». Si no marcas ninguno, al crear la rutina la IA separa el video en ejercicios.'
          : 'Cuando el video esté descargado podrás elegir aquí sus tramos.'}</p></div>`;
    if (video && tl.duration) drawLane();
  }

  function loadExercise(id) {
    const e = exerciseById(id);
    if (!e) return;
    activeId = id;
    if (video && tl.duration && e.end != null) {
      setSel(e.start, e.end, { seekTo: e.start });
      if (e.start < tl.v0 || e.end > tl.v1) setView(e.start - (e.end - e.start) * 0.2, e.end + (e.end - e.start) * 0.2);
    }
    drawExercises();
    root.querySelector(`[data-ex="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------- progreso ----------

  function drawProgress() {
    const box = $('#progress');
    if (!box) return;
    let p = null;
    let text = '';
    if (jobs.analyzing?.id === v.id) ((p = jobs.analyzing.p), (text = `Sacando los dibujos… ${Math.round(p * 100)}%`));
    else if (isAnalyzing(v.id)) ((p = 0), (text = 'En cola para analizar…'));
    else if (busyManual) ((p = busyManual.p), (text = `Extrayendo el tramo… ${Math.round(busyManual.p * 100)}%`));
    box.hidden = p == null;
    if (p != null) {
      $('#bar').style.width = Math.round(p * 100) + '%';
      $('#progText').textContent = p === 0 && jobs.analyzing?.id === v.id ? 'Cargando el detector de pose…' : text;
    }
    root.querySelectorAll('[data-act="auto"],[data-act="ex-extract"],[data-act="ex-reextract"]').forEach((b) => (b.disabled = p != null));
  }

  // Marca el tramo del timeline sin sacar dibujos: se sacan al crear la rutina.
  async function markSegment() {
    if (!tl.sel) return toast('Marca primero el tramo en el timeline', 'error');
    const { start, end } = tl.sel;
    try {
      const ex = upsert('exercises', await api.createExercise({ videoId: v.id, title: `Tramo ${exercisesOf(v.id).length + 1}`, start, end, mode: 'manual', keyframes: [] }));
      activeId = ex.id;
      drawExercises();
      toast(`Tramo ${fmtTime(start)} → ${fmtTime(end)} marcado. Sus dibujos se sacan al crear la rutina.`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function runManual(exerciseId = null, range = tl.sel) {
    if (!range) return toast('Marca primero el tramo en el timeline', 'error');
    busyManual = { p: 0 };
    drawProgress();
    try {
      const ex = await manualExtract(v.id, range.start, range.end, {
        count: +$('#kcount').value,
        exerciseId,
        onProgress: (p) => ((busyManual = { p }), drawProgress()),
      });
      activeId = ex.id;
      toast(exerciseId ? 'Ejercicio actualizado con el nuevo tramo' : 'Ejercicio añadido');
    } catch (e) {
      toast('No se pudo extraer: ' + e.message, 'error');
    } finally {
      busyManual = false;
      drawProgress();
      drawExercises();
    }
  }

  // ---------- acciones ----------

  root.addEventListener('click', async (e) => {
    const loadBtn = e.target.closest('[data-load]');
    if (loadBtn) return loadExercise(loadBtn.dataset.load);
    const nudge = e.target.closest('[data-nudge]');
    if (nudge && tl.sel) {
      e.preventDefault();
      const [which, d] = nudge.dataset.nudge.split(':');
      const t = tl.sel[which] + parseFloat(d);
      if (which === 'start') setSel(Math.min(t, tl.sel.end - 0.1), tl.sel.end, { seekTo: t });
      else setSel(tl.sel.start, Math.max(t, tl.sel.start + 0.1), { seekTo: t });
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const card = el.closest('[data-ex]');
    const ex = card && exerciseById(card.dataset.ex);
    if (card) activeId = card.dataset.ex;

    if (act === 'zoom-in') zoom(0.5);
    else if (act === 'zoom-out') zoom(2);
    else if (act === 'zoom-all') setView(0, tl.duration);
    else if (act === 'zoom-sel' && tl.sel) {
      const pad = (tl.sel.end - tl.sel.start) * 0.15;
      setView(tl.sel.start - pad, tl.sel.end + pad);
    } else if (act === 'mark-start' && tl.sel) setSel(Math.min(video.currentTime, tl.sel.end - 0.1), tl.sel.end);
    else if (act === 'mark-end' && tl.sel) setSel(tl.sel.start, Math.max(video.currentTime, tl.sel.start + 0.1));
    else if (act === 'play-sel') playSel();
    else if (act === 'mark-seg') markSegment();
    else if (act === 'back-draw') {
      ui.returnToDraw = null;
      ui.openPanel = 'draw';
      history.length > 1 ? history.back() : (location.hash = '#/biblioteca');
    } else if (act === 'ex-reextract') {
      if (!tl.sel) return toast('Marca primero el tramo en el timeline', 'error');
      // Un tramo aún sin dibujos solo cambia de tiempos; uno con dibujos se vuelve a sacar.
      if (ex.keyframes?.length) runManual(ex.id);
      else {
        upsert('exercises', await api.updateExercise(ex.id, { start: tl.sel.start, end: tl.sel.end }));
        drawExercises();
        toast('Tramo cambiado');
      }
    } else if (act === 'ex-extract') runManual(ex.id, { start: ex.start, end: ex.end });
    else if (act === 'auto') {
      const autos = exercisesOf(v.id).filter((x) => x.mode === 'auto').length;
      if (autos && !await ask(`Se sustituirán los ${autos} ejercicios que sacó la IA (los tramos que marcaste tú se quedan). ¿Continuar?`)) return;
      queueAnalysis([v.id], { force: true }).then(() => toast('Dibujos sacados')).catch(() => {});
      drawProgress();
    } else if (act === 'seek-kf' && video && ex) {
      const k = ex.keyframes[+el.closest('[data-k]').dataset.k];
      video.pause();
      video.currentTime = k.t;
    } else if (act === 'del-kf' && ex) {
      const keyframes = ex.keyframes.filter((_, j) => j !== +el.closest('[data-k]').dataset.k);
      saveExercise(ex.id, { keyframes, mode: 'manual' });
      drawExercises();
    } else if (act === 'ex-frame' && ex) {
      video.pause();
      try {
        const pose = await detectPose(video);
        if (!pose) return toast('No se detecta a la persona en este fotograma', 'error');
        const k = { t: Math.round(video.currentTime * 100) / 100, ...pose, label: labelPose(pose.lms, pose.aspect) };
        saveExercise(ex.id, { keyframes: [...ex.keyframes, k].sort((a, b) => a.t - b.t), mode: 'manual' });
        drawExercises();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'ex-del' && ex) {
      if (!await ask(`¿Eliminar el ejercicio «${ex.title}»? También se quitará de las rutinas.`)) return;
      await api.deleteExercise(ex.id);
      await refresh();
      drawExercises();
    } else if (act === 'ex-del-all') {
      const n = exercisesOf(v.id).length;
      if (!await ask(`¿Borrar los ${n} ejercicios de este video? También saldrán de las rutinas. El video se queda.`)) return;
      await api.deleteExercisesOf(v.id);
      await refresh();
      activeId = null;
      drawExercises();
    } else if (act === 'fetch') {
      queueDownload([v.id]);
      drawNoFile();
    } else if (act === 'del-video') {
      if (!await ask(`¿Eliminar «${v.title}» y sus ejercicios? También se quitarán de las rutinas.`)) return;
      await removeVideos([v.id]);
      location.hash = `#/biblioteca/${v.libraryId}`;
    }
  });

  root.addEventListener('input', (e) => {
    const card = e.target.closest('[data-ex]');
    const f = e.target.dataset.f;
    if (card && f) {
      const ex = exerciseById(card.dataset.ex);
      if (f === 'title') saveExercise(ex.id, { title: e.target.value, titleLocked: true });
      else if (f === 'category') saveExercise(ex.id, { category: e.target.value, categoryLocked: true });
      else if (f === 'summary') saveExercise(ex.id, { technique: { ...ex.technique, summary: e.target.value } });
      else if (f === 'cues') saveExercise(ex.id, { technique: { ...ex.technique, cues: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } });
    } else if (e.target.id === 'vtitle') saveTitle();
  });
  const saveTitle = debounce(async () => {
    upsert('videos', await api.updateVideo(v.id, { title: $('#vtitle').value.trim() || v.title, titleLocked: true }));
  }, 600);

  root.addEventListener('change', async (e) => {
    if (e.target.id === 'vlib') {
      upsert('videos', await api.updateVideo(v.id, { libraryId: e.target.value }));
      const to = libraryById(e.target.value);
      toast(`Movido a «${libraryLabel(to)}»`);
      root.querySelector('.back').href = `#/biblioteca/${to.id}`;
      root.querySelector('.back').textContent = `← ${isTop(to) ? shelfName(to) : to.name}`;
    } else if (e.target.id === 'attach' && e.target.files[0]) {
      toast('Subiendo…');
      try {
        upsert('videos', await api.attachFile(v.id, e.target.files[0]));
        emit('data', v.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  drawExercises();
  drawProgress();

  const onStore = (e) => {
    const { kind, id: changed } = e.detail;
    if (kind === 'job') {
      drawProgress();
      if (!v.source.file) drawNoFile();
    } else if (kind === 'data' && (changed === v.id || changed == null)) {
      const fresh = videoById(v.id);
      // Ha llegado el archivo (descarga o subida): se vuelve a pintar la vista con el reproductor.
      if (fresh && fresh.source.file !== v.source.file) return window.dispatchEvent(new HashChangeEvent('hashchange'));
      drawExercises();
      drawProgress();
    }
  };
  window.addEventListener('store', onStore);
  return () => {
    window.removeEventListener('store', onStore);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    Object.values(saveEx).forEach((d) => d.flush());
  };
}
