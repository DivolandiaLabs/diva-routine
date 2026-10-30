// Análisis de la técnica a partir de las poses: rasgos por fotograma, momentos clave
// representativos y una descripción del ejercicio con correcciones técnicas.
// "Izquierda/derecha" son de la persona que baila (si el video está en espejo, se invierten).
import { LM } from './figure.js';

const v = (lms, i, a) => ({ x: lms[i][0] * a, y: lms[i][1] });
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const len = (p) => Math.hypot(p.x, p.y);
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const dot = (p, q) => p.x * q.x + p.y * q.y;
const deg = (r) => (r * 180) / Math.PI;
function angleBetween(p, q) {
  const d = len(p) * len(q);
  return d ? deg(Math.acos(Math.max(-1, Math.min(1, dot(p, q) / d)))) : 0;
}
const jointAngle = (a, b, c) => angleBetween(sub(a, b), sub(c, b));

const SIDES = { L: 'izquierda', R: 'derecha' };

// ---------- rasgos de un fotograma ----------

export function frameFeatures(lms, aspect) {
  const P = (i) => v(lms, i, aspect);
  const lSh = P(LM.lSh), rSh = P(LM.rSh), lHip = P(LM.lHip), rHip = P(LM.rHip);
  const shMid = mid(lSh, rSh), hipMid = mid(lHip, rHip);
  const up = sub(shMid, hipMid);
  const T = len(up) || 1e-3; // largo del torso = unidad de medida
  const down = { x: -up.x, y: -up.y };
  // coordenada "hacia arriba" relativa al torso
  const along = (p) => dot(sub(p, hipMid), up) / (T * T);
  const across = (p) => Math.abs((sub(p, hipMid).x * up.y - sub(p, hipMid).y * up.x) / (T * T));

  const leg = (hip, kn, an) => ({
    knee: jointAngle(P(hip), P(kn), P(an)),
    raise: angleBetween(sub(P(an), P(hip)), down), // 0 = pierna abajo, 90 = a la altura de la cadera
    thigh: angleBetween(sub(P(kn), P(hip)), down),
  });
  const L = leg(LM.lHip, LM.lKn, LM.lAn);
  const R = leg(LM.rHip, LM.rKn, LM.rAn);

  const arm = (sh, wr) => {
    const w = P(wr), s = P(sh);
    return {
      up: along(w) > along(s) + 0.35,
      side: Math.abs(along(w) - along(s)) < 0.35 && across(w) > 0.85,
    };
  };
  const aL = arm(LM.lSh, LM.lWr), aR = arm(LM.rSh, LM.rWr);

  const releve = (heel, foot) => (P(foot).y - P(heel).y) / T > 0.1;

  return {
    T,
    hipMid,
    shMid,
    ankleY: Math.max(P(LM.lAn).y, P(LM.rAn).y),
    lowAnkleY: Math.min(P(LM.lAn).y, P(LM.rAn).y),
    tilt: angleBetween(up, { x: 0, y: -1 }), // 0 = torso vertical
    L, R,
    split: angleBetween(sub(P(LM.lAn), lHip), sub(P(LM.rAn), rHip)),
    feetWidth: len(sub(P(LM.lAn), P(LM.rAn))) / T,
    armsUp: aL.up && aR.up,
    armUp: aL.up || aR.up,
    armsSide: aL.side && aR.side,
    headDrop: along(P(LM.nose)) < along(shMid) - 0.05,
    releve: releve(LM.lHeel, LM.lFoot) && releve(LM.rHeel, LM.rFoot),
    facing: (lSh.x - rSh.x) / T, // >0 de frente a cámara, <0 de espaldas
    vec: poseVector(lms, aspect, hipMid, T),
  };
}

const VEC_POINTS = [LM.nose, LM.lSh, LM.rSh, LM.lEl, LM.rEl, LM.lWr, LM.rWr, LM.lHip, LM.rHip, LM.lKn, LM.rKn, LM.lAn, LM.rAn];
function poseVector(lms, aspect, c, T) {
  const out = [];
  for (const i of VEC_POINTS) {
    out.push((lms[i][0] * aspect - c.x) / T, (lms[i][1] - c.y) / T);
  }
  return out;
}
const vdist = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
};

// ---------- clasificación de un fotograma ----------

