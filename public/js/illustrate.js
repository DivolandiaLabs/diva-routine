// Viñetas estilo póster de ejercicios: la persona real de cada fase, recortada del video
// (sin fondo) y pasada a ilustración: colores planos (filtro tipo pintura + paleta reducida),
// líneas de tinta en los bordes y contorno, sobre fondo transparente (se ve blanco).
// Todas las fases de un ejercicio comparten encuadre: misma escala y mismo suelo.
import { loadVideo, loadImage } from './pose.js';

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const DETECT_SIDE = 640; // tamaño para detectar (la silueta se reescala al tamaño real)
const OUT_H = 420; // alto de la viñeta final en píxeles

let segmenterPromise = null;

// Un detector aparte, con silueta (máscara) de la persona: solo se usa en las pocas fases elegidas.
function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = (delegate) =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          outputSegmentationMasks: true,
        });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    })().catch((e) => {
      segmenterPromise = null;
      throw e;
    });
  }
  return segmenterPromise;
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

/** Fotograma a tamaño real + silueta de la persona (0..1) al mismo tamaño. */
async function frameWithMask(source) {
  const seg = await getSegmenter();
  const w = source.videoWidth || source.naturalWidth;
  const h = source.videoHeight || source.naturalHeight;
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  full.getContext('2d').drawImage(source, 0, 0, w, h);

  const s = Math.min(1, DETECT_SIDE / Math.max(w, h));
  const small = document.createElement('canvas');
  small.width = Math.round(w * s);
  small.height = Math.round(h * s);
  small.getContext('2d').drawImage(source, 0, 0, small.width, small.height);
  const result = seg.detect(small);
  const m = result.segmentationMasks?.[0];
  if (!m) return null;
  const vals = m.getAsFloat32Array();
  const mw = m.width, mh = m.height;
  // La silueta a tamaño real (reescalado suave).
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const mimg = mc.getContext('2d').createImageData(mw, mh);
  for (let i = 0; i < vals.length; i++) mimg.data[i * 4 + 3] = Math.round(vals[i] * 255);
  mc.getContext('2d').putImageData(mimg, 0, 0);
  m.close?.();
  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bg = big.getContext('2d');
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(mc, 0, 0, w, h);
  const alpha = bg.getImageData(0, 0, w, h).data;
  const raw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = alpha[i * 4 + 3] / 255;

  // Puntos del cuerpo en píxeles: dan la escala (largo del tronco) y dónde está la persona.
  const lm = result.landmarks?.[0];
  if (!lm) return null;
  const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h, v: lm[i].visibility ?? 1 });
  const sh = [P(11), P(12)], hp = [P(23), P(24)];
  const shMid = { x: (sh[0].x + sh[1].x) / 2, y: (sh[0].y + sh[1].y) / 2 };
  const hipMid = { x: (hp[0].x + hp[1].x) / 2, y: (hp[0].y + hp[1].y) / 2 };
  const T = Math.hypot(shMid.x - hipMid.x, shMid.y - hipMid.y);
  if (T < 8) return null;

  // Solo la mancha de silueta unida al cuerpo (fuera trozos de otras cosas o personas).
  const mask = new Float32Array(w * h);
  const seen = new Uint8Array(w * h);
  const seeds = [hipMid, shMid, ...hp, ...sh].map((p) => Math.round(Math.min(h - 1, Math.max(0, p.y))) * w + Math.round(Math.min(w - 1, Math.max(0, p.x))));
  const stack = seeds.filter((i) => raw[i] > 0.35);
  if (!stack.length) return null;
  let minX = w, minY = h, maxX = -1, maxY = -1, area = 0;
  for (const i of stack) seen[i] = 1;
  while (stack.length) {
    const i = stack.pop();
    mask[i] = raw[i];
    const x = i % w, y = (i / w) | 0;
    if (raw[i] > 0.5) {
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !seen[j] && raw[j] > 0.35) ((seen[j] = 1), stack.push(j));
    }
  }
  if (maxX < 0) return null;
  // Calidad: silueta completa (área esperable para un cuerpo) y puntos bien vistos.
  const vis = [11, 12, 23, 24, 25, 26, 27, 28].reduce((a, i) => a + (lm[i].visibility ?? 1), 0) / 8;
  const score = Math.min(1, area / (1.1 * T * T)) * vis;
  return { full, mask, w, h, box: { minX, minY, maxX, maxY }, T, center: { x: (minX + maxX) / 2 }, score };
}

