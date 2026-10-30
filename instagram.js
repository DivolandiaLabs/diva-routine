// Conexión con tu cuenta de Instagram: lee tus colecciones de Guardados (privadas) y
// descarga sus videos y fotos. Usa la cookie de sesión que pegas en la app; se guarda solo
// en data/instagram.json y solo se envía a Instagram.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BASE = (process.env.IG_BASE || 'https://www.instagram.com').replace(/\/$/, '');
// Algunas rutas (p. ej. la lista de colecciones) solo existen en el servidor "i." de Instagram.
const BASE_I = (process.env.IG_BASE_I || 'https://i.instagram.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const APP_ID = '936619743392459'; // id público de la web de Instagram
const PAGE_DELAY = Number(process.env.IG_PAGE_DELAY ?? 800); // pausa entre páginas, para no parecer un robot
const MAX_PAGES = 60;
export const ALL_SAVED = 'ALL_MEDIA_AUTO_COLLECTION';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const igError = (message, extra = {}) => Object.assign(new Error(message), { status: extra.session ? 401 : 502, ...extra });

let FILE;
let COOKIE_FILE;
let session = null; // { cookies, userId, username, connectedAt, expired }

export function initInstagram(dataDir) {
  FILE = path.join(dataDir, 'instagram.json');
  COOKIE_FILE = path.join(dataDir, 'instagram-cookies.txt');
  try {
    session = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    session = null;
  }
}

// Guardados en fila; cada uno escribe la sesión que haya en ese momento (o borra el archivo).
let saveChain = Promise.resolve();
const save = () =>
  (saveChain = saveChain
    .then(() => (session ? fsp.writeFile(FILE, JSON.stringify(session, null, 2)) : fsp.unlink(FILE).catch(() => {})))
    .catch((e) => console.error('No se pudo guardar la sesión de Instagram:', e.message)));

export const hasSession = () => Boolean(session);

export function status() {
  return { connected: Boolean(session) && !session.expired, expired: Boolean(session?.expired), username: session?.username || null };
}

// ---------- cookies ----------

/** Acepta: el valor de sessionid, una cabecera "a=b; c=d", un cookies.txt (Netscape) o un JSON exportado. */
export function parseCookieInput(raw) {
  const jar = readCookieText(String(raw || '').trim());
  // Chrome puede mostrar el valor descodificado ("123:abc:…"); Instagram lo espera con %3A.
  if (jar.sessionid) jar.sessionid = jar.sessionid.replace(/^"|"$/g, '').replace(/\s+/g, '').replace(/:/g, '%3A');
  return jar;
}

function readCookieText(text) {
  const jar = {};
  if (!text) return jar;
  const isIg = (domain) => /(^|\.)instagram\.com$/i.test(String(domain || 'instagram.com').replace(/^\./, ''));
  if (/^[[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      for (const c of [].concat(data.cookies || data)) if (c?.name && isIg(c.domain)) jar[c.name] = String(c.value ?? '');
      return jar;
    } catch {
      /* no era JSON */
    }
  }
  if (text.includes('\t')) {
    for (let line of text.split(/\r?\n/)) {
      if (line.startsWith('#HttpOnly_')) line = line.slice(10);
      if (!line || line.startsWith('#')) continue;
      const f = line.split('\t');
      if (f.length >= 7 && isIg(f[0])) jar[f[5]] = f[6].trim();
      else if (f.length >= 2 && /^[a-z_]+$/i.test(f[0]) && f[1]) jar[f[0]] = f[1].trim(); // fila copiada de la tabla de Chrome
    }
    return jar;
  }
  if (text.includes('=')) {
    for (const part of text.replace(/^cookie:\s*/i, '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return jar;
  }
  jar.sessionid = text;
  return jar;
}

const cookieHeader = () => Object.entries(session.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

// Instagram renueva algunas cookies (csrftoken, rur…) en cada respuesta: se guardan para que la sesión dure.
function absorbCookies(res) {
  let changed = false;
  for (const c of res.headers.getSetCookie?.() || []) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (i <= 0 || !value || value === '""' || name === 'sessionid') continue;
    if (session.cookies[name] !== value) ((session.cookies[name] = value), (changed = true));
  }
  if (changed) save();
}

/** cookies.txt temporal para yt-dlp (plan B de descarga). */
export async function withCookieFile(fn) {
  const lines = ['# Netscape HTTP Cookie File'];
  for (const [k, v] of Object.entries(session.cookies)) lines.push(['.instagram.com', 'TRUE', '/', 'TRUE', '2147483647', k, v].join('\t'));
  await fsp.writeFile(COOKIE_FILE, lines.join('\n') + '\n');
  try {
    return await fn(['--cookies', COOKIE_FILE]);
  } finally {
    await fsp.unlink(COOKIE_FILE).catch(() => {});
  }
}

// ---------- peticiones ----------

// Los ids de Instagram no caben en un número de JavaScript: se guardan como texto.
const keepBigIds = (key, value, ctx) => (Number.isInteger(value) && !Number.isSafeInteger(value) && ctx?.source ? ctx.source : value);

async function igGet(url) {
  try {
    return await igGetFrom(BASE, url);
  } catch (e) {
    if (!e.notFound) throw e;
    return await igGetFrom(BASE_I, url);
  }
}

/** Como la web y, si Instagram no lo acepta (sin que sea por la sesión), como la app del móvil. */
async function igGetAny(url) {
  try {
    return await igGet(url);
  } catch (e) {
    if (e.session || e.rateLimited) throw e;
    return await igGetFrom(BASE_I, url, { mobile: true });
  }
}

// Las mismas cabeceras que manda la web de Instagram desde Chrome.
const webHeaders = () => ({
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
  'X-IG-App-ID': APP_ID,
  'X-ASBD-ID': '129477',
  'X-IG-WWW-Claim': '0',
  'X-Requested-With': 'XMLHttpRequest',
  'X-CSRFToken': session.cookies.csrftoken || '',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  Referer: 'https://www.instagram.com/',
  Cookie: cookieHeader(),
});

// Algunas rutas (la lista de colecciones) solo responden a la app del móvil: se le habla como ella,
// con tu misma sesión en la cabecera Authorization (así lo hace la app con una sesión iniciada).
const MOBILE_UA = 'Instagram 309.1.0.41.113 Android (31/12; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; es_ES; 541635890)';
const MOBILE_APP_ID = '567067343352427';
const mobileHeaders = () => ({
  'User-Agent': MOBILE_UA,
  Accept: '*/*',
  'Accept-Language': 'es-ES',
  'X-IG-App-ID': MOBILE_APP_ID,
  'X-IG-Capabilities': '3brTvx0=',
  'X-IG-Connection-Type': 'WIFI',
  Authorization: 'Bearer IGT:2:' + Buffer.from(JSON.stringify({ ds_user_id: session.userId || session.cookies.ds_user_id, sessionid: session.cookies.sessionid })).toString('base64'),
});

async function igGetFrom(base, url, { mobile = false } = {}) {
  if (!session) throw igError('Conecta tu cuenta de Instagram primero.', { session: true });
  let res;
  try {
    res = await fetch(base + url, { redirect: 'manual', headers: mobile ? mobileHeaders() : webHeaders() });
  } catch (e) {
    throw igError('No se pudo conectar con Instagram: ' + (e.cause?.code || e.message));
  }
  absorbCookies(res);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text, keepBigIds);
  } catch {
    /* HTML: suele ser la página de login */
  }
  const msg = String(data?.message || '');
  let to = '';
  try {
    to = res.headers.get('location') ? new URL(res.headers.get('location'), base).pathname : '';
  } catch {
    /* redirección rara */
  }
  // Registro para diagnosticar (sin cookies ni contenido): ruta, respuesta y adónde redirige.
  console.log(`[instagram] ${mobile ? '(como la app del móvil) ' : ''}${new URL(base).host}${url.split('?')[0]} -> ${res.status}${to ? ' → ' + to : ''}${data?.status ? ' ' + data.status : data ? '' : ' (no JSON)'}${msg ? ' «' + msg.slice(0, 80) + '»' : ''}`);
  if (res.status === 429 || /wait a few minutes|rate limit/i.test(msg)) {
    throw igError('Instagram está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.', { rateLimited: true });
  }
  // Si la vía del móvil no cuela, no significa que tu sesión haya caducado (la de la web sigue valiendo).
  if (mobile && (!res.ok || !data || data.status === 'fail')) {
    throw igError(`Instagram respondió con un error (${res.status}${msg ? ': ' + msg : ''}).`, { notFound: res.status === 404 });
  }
  if (/checkpoint|challenge/i.test(msg) || data?.checkpoint_url || /challenge|checkpoint|suspended/i.test(to)) {
    throw igError('Instagram quiere confirmar que eres tú: abre instagram.com en el navegador, completa la verificación y vuelve a conectar.', { session: true });
  }
  if (res.status === 404) throw igError('Instagram no encuentra eso (404).', { notFound: true });
  if ((res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403 || !data || data.require_login || /login_required/i.test(msg)) {
    if (!session.expired) ((session.expired = true), save());
    throw igError('La sesión de Instagram ha caducado o no es válida. Vuelve a conectar tu cuenta.', { session: true });
  }
  if (!res.ok || data.status === 'fail') throw igError(`Instagram respondió con un error (${res.status}${msg ? ': ' + msg : ''}).`);
  if (session.expired) ((session.expired = false), save());
  return data;
}

// ---------- cuenta ----------

const COLLECTIONS_URL = (maxId = '') =>
  `/api/v1/collections/list/?collection_types=${encodeURIComponent(JSON.stringify([ALL_SAVED, 'MEDIA']))}&include_public_only=0&get_cover_media_lists=true&max_id=${encodeURIComponent(maxId)}`;

export async function connect(raw) {
  const cookies = parseCookieInput(raw);
  if (!cookies.sessionid) {
    throw Object.assign(new Error('No encuentro la cookie «sessionid». Copia su valor en instagram.com (F12 → Aplicación → Cookies) o sube un cookies.txt.'), { status: 400 });
  }
  const userId = cookies.ds_user_id || (cookies.sessionid.match(/^(\d+)%3A/) || [])[1] || null;
  if (userId) cookies.ds_user_id ||= userId; // la web de Instagram siempre lo manda junto a sessionid
  // Solo la forma, nunca el valor: ayuda a ver si se copió entero.
  const sid = cookies.sessionid;
  console.log(`[instagram] conectar: cookies ${Object.keys(cookies).join(', ')} · sessionid de ${sid.length} caracteres, ${(sid.match(/%3A/g) || []).length} separadores %3A, ${userId ? 'empieza por un id de usuario' : 'NO empieza por un id de usuario'}`);

  const prev = session;
  session = { cookies, userId, username: null, connectedAt: new Date().toISOString() };
  // Comprueba que la sesión vale con rutas que existen seguro, en la web y en el servidor "i."
  // (la primera da además tu usuario). Basta con que una responda.
  let lastError;
  outer: for (const base of [BASE, BASE_I]) {
    for (const url of ['/api/v1/accounts/edit/web_form_data/', '/api/v1/feed/saved/posts/?max_id=']) {
      try {
        const d = await igGetFrom(base, url);
        session.username = d.form_data?.username || null;
        lastError = null;
        break outer;
      } catch (e) {
        if (!lastError || /verificación/.test(e.message)) lastError = e;
        if (/limitando/.test(e.message)) break outer;
      }
    }
  }
  if (lastError) {
    session = prev; // la anterior (o ninguna) sigue valiendo, también en disco
    await save();
    if (lastError.session && !/verificación/.test(lastError.message)) {
      throw igError(
        `Instagram no ha aceptado esa sesión. Comprueba que copiaste el valor completo de sessionid (es largo, empieza por números y lleva varios %3A) y que en ese Chrome sigues con la sesión iniciada. Si sigue fallando, pega todas las cookies (abajo, en «¿No conecta?»): a veces Instagram pide más que sessionid.`,
        { session: true }
      );
    }
    throw lastError;
  }
  if (!session.username) {
    try {
      session.username = (await igGet('/api/v1/accounts/edit/web_form_data/')).form_data?.username || null;
    } catch {
      /* el nombre es solo para mostrarlo */
    }
  }
  await save();
  return status();
}

export async function disconnect() {
  session = null;
  await save();
  return status();
}

const best = (list) => [...(list || [])].sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;

function coverOf(c) {
  const m = c.cover_media || c.cover_media_list?.[0];
  const cands = [...(m?.image_versions2?.candidates || m?.carousel_media?.[0]?.image_versions2?.candidates || [])].sort((a, b) => a.width - b.width);
  return (cands.find((x) => x.width >= 150) || cands[cands.length - 1])?.url || null;
}

/** Tus colecciones de Guardados. Prueba primero como la app del móvil y luego como la web. */
export async function listCollections() {
  let lastError;
  for (const mobile of [true, false]) {
    try {
      return await listCollectionsVia(mobile);
    } catch (e) {
      if (e.session && !mobile) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

async function listCollectionsVia(mobile) {
  const out = [];
  let maxId = '';
  for (let page = 0; page < 10; page++) {
    const d = await igGetFrom(BASE_I, COLLECTIONS_URL(maxId), { mobile });
    for (const c of d.items || []) {
      const all = c.collection_type === ALL_SAVED || String(c.collection_id) === ALL_SAVED;
      out.push({
        id: all ? ALL_SAVED : String(c.collection_id),
        name: all ? 'Todas las publicaciones guardadas' : c.collection_name || 'Colección',
        count: c.collection_media_count ?? null,
        cover: coverOf(c),
      });
    }
    if (!d.more_available || !d.next_max_id) break;
    maxId = String(d.next_max_id);
    await sleep(PAGE_DELAY);
  }
  return out;
}

// ---------- colecciones y posts ----------

/** instagram.com/usuario/saved/nombre/123/ -> { id, name }; /saved/ o /saved/all-posts/ -> todos los guardados. */
export function parseCollectionUrl(url) {
  const m = String(url).match(/instagram\.com\/[^/?#]+\/saved(?:\/([^/?#]+))?(?:\/(\d+))?/i);
  if (!m) return null;
  if (!m[1] || m[1] === 'all-posts' || !m[2]) return { id: ALL_SAVED, name: 'Guardados de Instagram' };
  let name = m[1];
  try {
    name = decodeURIComponent(name);
  } catch {
    /* se deja tal cual */
  }
  return { id: m[2], name: name.replace(/[-_]+/g, ' ') };
}

async function paginate(base) {
  const medias = [];
  let maxId = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await igGetAny(`${base}?max_id=${encodeURIComponent(maxId)}`);
    for (const it of d.items || []) {
      const m = it.media || it;
      if (m?.code) medias.push(m);
    }
    if (!d.more_available || !d.next_max_id) break;
    maxId = String(d.next_max_id);
    await sleep(PAGE_DELAY);
  }
  return medias;
}

async function collectionMedia(id) {
  const bases = id === ALL_SAVED ? ['/api/v1/feed/saved/posts/'] : [`/api/v1/feed/collection/${id}/posts/`, `/api/v1/feed/collection/${id}/`];
  for (const base of bases) {
    try {
      return await paginate(base);
    } catch (e) {
      if (!e.notFound) throw e;
    }
  }
  throw igError('No encuentro esa colección en tu cuenta. ¿Es tuya y sigue existiendo?');
}

function captionTitle(m) {
  const line = String(m.caption?.text || '')
    .split('\n')
    .map((s) => s.replace(/[#@][\p{L}\p{N}_.]+/gu, '').replace(/\s+/g, ' ').trim())
    .find((s) => /[\p{L}\p{N}]/u.test(s));
  if (line) return line.slice(0, 80);
  return m.user?.username ? `@${m.user.username}` : `Instagram ${m.code}`;
}

export const postKey = (code, index) => `${code}:${index ?? ''}`;

/**
 * Un post -> sus entradas para la biblioteca. En los carruseles, una por cada video
 * (o por cada foto si no tiene videos).
 */
/** Portada pequeña del post (enlace de Instagram; caduca a los días, para verlo mientras se descarga). */
function thumbOf(m) {
  const cands = [...(m?.image_versions2?.candidates || [])].sort((a, b) => a.width - b.width);
  return (cands.find((c) => c.width >= 320) || cands[cands.length - 1])?.url || null;
}

function entriesFromMedia(m) {
  const url = `https://www.instagram.com/${m.product_type === 'clips' ? 'reel' : 'p'}/${m.code}/`;
  const pk = String(m.id || m.pk).split('_')[0];
  const title = captionTitle(m);
  const kids = m.media_type === 8 && Array.isArray(m.carousel_media) ? m.carousel_media : null;
  if (!kids?.length) return [{ url, title, igPk: pk, igIndex: null, key: postKey(m.code, null), thumb: thumbOf(m) }];
  let idx = kids.map((k, i) => (k.media_type === 2 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) idx = kids.map((_, i) => i);
  return idx.map((i, n) => ({
    url,
    title: idx.length > 1 ? `${title} (${n + 1}/${idx.length})` : title,
    igPk: pk,
    igIndex: i,
    key: postKey(m.code, i),
    thumb: thumbOf(kids[i]) || thumbOf(m),
  }));
}

/** Entradas de una colección, de la más antigua a la más reciente. */
export async function collectionEntries(id) {
  return (await collectionMedia(id)).reverse().flatMap(entriesFromMedia);
}

// ---------- descargas ----------

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const shortcodeOf = (url) => (String(url).match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i) || [])[1] || null;

function pkFromUrl(url) {
  const code = shortcodeOf(url);
  if (!code) return null;
  let pk = 0n;
  for (const ch of code.slice(0, 11)) pk = pk * 64n + BigInt(CODE_ALPHABET.indexOf(ch));
  return pk.toString();
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.instagram.com/' } });
  if (!res.ok || !res.body) throw igError(`No se pudo descargar el archivo de Instagram (${res.status}).`);
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  } catch (e) {
    await fsp.unlink(dest).catch(() => {});
    throw igError('La descarga de Instagram se cortó: ' + e.message);
  }
}

/** Descarga el video (o la foto) de un post con tu sesión. Devuelve { file, mediaType }. */
export async function download(source, dir, base) {
  const pk = source.igPk || pkFromUrl(source.url);
  if (!pk) throw igError('No reconozco el link de Instagram.');
  const d = await igGetAny(`/api/v1/media/${pk}/info/`);
  let m = d.items?.[0];
  if (!m) throw igError('Instagram no devolvió el post.');
  if (m.carousel_media?.length) {
    const i = source.igIndex ?? Math.max(0, m.carousel_media.findIndex((k) => k.media_type === 2));
    m = m.carousel_media[i] || m.carousel_media[0];
  }
  const video = best(m.video_versions);
  const image = best(m.image_versions2?.candidates);
  if (!video && !image) throw igError('Este post no tiene video ni foto que descargar.');
  const ext = video ? '.mp4' : ((new URL(image.url).pathname.match(/\.(jpe?g|png|webp)$/i) || [])[0] || '.jpg').toLowerCase();
  const file = base + ext;
  await downloadTo((video || image).url, path.join(dir, file));
  return { file, mediaType: video ? 'video' : 'image' };
}
