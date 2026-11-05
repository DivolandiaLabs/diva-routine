// Servidor Premium (Cloudflare Worker). Comprueba la licencia de Lemon Squeezy, lleva la cuenta de
// créditos de cada cuota y llama al proveedor de IA con la clave del proyecto, que nunca llega a la app.
// Secretos y ajustes: ver wrangler.toml. El cobro está solo en licenseCall: para cambiar de
// plataforma basta con sustituir eso y planOf.

import { LIMITS, MODELS, COSTS, LABELS, START_OFF } from './catalog.js';
import { sha256, isCompKey, isBlocked, modelIsOff, promptIsOff, compOf, grantOf, touch, record } from './db.js';
import { listStyles, styleOf, getImage, isImageKey } from './styles.js';
import { callEngine } from './engines.js';

const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

const MAX_IMAGE = 4_000_000; // caracteres en base64
const MAX_REFS = 4;
const MAX_PROMPT = 500; // caracteres de instrucciones de la persona

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status, error) => Object.assign(new Error(error), { status });
const BLOCKED = 'Esta licencia está bloqueada. Escríbenos si crees que es un error.';
const NO_GRANT = 'Esta cuenta no tiene Premium.';

async function licenseCall(env, action, fields) {
  const res = await fetch(`${env.LS_URL || LS_API}/${action}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw fail(502, 'No se pudo comprobar la licencia. Prueba otra vez.');
  return data;
}

/** La cuota de una licencia, o error si no es de este producto o ya no está activa. */
function planOf(env, data) {
  const m = data.meta || {};
  if (String(m.store_id) !== String(env.STORE_ID) || String(m.product_id) !== String(env.PRODUCT_ID)) throw fail(403, 'Esa licencia no es de Diva Routine Premium.');
  const plan = { [env.VARIANT_WEEK]: 'week', [env.VARIANT_MONTH]: 'month', [env.VARIANT_YEAR]: 'year' }[String(m.variant_id)];
  if (!plan) throw fail(403, 'Esa licencia no corresponde a ninguna cuota.');
  return plan;
}

/** Número de periodo de la cuota, contado desde que se creó la licencia. */
export function periodOf(plan, createdAt, now = new Date(), days = null) {
  const from = new Date(createdAt);
  if (plan === 'custom') return Math.floor((now - from) / (days * 864e5));
  if (plan === 'week') return Math.floor((now - from) / (7 * 864e5));
  if (plan === 'year') return Math.floor((now - from) / (365 * 864e5));
  const months = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + now.getUTCMonth() - from.getUTCMonth();
  return now.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

const usageKey = ({ lic, plan, days }) => `u:${lic.id}:${periodOf(plan, lic.created_at, new Date(), days)}`;
const limitOf = ({ plan, limit }) => limit ?? LIMITS[plan];
const getUsed = async (env, key) => Number(await env.USAGE.get(key)) || 0;
// kind: paid (Lemon Squeezy), comp (clave de cortesía) o account (activado en el panel). expires, en ms.
const summary = (info, used, extra = 0) => ({ plan: info.plan, used, extra, limit: limitOf(info), days: info.days ?? null, kind: info.kind, expires: info.expires ?? null });

// Créditos sueltos: un saldo por cuenta que no caduca y se gasta cuando se acaba la cuota.
const extraKey = (info) => `x:${info.hash}`;
const getExtra = async (env, info) => Number(await env.USAGE.get(extraKey(info))) || 0;

/** Canjea la clave de un pack, una sola vez, y suma sus créditos a la cuenta. */
async function redeem(env, body) {
  const info = await checked(env, body);
  const key = String(body.pack_key || '').trim();
  if (!key) throw fail(400, 'Pega la clave de tu pack.');
  const spent = `pack:${await sha256(key)}`;
  if (await env.USAGE.get(spent)) throw fail(400, 'Esa clave ya se ha canjeado.');
  const data = await licenseCall(env, 'activate', { license_key: key, instance_name: 'Diva Routine' });
  if (!data.activated) throw fail(400, data.error || 'No se pudo canjear esa clave.');
  const m = data.meta || {};
  const credits = { [env.VARIANT_PACK_100]: 100, [env.VARIANT_PACK_200]: 200, [env.VARIANT_PACK_500]: 500, [env.VARIANT_PACK_1000]: 1000 }[String(m.variant_id)];
  if (String(m.store_id) !== String(env.STORE_ID) || String(m.product_id) !== String(env.PACK_PRODUCT_ID) || !credits) throw fail(403, 'Esa clave no es de un pack de créditos.');
  await env.USAGE.put(spent, '1');
  const extra = (await getExtra(env, info)) + credits;
  await env.USAGE.put(extraKey(info), String(extra));
  return summary(info, await getUsed(env, usageKey(info)), extra);
}

const paidExpiry = (data) => (data.license_key?.expires_at ? Date.parse(data.license_key.expires_at) : null);

async function checked(env, body) {
  if (body.google_token) return grantChecked(env, body.google_token);
  const { license_key: key, instance_id: instance } = body;
  if (!key || !instance) throw fail(403, 'Falta la licencia.');
  const hash = await sha256(key);
  if (await isBlocked(env, hash)) throw fail(403, BLOCKED);
  if (isCompKey(key)) return compChecked(env, key, hash);
  const data = await licenseCall(env, 'validate', { license_key: key, instance_id: instance });
  if (!data.valid || data.license_key?.status !== 'active') throw fail(403, 'Tu suscripción Premium no está activa.');
  const plan = planOf(env, data);
  await touch(env, { hash, key, kind: 'paid', plan, email: data.meta?.customer_email });
  return { lic: data.license_key, plan, hash, kind: 'paid', expires: paidExpiry(data) };
}

// Licencia de cortesía, creada en el panel: no pasa por Lemon Squeezy.
async function compChecked(env, key, hash) {
  const comp = await compOf(env, hash);
  if (!comp) throw fail(403, 'Esa licencia no existe o ha caducado.');
  await touch(env, { hash, key, kind: 'comp', plan: comp.plan });
  return { lic: { id: hash, created_at: new Date(comp.created).toISOString() }, plan: comp.plan, hash, kind: 'comp', expires: comp.expires };
}

// Premium concedido en el panel. El id_token de Google prueba de qué cuenta se trata, sin dar
// acceso a nada de ella; lo comprueba el propio Google.
async function grantChecked(env, idToken) {
  const res = await fetch(`${env.TOKENINFO_URL || TOKENINFO}?id_token=${encodeURIComponent(idToken)}`).catch(() => null);
  if (!res || res.status >= 500) throw fail(502, 'No se pudo comprobar tu cuenta. Prueba otra vez.');
  const info = res.ok ? await res.json().catch(() => null) : null;
  const valid = info?.email && String(info.email_verified) === 'true' && (!env.GOOGLE_CLIENT_ID || info.aud === env.GOOGLE_CLIENT_ID);
  if (!valid) throw fail(403, NO_GRANT);
  const email = info.email.toLowerCase();
  const grant = await grantOf(env, email);
  if (!grant) throw fail(403, NO_GRANT);
  const hash = await sha256(`user:${email}`);
  if (await isBlocked(env, hash)) throw fail(403, BLOCKED);
  await touch(env, { hash, key: email, kind: 'comp', plan: grant.plan, email });
  return { lic: { id: hash, created_at: new Date(grant.created).toISOString() }, plan: grant.plan, hash, kind: 'account', expires: grant.expires, limit: grant.vignettes ?? undefined, days: grant.period_days ?? undefined };
}

async function redraw(env, body) {
  const { model, style, image, references = [] } = body;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT) : '';
  if (!MODELS[model]) throw fail(400, 'Motor o estilo desconocido.');
  const ficha = await styleOf(env, style);
  if (!ficha) throw fail(400, 'Motor o estilo desconocido.');
  if (!ficha.activo) throw fail(400, 'Ese estilo no está disponible ahora. Elige otro.');
  const sizes = [image, ...references.map((r) => r?.data)];
  if (references.length > MAX_REFS || sizes.some((d) => typeof d !== 'string' || !d || d.length > MAX_IMAGE)) throw fail(400, 'Imagen no válida.');
  if (references.some((r) => !/^image\/(jpeg|png)$/.test(r.mime))) throw fail(400, 'Imagen no válida.');
  if (await modelIsOff(env, model)) throw fail(400, 'Ese motor no está disponible ahora. Elige otro.');
  if (prompt && await promptIsOff(env, model)) throw fail(400, 'Ese motor no está disponible para el cuadro de prompt. Elige otro.');
  const info = await checked(env, body);
  const { plan, hash } = info;
  const key = usageKey(info);
  const limit = limitOf(info);
  const used = await getUsed(env, key);
  const extra = await getExtra(env, info);
  const fromPlan = Math.min(MODELS[model], Math.max(0, limit - used));
  const fromExtra = MODELS[model] - fromPlan;
  if (fromExtra > extra) throw fail(402, `No te quedan créditos suficientes en este periodo (has usado ${used} de ${limit}).`);
  const event = { hash, plan, model, style, ok: false, vignettes: MODELS[model], cost: 0 };
  const out = await callEngine(env, model, ficha, image, references, prompt).catch(async (e) => {
    await record(env, event);
    throw e;
  });
  const now = used + fromPlan;
  await env.USAGE.put(key, String(now), { expirationTtl: 400 * 864e2 });
  if (fromExtra) await env.USAGE.put(extraKey(info), String(extra - fromExtra));
  await record(env, { ...event, ok: true, cost: COSTS[model] });
  return { image: out, ...summary(info, now, extra - fromExtra) };
}

async function activateComp(env, key) {
  const hash = await sha256(key);
  if (await isBlocked(env, hash)) throw fail(403, BLOCKED);
  const info = await compChecked(env, key, hash);
  return { instance_id: 'comp', ...summary(info, await getUsed(env, usageKey(info))) };
}

async function route(path, env, body) {
  if (path === '/activate') {
    if (isCompKey(body.license_key)) return activateComp(env, body.license_key);
    if (await isBlocked(env, await sha256(body.license_key))) throw fail(403, BLOCKED);
    const data = await licenseCall(env, 'activate', { license_key: body.license_key, instance_name: 'Diva Routine' });
    if (!data.activated) throw fail(400, data.error || 'No se pudo activar esa licencia.');
    try {
      const plan = planOf(env, data);
      return { instance_id: data.instance.id, ...summary({ plan, kind: 'paid', expires: paidExpiry(data) }, await getUsed(env, usageKey({ lic: data.license_key, plan }))) };
    } catch (e) {
      await licenseCall(env, 'deactivate', { license_key: body.license_key, instance_id: data.instance.id }).catch(() => {});
      throw e;
    }
  }
  if (path === '/status') {
    const info = await checked(env, body);
    return summary(info, await getUsed(env, usageKey(info)), await getExtra(env, info));
  }
  if (path === '/credits') return redeem(env, body);
  if (path === '/deactivate') {
    if (isCompKey(body.license_key)) return { ok: true };
    await licenseCall(env, 'deactivate', { license_key: body.license_key, instance_id: body.instance_id });
    return { ok: true };
  }
  if (path === '/redraw') return redraw(env, body);
  throw fail(404, 'No existe.');
}

// Los motores apagados de fábrica no se enseñan; si se apaga uno de los demás, la app sigue
// enseñándolo y avisa al usarlo, para que quien lo tenga elegido sepa qué ha pasado.
async function publicModels(env) {
  const list = [];
  for (const id of Object.keys(MODELS)) {
    if (!START_OFF.has(id) || !(await modelIsOff(env, id))) list.push({ id, label: LABELS[id], cost: MODELS[id], prompt: !(await promptIsOff(env, id)) });
  }
  return list;
}

// La lista de estilos activos y sus miniaturas: la app los pide sin licencia para enseñarlos.
async function publicGet(path, env) {
  if (path === '/models') {
    return new Response(JSON.stringify({ models: await publicModels(env) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  }
  if (path === '/styles') {
    const styles = (await listStyles(env)).filter((s) => s.activo).map((s) => ({ id: s.id, label: s.nombre, thumb: s.miniatura }));
    return new Response(JSON.stringify({ styles }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  }
  const key = path.match(/^\/styles\/thumb\/(.+)$/)?.[1];
  const image = isImageKey(key) ? await getImage(env, key) : null;
  if (!image) return json(404, { error: 'No existe.' });
  return new Response(image, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return publicGet(new URL(request.url).pathname, env);
    if (request.method !== 'POST') return json(405, { error: 'Solo POST.' });
    try {
      const body = await request.json().catch(() => null);
      if (!body) throw fail(400, 'Petición no válida.');
      return json(200, await route(new URL(request.url).pathname, env, body));
    } catch (e) {
      if (!e.status) console.error(e);
      return json(e.status || 500, { error: e.status ? e.message : 'Error interno.' });
    }
  },
};
