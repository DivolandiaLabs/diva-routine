// Panel de administración. Lo protege Cloudflare Access, y aquí se comprueba otra vez el pase
// firmado que Access añade a cada petición: si alguien llega por otra ruta o falta cualquier
// ajuste, se deniega. Nunca se devuelve una clave de licencia, salvo la de cortesía al crearla.
import { PAGE } from './admin-page.js';
import { sha256, record, modelIsOff, setModel, promptIsOff, setPromptModel } from './db.js';
import { listStyles, styleOf, cleanFicha, putImage, getImage, isImageKey, MAX_STYLE_REFS } from './styles.js';
import { callEngine, missingKey } from './engines.js';

const fail = (status, error) => Object.assign(new Error(error), { status });
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const parsePart = (s) => JSON.parse(new TextDecoder().decode(fromB64(s)));

async function verifyAccess(request, env, ctx) {
  const { ACCESS_TEAM: team, ACCESS_AUD: aud, ADMIN_EMAILS: emails } = env;
  if (!team || !aud || !emails || [team, aud, emails].includes('PENDIENTE')) throw fail(503, 'El panel aún no está configurado.');
  const allowed = emails.split(',').map((e) => e.trim().toLowerCase());
  const permitted = (email) => allowed.includes(String(email).toLowerCase());
  // Con Access a nivel de Worker, Cloudflare da la identidad ya comprobada en ctx.access.
  if (ctx?.access) {
    if (ctx.access.aud !== aud || !permitted((await ctx.access.getIdentity())?.email)) throw fail(403, 'Acceso denegado.');
    return;
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw fail(401, 'Acceso denegado.');
  const denied = fail(403, 'Acceso denegado.');
  const parts = token.split('.');
  if (parts.length !== 3) throw denied;
  let head;
  let claims;
  try {
    head = parsePart(parts[0]);
    claims = parsePart(parts[1]);
  } catch {
    throw denied;
  }
  if (head.alg !== 'RS256') throw denied;
  const issuer = `https://${team}.cloudflareaccess.com`;
  const res = await fetch(env.ACCESS_CERTS_URL || `${issuer}/cdn-cgi/access/certs`);
  const jwk = (await res.json().catch(() => null))?.keys?.find((k) => k.kid === head.kid);
  if (!jwk) throw denied;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!good) throw denied;
  const now = Date.now() / 1000;
  const audiences = [claims.aud].flat();
  if (claims.iss !== issuer || !audiences.includes(aud) || !(claims.exp > now) || (claims.nbf && claims.nbf > now)) throw denied;
  if (!permitted(claims.email)) throw denied;
}

// Una web ajena no debe poder lanzar acciones aprovechando la sesión abierta.
function checkOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) throw fail(403, 'Acceso denegado.');
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail(415, 'Se espera JSON.');
}

const rows = async (stmt) => (await stmt.all()).results;

function newCompKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `DIVA-${hex.match(/.{4}/g).join('-')}`;
}

async function summary(env, url) {
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const active = Date.now() - 30 * 864e5;
  const [lic, totals, todayRow, perDay, perModel, perStyle] = await Promise.all([
    q(`SELECT COUNT(*) total, SUM(kind = 'paid' AND blocked = 0) paid, SUM(kind = 'comp' AND blocked = 0) comp,
       SUM(blocked) blocked, SUM(last_seen > ?) active FROM licenses`, active).first(),
    q('SELECT COALESCE(SUM(CASE WHEN ok = 1 THEN vignettes END), 0) vignettes, COALESCE(SUM(cost), 0) cost, COALESCE(SUM(ok = 0), 0) errors, COUNT(*) calls FROM events WHERE day >= ?', since).first(),
    q('SELECT COALESCE(SUM(CASE WHEN ok = 1 THEN vignettes END), 0) vignettes FROM events WHERE day = ?', today).first(),
    rows(q('SELECT day, SUM(CASE WHEN ok = 1 THEN vignettes ELSE 0 END) vignettes, SUM(cost) cost FROM events WHERE day >= ? GROUP BY day ORDER BY day', since)),
    rows(q('SELECT model name, COUNT(*) calls, SUM(cost) cost FROM events WHERE day >= ? AND ok = 1 GROUP BY model ORDER BY calls DESC', since)),
    rows(q('SELECT style name, COUNT(*) calls, SUM(cost) cost FROM events WHERE day >= ? AND ok = 1 GROUP BY style ORDER BY calls DESC', since)),
  ]);
  return { days, licenses: lic, totals, today: todayRow.vignettes, perDay, perModel, perStyle };
}

