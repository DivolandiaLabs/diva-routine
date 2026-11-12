// Vista de un video: reproductor, timeline para elegir el tramo exacto de un ejercicio,
// extracción automática (IA) o manual, y lista de ejercicios del video.
import { api } from './api.js';
import { phasesSVG } from './figure.js';
import { detectPose, captureFrames } from './pose.js';
import { labelPose } from './analysis.js';
import { tr } from './i18n.js';
import {
  state, refresh, emit, esc, toast, fmtTime, parseTime, debounce, upsert,
  videoById, libraryById, libraryLabel, libraryChoices, isTop, shelfName, exercisesOf, exerciseById, PLATFORM, CATEGORIES, youtubeId,
  jobs, queueDownload, queueAnalysis, isAnalyzing, manualExtract, canDownload, removeVideos, ui, isAudio, spotifyEmbed, mountSpotify,
  usedInRoutines, foldedAi, ask, styleTiles, modelPicker, chooseAi, framesExtract, imageExtract, improveWithAi, CROWN, frameKeyframe,
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
  if (src.platform === 'spotify') return spotifyEmbed(url);
  return null;
}

// Velocidades del video, de muy lenta (para estudiar un paso) a muy rápida.
const SPEEDS = [0.1, 0.25, 0.33, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const NICE_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function renderVideo(root, id) {
  const v = videoById(id);
  if (!v) {
    root.innerHTML = `<div class="empty-state"><h2>Video no encontrado</h2><a class="btn" href="#/biblioteca">Volver a la biblioteca</a></div>`;
    return;
  }
  const isVideo = v.source.mediaType === 'video';
  const isImage = v.source.mediaType === 'image';
  const audio = isAudio(v); // archivo de música o Spotify: se escucha, no se sacan dibujos
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
      <select id="vlib" title="Mover a otra carpeta">${libraryChoices().map((l) => `<option value="${l.id}" ${l.id === v.libraryId ? 'selected' : ''}>${esc(libraryLabel(l))}</option>`).join('')}</select>
      <button class="btn small ghost danger" data-act="del-video">Eliminar</button>
    </div>
    <div class="vgrid">
      <section class="vplayer-col">
        <div class="player ${embed ? 'embed' : ''}">
          ${audio && v.source.file ? `<audio id="audio" controls preload="metadata" src="/media/${esc(v.source.file)}"></audio>`
            : isVideo ? `<video id="video" controls controlslist="noplaybackrate" playsinline preload="auto" src="/media/${esc(v.source.file)}"></video>`
            : isImage ? `<img id="photo" src="/media/${esc(v.source.file)}" alt="">`
            : v.source.platform === 'spotify' ? '<div class="spotify-slot" id="spotifySlot"></div>'
            : embed ? `<iframe src="${esc(embed)}" allowfullscreen loading="lazy" title="Video original"></iframe>`
            : `<div class="ph big ph-${esc(v.source.platform)}"><span>${esc(PLATFORM[v.source.platform] || 'Link')}</span></div>`}
        </div>
        ${v.source.url ? `<a class="source-link" href="${esc(v.source.url)}" target="_blank" rel="noopener">Abrir original en ${esc(PLATFORM[v.source.platform] || 'la web')} ↗</a>` : ''}
        <div id="nofile"></div>
        ${isVideo ? `
          <div class="timeline-box">
            <div class="tl" id="tl" tabindex="0" aria-label="Timeline: arrastra para elegir el tramo del ejercicio">
              <div class="tl-strip" id="strip"></div>
              <div class="tl-sel" id="sel"><span class="tl-grab" data-h="move" title="Arrastra para mover el tramo entero (mismo tamaño)"></span><span class="tl-h" data-h="start" title="Inicio"></span><span class="tl-h" data-h="end" title="Fin"></span></div>
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
              <label class="tl-speed" title="Velocidad de reproducción">Velocidad
                <select id="speed" aria-label="Velocidad de reproducción">${SPEEDS.map((x) => `<option value="${x}">${x === 1 ? 'Normal' : `×${String(x).replace('.', ',')}`}</option>`).join('')}</select></label>
              <button class="btn small ghost" id="mirrorBtn" title="Espejo: ver el vídeo invertido, como en el espejo de clase">⇆ Espejo</button>
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
              <div class="views sp-mode" role="group" aria-label="Modo de sacar los dibujos">
                <button class="view-btn" data-act="mode" data-mode="manual">Manual</button>
                <button class="view-btn" data-act="mode" data-mode="auto">Automático</button>
              </div>
              <div class="sp-frames" id="spFrames"></div>
              <label class="sp-count"><span>Fotogramas</span><input type="range" id="spCount" min="2" max="12" step="1" value="6" aria-label="Número de fotogramas"><b id="spCountN">6</b></label>
            </div>
          </div>` : ''}
        ${v.source.file && !audio ? `
          <div class="extract">
            ${isVideo ? `<button class="btn primary" data-act="make-frames" data-only="manual" id="mkFrames" disabled>Crear viñetas</button>
              <button class="btn primary" data-act="process-seg" data-only="auto">Procesar este tramo</button>
              <button class="btn" data-act="mark-seg" data-only="auto">Marcar para más tarde</button>` : ''}
            <button class="btn ${isVideo ? 'ghost' : 'primary'}" data-act="auto">${isVideo ? 'Sacar dibujos de todo el video' : 'Sacar dibujo'}</button>
            ${modelPicker()}
            ${isVideo ? `<label class="inline" data-only="auto">Fases por ejercicio <select id="kcount">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
            ${isVideo ? `<span class="info-tip" tabindex="0" role="button" aria-label="Ayuda">?<span class="info-pop"><p class="hint" data-only="manual"><b>Modo manual:</b> elige el tramo en el timeline y haz clic en los fotogramas que quieras; cada uno será una viñeta del mismo ejercicio. Pulsa <b>Crear viñetas</b>. Al cambiar el tramo o el número de fotogramas se empieza de nuevo. Teclas: ← → mueven 0,1 s (con Mayús 1 s), I / O marcan inicio y fin, espacio reproduce.</p>
          <p class="hint" data-only="auto"><b>Modo automático:</b> elige el tramo y pulsa <b>Procesar este tramo</b>: el análisis decide las fases. Con <b>Marcar para más tarde</b> los dibujos se sacan al crear la rutina; sin tramos marcados, el video se separa en ejercicios solo. Teclas: ← → mueven 0,1 s (con Mayús 1 s), I / O marcan inicio y fin, espacio reproduce.</p></span></span>` : ''}
          </div>
          <details class="ai-box" ${foldedAi() ? '' : 'open'}>
            <summary>${CROWN}Instrucciones para la IA <small>(opcional)</small></summary>
            <label class="field sp-prompt">
              <textarea id="spPrompt" aria-label="Instrucciones para la IA" rows="2" maxlength="500" placeholder="Ej.: es un plié con la espalda recta; ponle ropa de ballet" ${state.ai?.premium ? '' : 'disabled'}></textarea></label>
            ${modelPicker('promptModel')}
            <small class="hint">Función Premium: gasta créditos. Se aplican con el estilo de viñeta elegido y se guardan con el dibujo.</small>
          </details>
          <div class="progress" id="progress" hidden><div class="bar"><div id="bar"></div></div><span id="progText"></span></div>
          ${styleTiles()}` : ''}
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
  if ($('#spotifySlot')) mountSpotify($('#spotifySlot'), v.source.url);
  const video = $('#video');
  // Versión web: si el video (desde Drive) no carga, enseñar por qué.
  if (globalThis.JR_WEB && video) video.addEventListener('error', async () => {
    const r = await fetch(video.currentSrc || video.src, { headers: { Range: 'bytes=0-1' } }).catch((e) => ({ ok: false, statusText: e.message }));
    const msg = r.ok ? `formato no compatible (${r.headers?.get('Content-Type') || '?'})` : (await r.json?.().catch(() => null))?.error || `${r.status || ''} ${r.statusText || ''}`;
    toast(`${tr('No se pudo cargar el video')}: ${msg}`, 'error');
  }, { once: true });
  // Espejo: invierte la imagen (solo se ve así; los dibujos se sacan del vídeo original).
  if (video) {
    const btn = $('#mirrorBtn');
    const apply = (on) => {
      video.closest('.player').classList.toggle('mirror', on);
      btn.classList.toggle('on', on);
    };
    let on = false;
    try { on = localStorage.getItem('jr-mirror') === '1'; } catch { /* sin almacenamiento */ }
    apply(on);
    btn.addEventListener('click', () => {
      on = !on;
      apply(on);
      try { localStorage.setItem('jr-mirror', on ? '1' : '0'); } catch { /* solo esta vez */ }
    });
  }
  // Velocidad: se recuerda la última elegida para todos los videos.
  if (video) {
    const speed = $('#speed');
    let rate = 1;
    try {
      rate = Number(localStorage.getItem('jr-speed')) || 1;
    } catch {
      /* sin almacenamiento: normal */
    }
    if (!SPEEDS.includes(rate)) rate = 1;
    speed.value = String(rate);
    video.defaultPlaybackRate = video.playbackRate = rate;
    speed.addEventListener('change', () => {
      video.defaultPlaybackRate = video.playbackRate = Number(speed.value);
      try {
        localStorage.setItem('jr-speed', speed.value);
      } catch {
        /* solo esta vez */
      }
    });
  }
  let activeId = null; // ejercicio resaltado
  let busyManual = false;
  let shownOnly = null; // mientras la IA dibuja: los que se ven; el dibujo base no se enseña

  // ---------- sin archivo (solo link) ----------

  const drawNoFile = () => {
    const box = $('#nofile');
    if (v.source.file || audio) return (box.innerHTML = ''); // Spotify no se descarga: se escucha aquí
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

  // Dos formas de sacar los dibujos: elegir los fotogramas a mano o dejar que el análisis procese el tramo.
  let mode = 'manual';
  try {
    if (localStorage.getItem('jr-extract-mode') === 'auto') mode = 'auto';
  } catch {
    /* sin almacenamiento: el modo manual */
  }
  const picked = new Set(); // instantes elegidos en el modo manual
  // Cuántos fotogramas se ven: lo marca la barra de debajo de la vista previa.
  let previewN = 6;
  try {
    const saved = Number(localStorage.getItem('jr-preview-frames'));
    if (saved >= 2 && saved <= 12) previewN = saved;
  } catch {
    /* sin almacenamiento: los de siempre */
  }
  if ($('#spCount')) {
    $('#spCount').value = previewN;
    $('#spCountN').textContent = previewN;
  }
  const drawPicks = () => {
    const order = [...picked].sort((a, b) => a - b);
    root.querySelectorAll('#spFrames [data-seek]').forEach((f) => {
      const i = order.indexOf(Number(f.dataset.seek));
      f.classList.toggle('picked', i >= 0);
      f.querySelector('.sp-n').textContent = i >= 0 ? i + 1 : '';
    });
    const btn = $('#mkFrames');
    if (!btn) return;
    btn.disabled = !picked.size || Boolean(busyManual);
    btn.textContent = picked.size ? `Crear ${picked.size === 1 ? '1 viñeta' : `${picked.size} viñetas`}` : 'Crear viñetas';
  };
  const applyMode = () => {
    root.querySelectorAll('[data-only]').forEach((el) => (el.hidden = el.dataset.only !== mode));
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('#spFrames')?.classList.toggle('manual', mode === 'manual');
  };
  applyMode();

  // Vista previa del tramo: sus fotogramas, de inicio a fin, en grande (de ahí salen los dibujos).
  let previewToken = 0;
  const drawPreview = debounce(async () => {
    const box = $('#spFrames');
    if (!box || !tl.sel || !v.source.file) return;
    const token = ++previewToken;
    const { start, end } = tl.sel;
    const PREVIEW_N = previewN;
    picked.clear();
    // (justo al final del video no hay imagen: el último, un instante antes)
    const times = Array.from({ length: PREVIEW_N }, (_, i) => Math.min(start + ((end - start) * i) / (PREVIEW_N - 1), tl.duration - 0.08));
    box.style.setProperty('--ar', `${video?.videoWidth || 9} / ${video?.videoHeight || 16}`); // la forma del video
    $('#spInfo').textContent = `${fmtTime(start)} → ${fmtTime(end)} · ${(end - start).toFixed(1)} s. ${mode === 'manual' ? 'Haz clic en los fotogramas que quieras convertir en viñetas.' : 'Clic en un fotograma para verlo en el video.'}`;
    box.innerHTML = times.map((t, i) => `<figure class="sp-f loading"><i></i><figcaption>${i === 0 ? 'Inicio' : i === PREVIEW_N - 1 ? 'Fin' : fmtTime(t)}</figcaption></figure>`).join('');
    try {
      const imgs = await captureFrames(`/media/${v.source.file}`, times, 220);
      if (token !== previewToken) return;
      box.innerHTML = imgs.map((src, i) => `
        <figure class="sp-f" data-seek="${times[i]}" title="${mode === 'manual' ? 'Elegir' : 'Ir a'} ${fmtTime(times[i])}">
          <b class="sp-n"></b><img src="${src}" alt=""><figcaption>${i === 0 ? `Inicio · ${fmtTime(times[i])}` : i === PREVIEW_N - 1 ? `Fin · ${fmtTime(times[i])}` : fmtTime(times[i])}</figcaption>
        </figure>`).join('');
      drawPicks();
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
      const from = tl.sel ? { ...tl.sel } : null; // para mover el tramo entero
      let moved = false;
      const onMove = (ev) => {
        const t = xToT(ev.clientX);
        if (!moved && Math.abs(ev.clientX - e.clientX) < 3) return;
        moved = true;
        if (handle === 'start') setSel(Math.min(t, tl.sel.end - 0.1), tl.sel.end, { seekTo: t });
        else if (handle === 'end') setSel(tl.sel.start, Math.max(t, tl.sel.start + 0.1), { seekTo: t });
        else if (handle === 'move' && from) {
          // El tramo entero se desliza con el mismo tamaño, sin salirse del video.
          const len = from.end - from.start;
          const start = Math.max(0, Math.min(tl.duration - len, from.start + (t - t0)));
          setSel(start, start + len, { seekTo: start });
        } else setSel(Math.min(t0, t), Math.max(t0, t), { seekTo: t });
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

    $('#spCount').addEventListener('input', (e) => {
      previewN = Number(e.target.value);
      $('#spCountN').textContent = previewN;
      try {
        localStorage.setItem('jr-preview-frames', previewN);
      } catch {
        /* solo esta vez */
      }
      drawPreview();
    });

    // Vista previa: clic en un fotograma = ir a él en el video y, en el modo manual, elegirlo.
    $('#spFrames').addEventListener('click', (e) => {
      const f = e.target.closest('[data-seek]');
      if (!f) return;
      video.pause();
      const t = Number(f.dataset.seek);
      video.currentTime = t;
      if (mode !== 'manual') return;
      if (!picked.delete(t)) picked.add(t);
      drawPicks();
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

  const aiPrompt = () => $('#spPrompt')?.value.trim() || '';
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
    const list = exercisesOf(v.id).filter((e) => !shownOnly || shownOnly.has(e.id));
    $('#exCount').textContent = `(${list.length})`;
    $('#exDelAll').hidden = list.length < 2;
    $('#exList').innerHTML = list.length
      ? list.map((e, i) => `
        <article class="excard ${e.id === activeId ? 'on' : ''}" data-ex="${e.id}">
          <div class="excard-head">
            <span class="num">${i + 1}</span>
            <input class="ex-title" data-f="title" value="${esc(e.title)}" aria-label="Nombre del ejercicio">
            <button class="ex-x" data-act="ex-del" title="Eliminar este ejercicio" aria-label="Eliminar">✕</button>
          </div>
          ${e.keyframes?.length ? `<div class="kf-row">${phasesSVG(e.keyframes, { size: 104 }).map((ph, j) => `
            <figure class="kf" data-k="${j}">
              <button class="kf-fig" data-act="seek-kf" title="${isVideo ? 'Ver este momento' : ''}">${ph.svg}</button>
              <figcaption>${esc(ph.caption)}</figcaption>
              <button class="kf-del" data-act="del-kf" title="Quitar esta fase">✕</button>
            </figure>`).join('')}</div>`
            : `<p class="hint pending">Tramo marcado: sus dibujos se sacan al crear la rutina.</p>`}
          <div class="row wrap ex-tools">
            ${e.keyframes?.some((k) => k.img) ? `<button class="btn small" data-act="ex-ai" title="Vuelve a dibujar con IA todos los dibujos de esta secuencia, con el estilo elegido (puedes volver a los originales)">${CROWN} Regenerar secuencia con IA</button>` : ''}
            ${isVideo && !e.keyframes?.length ? '<button class="btn small ghost" data-act="ex-extract" title="Saca ya los dibujos de este tramo, sin esperar a crear la rutina">Sacar dibujos ahora</button>' : ''}
            ${isVideo && e.keyframes?.length ? '<button class="btn small ghost" data-act="ex-frame" title="Añade a la secuencia un dibujo más, sacado del fotograma que se ve ahora en el video">+ Dibujo del fotograma actual</button>' : ''}
          </div>
          <details class="ex-details">
            <summary>Técnica y categoría</summary>
            <label class="field">Categoría
              <select data-f="category">${[...new Set([...CATEGORIES, e.category].filter(Boolean))].map((c) => `<option value="${esc(c)}" ${c === e.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
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
    else if (busyManual) ((p = busyManual.p), (text = isVideo ? `Extrayendo el tramo… ${Math.round(busyManual.p * 100)}%` : `Sacando los dibujos… ${Math.round(busyManual.p * 100)}%`));
    box.hidden = p == null;
    if (p != null) {
      $('#bar').style.width = Math.round(p * 100) + '%';
      $('#progText').textContent = p === 0 && jobs.analyzing?.id === v.id ? 'Cargando el detector de pose…' : text;
    }
    root.querySelectorAll('[data-act="auto"],[data-act="process-seg"],[data-act="ex-extract"],[data-act="ex-reextract"]').forEach((b) => (b.disabled = p != null));
    drawPicks();
  }

  // Marca el tramo del timeline sin sacar dibujos: se sacan al crear la rutina.
  async function markSegment() {
    if (!tl.sel) return toast('Marca primero el tramo en el timeline', 'error');
    const { start, end } = tl.sel;
    try {
      const ex = upsert('exercises', await api.createExercise({ videoId: v.id, title: tr(`Tramo ${exercisesOf(v.id).length + 1}`), start, end, mode: 'manual', keyframes: [], aiPrompt: aiPrompt() }));
      activeId = ex.id;
      $('#spPrompt').value = '';
      drawExercises();
      toast(`Tramo ${fmtTime(start)} → ${fmtTime(end)} marcado. Sus dibujos se sacan al crear la rutina.`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // El estilo elegido abajo: el gratuito ya es el que acaba de hacer la app.
  async function applyStyle(id) {
    const style = state.ai?.styles.find((s) => s.id === state.ai.style);
    const ex = exerciseById(id);
    if (style?.free && ex?.aiPrompt) return toast('Las instrucciones para la IA necesitan un estilo Premium: el dibujo se ha hecho con el estilo gratuito.', 'error');
    if (!style || style.free || !ex?.keyframes.some((k) => k.img)) return;
    if (!state.ai.premium) return toast('El estilo elegido es Premium: los dibujos se han hecho con el estilo gratuito.', 'error');
    busyManual = { p: 0 };
    drawProgress();
    await improveWithAi(ex, (i, total) => ((busyManual = { p: (i - 1) / total }), drawProgress()));
    busyManual = false;
    drawProgress();
    drawExercises();
  }

  async function runManual(exerciseId = null, range = tl.sel) {
    if (!range) return toast('Marca primero el tramo en el timeline', 'error');
    let made = null;
    busyManual = { p: 0 };
    drawProgress();
    try {
      const ex = await manualExtract(v.id, range.start, range.end, {
        count: +$('#kcount').value,
        exerciseId,
        aiPrompt: aiPrompt(),
        onProgress: (p) => ((busyManual = { p }), drawProgress()),
      });
      activeId = made = ex.id;
      $('#spPrompt').value = '';
      toast(exerciseId ? 'Ejercicio actualizado con el nuevo tramo' : 'Ejercicio añadido');
    } catch (e) {
      toast('No se pudo extraer: ' + e.message, 'error');
    } finally {
      busyManual = false;
      drawProgress();
      drawExercises();
    }
    if (made) await applyStyle(made);
  }

  async function runImage() {
    let made = null;
    const style = state.ai?.styles.find((s) => s.id === state.ai.style);
    const redrawn = Boolean(style && !style.free && state.ai.premium);
    if (redrawn) shownOnly = new Set(exercisesOf(v.id).map((e) => e.id));
    busyManual = { p: 0 };
    drawProgress();
    try {
      const ex = await imageExtract(v.id, {
        aiPrompt: aiPrompt(),
        onProgress: (p) => ((busyManual = { p }), drawProgress()),
      });
      activeId = made = ex.id;
      $('#spPrompt').value = '';
      if (!redrawn) toast('Dibujo añadido');
    } catch (e) {
      toast('No se pudo extraer: ' + e.message, 'error');
    } finally {
      busyManual = false;
      drawProgress();
      drawExercises();
    }
    if (made) await applyStyle(made);
    if (!redrawn) return;
    // Si la IA no llegó a dibujar (cancelado o error), no queda un dibujo gratuito que no se pidió.
    if (made && !exerciseById(made)?.keyframes.some((k) => k.origImg)) {
      await api.deleteExercise(made).catch(() => {});
      await refresh();
      if (activeId === made) activeId = null;
    }
    shownOnly = null;
    drawExercises();
  }

  async function runFrames() {
    let made = null;
    busyManual = { p: 0 };
    drawProgress();
    try {
      const { ex, skipped } = await framesExtract(v.id, [...picked].sort((a, b) => a - b), {
        aiPrompt: aiPrompt(),
        onProgress: (p) => ((busyManual = { p }), drawProgress()),
      });
      activeId = made = ex.id;
      picked.clear();
      $('#spPrompt').value = '';
      toast(skipped ? `Ejercicio añadido. ${skipped === 1 ? 'En 1 fotograma' : `En ${skipped} fotogramas`} no se detectó a la persona.` : 'Ejercicio añadido');
    } catch (e) {
      toast('No se pudo extraer: ' + e.message, 'error');
    } finally {
      busyManual = false;
      drawProgress();
      drawExercises();
    }
    if (made) await applyStyle(made);
  }

  // ---------- acciones ----------

  root.addEventListener('click', async (e) => {
    const styleBtn = e.target.closest('.style-tile');
    if (styleBtn) {
      await chooseAi(styleBtn);
      root.querySelectorAll('.style-tile').forEach((b) => {
        const on = b.value === state.ai.style;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      });
      return;
    }
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
    else if (act === 'make-frames') runFrames();
    else if (act === 'process-seg') runManual();
    else if (act === 'mode') {
      mode = el.dataset.mode;
      try {
        localStorage.setItem('jr-extract-mode', mode);
      } catch {
        /* solo esta vez */
      }
      applyMode();
      drawPreview();
    }
    else if (act === 'back-draw') {
      ui.returnToDraw = null;
      ui.openPanel = 'draw';
      history.length > 1 ? history.back() : (location.hash = '#/biblioteca');
    } else if (act === 'ex-ai' && ex) {
      // Toda la secuencia de la casilla, dibujo a dibujo, con el estilo de IA elegido.
      busyManual = { p: 0 };
      drawProgress();
      try {
        await improveWithAi(ex, (i, total) => ((busyManual = { p: (i - 1) / total }), drawProgress()));
      } finally {
        busyManual = false;
        drawProgress();
        drawExercises();
      }
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
      if (!isVideo) return runImage();
      const autos = exercisesOf(v.id).filter((x) => x.mode === 'auto').length;
      if (autos && !await ask(`Se sustituirán los ${autos} ejercicios que sacó la IA (los tramos que marcaste tú se quedan). ¿Continuar?`)) return;
      const prompt = aiPrompt();
      $('#spPrompt').value = '';
      queueAnalysis([v.id], { force: true })
        .then(() => {
          if (prompt) for (const x of exercisesOf(v.id)) if (x.mode === 'auto') saveExercise(x.id, { aiPrompt: prompt });
          toast('Dibujos sacados');
        })
        .catch(() => {});
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
      // La fase nueva con su viñeta, del mismo estilo que las sacadas del tramo.
      busyManual = { p: 0.3 };
      drawProgress();
      try {
        const k = await frameKeyframe(v.id, Math.round(video.currentTime * 100) / 100);
        if (!k) return toast('No se detecta a la persona en este fotograma', 'error');
        const keyframes = [...ex.keyframes, k].sort((a, b) => a.t - b.t);
        const saved = upsert('exercises', await api.updateExercise(ex.id, { keyframes, mode: 'manual' }));
        drawExercises();
        // Si las otras fases están redibujadas con IA, la nueva también (solo esa).
        const style = state.ai?.styles.find((x) => x.id === state.ai.style);
        if (ex.keyframes.some((x) => x.origImg) && k.img && style && !style.free && state.ai.premium) {
          const i = saved.keyframes.findIndex((x) => x.t === k.t && x.img === k.img);
          if (i >= 0) await improveWithAi(saved, () => {}, [{ ex: saved, i }]);
          drawExercises();
        }
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busyManual = false;
        drawProgress();
      }
    } else if (act === 'ex-del' && ex) {
      if (!await ask(`¿Eliminar el ejercicio «${ex.title}»? Las rutinas donde está lo conservan. ${tr(usedInRoutines([ex.id]))}`)) return;
      await api.deleteExercise(ex.id);
      await refresh();
      drawExercises();
    } else if (act === 'ex-del-all') {
      const n = exercisesOf(v.id).length;
      if (!await ask(`¿Borrar los ${n} ejercicios de este video? Las rutinas donde están los conservan. El video se queda.`)) return;
      await api.deleteExercisesOf(v.id);
      await refresh();
      activeId = null;
      drawExercises();
    } else if (act === 'fetch') {
      queueDownload([v.id]);
      drawNoFile();
    } else if (act === 'del-video') {
      if (!await ask(`¿Eliminar «${v.title}» y sus ejercicios? Las rutinas donde están los conservan.`)) return;
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
    if (e.target.matches('select[data-ai-choice]')) return chooseAi(e.target);
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
