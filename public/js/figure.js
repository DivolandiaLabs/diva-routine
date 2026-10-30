// Dibuja una pose (33 puntos de MediaPipe) como ilustración de tabla de entrenamiento, con un
// estilo único para todos los ejercicios: figura con volumen (miembros con forma, maillot,
// cabeza con moño, pies en punta) y contorno de tinta. Lado derecho de la persona en color
// fuerte y el izquierdo en claro.
// En una secuencia de fases, todas comparten encuadre y suelo (se ve si sube, baja o se
// desplaza), y cada fase lleva la silueta tenue de la anterior y flechas con el recorrido.
// Los puntos se guardan normalizados [x, y, z, visibilidad] en el marco del video, así que
// se corrige con `aspect` (ancho/alto del video) para no deformar la figura.

export const LM = {
  nose: 0, lEye: 2, rEye: 5, lEar: 7, rEar: 8,
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lIdx: 19, rIdx: 20,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
  lHeel: 29, rHeel: 30, lFoot: 31, rFoot: 32,
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const C = {
  ink: 'var(--fig-ink, #2b2622)',
  body: 'var(--fig-body, #3a3330)', // maillot
  skin: 'var(--fig-skin, #f2dcc6)',
  hair: 'var(--fig-hair, #2b2622)',
  right: 'var(--fig-accent, #c4553a)',
  left: 'var(--fig-left, #e7ad99)',
  ghost: 'var(--fig-ghost, #cdbca6)',
  floor: 'var(--fig-floor, #d9c9b4)',
  arrow: 'var(--fig-accent, #c4553a)',
  bg: 'var(--fig-bg, #fbf6ef)',
};

const f2 = (n) => (Math.round(n * 1000) / 1000).toString();
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => (len(a) ? mul(a, 1 / len(a)) : { x: 0, y: -1 });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a, b) => lerp(a, b, 0.5);

// ---------- cuerpo ----------

/** Puntos del cuerpo (corregidos de aspecto) y medidas derivadas. */
function body(lms, aspect) {
  const P = (i) => ({ x: lms[i][0] * aspect, y: lms[i][1] });
  const p = Object.fromEntries(Object.entries(LM).map(([k, i]) => [k, P(i)]));
  const shMid = mid(p.lSh, p.rSh);
  const hipMid = mid(p.lHip, p.rHip);
  const T = len(sub(shMid, hipMid)) || 0.2; // largo del tronco: la escala de todo
  const up = norm(sub(shMid, hipMid));
  const ears = mid(p.lEar, p.rEar);
  const headR = T * 0.21;
  const head = add(lerp(ears, p.nose, 0.3), mul(up, headR * 0.15));
  // El pelo va hacia la nuca (lo contrario de la nariz) y hacia arriba.
  const hairDir = norm(add(sub(ears, p.nose), mul(up, headR * 0.9)));
  // z de MediaPipe: más pequeño = más cerca de la cámara.
  const z = (i) => lms[i][2] || 0;
  const rightNear = z(LM.rHip) + z(LM.rSh) <= z(LM.lHip) + z(LM.lSh);
  return { p, shMid, hipMid, T, up, head, headR, hairDir, rightNear };
}

/** Caja de lo que ocupa la figura (para encuadrarla). */
function extent(B) {
  const pts = Object.entries(B.p).filter(([k]) => !/Eye|Ear|nose/.test(k)).map(([, v]) => v);
  pts.push(add(B.head, { x: -B.headR * 1.6, y: -B.headR * 1.6 }), add(B.head, { x: B.headR * 1.6, y: B.headR * 1.6 }));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const floorY = Math.max(B.p.lHeel.y, B.p.rHeel.y, B.p.lFoot.y, B.p.rFoot.y, B.p.lAn.y, B.p.rAn.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), floorY, T: B.T };
}

/** Encuadre cuadrado con margen a partir de una o varias cajas. */
function frameOf(boxes) {
  const minX = Math.min(...boxes.map((b) => b.minX)), maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY)), maxY = Math.max(...boxes.map((b) => b.maxY));
  const T = Math.max(...boxes.map((b) => b.T));
  const floorY = Math.max(...boxes.map((b) => b.floorY));
  const pad = T * 0.4;
  let x = minX - pad, y = minY - pad, w = maxX - minX + pad * 2, h = Math.max(maxY, floorY + T * 0.15) - minY + pad * 2;
  if (w > h) ((y -= (w - h) / 2), (h = w));
  else ((x -= (h - w) / 2), (w = h));
  return { x, y, w, h, floorY, T };
}

/**
 * Encuadre común para las fases de un ejercicio: todas a la misma escala y con el mismo
 * suelo. Si la persona se desplaza mucho, cada fase va con su propio encuadre (null).
 */