function classify(f, ctx) {
  // Despegue = incluso el tobillo más bajo está por encima del suelo habitual del clip.
  const off = ctx ? (ctx.floorY - f.ankleY) / f.T : 0;
  const hipToFloor = ctx ? (ctx.floorY - f.hipMid.y) / f.T : 2;
  const work = f.L.raise >= f.R.raise ? 'L' : 'R';
  const W = f[work];
  const res = { key: 'pose', side: null, jump: false, floor: false };

  if (ctx && ctx.multi && off > 0.3 && f.tilt < 50) {
    res.key = 'jump';
    res.jump = true;
  } else if (f.tilt > 60 && hipToFloor < 0.7) {
    res.key = 'floor';
    res.floor = true;
  } else if (W.raise > 70) {
    res.key = f.split > 140 ? 'split' : 'kick';
    res.side = work;
  } else if (W.thigh > 55 && W.knee < 110) {
    res.key = 'passe';
    res.side = work;
  } else if (f.L.knee < 155 && f.R.knee < 155 && f.tilt < 35) {
    res.key = 'plie';
  } else if (f.tilt > 35) {
    res.key = 'tilt';
  } else if (f.headDrop) {
    res.key = 'contraction';
  } else if (f.releve) {
    res.key = 'releve';
  } else if (f.armsUp) {
    res.key = 'armsUp';
  }
  return res;
}

const LABELS = {
  pose: 'Posición',
  jump: 'Salto',
  floor: 'Suelo',
  kick: 'Kick / extensión',
  split: 'Split / grand battement',
  passe: 'Passé (retiré)',
  plie: 'Plié',
  tilt: 'Inclinación de torso',
  contraction: 'Contracción',
  releve: 'Relevé',
  armsUp: 'Brazos arriba',
};

export function labelFor(c) {
  const base = LABELS[c.key] || 'Posición';
  return c.side ? `${base} (${SIDES[c.side]})` : base;
}

/** Nombre de una postura suelta (p. ej. un fotograma añadido a mano). */
export function labelPose(lms, aspect) {
  return labelFor(classify(frameFeatures(lms, aspect), null));
}

// ---------- análisis completo ----------

const TAGS = {
  kicks: { name: 'Kicks', cue: 'Pierna de base estirada y cadera cuadrada; patear desde el muslo, no desde la rodilla, y bajar con control.' },
  extension: { name: 'Extensiones (adagio)', cue: 'Elevar desde glúteo e isquios y alargar por el empeine; hombros abajo y torso quieto.' },
  split: { name: 'Split / grand battement', cue: 'Empujar las dos piernas en oposición con caderas cuadradas; no hundirse en la pierna de base.' },
  passe: { name: 'Passé', cue: 'Punta del pie a la rodilla de base, rodilla en rotación y cadera nivelada.' },
  plie: { name: 'Plié', cue: 'Rodillas alineadas sobre los dedos del pie, talones al suelo y espalda larga.' },
  turns: { name: 'Giros', cue: 'Preparar en plié, subir a relevé alto, spot con la cabeza y core firme; terminar en plié controlado.' },
  jumps: { name: 'Saltos', cue: 'Impulsar desde el plié y los dedos; amortiguar la caída pasando de metatarso a talón con rodillas suaves.' },
  floor: { name: 'Suelo', cue: 'Bajar y subir con el abdomen; deslizar sin golpear rodillas ni caderas.' },
  tilt: { name: 'Inclinación / layout', cue: 'Alargar la columna antes de inclinar; abdomen activo y pelvis estable.' },
  contraction: { name: 'Contracción', cue: 'Iniciar en el abdomen bajo redondeando la columna, pelvis en retroversión y cuello largo.' },
  releve: { name: 'Relevé', cue: 'Metatarso alto, tobillos alineados (sin hoz) y peso sobre los dedos 1-2.' },
  armsUp: { name: 'Brazos arriba', cue: 'Hombros lejos de las orejas; brazos sostenidos desde la espalda.' },
  armsSide: { name: 'Brazos en segunda', cue: 'Codos sostenidos, brazos un poco por delante del cuerpo y dedos largos.' },
  wide: { name: 'Pies en segunda', cue: 'En posición abierta, rodillas hacia fuera sobre los pies y peso centrado.' },
  travel: { name: 'Desplazamiento', cue: 'Mantener la altura de la cabeza al viajar y mirar hacia la dirección del desplazamiento.' },
};