// ---------- filtro de ilustración ----------

/** Filtro de Kuwahara: suaviza sin borrar bordes (aspecto de pintura con zonas planas). */
function kuwahara(src, w, h, r) {
  const out = new Uint8ClampedArray(src.length);
  const q = [[-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity, br = 0, bgc = 0, bb = 0;
      for (const [x0, x1, y0, y1] of q) {
        let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
        for (let dy = y0; dy <= y1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = x0; dx <= x1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const i = (yy * w + xx) * 4;
            const R = src[i], G = src[i + 1], B = src[i + 2];
            const l = R * 0.3 + G * 0.59 + B * 0.11;
            sr += R; sg += G; sb += B; sl += l; sl2 += l * l; n++;
          }
        }
        const v = sl2 / n - (sl / n) ** 2;
        if (v < best) ((best = v), (br = sr / n), (bgc = sg / n), (bb = sb / n));
      }
      const o = (y * w + x) * 4;
      out[o] = br; out[o + 1] = bgc; out[o + 2] = bb; out[o + 3] = src[o + 3];
    }
  }
  return out;
}

/** Paleta reducida (k-means sobre los píxeles de la persona): colores planos de ilustración. */
function quantize(px, mask, w, h, k = 12) {
  const pts = [];
  for (let i = 0; i < w * h; i += 3) if (mask[i] > 0.5) pts.push(i);
  if (pts.length < k) return px;
  let cent = Array.from({ length: k }, (_, j) => {
    const i = pts[Math.floor(((j + 0.5) / k) * pts.length)] * 4;
    return [px[i], px[i + 1], px[i + 2]];
  });
  const near = (r, g, b) => {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < cent.length; j++) {
      const c = cent[j];
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < bd) ((bd = d), (bi = j));
    }
    return bi;
  };
  for (let it = 0; it < 8; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      const i = p * 4;
      const j = near(px[i], px[i + 1], px[i + 2]);
      acc[j][0] += px[i]; acc[j][1] += px[i + 1]; acc[j][2] += px[i + 2]; acc[j][3]++;
    }
    cent = acc.map((a, j) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cent[j]));
  }
  const out = new Uint8ClampedArray(px);
  for (let i = 0; i < w * h; i++) {
    if (mask[i] < 0.05) continue;
    const o = i * 4;
    const c = cent[near(px[o], px[o + 1], px[o + 2])];
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

/** Un poco más luminoso y con algo más de color, como las ilustraciones de los pósters. */
function brighten(px, mask, w, h) {
  for (let i = 0; i < w * h; i++) {
    if (mask[i] < 0.05) continue;
    const o = i * 4;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const l = (r + g + b) / 3;
    for (let c = 0; c < 3; c++) {
      const v = px[o + c];
      px[o + c] = Math.min(255, (l + (v - l) * 1.18) * 1.06 + 8);
    }
  }
}

/** Desenfoque de caja de la silueta: bordes suaves en vez de escalones. */
function smoothMask(mask, w, h, r = 2, passes = 2) {
  let a = mask;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / (2 * r + 1);
        s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    a = out;
  }
  return a;
}

/** Convierte el recorte en viñeta: pintura + paleta + tinta en los bordes + contorno. */
function illustrate(crop, rawMask, w, h) {
  const mask = smoothMask(rawMask, w, h);
  let px = kuwahara(crop, w, h, 3);
  px = kuwahara(px, w, h, 2);
  px = quantize(px, mask, w, h, 10);
  brighten(px, mask, w, h);

  // Tinta: bordes (Sobel) de la imagen ya suavizada, solo dentro de la persona.
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
  const edge = new Float32Array(w * h);
  const vals = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      edge[i] = Math.hypot(gx, gy);
      if (mask[i] > 0.5) vals.push(edge[i]);
    }
  }
  vals.sort((a, b) => a - b);
  const thr = vals[Math.floor(vals.length * 0.86)] || 60;

  const person = new ImageData(w, h);
  const silhouette = new ImageData(w, h);
  const d = person.data, s = silhouette.data;
  const ink = [43, 38, 34];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const m = Math.min(1, Math.max(0, (mask[i] - 0.35) / 0.3));
    const a = m * m * (3 - 2 * m); // borde suave
    let r = px[o], g = px[o + 1], b = px[o + 2];
    const e = Math.min(1, Math.max(0, (edge[i] - thr) / thr)) * 0.75;
    r += (ink[0] - r) * e; g += (ink[1] - g) * e; b += (ink[2] - b) * e;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255;
    s[o] = ink[0]; s[o + 1] = ink[1]; s[o + 2] = ink[2]; s[o + 3] = a * 255;
  }
  // Contorno de tinta: la silueta en tinta, desplazada en círculo (queda un borde liso
  // alrededor), y la persona encima. Se deja margen para que el contorno no se corte.
  const R = Math.max(2, h / 190);
  const P = Math.ceil(R) + 1;
  const layer = (img) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  const sil = layer(silhouette), per = layer(person);
  const out = document.createElement('canvas');
  out.width = w + P * 2;
  out.height = h + P * 2;
  const g = out.getContext('2d');
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    g.drawImage(sil, P + Math.cos(t) * R, P + Math.sin(t) * R);
  }
  g.drawImage(per, P, P);
  return out;
}