export function sequenceFrame(keyframes) {
  const valid = (keyframes || []).filter((k) => k?.lms?.length >= 33);
  if (valid.length < 2) return null;
  const boxes = valid.map((k) => extent(body(k.lms, k.aspect || 1)));
  const fr = frameOf(boxes);
  const single = Math.max(...boxes.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)));
  return fr.w > single * 2.3 ? null : fr;
}

/** Miembro con volumen: cadena de cápsulas (trapecios + círculos) con grosor variable. */
function capsules(points, widths) {
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const a = points[i], ra = widths[i] / 2;
    d += `M${f2(a.x + ra)},${f2(a.y)}A${f2(ra)},${f2(ra)} 0 1 0 ${f2(a.x - ra)},${f2(a.y)}A${f2(ra)},${f2(ra)} 0 1 0 ${f2(a.x + ra)},${f2(a.y)}Z`;
    if (i === points.length - 1) break;
    const b = points[i + 1], rb = widths[i + 1] / 2;
    const n = norm({ x: -(b.y - a.y), y: b.x - a.x });
    if (!len(sub(b, a))) continue;
    const a1 = add(a, mul(n, ra)), a2 = add(a, mul(n, -ra)), b1 = add(b, mul(n, rb)), b2 = add(b, mul(n, -rb));
    d += `M${f2(a1.x)},${f2(a1.y)}L${f2(b1.x)},${f2(b1.y)}L${f2(b2.x)},${f2(b2.y)}L${f2(a2.x)},${f2(a2.y)}Z`;
  }
  return d;
}