// Etiqueta principal (en orden de prioridad) -> categoría
const MAIN_TAGS = ['turns', 'jumps', 'split', 'kicks', 'extension', 'passe', 'floor', 'contraction', 'tilt', 'plie'];
const CATEGORY = {
  turns: 'Giros',
  jumps: 'Saltos',
  floor: 'Suelo',
  split: 'Kicks y extensiones',
  kicks: 'Kicks y extensiones',
  extension: 'Kicks y extensiones',
  passe: 'Centro',
  plie: 'Centro',
  contraction: 'Centro',
  tilt: 'Centro',
};

/**
 * @param {{t:number,lms:number[][],aspect:number}[]} frames
 * @param {{count?:number}} opts
 */
export function analyze(frames, opts = {}) {
  const count = opts.count || 4;
  if (!frames.length) {
    return { keyframes: [], technique: { summary: 'No se detectó a ninguna persona en el video.', tags: [], cues: [] }, category: '', suggestedTitle: '' };
  }

  const feats = frames.map((fr) => frameFeatures(fr.lms, fr.aspect));
  const ctx = { floorY: percentile(feats.map((f) => f.ankleY), 0.9), multi: feats.length > 1 };
  const cls = feats.map((f) => classify(f, ctx));

  // Movimiento entre fotogramas (pose normalizada, por segundo)
  const motion = feats.map((f, i) => {
    if (!i) return 0;
    const dt = Math.max(0.05, frames[i].t - frames[i - 1].t);
    return vdist(f.vec, feats[i - 1].vec) / dt;
  });
  const smooth = motion.map((_, i) => avg(motion.slice(Math.max(0, i - 1), i + 2)));

  // ---- etiquetas del ejercicio ----
  const n = feats.length;
  const countKey = (k) => cls.filter((c) => c.key === k).length;
  const enough = (k, min = 2) => countKey(k) >= Math.min(min, Math.max(1, Math.round(n * 0.05)));
  const tags = [];
  const details = [];

  const legFrames = cls.filter((c) => c.key === 'kick' || c.key === 'split');
  const legSide = sideOf(legFrames);
  if (legFrames.length && (enough('kick') || enough('split') || n === 1)) {
    const legMotion = avg(cls.map((c, i) => (c.key === 'kick' || c.key === 'split' ? smooth[i] : null)).filter((x) => x != null));
    if (enough('split', 1)) tags.push('split');
    if (legMotion < 1.2 && n > 1) tags.push('extension');
    else tags.push('kicks');
    details.push(`elevaciones de pierna ${legSide}`);
  }
  if (enough('passe')) {
    tags.push('passe');
    details.push(`passé ${sideOf(cls.filter((c) => c.key === 'passe'))}`);
  }
  if (enough('plie')) tags.push('plie');

  const turns = countTurns(feats);
  if (turns > 0) {
    tags.push('turns');
    details.push(turns === 1 ? 'un giro' : `unos ${turns} giros`);
  }
  const jumps = countEpisodes(cls.map((c) => c.jump));
  if (jumps > 0) {
    tags.push('jumps');
    details.push(jumps === 1 ? 'un salto' : `${jumps} saltos`);
  }
  if (enough('floor')) tags.push('floor');
  if (enough('tilt')) tags.push('tilt');
  if (enough('contraction')) tags.push('contraction');
  if (feats.filter((f) => f.releve).length >= Math.max(2, n * 0.15)) tags.push('releve');
  if (feats.filter((f) => f.armsUp).length >= Math.max(1, n * 0.2)) tags.push('armsUp');
  if (feats.filter((f) => f.armsSide).length >= Math.max(1, n * 0.2)) tags.push('armsSide');
  if (feats.filter((f) => f.feetWidth > 1.1).length >= Math.max(1, n * 0.3)) tags.push('wide');

  const xs = feats.map((f) => f.hipMid.x / f.T);
  if (n > 1 && Math.max(...xs) - Math.min(...xs) > 2.5) tags.push('travel');

  // ---- momentos clave ----
  const keyIdx = pickKeyframes(frames, feats, cls, smooth, count);
  const keyframes = keyIdx.map((i, k) => ({
    t: frames[i].t,
    aspect: Math.round(frames[i].aspect * 1000) / 1000,
    lms: frames[i].lms,
    label: keyIdx.length > 1 && cls[i].key === 'pose' && (k === 0 || k === keyIdx.length - 1) ? (k === 0 ? 'Inicio' : 'Final') : labelFor(cls[i]),
  }));

  // ---- texto ----
  // La etiqueta principal es la de más peso: los giros/saltos mandan aunque aparezcan poco.
  const main = MAIN_TAGS.find((t) => tags.includes(t));
  const category = main ? CATEGORY[main] : tags.includes('travel') ? 'Diagonales' : n > 1 ? 'Calentamiento / aislamientos' : 'Posición';
  const span = n > 1 ? frames[n - 1].t - frames[0].t : 0;
  const pace = n > 1 ? (avg(smooth) > 2 ? 'a ritmo rápido' : avg(smooth) > 0.9 ? 'a ritmo medio' : 'lento y controlado') : '';
  let summary;
  if (n === 1) {
    const label = labelFor(cls[0]);
    const others = tags.map((t) => TAGS[t].name).filter((name) => !label.startsWith(name.split(' ')[0]));
    summary = `Postura: ${label.toLowerCase()}.${others.length ? ` Con ${joinEs(others.map((s) => s.toLowerCase()))}.` : ''}`;
  } else {
    summary = `Ejercicio de ${category.toLowerCase()} de unos ${Math.round(span)} s, ${pace}.`;
    if (details.length) summary += ` Incluye ${joinEs(details)}.`;
    const extra = tags.filter((t) => ['plie', 'tilt', 'contraction', 'releve', 'armsUp', 'armsSide', 'wide', 'travel'].includes(t));
    if (extra.length) summary += ` Se observa: ${joinEs(extra.map((t) => TAGS[t].name.toLowerCase()))}.`;
    summary += ` Momentos clave: ${keyframes.map((k) => k.label.toLowerCase()).join(' → ')}.`;
  }

  let suggestedTitle = main ? TAGS[main].name : category;
  if (['kicks', 'extension', 'split'].includes(main) && legSide !== 'ambas piernas') suggestedTitle += ` (${legSide})`;
  const secondary = MAIN_TAGS.find((t) => t !== main && tags.includes(t) && ['jumps', 'split', 'kicks', 'extension', 'passe', 'floor'].includes(t));
  if (secondary) suggestedTitle += ` + ${TAGS[secondary].name.toLowerCase()}`;

  return {
    keyframes,
    technique: { summary, tags: tags.map((t) => TAGS[t].name), cues: tags.map((t) => TAGS[t].cue) },
    category,
    suggestedTitle,
  };
}

