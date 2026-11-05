// IA en la nube (Premium). La app no habla con el proveedor: envía la licencia y las viñetas al
// servidor Premium (premium-server/), que comprueba la cuota y guarda la clave del proveedor.
// La licencia se queda en este ordenador y solo se envía a ese servidor.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as google from './google.js';

// Dirección del servidor Premium. JR_PREMIUM_URL la cambia para hacer pruebas.
const BACKEND = process.env.JR_PREMIUM_URL || 'https://diva-routine-premium.premium-server.workers.dev';
const TIMEOUT_MS = 150_000;

// cost: créditos que gasta cada viñeta. La lista buena viene del servidor (/models); esta es la de reserva.
const MODELS = [
  { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1 (recomendado)', cost: 1 },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2', cost: 2 },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro', cost: 4 },
];
// free: el dibujo que ya hace la app, sin pasar por la nube.
const FREE_STYLE = { id: 'app', label: 'Recorte ilustrado', free: true };
// Los Premium se piden al servidor, que los gestiona desde el panel. Esta lista es para cuando no responde.
const STYLES = [
  { id: 'ink', label: 'Línea en blanco y negro' },
  { id: 'color', label: 'Ilustración a color' },
  { id: 'muscle', label: 'Músculos trabajados' },
  { id: 'comic', label: 'Cómic deportivo' },
  { id: 'botanic', label: 'Ilustración botánica' },
  { id: 'watercolor', label: 'Acuarela' },
  { id: '3d', label: 'Personaje 3D' },
  { id: 'neon', label: 'Neón anatómico' },
  { id: 'atlas', label: 'Atlas anatómico' },
  { id: 'cartoon', label: 'Cartoon alegre' },
];

const fail = (status, message) => Object.assign(new Error(message), { status });

let file = null;
let saved = {}; // { model, style, styles, license: { key, instance }, active, plan, used, limit }

const write = () => fsp.writeFile(file, JSON.stringify(saved), { mode: 0o600 });
const models = () => saved.models || MODELS;
const model = () => models().find((m) => m.id === saved.model) || models()[0];
// El cuadro de prompt tiene su motor: el panel decide cuáles se pueden usar ahí.
const promptModels = () => models().filter((m) => m.prompt !== false);
const promptModel = () => promptModels().find((m) => m.id === saved.promptModel) || promptModels().find((m) => m.id === model().id) || promptModels()[0] || model();
const styleList = () => [FREE_STYLE, ...(saved.styles || STYLES)];
const style = () => styleList().find((s) => s.id === saved.style) || FREE_STYLE;

export function initAi(dir) {
  file = path.join(dir, 'ai.json');
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    saved = {};
  }
}

export const status = () => ({
  available: Boolean(BACKEND),
  premium: Boolean(saved.active),
  licensed: Boolean(saved.license),
  kind: saved.kind || (!saved.license ? 'account' : saved.license.key?.startsWith('DIVA-') ? 'comp' : 'paid'),
  expires: saved.expires || null,
  plan: saved.plan || null,
  days: saved.days || null,
  used: saved.used || 0,
  extra: saved.extra || 0,
  limit: saved.limit || 0,
  model: model().id,
  promptModel: promptModel().id,
  style: style().id,
  models: models(),
  styles: styleList(),
});