/** Curva cerrada suave por los puntos (Catmull-Rom). */
function closedCurve(pts) {
  const n = pts.length;
  let d = `M${f2(pts[0].x)},${f2(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6)), c2 = add(p2, mul(sub(p3, p1), -1 / 6));
    d += `C${f2(c1.x)},${f2(c1.y)} ${f2(c2.x)},${f2(c2.y)} ${f2(p2.x)},${f2(p2.y)}`;
  }
  return d + 'Z';
}

const circle = (c, r) => `M${f2(c.x + r)},${f2(c.y)}A${f2(r)},${f2(r)} 0 1 0 ${f2(c.x - r)},${f2(c.y)}A${f2(r)},${f2(r)} 0 1 0 ${f2(c.x + r)},${f2(c.y)}Z`;

/** Formas del cuerpo, cada una { d, fill }, en orden de pintado (de atrás a delante). */
function shapes(B) {
  const { p, T } = B;
  const leg = (hip, kn, an, heel, foot) => ({
    leg: capsules([hip, lerp(hip, kn, 0.35), kn, lerp(kn, an, 0.35), an], [0.25, 0.26, 0.15, 0.16, 0.09].map((w) => w * T)),
    foot: capsules([heel, an, lerp(an, foot, 0.5), foot], [0.08, 0.09, 0.07, 0.04].map((w) => w * T)),
  });
  const arm = (sh, el, wr, idx) => ({
    arm: capsules([sh, lerp(sh, el, 0.4), el, lerp(el, wr, 0.4), wr], [0.15, 0.14, 0.1, 0.11, 0.075].map((w) => w * T)),
    hand: capsules([wr, lerp(wr, idx, 1.1)], [0.08, 0.06].map((w) => w * T)),
  });
  const L = leg(p.lHip, p.lKn, p.lAn, p.lHeel, p.lFoot), R = leg(p.rHip, p.rKn, p.rAn, p.rHeel, p.rFoot);
  const LA = arm(p.lSh, p.lEl, p.lWr, p.lIdx), RA = arm(p.rSh, p.rEl, p.rWr, p.rIdx);

  // Tronco: hombros redondeados, cintura algo más estrecha y caderas. De perfil los dos
  // hombros (o caderas) caen casi en el mismo punto: se les da un ancho mínimo para que el
  // cuerpo tenga volumen.
  const across = { x: -B.up.y, y: B.up.x };
  const widen = (a, b, c, min) => {
    const w = (b.x - a.x) * across.x + (b.y - a.y) * across.y;
    if (Math.abs(w) >= min) return [a, b];
    const s = w < 0 ? -1 : 1;
    return [add(c, mul(across, (-s * min) / 2)), add(c, mul(across, (s * min) / 2))];
  };
  const [lSh, rSh] = widen(p.lSh, p.rSh, B.shMid, T * 0.38);
  const [lHip, rHip] = widen(p.lHip, p.rHip, B.hipMid, T * 0.34);
  const hipC = B.hipMid;
  const waist = (sh, hip) => {
    const w = lerp(sh, hip, 0.58);
    return lerp(w, lerp(hipC, B.shMid, 0.42), 0.18);
  };
  const torso = closedCurve([
    lerp(lSh, B.shMid, 0.05), lerp(rSh, B.shMid, 0.05),
    waist(rSh, rHip), lerp(rHip, hipC, -0.12),
    add(hipC, mul(B.up, -T * 0.1)),
    lerp(lHip, hipC, -0.12), waist(lSh, lHip),
  ]);
  const neck = capsules([B.shMid, lerp(B.shMid, B.head, 0.8)], [0.12 * T, 0.1 * T]);
  const r = B.headR;
  const hair = circle(add(B.head, mul(B.hairDir, r * 0.12)), r * 1.02);
  const bun = circle(add(B.head, mul(B.hairDir, r * 1.05)), r * 0.4);
  const face = circle(add(B.head, mul(B.hairDir, -r * 0.14)), r * 0.9);

  // Las piernas salen de debajo del maillot (van detrás del tronco); de los brazos, el del
  // lado más cercano a la cámara va delante y el otro detrás.
  const legs = { left: { d: L.leg + L.foot, fill: C.left }, right: { d: R.leg + R.foot, fill: C.right } };
  const arms = { left: { d: LA.arm + LA.hand, fill: C.left }, right: { d: RA.arm + RA.hand, fill: C.right } };
  const [far, near] = B.rightNear ? ['left', 'right'] : ['right', 'left'];
  return [
    arms[far],
    legs[far],
    legs[near],
    { d: neck, fill: C.skin },
    { d: torso, fill: C.body },
    arms[near],
    { d: bun + hair, fill: C.hair },
    { d: face, fill: C.skin },
  ];
}

/** Cada forma: primero el contorno (trazo grueso), luego el relleno encima: queda una silueta limpia. */
function renderBody(B, { ghost = false } = {}) {
  const sw = B.T * 0.045;
  return shapes(B)
    .map((s) => ghost
      ? `<path d="${s.d}" fill="${C.ghost}"/>`
      : `<path d="${s.d}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${f2(sw * 2)}" stroke-linejoin="round"/><path d="${s.d}" fill="${s.fill}"/>`)
    .join('');
}

// ---------- flechas de movimiento ----------

/** Flechas desde la fase anterior: las 1–2 partes que más se han movido (manos, pies, cabeza, cadera). */
function motionArrows(A, B) {
  const T = B.T;
  const parts = [
    ['rWr', 'brazo'], ['lWr', 'brazo-i'], ['rFoot', 'pierna'], ['lFoot', 'pierna-i'],
  ].map(([k, g]) => ({ from: A.p[k], to: B.p[k], g }));
  parts.push({ from: A.head, to: B.head, g: 'cabeza' }, { from: A.hipMid, to: B.hipMid, g: 'cadera' });
  const moved = parts
    .map((m) => ({ ...m, dist: len(sub(m.to, m.from)) }))
    .filter((m) => m.dist > T * 0.35)
    .sort((a, b) => b.dist - a.dist);
  const chosen = [];
  for (const m of moved) {
    if (chosen.length >= 2) break;
    if (chosen.some((c) => c.g.split('-')[0] === m.g.split('-')[0])) continue;
    chosen.push(m);
  }
  const sw = T * 0.035;
  return chosen.map(({ from, to }) => {
    // Curva hacia fuera del cuerpo, con punta de flecha en la posición actual.
    const dir = sub(to, from);
    let n = norm({ x: -dir.y, y: dir.x });
    if ((n.x * (mid(from, to).x - B.hipMid.x) + n.y * (mid(from, to).y - B.hipMid.y)) < 0) n = mul(n, -1);
    const ctrl = add(mid(from, to), mul(n, len(dir) * 0.25));
    const tip = norm(sub(to, ctrl));
    const back = add(to, mul(tip, -T * 0.13));
    const side = { x: -tip.y, y: tip.x };
    const end = add(to, mul(tip, -T * 0.06)); // la línea acaba antes de la punta
    const h1 = add(back, mul(side, T * 0.07)), h2 = add(back, mul(side, -T * 0.07));
    return `<path d="M${f2(from.x)},${f2(from.y)}Q${f2(ctrl.x)},${f2(ctrl.y)} ${f2(end.x)},${f2(end.y)}" fill="none" stroke="${C.arrow}" stroke-width="${f2(sw)}" stroke-linecap="round" stroke-dasharray="${f2(sw * 2.4)} ${f2(sw * 1.6)}" opacity="0.9"/>` +
      `<path d="M${f2(to.x)},${f2(to.y)}L${f2(h1.x)},${f2(h1.y)}L${f2(h2.x)},${f2(h2.y)}Z" fill="${C.arrow}"/>` +
      `<circle cx="${f2(from.x)}" cy="${f2(from.y)}" r="${f2(sw * 1.3)}" fill="${C.bg}" stroke="${C.arrow}" stroke-width="${f2(sw * 0.8)}"/>`;
  }).join('');
}

// ---------- figura ----------

/**
 * Devuelve un string SVG con la figura.
 * @param {number[][]} lms  33 puntos [x,y,z,v]
 * @param {object} opts { aspect, size, number, label, prev (pose anterior: silueta tenue + flechas), frame (de sequenceFrame), emptyText }
 */
export function figureSVG(lms, opts = {}) {
  const aspect = opts.aspect || 1;
  const size = opts.size || 220;
  if (!lms || lms.length < 33) return emptyFigure(size, opts);

  const B = body(lms, aspect);
  const prevLms = opts.prev || opts.ghost;
  const A = prevLms && prevLms.length >= 33 ? body(prevLms, aspect) : null;
  const fr = opts.frame || frameOf([extent(B), ...(A ? [extent(A)] : [])]);
  const { x, y, w, h } = fr;
  const T = fr.T;

  // Suelo: sombra bajo los pies cuando están en el suelo, y línea discontinua.
  const floorY = fr.floorY + T * 0.05;
  const lowFoot = Math.max(B.p.lFoot.y, B.p.rFoot.y, B.p.lHeel.y, B.p.rHeel.y);
  const lift = Math.max(0, floorY - lowFoot) / T; // altura del salto, en "troncos"
  const shadowX = (B.p.lAn.x + B.p.rAn.x) / 2;
  const shadow = `<ellipse cx="${f2(shadowX)}" cy="${f2(floorY)}" rx="${f2(T * 0.55 * Math.max(0.45, 1 - lift * 0.4))}" ry="${f2(T * 0.07)}" fill="${C.floor}" opacity="${f2(Math.max(0.25, 0.7 - lift * 0.3))}"/>`;
  const floor = `<line x1="${f2(x + w * 0.06)}" y1="${f2(floorY)}" x2="${f2(x + w * 0.94)}" y2="${f2(floorY)}" stroke="${C.floor}" stroke-width="${f2(T * 0.025)}" stroke-linecap="round" stroke-dasharray="${f2(T * 0.08)} ${f2(T * 0.06)}"/>`;

  const ghost = A ? `<g opacity="0.45">${renderBody(A, { ghost: true })}</g>` : '';
  const arrows = A ? motionArrows(A, B) : '';
  const badge = opts.number != null
    ? `<g><circle cx="${f2(x + w * 0.1)}" cy="${f2(y + h * 0.1)}" r="${f2(w * 0.07)}" fill="${C.right}"/><text x="${f2(x + w * 0.1)}" y="${f2(y + h * 0.1)}" text-anchor="middle" dominant-baseline="central" font-size="${f2(w * 0.08)}" font-family="system-ui, sans-serif" font-weight="700" fill="#fff">${opts.number}</text></g>`
    : '';

  return `<svg xmlns="${SVG_NS}" viewBox="${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)}" width="${size}" height="${size}" class="figure" role="img" aria-label="${escapeAttr(opts.label || 'Postura')}">
<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(w * 0.06)}" fill="${C.bg}"/>
${floor}${shadow}${ghost}${renderBody(B)}${arrows}${badge}
</svg>`;
}

/** Pie de cada fase: «Inicio», «Fase 2 · Passé», «Final · Relevé»… */
export function phaseCaption(keyframes, j) {
  const n = keyframes.length;
  const name = n < 2 ? '' : j === 0 ? 'Inicio' : j === n - 1 ? 'Final' : `Fase ${j + 1}`;
  const label = keyframes[j]?.label || '';
  if (!name) return label;
  return !label || label === name || ['Inicio', 'Final'].includes(label) ? name : `${name} · ${label}`;
}

/**
 * Las fases de un ejercicio, listas para pintar: la viñeta (la persona real dibujada) si la
 * hay; si no, la figura con encuadre común, silueta de la anterior y flechas.
 */
export function phasesSVG(keyframes, { size = 140, numbers = true } = {}) {
  const fr = sequenceFrame(keyframes);
  return (keyframes || []).map((k, j) => {
    const caption = phaseCaption(keyframes, j);
    return {
      svg: k.img
        ? `<img class="phase-img" src="/media/${encodeURI(k.img)}" alt="${escapeAttr(caption)}" loading="lazy">`
        : figureSVG(k.lms, { aspect: k.aspect, size, number: numbers ? j + 1 : null, label: caption, prev: keyframes[j - 1]?.lms, frame: fr }),
      caption,
      t: k.t,
      img: Boolean(k.img),
    };
  });
}

function emptyFigure(size, opts) {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100" width="${size}" height="${size}" class="figure empty" role="img" aria-label="Sin postura">
<rect width="100" height="100" rx="6" fill="${C.bg}"/>
<text x="50" y="52" text-anchor="middle" font-size="9" font-family="system-ui, sans-serif" fill="var(--muted, #8a7f73)">${escapeAttr(opts.emptyText || 'Sin analizar')}</text>
</svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