const MAX_IMAGE = 3_000_000; // bytes de cada imagen de estilo
const MAX_TEST_IMAGE = 4_000_000; // caracteres en base64

function slug(name) {
  const text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return text || 'estilo';
}

async function freeId(env, name) {
  const taken = new Set((await listStyles(env)).map((s) => s.id));
  taken.add('app'); // el estilo gratuito de la app
  const base = slug(name);
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

/** Guarda la ficha como versión nueva y deja la anterior en el historial. */
async function saveStyle(env, id, input) {
  const ficha = cleanFicha(input);
  if (!ficha.nombre) throw fail(400, 'Ponle un nombre.');
  if (!ficha.tecnica) throw fail(400, 'Describe la técnica del dibujo.');
  const now = Date.now();
  const old = id ? await styleOf(env, id) : null;
  if (id && !old) throw fail(404, 'Ese estilo no existe.');
  const newId = id || await freeId(env, ficha.nombre);
  if (old) {
    await env.DB.prepare('INSERT OR REPLACE INTO style_versions (id, version, updated, data) VALUES (?, ?, ?, ?)').bind(newId, old.version, now, JSON.stringify(cleanFicha(old))).run();
  }
  // Un estilo nuevo nace apagado: no llega a la app hasta probarlo y activarlo.
  await env.DB.prepare(`INSERT INTO styles (id, version, activo, created, updated, data) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET version = excluded.version, updated = excluded.updated, data = excluded.data`)
    .bind(newId, (old?.version || 0) + 1, old?.activo ? 1 : 0, now, now, JSON.stringify(ficha)).run();
  return styleOf(env, newId);
}

async function setActive(env, id, activo) {
  const style = await styleOf(env, id);
  if (!style) throw fail(404, 'Ese estilo no existe.');
  if (activo && !style.builtin && !style.miniatura) throw fail(400, 'Añade una miniatura antes de activarlo.');
  if (!(await env.DB.prepare('SELECT 1 FROM styles WHERE id = ?').bind(id).first())) await saveStyle(env, id, style);
  await env.DB.prepare('UPDATE styles SET activo = ? WHERE id = ?').bind(activo ? 1 : 0, id).run();
}

async function uploadImage(env, body) {
  if (typeof body.data !== 'string') throw fail(400, 'Imagen no válida.');
  let bytes;
  try {
    bytes = fromB64(body.data);
  } catch {
    throw fail(400, 'Imagen no válida.');
  }
  if (bytes.length > MAX_IMAGE || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw fail(400, 'Imagen no válida.');
  const key = await sha256(body.data);
  await putImage(env, key, bytes);
  return { key };
}

// Una prueba gasta una imagen real del proveedor: cuenta en el gasto, pero no en ninguna licencia.
async function testStyle(env, catalog, body) {
  if (!catalog.MODELS[body.model]) throw fail(400, 'Ese motor no existe.');
  const missing = missingKey(env, body.model);
  if (missing) throw fail(503, missing);
  if (typeof body.image !== 'string' || !body.image || body.image.length > MAX_TEST_IMAGE) throw fail(400, 'Elige un frame de prueba.');
  const ficha = cleanFicha(body.ficha);
  if (!ficha.tecnica) throw fail(400, 'Describe la técnica del dibujo.');
  const event = { hash: 'admin', plan: 'admin', model: body.model, style: String(body.id || 'prueba').slice(0, 40), ok: false, vignettes: 0, cost: 0 };
  const image = await callEngine(env, body.model, ficha, body.image, [], '').catch(async (e) => {
    await record(env, event);
    throw e;
  });
  await record(env, { ...event, ok: true, cost: catalog.COSTS[body.model] });
  return { image };
}

async function api(path, method, request, url, env, catalog) {
  const body = method === 'POST' ? await request.json().catch(() => null) : null;
  if (method === 'POST' && !body) throw fail(400, 'Petición no válida.');
  if (path === 'summary' && method === 'GET') return summary(env, url);

  if (path === 'licenses' && method === 'GET') {
    const text = `%${(url.searchParams.get('q') || '').slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
    return {
      licenses: await rows(env.DB.prepare(`SELECT hash, tail, kind, plan, email, first_seen, last_seen, vignettes, blocked FROM licenses
        WHERE email LIKE ?1 ESCAPE '\\' OR tail LIKE ?1 ESCAPE '\\' OR ?2 = '' ORDER BY last_seen DESC LIMIT 200`).bind(text, url.searchParams.get('q') || '')),
    };
  }
  if (path === 'licenses/block' && method === 'POST') {
    const { meta } = await env.DB.prepare('UPDATE licenses SET blocked = ? WHERE hash = ?').bind(body.blocked ? 1 : 0, String(body.hash)).run();
    if (!meta.changes) throw fail(404, 'Esa licencia no existe.');
    return { ok: true };
  }

  if (path === 'grants' && method === 'GET') {
    return { grants: await rows(env.DB.prepare(`SELECT g.email, g.note, g.plan, g.created, g.expires, g.revoked, l.vignettes, l.period_days
      FROM grants g LEFT JOIN grant_limits l ON l.email = g.email ORDER BY g.created DESC LIMIT 500`)) };
  }
  if (path === 'grants' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const days = Number(body.days);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw fail(400, 'Escribe el correo de su cuenta de Google.');
    const custom = body.plan === 'custom';
    if (!custom && !catalog.LIMITS[body.plan]) throw fail(400, 'Esa cuota no existe.');
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw fail(400, 'La duración debe ser de 1 a 3660 días.');
    const vignettes = Number(body.vignettes);
    if (custom && (!Number.isInteger(vignettes) || vignettes < 1 || vignettes > 100000)) throw fail(400, 'Los créditos deben ser de 1 a 100.000.');
    const now = Date.now();
    const note = String(body.note || '').trim().slice(0, 80);
    // La cuota a medida vale para toda la duración: el periodo llega desde el alta hasta que caduca.
    const old = body.edit ? await env.DB.prepare('SELECT created FROM grants WHERE email = ?').bind(email).first() : null;
    const period = Math.ceil((now + days * 864e5 - (old?.created ?? now)) / 864e5);
    // Al editar se conserva created: de él salen los periodos, así no se reinicia lo gastado.
    const save = body.edit
      ? env.DB.prepare('UPDATE grants SET note = ?, plan = ?, expires = ?, revoked = 0 WHERE email = ?').bind(note, body.plan, now + days * 864e5, email)
      : env.DB.prepare(`INSERT INTO grants (email, note, plan, created, expires) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT (email) DO UPDATE SET note = ?2, plan = ?3, created = ?4, expires = ?5, revoked = 0`).bind(email, note, body.plan, now, now + days * 864e5);
    const quota = custom
      ? env.DB.prepare('INSERT OR REPLACE INTO grant_limits (email, vignettes, period_days) VALUES (?, ?, ?)').bind(email, vignettes, period)
      : env.DB.prepare('DELETE FROM grant_limits WHERE email = ?').bind(email);
    await env.DB.batch([save, quota]);
    return { ok: true };
  }
  if (path === 'grants/delete' && method === 'POST') {
    const email = String(body.email);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM grants WHERE email = ?').bind(email),
      env.DB.prepare('DELETE FROM grant_limits WHERE email = ?').bind(email),
    ]);
    return { ok: true };
  }
  if (path === 'grants/revoke' && method === 'POST') {
    const { meta } = await env.DB.prepare('UPDATE grants SET revoked = 1 WHERE email = ?').bind(String(body.email)).run();
    if (!meta.changes) throw fail(404, 'Esa cuenta no tiene Premium.');
    return { ok: true };
  }

  if (path === 'comps' && method === 'GET') {
    return { comps: await rows(env.DB.prepare('SELECT hash, tail, label, plan, created, expires, revoked FROM comps ORDER BY created DESC LIMIT 200')) };
  }
  if (path === 'comps' && method === 'POST') {
    const label = String(body.label || '').trim().slice(0, 80);
    const days = Number(body.days);
    if (!label) throw fail(400, 'Indica para quién es.');
    if (!catalog.LIMITS[body.plan]) throw fail(400, 'Esa cuota no existe.');
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw fail(400, 'La duración debe ser de 1 a 3660 días.');
    const key = newCompKey();
    const created = Date.now();
    await env.DB.prepare('INSERT INTO comps (hash, tail, label, plan, created, expires) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(key), key.slice(-4), label, body.plan, created, created + days * 864e5).run();
    return { key };
  }
  if (path === 'comps/revoke' && method === 'POST') {
    const { meta } = await env.DB.prepare('UPDATE comps SET revoked = 1 WHERE hash = ?').bind(String(body.hash)).run();
    if (!meta.changes) throw fail(404, 'Esa licencia no existe.');
    return { ok: true };
  }

  if (path === 'models' && method === 'GET') {
    const ids = Object.keys(catalog.MODELS);
    const off = await Promise.all(ids.map((id) => modelIsOff(env, id)));
    const promptOff = await Promise.all(ids.map((id) => promptIsOff(env, id)));
    return { models: ids.map((id, i) => ({ id, vignettes: catalog.MODELS[id], cost: catalog.COSTS[id], enabled: !off[i], prompt: !promptOff[i] })) };
  }
  if (path === 'models' && method === 'POST') {
    if (!catalog.MODELS[body.id]) throw fail(400, 'Ese motor no existe.');
    await (body.prompt ? setPromptModel : setModel)(env, body.id, Boolean(body.enabled));
    return { ok: true };
  }

  if (path === 'styles' && method === 'GET') {
    return { styles: await listStyles(env), maxRefs: MAX_STYLE_REFS, canTest: Boolean(env.GEMINI_KEY || env.OPENAI_KEY), models: Object.keys(catalog.MODELS).map((id) => ({ id, cost: catalog.COSTS[id] })) };
  }
  if (path === 'styles' && method === 'POST') return { style: await saveStyle(env, body.id ? String(body.id) : '', body.ficha) };
  if (path === 'styles/active' && method === 'POST') {
    await setActive(env, String(body.id), Boolean(body.activo));
    return { ok: true };
  }
  if (path === 'styles/versions' && method === 'GET') {
    return { versions: await rows(env.DB.prepare('SELECT version, updated, data FROM style_versions WHERE id = ? ORDER BY version DESC LIMIT 50').bind(url.searchParams.get('id') || '')) };
  }
  if (path === 'styles/restore' && method === 'POST') {
    const row = await env.DB.prepare('SELECT data FROM style_versions WHERE id = ? AND version = ?').bind(String(body.id), Number(body.version)).first();
    if (!row) throw fail(404, 'Esa versión no existe.');
    return { style: await saveStyle(env, String(body.id), JSON.parse(row.data)) };
  }
  if (path === 'styles/image' && method === 'POST') return uploadImage(env, body);
  if (path === 'styles/image' && method === 'GET') {
    const key = url.searchParams.get('key');
    const image = isImageKey(key) ? await getImage(env, key) : null;
    if (!image) throw fail(404, 'No existe.');
    return new Response(image, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (path === 'styles/test' && method === 'POST') return testStyle(env, catalog, body);
  throw fail(404, 'No existe.');
}

export async function handleAdmin(request, env, catalog, ctx) {
  try {
    await verifyAccess(request, env, ctx);
    const url = new URL(request.url);
    if (url.pathname === '/admin' && request.method === 'GET') {
      return new Response(PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
      });
    }
    if (!url.pathname.startsWith('/admin/api/')) throw fail(404, 'No existe.');
    if (!env.DB) throw fail(503, 'Falta la base de datos.');
    if (!['GET', 'POST'].includes(request.method)) throw fail(405, 'Método no permitido.');
    if (request.method === 'POST') checkOrigin(request);
    const out = await api(url.pathname.slice('/admin/api/'.length), request.method, request, url, env, catalog);
    return out instanceof Response ? out : json(200, out);
  } catch (e) {
    if (!e.status) console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : 'Error interno.' });
  }
}