async function call(route, body) {
  if (!BACKEND) throw fail(503, 'Premium todavía no está disponible.');
  let res;
  try {
    res = await fetch(`${BACKEND}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw fail(502, e.name === 'TimeoutError' ? 'El servicio de IA tardó demasiado en responder. Prueba otra vez.' : 'No se pudo conectar con el servicio de IA. Revisa tu conexión.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw fail(res.status, data?.error || `Error ${res.status}`);
  return data;
}

const licenseFields = () => ({ license_key: saved.license?.key, instance_id: saved.license?.instance });

// Sin clave de licencia, el Premium puede venir de la cuenta de Google (se activa en el panel).
async function credentials() {
  if (saved.license) return licenseFields();
  const token = google.connected() ? await google.identityToken() : null;
  return token ? { google_token: token } : null;
}

function applyPlan(r) {
  Object.assign(saved, { active: true, plan: r.plan, used: r.used, extra: r.extra || 0, limit: r.limit, days: r.days, kind: r.kind, expires: r.expires });
}

async function refreshModels() {
  try {
    const res = await fetch(`${BACKEND}/models`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    saved.models = (await res.json()).models;
    await write();
  } catch {
    // Sin conexión sigue la última lista.
  }
}

async function refreshStyles() {
  try {
    const res = await fetch(`${BACKEND}/styles`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    const { styles } = await res.json();
    saved.styles = styles.map((s) => ({ id: s.id, label: s.label, img: s.thumb ? `${BACKEND}/styles/thumb/${s.thumb}` : '' }));
    await write();
  } catch {
    // Sin conexión sigue la última lista.
  }
}

/** Al día con el servidor. Sin conexión se conserva lo último sabido. */
export async function refresh() {
  if (!BACKEND) return;
  await Promise.all([refreshModels(), refreshStyles()]);
  try {
    const who = await credentials();
    if (!who) {
      saved.active = false;
      await write();
      return;
    }
    applyPlan(await call('/status', who));
  } catch (e) {
    if (e.status !== 403) return;
    saved.active = false;
  }
  await write();
}

export async function activate(value) {
  const key = String(value ?? '').trim();
  if (!key) throw fail(400, 'Pega tu clave de licencia.');
  const r = await call('/activate', { license_key: key });
  saved.license = { key, instance: r.instance_id };
  applyPlan(r);
  await write();
}

export async function deactivate() {
  if (saved.license) await call('/deactivate', licenseFields());
  for (const k of ['license', 'active', 'plan', 'used', 'limit', 'days', 'kind', 'expires']) delete saved[k];
  await write();
}

/** Canjea la clave de un pack de créditos sueltos. */
export async function redeemPack(value) {
  const key = String(value ?? '').trim();
  if (!key) throw fail(400, 'Pega la clave de tu pack.');
  if (!saved.active) throw fail(402, 'Necesitas Premium activo para usar créditos sueltos.');
  applyPlan(await call('/credits', { ...(await credentials()), pack_key: key }));
  await write();
}

/** Lo elegido en el Creador de rutinas: se recuerda en este ordenador. */
export async function setChoice({ model: m, promptModel: pm, style: s }) {
  if (m !== undefined && !models().some((x) => x.id === m)) throw fail(400, 'Ese motor no existe.');
  if (pm !== undefined && !promptModels().some((x) => x.id === pm)) throw fail(400, 'Ese motor no existe.');
  if (s !== undefined && !styleList().some((x) => x.id === s)) throw fail(400, 'Ese estilo no existe.');
  if (m !== undefined) saved.model = m;
  if (pm !== undefined) saved.promptModel = pm;
  if (s !== undefined) saved.style = s;
  await write();
}

/** image: la viñeta en JPEG (base64). references: fases ya hechas, { data: Buffer, mime }. */
export async function redraw(image, references = [], prompt = '') {
  if (!saved.active) throw fail(402, 'Mejorar dibujos con IA es una función Premium.');
  if (style().free) throw fail(400, 'Ese estilo es el dibujo normal de la app. Elige un estilo Premium.');
  const r = await call('/redraw', {
    ...(await credentials()),
    model: (prompt.trim() ? promptModel() : model()).id,
    style: style().id,
    prompt,
    image,
    references: references.map((x) => ({ mime: x.mime, data: x.data.toString('base64') })),
  }).catch(async (e) => {
    if (e.status === 403) {
      saved.active = false;
      await write();
    }
    throw e;
  });
  applyPlan(r);
  await write();
  return { data: Buffer.from(r.image.data, 'base64'), ext: r.image.mime_type === 'image/png' ? 'png' : 'jpg' };
}