/**
 * Separa un video en ejercicios: tramos de movimiento separados por pausas (la persona
 * quieta o fuera de cuadro). Devuelve [{ start, end }] en segundos.
 * @param {{t:number,lms:number[][],aspect:number}[]} frames  poses detectadas, en orden
 * @param {{duration:number, minPause?:number, minLength?:number}} opts
 */
export function segmentExercises(frames, opts) {
  const { duration, minPause = 1.2, minLength = 2 } = opts;
  if (frames.length < 3) return frames.length ? [{ start: 0, end: duration }] : [];

  const feats = frames.map((f) => frameFeatures(f.lms, f.aspect));
  // Movimiento = cambio de postura + desplazamiento del cuerpo entero (saltos, pliés, viajes).
  const motion = feats.map((f, i) => {
    if (!i) return 0;
    const p = feats[i - 1];
    const dt = frames[i].t - frames[i - 1].t;
    if (dt > 1.5) return 0;
    const shift = Math.hypot(f.hipMid.x - p.hipMid.x, f.hipMid.y - p.hipMid.y) / f.T;
    return (vdist(f.vec, p.vec) + shift) / Math.max(0.05, dt);
  });
  const smooth = motion.map((_, i) => avg(motion.slice(Math.max(0, i - 2), i + 3)));
  // Umbral relativo al propio video: "quieto" es bastante menos que el movimiento típico.
  const thr = Math.max(0.15, percentile(smooth, 0.6) * 0.2);

  // Tramos activos, cortando donde hay pausas largas o la persona desaparece.
  const runs = [];
  let cur = null;
  for (let i = 0; i < frames.length; i++) {
    const t = frames[i].t;
    const gap = i > 0 && t - frames[i - 1].t > minPause;
    if (gap && cur) {
      runs.push(cur);
      cur = null;
    }
    if (smooth[i] >= thr) {
      if (!cur) cur = { start: i && !gap ? frames[i - 1].t : t, end: t, lastActive: t };
      cur.end = t;
      cur.lastActive = t;
    } else if (cur && t - cur.lastActive > minPause) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);

  // Une tramos muy cercanos y descarta los muy cortos (gestos sueltos).
  const merged = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && r.start - prev.end < minPause * 0.6) prev.end = r.end;
    else merged.push({ start: r.start, end: r.end });
  }
  const pad = 0.4;
  const segs = merged
    .filter((r) => r.end - r.start >= minLength)
    .map((r) => ({ start: Math.max(0, round2(r.start - pad)), end: Math.min(duration, round2(r.end + pad)) }));
  return segs.length ? segs.slice(0, 30) : [{ start: 0, end: duration }];
}