/**
 * Recorta una zona (en píxeles del fotograma, puede salirse del fotograma: ahí queda vacío)
 * y la reescala para que su alto sea OUT_H.
 */
function cropTo(fm, box) {
  const scale = OUT_H / (box.maxY - box.minY);
  const w = Math.max(1, Math.round((box.maxX - box.minX) * scale));
  const h = OUT_H;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(fm.full, box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const mask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.round(box.minY + y / scale);
    if (sy < 0 || sy >= fm.h) continue;
    for (let x = 0; x < w; x++) {
      const sx = Math.round(box.minX + x / scale);
      if (sx >= 0 && sx < fm.w) mask[y * w + x] = fm.mask[sy * fm.w + sx];
    }
  }
  return { px, mask, w, h };
}

const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/webp', 0.88));

/**
 * Viñetas de las fases de un ejercicio. src: video o foto; keyframes: [{ t }].
 * Devuelve un Blob (webp con transparencia) por fase, o null donde no se pudo.
 */
export async function illustratePhases(src, keyframes, { isImage = false, onProgress } = {}) {
  const media = isImage ? await loadImage(src) : await loadVideo(src);
  const duration = isImage ? 0 : media.duration || 0;
  // De cada fase se prueba su fotograma y los de justo antes y después (los movimientos
  // rápidos salen movidos): se queda el de silueta más completa y nítida.
  const frames = [];
  for (const k of keyframes) {
    const times = isImage ? [0] : [k.t, k.t - 0.12, k.t + 0.12].filter((t) => t >= 0 && (!duration || t <= duration));
    let best = null;
    for (const t of times) {
      if (!isImage) await seek(media, t);
      const fm = await frameWithMask(media).catch(() => null);
      if (fm && (!best || fm.score > best.score + 0.05)) best = fm;
      if (best?.score > 0.8) break;
    }
    frames.push(best && best.score > 0.25 ? best : null);
    onProgress?.(frames.length / keyframes.length / 2);
  }
  if (!isImage) {
    media.removeAttribute('src');
    media.load();
  }
  const ok = frames.filter(Boolean);
  if (!ok.length) return keyframes.map(() => null);

  // Misma escala en todas las fases: la marca el largo del tronco, no la altura de la postura
  // (agachada no sale más grande que de pie), y todas comparten el suelo (se ve si salta).
  const T = ok.map((f) => f.T).sort((a, b) => a - b)[Math.floor(ok.length / 2)];
  const floor = Math.max(...ok.map((f) => f.box.maxY)) + T * 0.15;
  const top = Math.min(floor - T * 4.4, ...ok.map((f) => f.box.minY - T * 0.15));
  const H = floor - top;

  const out = [];
  for (let j = 0; j < frames.length; j++) {
    const fm = frames[j];
    if (!fm) {
      out.push(null);
      continue;
    }
    const half = Math.max(H * 0.22, (fm.box.maxX - fm.box.minX) / 2 + T * 0.2);
    const box = { minX: Math.round(fm.center.x - half), maxX: Math.round(fm.center.x + half), minY: Math.round(top), maxY: Math.round(floor) };
    const c = cropTo(fm, box);
    out.push(await toBlob(illustrate(c.px, c.mask, c.w, c.h)));
    onProgress?.(0.5 + (j + 1) / frames.length / 2);
  }
  return out;
}
