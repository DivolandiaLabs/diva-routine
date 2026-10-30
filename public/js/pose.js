// Detección de pose con MediaPipe (se carga desde CDN la primera vez que se usa).
const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const MAX_SIDE = 640; // se reduce el fotograma para analizar más rápido

let landmarkerPromise = null;

export function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = (delegate) =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
        });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    })().catch((e) => {
      landmarkerPromise = null;
      throw new Error('No se pudo cargar el detector de pose (¿sin conexión a internet?): ' + e.message);
    });
  }
  return landmarkerPromise;
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });

/** Detecta la pose en un <video> (fotograma actual) o <img>. Devuelve {lms, aspect} o null. */
export async function detectPose(source) {
  const landmarker = await getLandmarker();
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const result = landmarker.detect(canvas);
  const pose = result.landmarks && result.landmarks[0];
  if (!pose) return null;
  const r = (n) => Math.round(n * 10000) / 10000;
  return {
    lms: pose.map((p) => [r(p.x), r(p.y), r(p.z), r(p.visibility ?? 1)]),
    aspect: w / h,
  };
}

function seek(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    setTimeout(finish, 3000);
    video.currentTime = t;
  });
}

/** Miniaturas JPEG (data URL) de varios instantes del video, para la tira del timeline. */
export async function captureFrames(src, times, height = 54) {
  const v = await loadVideo(src);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  c.height = height;
  c.width = Math.max(1, Math.round((height * (v.videoWidth || 16)) / (v.videoHeight || 9)));
  const out = [];
  for (const t of times) {
    await seek(v, t);
    g.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.6));
  }
  v.removeAttribute('src');
  v.load();
  return out;
}

/** Portada del video: un fotograma (hacia el segundo 1) en JPEG. */
export async function capturePoster(src, height = 480) {
  const v = await loadVideo(src);
  const d = Number.isFinite(v.duration) ? v.duration : 2;
  await seek(v, Math.min(1, d * 0.25));
  const c = document.createElement('canvas');
  c.height = Math.min(height, v.videoHeight || height);
  c.width = Math.max(1, Math.round((c.height * (v.videoWidth || 9)) / (v.videoHeight || 16)));
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  v.removeAttribute('src');
  v.load();
  return new Promise((r, reject) => c.toBlob((b) => (b ? r(b) : reject(new Error('sin imagen'))), 'image/jpeg', 0.82));
}

/** Duración del video (también para .webm sin duración en la cabecera). */
export async function videoDuration(src) {
  const v = await loadVideo(src);
  if (!Number.isFinite(v.duration)) {
    await seek(v, 1e7);
    await seek(v, 0);
  }
  const d = Number.isFinite(v.duration) ? v.duration : 0;
  v.removeAttribute('src');
  v.load();
  return d;
}

export function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('No se pudo abrir el video para analizarlo'));
    v.src = src;
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    img.src = src;
  });
}

/**
 * Recorre un tramo del video y detecta la pose en fotogramas espaciados.
 * Usa un <video> propio para no mover el reproductor que ve el usuario.
 */
export async function samplePoses(src, { start = 0, end = null, maxFrames = 180, minStep = null, onProgress, signal } = {}) {
  await getLandmarker();
  const video = await loadVideo(src);
  if (!Number.isFinite(video.duration)) {
    // Algunos .webm (grabados con el móvil o el navegador) no traen la duración: se fuerza a calcularla.
    await seek(video, 1e7);
    await seek(video, 0);
  }
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const from = Math.max(0, Math.min(start, duration));
  const to = Math.max(from, Math.min(end ?? duration, duration));
  const span = to - from;
  // Más denso en clips cortos (los giros son rápidos), sin pasar de maxFrames fotogramas.
  const step = Math.max(span / maxFrames, minStep ?? (span < 20 ? 0.1 : 0.2));
  const frames = [];
  const total = Math.max(1, Math.floor(span / step) + 1);
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error('Análisis cancelado');
    const t = Math.min(to - 0.01, from + i * step);
    await seek(video, Math.max(0, t));
    const pose = await detectPose(video);
    if (pose) frames.push({ t: Math.round(t * 100) / 100, ...pose });
    onProgress?.((i + 1) / total);
  }
  video.removeAttribute('src');
  video.load();
  return { frames, duration, start: from, end: to };
}