const round2 = (n) => Math.round(n * 100) / 100;

function pickKeyframes(frames, feats, cls, motion, count) {
  const n = frames.length;
  if (n <= count) return frames.map((_, i) => i);
  const mean = feats[0].vec.map((_, j) => avg(feats.map((f) => f.vec[j])));
  const ext = feats.map((f) => vdist(f.vec, mean));
  const maxExt = Math.max(...ext) || 1;
  const maxMot = Math.max(...motion) || 1;
  // Preferimos poses marcadas (lejos de la media), nítidas (poco movimiento) y con nombre.
  const score = feats.map((_, i) => (ext[i] / maxExt) * (1 - 0.6 * (motion[i] / maxMot)) + (cls[i].key !== 'pose' ? 0.35 : 0));
  const span = frames[n - 1].t - frames[0].t;
  const minGap = Math.max(0.3, span / (count * 2.5));

  // Fases: siempre el inicio y el final (el momento más quieto del último 20 %), y en medio
  // las posturas más marcadas.
  const chosen = [0];
  if (count >= 3) {
    let end = n - 1;
    for (let i = Math.floor(n * 0.8); i < n; i++) if (motion[i] < motion[end]) end = i;
    if (frames[end].t - frames[0].t >= minGap) chosen.push(end);
  }
  while (chosen.length < count) {
    let best = -1, bestVal = -Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen.some((c) => Math.abs(frames[c].t - frames[i].t) < minGap)) continue;
      const novelty = Math.min(...chosen.map((c) => vdist(feats[c].vec, feats[i].vec)));
      // Variedad: penaliza repetir el mismo tipo de postura que ya está elegida.
      const repeated = chosen.some((c) => cls[c].key === cls[i].key && cls[i].key !== 'pose');
      const val = score[i] * (0.4 + novelty) * (repeated ? 0.45 : 1);
      if (val > bestVal) { bestVal = val; best = i; }
    }
    if (best < 0) break;
    chosen.push(best);
  }
  return chosen.sort((a, b) => a - b);
}

// Cada vez que la persona pasa de frente a espaldas cambia el signo de "facing"; dos cambios ≈ una vuelta.
function countTurns(feats) {
  let state = 0, flips = 0;
  for (const f of feats) {
    const s = f.facing > 0.18 ? 1 : f.facing < -0.18 ? -1 : 0;
    if (s && state && s !== state) flips++;
    if (s) state = s;
  }
  return flips >= 2 ? Math.max(1, Math.floor(flips / 2)) : 0;
}

function countEpisodes(bools) {
  let c = 0;
  for (let i = 0; i < bools.length; i++) if (bools[i] && !bools[i - 1]) c++;
  return c;
}

function sideOf(list) {
  const l = list.filter((c) => c.side === 'L').length;
  const r = list.filter((c) => c.side === 'R').length;
  if (l && r && Math.min(l, r) / Math.max(l, r) > 0.35) return 'ambas piernas';
  return r >= l ? 'derecha' : 'izquierda';
}

function joinEs(items) {
  return items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}
function avg(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function percentile(a, p) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
