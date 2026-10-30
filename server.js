// Servidor local sin dependencias: sirve la app, guarda los datos en db.json y los
// archivos subidos o descargados en uploads/. Escucha solo en 127.0.0.1.
//
// Modelo: bibliotecas -> videos (o fotos) -> ejercicios (tramos del video con sus
// momentos clave dibujados y su técnica) -> rutinas (lista ordenada de ejercicios).
//
// Varios ordenadores: la carpeta de datos puede ser una compartida (disco de red, OneDrive…)
// que usan todas las instalaciones (Ajustes en la app, o config.json). Lo de cada ordenador
// (la sesión de Instagram) se queda siempre en su carpeta data/ local.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as ig from './instagram.js';
import * as social from './social.js';
import * as cloud from './cloud.js';
import * as google from './google.js';
import { createCollab, RULES } from './collab.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOCAL_DIR = process.env.JR_LOCAL_DIR ? path.resolve(process.env.JR_LOCAL_DIR) : path.join(ROOT, 'data');
const CONFIG_FILE = process.env.JR_CONFIG ? path.resolve(process.env.JR_CONFIG) : path.join(ROOT, 'config.json');
const RESTART_CODE = 75; // el lanzador vuelve a arrancar el servidor si sale con este código

// %OneDrive%, %USERPROFILE%… en la ruta, para que la misma config valga en varios ordenadores.
const expandEnv = (p) => String(p).replace(/%([^%]+)%/g, (all, k) => process.env[k] ?? all);
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}
const config = readConfig();
const DATA_DIR = process.env.JR_DATA_DIR
  ? path.resolve(process.env.JR_DATA_DIR)
  : config.dataDir ? path.resolve(expandEnv(config.dataDir)) : LOCAL_DIR;
const SHARED = DATA_DIR !== LOCAL_DIR;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PRESENCE_DIR = path.join(DATA_DIR, 'presencia');
const HOST = process.env.JR_HOST || os.hostname();
let PORT = Number(process.env.PORT) || 5177; // en la app de escritorio, otro libre si ese está ocupado
// App de escritorio (Windows): la ventana, las actualizaciones y reiniciar los pone desktop/main.js.
const DESKTOP = globalThis.jrDesktop || null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

fs.mkdirSync(LOCAL_DIR, { recursive: true });
// Si la carpeta compartida no está disponible (disco de red apagado, nube sin sincronizar),
// no se usan los datos locales a escondidas: la app lo dice y deja cambiar la carpeta.
let dataError = null;
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  dataError = `No puedo abrir la carpeta de datos «${DATA_DIR}» (${e.code || e.message}). ¿Está encendido el disco de red o sincronizada la nube? Cuando lo esté, cierra y vuelve a abrir la app, o elige otra carpeta en Ajustes.`;
  console.error(dataError);
}
ig.initInstagram(LOCAL_DIR);
social.initSocial(LOCAL_DIR);
// El identificador de Google y la configuración de Firebase van junto a la app (valen para todos
// tus ordenadores y para quien se la pases); la sesión, en data/ local.
google.initGoogle({
  clientFile: process.env.JR_GOOGLE_CLIENT ? path.resolve(process.env.JR_GOOGLE_CLIENT) : path.join(ROOT, 'google-client.json'),
  firebaseFile: process.env.JR_FIREBASE ? path.resolve(process.env.JR_FIREBASE) : path.join(ROOT, 'firebase-config.json'),
  localDir: LOCAL_DIR,
});
google.loadProfile().catch(() => {}); // foto de la cuenta, si aún no la tiene

const newId = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- base de datos (JSON en disco) ----------

let db = dataError ? { libraries: [], videos: [], exercises: [], routines: [], deleted: {} } : loadDb();

// Lee un JSON reintentando unos segundos si está ocupado (al actualizar, la app anterior puede
// tenerlo abierto todavía). Si no existe devuelve null; si no se puede leer, lanza el error.
function readJsonSync(file, tries = 20) {
  for (let i = 1; ; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      if (i >= tries) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

function loadDb() {
  let parsed = {};
  try {
    parsed = readJsonSync(DB_FILE) || {}; // sin archivo: primera vez
  } catch (e) {
    // Nunca se arranca vacío encima de unos datos que no se han podido leer: así no se pisan.
    dataError = `No pude leer tus datos (${e.code || e.message}). Cierra y vuelve a abrir la app; tus datos siguen en «${DB_FILE}».`;
    console.error(dataError);
  }
  const data = {
    libraries: parsed.libraries || [],
    videos: parsed.videos || [],
    exercises: [],
    routines: parsed.routines || [],
    deleted: parsed.deleted || {}, // id -> cuándo se borró (para sincronizar borrados)
  };
  if (!data.libraries.length) data.libraries.push({ id: newId(), name: 'General', createdAt: now() });
  // Una biblioteca es la raíz (lo que no está en ninguna carpeta); las demás se ven como carpetas.
  if (!data.libraries.some((l) => l.root)) (data.libraries.find((l) => l.name === 'General') || data.libraries[0]).root = true;

  // Versión anterior: cada "ejercicio" llevaba su propio video. Se separa en video + ejercicio.
  for (const old of parsed.exercises || []) {
    if (!old.source) {
      data.exercises.push(old);
      continue;
    }
    data.videos.push({
      id: old.id,
      libraryId: data.libraries[0].id,
      title: old.title,
      titleLocked: Boolean(old.titleLocked),
      source: { kind: old.source.kind, url: old.source.url || '', platform: old.source.platform, file: old.source.file, mediaType: old.source.mediaType },
      createdAt: old.createdAt || now(),
    });
    if (old.keyframes?.length) {
      const exId = newId();
      data.exercises.push({
        id: exId,
        videoId: old.id,
        title: old.title,
        start: old.segment?.start ?? 0,
        end: old.segment?.end ?? null,
        mode: old.extraction === 'manual' ? 'manual' : 'auto',
        keyframes: old.keyframes,
        technique: old.technique,
        category: old.category || '',
        notes: old.notes || '',
        createdAt: old.createdAt || now(),
      });
      for (const r of data.routines) for (const it of r.items) if (it.exerciseId === old.id) it.exerciseId = exId;
    }
  }
  const ids = new Set(data.exercises.map((e) => e.id));
  for (const r of data.routines) r.items = r.items.filter((it) => ids.has(it.exerciseId));
  return data;
}

// ---------- fecha de cambio de cada elemento y registro de borrados ----------
// Para juntar los cambios de varios ordenadores (sincronizar con Google) hace falta saber qué
// versión de cada elemento es la más nueva y qué se borró. Se calcula solo al guardar,
// comparando con lo último guardado: así no hay que tocarlo en cada sitio que cambia datos.

const COLLECTIONS = ['libraries', 'videos', 'exercises', 'routines'];
const recordKey = (r) => {
  const { updatedAt, ...rest } = r;
  return JSON.stringify(rest);
};
let savedSnap = new Map(); // id -> cómo estaba al guardarlo (sin updatedAt)
function rememberSaved(data) {
  savedSnap = new Map();
  for (const c of COLLECTIONS) for (const r of data[c]) savedSnap.set(r.id, recordKey(r));
}
rememberSaved(db);

function stampChanges() {
  const t = now();
  const present = new Set();
  for (const c of COLLECTIONS) {
    for (const r of db[c]) {
      present.add(r.id);
      if (savedSnap.get(r.id) !== recordKey(r)) {
        r.updatedAt = t;
        savedSnap.set(r.id, recordKey(r));
        delete db.deleted[r.id]; // si vuelve a existir, ya no está borrado
      }
    }
  }
  for (const id of [...savedSnap.keys()]) {
    if (!present.has(id)) {
      db.deleted[id] = t;
      savedSnap.delete(id);
    }
  }
  const old = Date.now() - 120 * 864e5; // los borrados de hace más de 4 meses ya no hacen falta
  for (const [id, at] of Object.entries(db.deleted)) if (Date.parse(at) < old) delete db.deleted[id];
}

let saveChain = Promise.resolve();
function saveDb() {
  if (dataError) return Promise.reject(Object.assign(new Error(dataError), { status: 503 }));
  stampChanges();
  onLocalChange();
  // Escritura atómica y serializada para no corromper el archivo.
  saveChain = saveChain.then(async () => {
    const tmp = `${DB_FILE}.${HOST}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
    await fsp.rename(tmp, DB_FILE);
    diskStamp = await stampOf();
  });
  return saveChain;
}

// ---------- varios ordenadores sobre la misma carpeta ----------

// Huella del db.json en disco: si cambia sin haberlo escrito nosotros, lo escribió otro ordenador.
let diskStamp = null;
let dataVersion = Date.now(); // cambia al cargar cambios de fuera: los navegadores se ponen al día
async function stampOf() {
  try {
    const s = await fsp.stat(DB_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

/** Si otro ordenador cambió los datos, se cargan (antes de atender cada petición y cada pocos segundos). */
async function syncFromDisk() {
  if (dataError) return;
  const st = await stampOf();
  if (!st || st === diskStamp) return;
  await saveChain.catch(() => {}); // que no sea una escritura nuestra a medias
  const st2 = await stampOf();
  if (!st2 || st2 === diskStamp) return;
  try {
    db = loadDb();
    rememberSaved(db);
    diskStamp = st2;
    dataVersion = Date.now();
    console.log('[sincronizar] cargados los cambios de otro ordenador');
  } catch (e) {
    console.error('[sincronizar] no se pudo leer db.json (¿a medio copiar?):', e.message);
  }
}

// «Estoy abierta»: cada instalación deja aquí su nombre y la hora; así las demás avisan.
const presenceFile = path.join(PRESENCE_DIR, HOST.replace(/[^\w.-]/g, '_') + '.json');
async function beat() {
  if (dataError || !SHARED) return;
  try {
    await fsp.mkdir(PRESENCE_DIR, { recursive: true });
    await fsp.writeFile(presenceFile, JSON.stringify({ host: HOST, at: Date.now() }));
  } catch {
    /* sin acceso: ya se verá en la siguiente */
  }
}
async function othersOpen() {
  if (!SHARED || dataError) return [];
  try {
    const out = [];
    for (const f of await fsp.readdir(PRESENCE_DIR)) {
      if (path.join(PRESENCE_DIR, f) === presenceFile) continue;
      const p = JSON.parse(await fsp.readFile(path.join(PRESENCE_DIR, f), 'utf8'));
      if (Date.now() - p.at < 75000) out.push(p.host);
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- sincronizar con tu cuenta de Google (Google Drive) ----------
// Los datos se guardan también en la carpeta privada de la app en tu Drive. Cada ordenador
// donde inicias sesión baja los cambios de los demás y los junta con los suyos elemento a
// elemento (gana el cambio más reciente; lo borrado queda borrado), y sube lo que tenga nuevo.

const gsync = { state: 'off', last: null, error: null, progress: null };
let gRemoteVersion = null; // versión del db.json de Drive que ya está juntada aquí
let gPushed = null; // los datos que se subieron la última vez
let gActive = null; // la vuelta de sincronización en curso
let gQueued = null; // la siguiente, si se pidió otra mientras tanto
let gTimer = null;

/** Tras cada cambio de aquí, se sincroniza a los pocos segundos (juntando varios cambios seguidos). */
function onLocalChange() {
  collab.schedule(); // y lo compartido con otras personas
  if (!google.connected()) return;
  clearTimeout(gTimer);
  gTimer = setTimeout(() => syncGoogle().catch(() => {}), 4000);
}

/** Junta los datos de dos ordenadores. */
function mergeDb(a, b) {
  const deleted = { ...(b.deleted || {}) };
  for (const [id, at] of Object.entries(a.deleted || {})) if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  const out = { deleted };
  for (const c of COLLECTIONS) {
    const byId = new Map();
    for (const r of [...(a[c] || []), ...(b[c] || [])]) {
      const cur = byId.get(r.id);
      if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) byId.set(r.id, r);
    }
    // Borrado después de su último cambio: fuera. Cambiado después de borrarse: se queda.
    out[c] = [...byId.values()].filter((r) => !(deleted[r.id] && deleted[r.id] >= (r.updatedAt || '')));
    for (const r of out[c]) delete deleted[r.id];
  }
  // Una sola raíz: si cada ordenador empezó con su propia «General», se queda la más antigua.
  const roots = out.libraries.filter((l) => l.root).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  const keep = roots[0];
  for (const extra of roots.slice(1)) {
    for (const v of out.videos) if (v.libraryId === extra.id) v.libraryId = keep.id;
    for (const c of extra.igCollections || []) {
      keep.igCollections ||= [];
      if (!keep.igCollections.some((k) => k.id === c.id)) keep.igCollections.push(c);
    }
    deleted[extra.id] = now();
  }
  out.libraries = out.libraries.filter((l) => !roots.slice(1).includes(l));
  // Referencias que apuntan a algo que ya no está.
  const libIds = new Set(out.libraries.map((l) => l.id));
  for (const v of out.videos) if (!libIds.has(v.libraryId) && keep) v.libraryId = keep.id;
  for (const l of out.libraries) if (l.parentId && !libIds.has(l.parentId)) l.parentId = null;
  // (Un dibujo puede estar sin su video: los que te comparten llegan sin él.)
  const exIds = new Set(out.exercises.map((e) => e.id));
  for (const r of out.routines) r.items = (r.items || []).filter((it) => exIds.has(it.exerciseId));
  out.routines.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return out;
}

/** Archivos (en uploads/) que usan los datos: videos, fotos, portadas y viñetas. */
function referencedFiles(data) {
  const s = new Set();
  for (const v of data.videos) {
    if (v.source?.file) s.add(v.source.file);
    if (v.poster) s.add(v.poster);
  }
  for (const e of data.exercises) for (const k of e.keyframes || []) if (k.img) s.add(k.img);
  return s;
}

/**
 * Sincroniza con Google. Si ya hay una vuelta en curso, se hace otra justo después (una sola,
 * aunque se pida varias veces); la promesa termina cuando acaba la que incluye esta petición.
 */
function syncGoogle() {
  if (!google.connected() || dataError) return Promise.resolve();
  if (!gActive) {
    gActive = runGoogleSync().finally(() => (gActive = null));
    return gActive;
  }
  gQueued ||= gActive.then(() => {
    gQueued = null;
    return syncGoogle();
  });
  return gQueued;
}

async function runGoogleSync() {
  gsync.state = 'syncing';
  gsync.error = null;
  try {
    const files = await google.listFiles();
    const remoteDb = files.get('db.json');

    // 1) Traer y juntar lo que cambió en otros ordenadores.
    if (remoteDb && remoteDb.version !== gRemoteVersion) {
      const remote = JSON.parse(await google.downloadText(remoteDb.id));
      await saveChain.catch(() => {});
      const before = JSON.stringify(db);
      const merged = mergeDb(db, remote);
      gRemoteVersion = remoteDb.version;
      if (JSON.stringify(merged) !== before) {
        db = merged;
        rememberSaved(db);
        await saveDb();
        dataVersion = Date.now();
        console.log('[google] cambios de otros ordenadores juntados');
      }
    }

    // 2) Archivos: subir a Drive los que faltan allí y bajar los que faltan aquí. Los videos de
    // carpetas compartidas ya están en un Drive con su enlace: no se guardan otra vez aquí.
    const refs = referencedFiles(db);
    const linked = new Set(db.videos.filter((v) => v.source?.drive).map((v) => v.source.file));
    const here = (f) => fs.existsSync(path.join(UPLOAD_DIR, f));
    const toUp = [...refs].filter((f) => !linked.has(f) && !files.has(f) && here(f));
    const toDown = [...refs].filter((f) => files.has(f) && !here(f));
    const total = toUp.length + toDown.length;
    let done = 0;
    for (const f of toUp) {
      gsync.progress = { done, total, what: 'Subiendo' };
      const r = await google.uploadFile(f, await fsp.readFile(path.join(UPLOAD_DIR, f)));
      files.set(f, { id: r.id, modifiedTime: now() });
      done++;
    }
    for (const f of toDown) {
      gsync.progress = { done, total, what: 'Bajando' };
      await google.downloadFile(files.get(f).id, path.join(UPLOAD_DIR, f));
      done++;
    }
    if (toDown.length) dataVersion = Date.now(); // ya se pueden ver los videos y fotos nuevos

    // 3) Subir los datos si aquí hay algo que Drive no tiene. (Si otro ordenador subió los suyos
    // justo a la vez, en su próxima vuelta junta estos con los suyos: nada se pierde.)
    const json = JSON.stringify(db);
    if (json !== gPushed || !remoteDb) {
      const up = await google.uploadFile('db.json', Buffer.from(json), { id: remoteDb?.id, type: 'application/json' });
      gRemoteVersion = up.version ?? gRemoteVersion;
      gPushed = json;
    }

    // 4) Limpieza (con margen de una hora, por si otro ordenador está subiendo lo suyo):
    // en Drive, archivos que ya no usa nadie; aquí, los de cosas borradas en otro ordenador.
    const hourAgo = Date.now() - 3600e3;
    for (const [name, f] of files) {
      if (name !== 'db.json' && (!refs.has(name) || linked.has(name)) && Date.parse(f.modifiedTime) < hourAgo) await google.deleteFile(f.id).catch(() => {});
    }
    for (const name of await fsp.readdir(UPLOAD_DIR).catch(() => [])) {
      if (refs.has(name)) continue;
      const st = await fsp.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
      if (st?.isFile() && st.mtimeMs < hourAgo) await fsp.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
    }

    gsync.state = 'idle';
    gsync.last = now();
    gsync.progress = null;
  } catch (e) {
    gsync.state = 'error';
    gsync.error = e.message;
    gsync.progress = null;
    console.error('[google]', e.message);
  }
}

const googleInfo = () => ({ ...google.status(), ...gsync, state: google.connected() ? gsync.state : 'off' });
const updateInfo = () => (DESKTOP ? { desktop: true, current: DESKTOP.version, ...DESKTOP.update } : { desktop: false });

// ---------- compartir con otras personas (Firebase) ----------

const collab = createCollab({
  localDir: LOCAL_DIR,
  uploadDir: UPLOAD_DIR,
  getDb: () => db,
  saveDb,
  markSaved: (r) => savedSnap.set(r.id, recordKey(r)), // llegó de fuera: no es un cambio de aquí
  onData: () => (dataVersion = Date.now()),
});

/** Video compartido cuyo archivo aún no está aquí: para el navegador, «por descargar» (de Drive). */
const forClient = (v) => (v.source?.drive && v.source.file && !fs.existsSync(path.join(UPLOAD_DIR, v.source.file))
  ? { ...v, source: { ...v.source, file: null } }
  : v);

/** Baja el archivo de un video compartido (de Drive, con su enlace) con el mismo nombre. */
async function fetchShared(v0) {
  try {
    await google.downloadShared(v0.source.drive, path.join(UPLOAD_DIR, v0.source.file));
  } catch (e) {
    const v = db.videos.find((x) => x.id === v0.id);
    if (v) {
      v.source.fetchError = String(e.message || e).slice(0, 300);
      await saveDb();
    }
    throw e;
  }
  dataVersion = Date.now();
}

if (!dataError) {
  if (fs.existsSync(DB_FILE)) stampOf().then((s) => (diskStamp = s));
  else saveDb();
  setInterval(() => syncFromDisk().catch(() => {}), 3000);
  beat();
  setInterval(beat, 20000);
  // Con la cuenta de Google: al arrancar, y cada 45 s para traer lo de otros ordenadores.
  setTimeout(() => syncGoogle().catch(() => {}), 1500);
  setInterval(() => syncGoogle().catch(() => {}), 45000);
  // Lo compartido: al arrancar y cada 2 minutos (para ver lo que añaden los demás y lo nuevo que te compartan).
  setTimeout(() => collab.sync().catch(() => {}), 3000);
  setInterval(() => collab.sync().catch(() => {}), Number(process.env.JR_COLLAB_EVERY) || 120000);
}
// Al cerrar, se quita la señal de «abierta» para que los demás no avisen en falso.
const leave = (code = 0) => {
  try {
    fs.unlinkSync(presenceFile);
  } catch {
    /* no estaba */
  }
  if (code === RESTART_CODE && DESKTOP) return DESKTOP.restart(); // sin el lanzador .bat: se reabre ella
  process.exit(code);
};
process.on('SIGINT', () => leave(0));
process.on('SIGTERM', () => leave(0));

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('vimeo.com')) return 'vimeo';
  return 'web';
}

function titleFromUrl(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (m) return `Instagram ${m[1]}`;
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v) return `YouTube ${v}`;
    return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

const isPlaylist = (url) => /youtube\.com\/playlist\?/i.test(url);
const isIgCollection = (url) => /instagram\.com\/[^/]+\/saved\//i.test(url);

// ---------- utilidades HTTP ----------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? MIME['.json'] : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Cuerpo demasiado grande');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail(400, 'JSON inválido');
  }
}

function safeJoin(base, rel) {
  const target = path.resolve(base, '.' + path.sep + rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

// Sirve archivos con soporte de Range (necesario para poder saltar en los videos).
async function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error();
  } catch {
    return send(res, 404, 'No encontrado');
  }
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  // La app siempre se vuelve a pedir (si no, el navegador puede usar una versión vieja);
  // los archivos subidos tienen nombre único y no cambian.
  const cache = filePath.startsWith(UPLOAD_DIR + path.sep) ? 'private, max-age=31536000, immutable' : 'no-cache';
  res.setHeader('Cache-Control', cache);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (m && !m[1] && m[2]) {
      start = stat.size - parseInt(m[2], 10);
      end = stat.size - 1;
    }
    if (start >= stat.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

// Versión de la app = última modificación de los archivos de public/ (para avisar de recargar).
async function appVersion() {
  let latest = 0;
  const walk = async (dir) => {
    for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else latest = Math.max(latest, (await fsp.stat(p)).mtimeMs);
    }
  };
  await walk(PUBLIC_DIR);
  return String(Math.round(latest));
}

// Guarda el cuerpo de la petición (archivo crudo) en data/uploads.
async function receiveUpload(req) {
  const original = decodeURIComponent(req.headers['x-filename'] || 'archivo');
  const ext = path.extname(original).toLowerCase();
  if (!VIDEO_EXT.has(ext) && !IMAGE_EXT.has(ext)) throw fail(415, `Formato no soportado: ${ext || '(sin extensión)'}`);
  const fileName = newId() + ext;
  const dest = path.join(UPLOAD_DIR, fileName);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  });
  return { file: fileName, original, mediaType: VIDEO_EXT.has(ext) ? 'video' : 'image' };
}

async function removeUpload(fileName) {
  if (!fileName) return;
  const p = safeJoin(UPLOAD_DIR, fileName);
  if (p) await fsp.unlink(p).catch(() => {});
}

// ---------- yt-dlp (descarga de YouTube, Instagram, TikTok…) ----------

function run(cmd, args) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      return resolve({ code: -1, out: '', err: String(e) });
    }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

let ytdlpCmd; // cache: [cmd, prefixArgs] o null
async function findYtDlp() {
  if (ytdlpCmd !== undefined) return ytdlpCmd;
  const candidates = [
    ['yt-dlp', []],
    ['python', ['-m', 'yt_dlp']],
    ['py', ['-m', 'yt_dlp']],
    ['python3', ['-m', 'yt_dlp']],
  ];
  for (const [cmd, pre] of candidates) {
    const r = await run(cmd, [...pre, '--version']);
    if (r.code === 0) return (ytdlpCmd = [cmd, pre]);
  }
  return (ytdlpCmd = null);
}

const extraArgs = () => (process.env.YTDLP_ARGS ? process.env.YTDLP_ARGS.split(' ').filter(Boolean) : []);

async function ytdlp() {
  const tool = await findYtDlp();
  if (!tool) throw fail(501, 'Para descargar de YouTube o Instagram hace falta yt-dlp: instálalo con "pip install yt-dlp" y reinicia el servidor. Mientras, puedes subir el archivo.');
  return tool;
}

/** Descarga un video. Devuelve { file, title }. */
async function downloadWithYtDlp(url, more = []) {
  const tool = await ytdlp();
  const base = newId();
  const args = [
    ...tool[1],
    '--no-playlist',
    '-f', 'best[ext=mp4]/mp4/best',
    '-o', path.join(UPLOAD_DIR, base + '.%(ext)s'),
    '--no-simulate', '--print', 'title',
    ...more,
    ...extraArgs(),
    url,
  ];
  const r = await run(tool[0], args);
  const produced = (await fsp.readdir(UPLOAD_DIR)).find((f) => f.startsWith(base + '.') && !f.endsWith('.part'));
  if (r.code !== 0 || !produced) {
    if (/instagram\.com/i.test(url) && /login|empty media response|cookies/i.test(r.err)) {
      throw fail(502, more.length
        ? 'Instagram no deja descargar este post ni con tu sesión. Descárgalo desde el móvil y súbelo con «Subir archivo».'
        : 'Instagram pide iniciar sesión para descargar este post: conecta tu cuenta de Instagram (en la Biblioteca) o súbelo con «Subir archivo».');
    }
    const line = r.err.split('\n').filter((l) => /ERROR/.test(l)).slice(-1).join('');
    throw fail(502, 'No se pudo descargar el video. Puedes subir el archivo a mano.' + (line ? '\n' + line.slice(0, 200) : ''));
  }
  return { file: produced, title: r.out.split('\n').map((s) => s.trim()).find(Boolean) || null };
}

/**
 * Descarga el archivo de un video con link. Instagram, si tu cuenta está conectada, va
 * directo con tu sesión (y si falla, yt-dlp con tus cookies); lo demás, con yt-dlp.
 * Devuelve { file, mediaType, title }.
 */
async function downloadSource(source) {
  // Google Drive, Dropbox, OneDrive, MEGA: el archivo compartido, tal cual.
  if (source.platform === 'cloud') return cloud.download(source.ref, UPLOAD_DIR, newId());
  if (source.platform === 'instagram' && ig.hasSession()) {
    try {
      return { ...(await ig.download(source, UPLOAD_DIR, newId())), title: null };
    } catch (e) {
      if (e.session || !(await findYtDlp())) throw e;
      const got = await ig.withCookieFile((args) => downloadWithYtDlp(source.url, args));
      return { ...got, mediaType: 'video', title: null };
    }
  }
  // YouTube, TikTok, Facebook: con tu sesión si la conectaste (videos privados o que piden cuenta).
  const net = social.netOf(source.url);
  if (net) return { ...(await social.withCookies(net, (args) => downloadWithYtDlp(source.url, args))), mediaType: 'video' };
  return { ...(await downloadWithYtDlp(source.url)), mediaType: 'video' };
}

/**
 * Trae a una biblioteca los posts nuevos de una colección de Instagram (los que ya se
 * importaron antes no se repiten, aunque los hayas borrado). La biblioteca queda enlazada
 * a la colección para poder sincronizarla. Devuelve los videos nuevos, sin guardarlos aún.
 */
async function importIgCollection(lib0, col) {
  const entries = await ig.collectionEntries(col.id);
  // Mientras se leía Instagram pudieron llegar cambios de otro ordenador: la biblioteca al día.
  const lib = db.libraries.find((l) => l.id === lib0.id) || lib0;
  lib.igCollections ||= [];
  let link = lib.igCollections.find((c) => c.id === col.id);
  if (!link) lib.igCollections.push((link = { id: col.id, name: col.name, seen: [] }));
  const seen = new Set(link.seen);
  const created = [];
  for (const e of entries) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    created.push(newVideo(lib.id, {
      title: e.title,
      source: { kind: 'link', url: e.url, platform: 'instagram', file: null, mediaType: null, igPk: e.igPk, igIndex: e.igIndex, thumb: e.thumb },
    }));
  }
  link.seen = [...seen];
  link.syncedAt = now();
  return created;
}

/** Lista de reproducción de YouTube -> [{ url, title }] sin descargar nada. */
/**
 * Una lista de YouTube (lista de reproducción, «Ver más tarde», «Me gusta», canal) o de TikTok
 * (colección, perfil) -> { title, entries: [{ id, url, title }] }, con tu sesión si está conectada.
 */
async function readList(url) {
  const net = social.netOf(url);
  const tool = await ytdlp();
  const r = await social.withCookies(net, (args) => run(tool[0], [...tool[1], '--flat-playlist', '-J', ...args, ...extraArgs(), url]));
  let data;
  try {
    data = JSON.parse(r.out);
  } catch {
    const line = r.err.split('\n').filter((l) => /ERROR/.test(l)).slice(-1).join('');
    throw fail(502, `No se pudo leer la lista${net && !social.connected(net) ? ` (si es privada, conecta tu cuenta de ${social.NETS[net].name})` : ''}.${line ? ' ' + line.slice(0, 200) : ''}`);
  }
  const entries = (data.entries || []).filter((e) => e && (e.url || e.id)).map((e) => {
    const link = net === 'youtube' && e.id && !/^https?:/.test(e.url || '') ? `https://www.youtube.com/watch?v=${e.id}` : e.url || e.webpage_url;
    return { id: String(e.id || link), url: link, title: e.title || null };
  });
  return { title: data.title || data.uploader || 'Lista', entries };
}

/** Trae a la carpeta lo nuevo de una lista enlazada (lo ya importado no se repite, aunque se borrara). */
async function importList(lib0, list) {
  const { entries } = await readList(list.url);
  const lib = db.libraries.find((l) => l.id === lib0.id) || lib0;
  const link = (lib.lists ||= []).find((x) => x.url === list.url) || (lib.lists.push(list), list);
  const seen = new Set(link.seen || []);
  const created = [];
  for (const e of entries) {
    if (seen.has(e.id) || !e.url) continue;
    seen.add(e.id);
    created.push(newVideo(lib.id, { title: e.title || titleFromUrl(e.url), source: { kind: 'link', url: e.url, platform: detectPlatform(e.url), file: null, mediaType: null } }));
  }
  link.seen = [...seen];
  link.syncedAt = now();
  return created;
}

async function expandPlaylist(url) {
  const tool = await ytdlp();
  const r = await run(tool[0], [...tool[1], '--flat-playlist', '-J', ...extraArgs(), url]);
  let data;
  try {
    data = JSON.parse(r.out);
  } catch {
    throw fail(502, 'No se pudo leer la lista de reproducción.');
  }
  return (data.entries || [])
    .filter((e) => e && e.id)
    .map((e) => ({ url: `https://www.youtube.com/watch?v=${e.id}`, title: e.title || `YouTube ${e.id}` }));
}

// ---------- API ----------

const find = (list, id, what) => {
  const x = db[list].find((e) => e.id === id);
  if (!x) throw fail(404, `${what} no encontrado`);
  return x;
};
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

// poster: imagen de portada (un fotograma), para la Biblioteca.
const VIDEO_EDITABLE = ['title', 'titleLocked', 'libraryId', 'notes', 'poster'];
// titleLocked/categoryLocked: editados a mano, el análisis ya no los sustituye.
const EXERCISE_EDITABLE = ['title', 'titleLocked', 'start', 'end', 'mode', 'keyframes', 'technique', 'category', 'categoryLocked', 'notes'];
// pinned: la rutina se ve en la página principal.
const ROUTINE_EDITABLE = ['name', 'items', 'notes', 'pinned'];

const rootLibrary = () => db.libraries.find((l) => l.root) || db.libraries[0];

/** Ids de todas las subcarpetas (a cualquier profundidad) de una carpeta. */
function descendantsOf(id) {
  const out = [];
  const walk = (pid) => {
    for (const l of db.libraries) {
      if (l.parentId === pid && !out.includes(l.id)) {
        out.push(l.id);
        walk(l.id);
      }
    }
  };
  walk(id);
  return out;
}

/**
 * Carpeta madre válida para una carpeta (null = en la Biblioteca): tiene que existir, no ser
 * la raíz, y no ser la propia carpeta ni una de sus subcarpetas (no se puede meter en sí misma).
 */
function validParent(parentId, selfId) {
  if (!parentId) return null;
  const parent = find('libraries', parentId, 'Carpeta');
  if (parent.root) return null;
  if (selfId && (parentId === selfId || descendantsOf(selfId).includes(parentId))) {
    throw fail(400, 'Una carpeta no se puede meter dentro de sí misma');
  }
  return parent.id;
}

/** Biblioteca pedida por el navegador, o la raíz si no existe. */
const libraryOrRoot = (id) => (db.libraries.some((l) => l.id === id) ? id : rootLibrary().id);

function newVideo(libraryId, fields) {
  return { id: newId(), libraryId, title: 'Video', titleLocked: false, notes: '', createdAt: now(), ...fields };
}

function newExercise(videoId, fields) {
  return {
    id: newId(),
    videoId,
    title: 'Ejercicio',
    start: 0,
    end: null,
    mode: 'manual',
    keyframes: [],
    technique: { summary: '', tags: [], cues: [] },
    category: '',
    notes: '',
    createdAt: now(),
    ...pick(fields, EXERCISE_EDITABLE),
  };
}

// Viñetas (dibujos de cada fase) guardadas en uploads.
const framesOf = (ex) => (ex.keyframes || []).map((k) => k.img).filter(Boolean);

function dropExercises(pred) {
  const dropped = db.exercises.filter(pred);
  const gone = new Set(dropped.map((e) => e.id));
  db.exercises = db.exercises.filter((e) => !gone.has(e.id));
  for (const r of db.routines) r.items = r.items.filter((it) => !gone.has(it.exerciseId));
  for (const f of dropped.flatMap(framesOf)) removeUpload(f);
}

// ---------- ajustes: carpeta de datos ----------

/** Carpetas donde tendría sentido compartir los datos: discos de red, OneDrive, Google Drive, Dropbox. */
async function suggestDirs() {
  const out = [];
  if (process.platform === 'win32') {
    const r = await run('net', ['use']);
    // Con la ruta de red (\\equipo\carpeta) y no la letra: en otro ordenador la letra puede ser otra.
    for (const m of r.out.matchAll(/^\S*\s+([A-Z]:)\s+(\\\\\S+)/gm)) out.push({ label: `Disco de red ${m[1]} (${m[2]})`, dir: `${m[2]}\\Diva Routine` });
  }
  for (const k of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    if (process.env[k] && fs.existsSync(process.env[k]) && !out.some((o) => o.label === 'OneDrive')) {
      out.push({ label: 'OneDrive', dir: `%${k}%\\Diva Routine` });
    }
  }
  // Google Drive: como unidad G: (modo «transmitir») o como carpeta del usuario (modo «duplicar»).
  for (const g of ['G:\\Mi unidad', 'G:\\My Drive']) if (fs.existsSync(g)) out.push({ label: 'Google Drive', dir: `${g}\\Diva Routine` });
  for (const name of ['Mi unidad', 'My Drive', 'Google Drive']) {
    if (fs.existsSync(path.join(os.homedir(), name)) && !out.some((o) => o.label === 'Google Drive')) {
      out.push({ label: 'Google Drive', dir: `%USERPROFILE%\\${name}\\Diva Routine` });
    }
  }
  const dropbox = path.join(os.homedir(), 'Dropbox');
  if (fs.existsSync(dropbox)) out.push({ label: 'Dropbox', dir: '%USERPROFILE%\\Dropbox\\Diva Routine' });
  return out;
}

/** Tamaño de una carpeta en MB (para avisar de cuánto hay que copiar). */
async function folderMB(dir) {
  let total = 0;
  const walk = async (d) => {
    for (const ent of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else total += (await fsp.stat(p).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(dir);
  return Math.round(total / 1048576);
}

async function settingsInfo() {
  return {
    sizeMB: dataError ? null : await folderMB(DATA_DIR),
    host: HOST,
    dataDir: DATA_DIR,
    configured: config.dataDir || '',
    shared: SHARED,
    local: LOCAL_DIR,
    error: dataError,
    others: await othersOpen(),
    suggestions: await suggestDirs(),
  };
}

/**
 * Cambia la carpeta de datos. Si la nueva ya tiene datos (de otro ordenador), se usan esos;
 * si está vacía, se copian allí los de ahora. dir vacío = volver a la carpeta de este ordenador.
 * Después el servidor se reinicia (el lanzador lo vuelve a arrancar).
 */
async function changeDataDir(dirRaw) {
  const raw = String(dirRaw || '').trim();
  const target = raw ? path.resolve(expandEnv(raw)) : LOCAL_DIR;
  if (target === DATA_DIR) throw fail(400, 'Esa ya es la carpeta de datos que se está usando.');
  try {
    await fsp.mkdir(target, { recursive: true });
    const probe = path.join(target, `.prueba-${HOST}`);
    await fsp.writeFile(probe, 'ok');
    await fsp.unlink(probe);
  } catch (e) {
    throw fail(400, `No puedo escribir en «${target}» (${e.code || e.message}). ¿Existe y tienes permiso?`);
  }
  const adopted = fs.existsSync(path.join(target, 'db.json'));
  if (!adopted && !dataError) {
    // Copia de los datos (sin lo que es solo de este ordenador: la sesión de Instagram).
    await saveChain.catch(() => {});
    await fsp.cp(DATA_DIR, target, {
      recursive: true,
      filter: (src) => !/[\\/](presencia|instagram\.json|instagram-cookies\.txt)$|\.tmp$/.test(src),
    });
  }
  const next = { ...config };
  if (raw && target !== LOCAL_DIR) next.dataDir = raw;
  else delete next.dataDir;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  console.log(`[ajustes] carpeta de datos: ${target} (${adopted ? 'usando los datos que ya había' : 'datos copiados'}). Reiniciando…`);
  setTimeout(() => leave(RESTART_CODE), 500);
  return { ok: true, dir: target, adopted, restart: true };
}

const fetching = new Map(); // id de video -> descarga en curso

async function fetchVideo(v0) {
  let got;
  // La descarga tarda: al acabar se usa el video tal como esté entonces (otro ordenador pudo
  // cambiar los datos, o incluso borrarlo).
  const current = () => db.videos.find((x) => x.id === v0.id);
  try {
    got = await downloadSource(v0.source);
  } catch (e) {
    // Se apunta para no reintentarlo solo cada vez que se abre la app (sí a mano).
    const v = current();
    if (v) {
      v.source.fetchError = String(e.message || e).slice(0, 300);
      await saveDb();
    }
    throw e;
  }
  const v = current();
  if (!v) return removeUpload(got.file);
  if (v.source.file) return removeUpload(got.file); // ya lo bajó otro ordenador
  delete v.source.fetchError;
  await removeUpload(v.source.file);
  await removeUpload(v.poster); // la portada era del archivo anterior
  delete v.poster;
  Object.assign(v.source, { file: got.file, mediaType: got.mediaType });
  if (got.title && !v.titleLocked) v.title = got.title.slice(0, 120);
  await saveDb();
}

async function deleteVideo(v) {
  db.videos = db.videos.filter((x) => x !== v);
  dropExercises((e) => e.videoId === v.id);
  await removeUpload(v.source.file);
  await removeUpload(v.poster);
  // La copia compartida en tu Drive, si la subiste tú.
  if (v.source.drive && v.source.driveBy && v.source.driveBy === google.email()?.toLowerCase()) google.deleteFile(v.source.drive).catch(() => {});
}

async function handleApi(req, res, parts) {
  const [resource, id, action, sub] = parts;
  const method = req.method;

  // --- ajustes: carpeta de datos (compartida entre ordenadores o la de este) ---
  if (resource === 'settings') {
    if (!id && method === 'GET') return send(res, 200, await settingsInfo());
    if (id === 'data-dir' && method === 'POST') {
      const { dir } = await readJson(req);
      return send(res, 200, await changeDataDir(dir));
    }
  }
  // --- cuenta de Google (sincronizar con Google Drive) ---
  if (resource === 'google') {
    if (!id && method === 'GET') return send(res, 200, googleInfo());
    if (id === 'client' && method === 'POST') {
      // El JSON que descarga Google Cloud (o { client_id, client_secret }).
      const body = await readJson(req);
      await google.setClient(body.json ?? body);
      return send(res, 200, googleInfo());
    }
    if (id === 'login' && method === 'GET') {
      // Google vuelve a este ordenador (127.0.0.1) con el permiso; ver más abajo, en el servidor.
      res.writeHead(302, { Location: google.loginUrl(`http://127.0.0.1:${PORT}/`) });
      return res.end();
    }
    if (id === 'logout' && method === 'POST') {
      await google.logout();
      Object.assign(gsync, { state: 'off', error: null, progress: null });
      gRemoteVersion = null;
      gPushed = null;
      return send(res, 200, googleInfo());
    }
    if (id === 'sync' && method === 'POST') {
      if (!google.connected()) throw fail(400, 'Primero inicia sesión con Google.');
      await syncGoogle();
      return send(res, 200, googleInfo());
    }
    if (id === 'firebase' && method === 'POST') {
      // El bloque firebaseConfig de la consola de Firebase (para compartir con otras personas).
      const body = await readJson(req);
      await google.setFirebase(body.config ?? body);
      collab.sync().catch(() => {});
      return send(res, 200, googleInfo());
    }
  }
  if (resource === 'version' && method === 'GET') {
    // data: cambia cuando llegan cambios de otro ordenador; others: dónde más está abierta;
    // update: si hay una versión nueva de la app de escritorio.
    return send(res, 200, { version: await appVersion(), data: dataVersion, others: await othersOpen(), error: dataError, google: googleInfo(), collab: collab.status(), update: updateInfo() });
  }
  // --- actualizaciones de la app de escritorio ---
  if (resource === 'update') {
    if (!id && method === 'GET') return send(res, 200, updateInfo());
    if (!DESKTOP) throw fail(400, 'Las actualizaciones solas son de la app instalada.');
    if (id === 'check' && method === 'POST') {
      await DESKTOP.check();
      return send(res, 200, updateInfo());
    }
    if (id === 'install' && method === 'POST') {
      if (DESKTOP.update.state !== 'ready') throw fail(400, 'La nueva versión aún no está descargada.');
      send(res, 200, { ok: true });
      // Se cierra, se instala y se vuelve a abrir sola (tras guardar lo pendiente).
      await saveChain.catch(() => {});
      setTimeout(() => DESKTOP.install(), 300);
      return;
    }
  }
  if (dataError) throw fail(503, dataError);
  await syncFromDisk();

  if (resource === 'state' && method === 'GET') {
    return send(res, 200, {
      ...db,
      videos: db.videos.map(forClient),
      collab: collab.info(),
      update: updateInfo(),
      ytdlp: Boolean(await findYtDlp()),
      instagram: ig.status(),
      social: social.status(),
      version: await appVersion(),
      data: dataVersion,
      sync: { shared: SHARED, dataDir: DATA_DIR, host: HOST, others: await othersOpen() },
      google: googleInfo(),
    });
  }

  // --- compartir con otras personas: carpetas, rutinas y dibujos ---
  if (resource === 'collab') {
    if (!id && method === 'GET') return send(res, 200, { ...collab.info(), rules: RULES });
    if (id === 'sync' && method === 'POST') {
      await collab.sync();
      return send(res, 200, collab.info());
    }
    if (id === 'share' && method === 'POST') {
      // { type: folder|routine|drawing, id, email? }: lo comparte (si no lo estaba) e invita a esa persona.
      const body = await readJson(req);
      let space = await collab.share(String(body.type || ''), String(body.id || ''));
      if (body.email) space = await collab.addMember(space.id, body.email);
      collab.sync().catch(() => {}); // sube ya lo que se comparte
      return send(res, 200, space);
    }
    if (id && action === 'members' && method === 'POST') {
      const { email } = await readJson(req);
      return send(res, 200, await collab.addMember(id, email));
    }
    if (id && action === 'members' && sub && method === 'DELETE') return send(res, 200, await collab.removeMember(id, sub));
    if (id && action === 'leave' && method === 'POST') {
      // Si es tuyo: dejar de compartirlo (te lo quedas). Si te lo compartieron: salir (se quita de aquí).
      const r = await collab.leave(id);
      return send(res, 200, r);
    }
  }

  // --- cuenta de Instagram (la sesión nunca sale del servidor) ---
  // --- otras redes: YouTube, TikTok, Facebook (la sesión nunca sale del servidor) ---
  if (resource === 'copy' && !id && method === 'POST') {
    // { videos, folders, target }: copias (con sus archivos) en la carpeta o biblioteca target.
    // Una carpeta se copia entera, con sus subcarpetas. Los dibujos se quedan en el original.
    const body = await readJson(req);
    const dest = find('libraries', body.target, 'Carpeta');
    const parentOf = (l) => (l.root ? null : l.id);
    const libraries = [];
    const videos = [];
    const copyFile = async (name) => {
      if (!name) return name;
      const from = safeJoin(UPLOAD_DIR, name);
      if (!from || !fs.existsSync(from)) return null;
      const to = newId() + path.extname(name);
      await fsp.copyFile(from, path.join(UPLOAD_DIR, to));
      return to;
    };
    const copyVideo = async (v, libraryId) => {
      const c = JSON.parse(JSON.stringify(v));
      Object.assign(c, { id: newId(), libraryId, createdAt: now() });
      delete c.addedBy;
      delete c.updatedAt;
      if (c.source?.file && !c.source.drive) c.source.file = await copyFile(c.source.file);
      if (c.poster) c.poster = await copyFile(c.poster);
      videos.push(c);
    };
    const copyFolder = async (l, parentId) => {
      const c = { id: newId(), name: l.name, parentId, createdAt: now() };
      libraries.push(c);
      for (const v of db.videos.filter((x) => x.libraryId === l.id)) await copyVideo(v, c.id);
      for (const sub of db.libraries.filter((x) => x.parentId === l.id)) await copyFolder(sub, c.id);
    };
    for (const vid of body.videos || []) await copyVideo(find('videos', vid, 'Video'), dest.id);
    for (const fid of body.folders || []) {
      const l = find('libraries', fid, 'Carpeta');
      if (fid === dest.id || descendantsOf(fid).includes(dest.id)) throw fail(400, 'Una carpeta no se puede copiar dentro de sí misma');
      await copyFolder(l, parentOf(dest));
    }
    db.libraries.push(...libraries);
    db.videos.push(...videos);
    await saveDb();
    return send(res, 200, { libraries, videos: videos.map(forClient) });
  }
  if (resource === 'cloud' && id === 'import' && method === 'POST') {
    // { url, libraryId }: un archivo va a esa carpeta; una carpeta, a una carpeta nueva dentro.
    const body = await readJson(req);
    const url = String(body.url || '').trim();
    if (!/^https?:\/\//i.test(url) || !cloud.cloudOf(url)) throw fail(400, 'Pega el link compartido de Google Drive, Dropbox, OneDrive o MEGA.');
    const target = db.libraries.find((l) => l.id === body.libraryId) || rootLibrary();
    const found = await cloud.list(url);
    try {
      if (!found.items.length) throw fail(400, 'Ahí no hay videos ni fotos (o no se pueden ver con ese link).');
      let lib = target;
      if (found.folder) {
        lib = { id: newId(), name: String(found.name).slice(0, 60), parentId: target.root ? null : target.id, createdAt: now() };
        db.libraries.push(lib);
      }
      const created = [];
      for (const it of found.items) {
        const v = newVideo(lib.id, {
          title: it.name.replace(/\.[^.]+$/, '').slice(0, 120),
          source: { kind: 'link', url, platform: 'cloud', cloud: cloud.cloudOf(url), ref: it.ref, file: null, mediaType: null },
        });
        // De Dropbox, una carpeta ya viene bajada (en .zip): se guarda ya.
        if (it.ref.local) {
          Object.assign(v.source, await cloud.download(it.ref, UPLOAD_DIR, newId()));
          delete v.source.ref.local;
        }
        created.push(v);
      }
      db.videos.push(...created);
      await saveDb();
      return send(res, 200, { library: lib, created: created.map(forClient) });
    } finally {
      await found.cleanup?.();
    }
  }
  if (resource === 'social') {
    if (!id && method === 'GET') return send(res, 200, social.status());
    if (social.NETS[id] && !action && method === 'POST') {
      const { cookies } = await readJson(req);
      return send(res, 200, await social.connect(id, cookies));
    }
    if (social.NETS[id] && !action && method === 'DELETE') return send(res, 200, await social.disconnect(id));
    if (id === 'youtube' && action === 'lists' && method === 'GET') {
      // Tus listas de YouTube (con tu sesión), más «Ver más tarde» y «Me gusta».
      if (!social.connected('youtube')) throw fail(400, 'Conecta primero tu cuenta de YouTube.');
      const mine = await readList('https://www.youtube.com/feed/playlists').catch(() => ({ entries: [] }));
      const lists = [
        { name: 'Ver más tarde', url: 'https://www.youtube.com/playlist?list=WL' },
        { name: 'Videos que me gustan', url: 'https://www.youtube.com/playlist?list=LL' },
        ...mine.entries.filter((e) => /list=/.test(e.url)).map((e) => ({ name: e.title || 'Lista', url: e.url })),
      ].map((l) => ({ ...l, libraries: db.libraries.filter((x) => x.lists?.some((y) => y.url === l.url)).map((x) => x.id) }));
      return send(res, 200, { lists });
    }
    if (id === 'lists' && action === 'import' && method === 'POST') {
      // { url, name?, libraryId? }: sin libraryId, a una carpeta nueva con el nombre de la lista.
      const body = await readJson(req);
      const url = String(body.url || '').trim();
      if (!/^https?:\/\//i.test(url) || !social.netOf(url)) throw fail(400, 'Pega el link de una lista de YouTube o de una colección o perfil de TikTok.');
      const info = await readList(url);
      if (!info.entries.length) throw fail(400, 'Esa lista está vacía (o es privada y falta conectar la cuenta).');
      let lib = db.libraries.find((l) => l.id === body.libraryId) || db.libraries.find((l) => l.lists?.some((x) => x.url === url));
      const isNew = !lib;
      if (isNew) lib = { id: newId(), name: String(body.name || info.title).slice(0, 60), parentId: validParent(body.parentId, null), createdAt: now() };
      const created = await importList(lib, { url, name: String(body.name || info.title).slice(0, 80), net: social.netOf(url), seen: [] });
      if (isNew) db.libraries.push(lib);
      db.videos.push(...created);
      await saveDb();
      return send(res, 200, { library: db.libraries.find((l) => l.id === lib.id) || lib, created });
    }
    if (id === 'lists' && action === 'unlink' && method === 'POST') {
      // { libraryId, url }: deja de sincronizar esa lista (lo importado se queda).
      const { libraryId, url } = await readJson(req);
      const lib = find('libraries', libraryId, 'Carpeta');
      lib.lists = (lib.lists || []).filter((x) => x.url !== url);
      await saveDb();
      return send(res, 200, lib);
    }
  }

  if (resource === 'instagram') {
    if (!id && method === 'GET') return send(res, 200, ig.status());
    if (!id && method === 'POST') {
      const { cookies } = await readJson(req);
      return send(res, 200, await ig.connect(cookies));
    }
    if (!id && method === 'DELETE') return send(res, 200, await ig.disconnect());
    if (id === 'collections' && !action && method === 'GET') {
      let list;
      try {
        list = await ig.listCollections();
      } catch (e) {
        if (e.session) throw e;
        throw fail(502, `No pude leer la lista de tus colecciones: ${e.message}`);
      }
      const collections = list.map((c) => ({
        ...c,
        libraries: db.libraries.filter((l) => l.igCollections?.some((x) => x.id === c.id)).map((l) => l.id),
      }));
      return send(res, 200, { collections });
    }
    if (id === 'collections' && action === 'import' && method === 'POST') {
      // { id, name, libraryId? }: sin libraryId va a la biblioteca de esa colección (se crea si no existe).
      const body = await readJson(req);
      const col = { id: String(body.id || ''), name: String(body.name || 'Instagram').slice(0, 60) };
      if (!col.id) throw fail(400, 'Falta la colección');
      let lib = db.libraries.find((l) => l.id === body.libraryId)
        || db.libraries.find((l) => l.igCollections?.some((x) => x.id === col.id));
      const isNew = !lib;
      if (isNew) lib = { id: newId(), name: col.name, parentId: validParent(body.parentId, null), createdAt: now() };
      const created = await importIgCollection(lib, col);
      if (isNew) db.libraries.push(lib);
      db.videos.push(...created);
      await saveDb();
      return send(res, 200, { library: db.libraries.find((l) => l.id === lib.id) || lib, created });
    }
  }

  // --- bibliotecas ---
  if (resource === 'libraries') {
    if (!id && method === 'POST') {
      // parentId: carpeta dentro de otra (sin él, va en la Biblioteca).
      const { name, parentId, shelf } = await readJson(req);
      // shelf: una biblioteca más (con sus propias carpetas), no una carpeta.
      const lib = shelf
        ? { id: newId(), name: String(name || 'Nueva biblioteca').slice(0, 60), shelf: true, createdAt: now() }
        : { id: newId(), name: String(name || 'Nueva carpeta').slice(0, 60), parentId: validParent(parentId, null), createdAt: now() };
      db.libraries.push(lib);
      await saveDb();
      return send(res, 201, lib);
    }
    if (id === 'order' && method === 'POST') {
      // { ids }: el orden de unas carpetas (las de un mismo sitio), de la primera a la última.
      const { ids } = await readJson(req);
      const libs = (Array.isArray(ids) ? ids : []).map((x) => find('libraries', x, 'Carpeta'));
      libs.forEach((l, i) => (l.order = i));
      await saveDb();
      return send(res, 200, { libraries: libs });
    }
    const lib = find('libraries', id, 'Biblioteca');
    if (action === 'sync' && method === 'POST') {
      // Trae los posts nuevos de las colecciones de Instagram enlazadas a esta biblioteca.
      const created = [];
      const errors = [];
      // Nombres actuales de las colecciones (por si se cambiaron en Instagram).
      const current = new Map(lib.igCollections?.length ? (await ig.listCollections().catch(() => [])).map((c) => [c.id, c.name]) : []);
      // Listas de YouTube y TikTok enlazadas a la carpeta: lo nuevo desde la última vez.
      for (const list of lib.lists || []) {
        try {
          created.push(...(await importList(lib, list)));
        } catch (e) {
          errors.push(`${list.name}: ${e.message}`);
        }
      }
      for (const col of lib.igCollections || []) {
        if (current.get(col.id) && current.get(col.id) !== col.name) col.name = current.get(col.id);
        try {
          created.push(...(await importIgCollection(lib, col)));
        } catch (e) {
          if (!created.length && (e.session || lib.igCollections.length === 1)) throw e;
          errors.push(`${col.name}: ${e.message}`);
          if (e.session) break;
        }
      }
      db.videos.push(...created);
      // La carpeta toma el nombre de la colección si solo tiene esa colección, nada más importado
      // (ni subcarpetas) y no le pusiste tú otro nombre.
      const cur = db.libraries.find((l) => l.id === lib.id) || lib;
      const only = cur.igCollections?.length === 1 && !cur.nameLocked
        && !db.libraries.some((l) => l.parentId === cur.id)
        && db.videos.filter((v) => v.libraryId === cur.id).every((v) => v.source?.platform === 'instagram' && v.source.igPk);
      if (only && cur.igCollections[0].name && cur.name !== cur.igCollections[0].name) cur.name = cur.igCollections[0].name.slice(0, 60);
      await saveDb();
      return send(res, 200, { library: cur, created, errors });
    }
    if (method === 'PUT') {
      const body = await readJson(req);
      if ('parentId' in body && !lib.root) {
        const parentId = validParent(body.parentId, lib.id);
        collab.guard((d) => (d.libraries.find((l) => l.id === lib.id).parentId = parentId));
        lib.parentId = parentId;
      }
      if (body.name && String(body.name).slice(0, 60) !== lib.name) {
        lib.name = String(body.name).slice(0, 60);
        lib.nameLocked = true; // nombre tuyo: sincronizar con Instagram ya no lo cambia
      }
      if (body.nameLocked === false) delete lib.nameLocked; // vuelve a seguir el nombre de la colección
      await saveDb();
      return send(res, 200, lib);
    }
    if (action === 'collections' && sub && method === 'DELETE') {
      // Deja de sincronizar esa colección (los videos ya importados se quedan).
      lib.igCollections = (lib.igCollections || []).filter((c) => c.id !== sub);
      await saveDb();
      return send(res, 200, lib);
    }
    if (!action && method === 'DELETE') {
      if (lib.root) {
        // La raíz no desaparece (es donde se importa lo suelto): se vacía.
        for (const v of db.videos.filter((x) => x.libraryId === id)) await deleteVideo(v);
        lib.igCollections = [];
      } else {
        // La carpeta, sus subcarpetas y todo lo que tienen dentro.
        const gone = new Set([id, ...descendantsOf(id)]);
        collab.guard((d) => {
          d.libraries = d.libraries.filter((l) => !gone.has(l.id));
          d.videos = d.videos.filter((v) => !gone.has(v.libraryId));
        });
        for (const v of db.videos.filter((x) => gone.has(x.libraryId))) await deleteVideo(v);
        db.libraries = db.libraries.filter((l) => !gone.has(l.id));
      }
      await saveDb();
      return send(res, 200, { ok: true });
    }
  }

  // --- videos ---
  if (resource === 'videos') {
    if (!id && method === 'POST') {
      // Alta por links: { urls, libraryId }. Las listas de YouTube se expanden en sus videos.
      const { urls = [], libraryId } = await readJson(req);
      const created = [];
      const errors = [];
      for (const raw of urls.map((u) => String(u || '').trim()).filter(Boolean)) {
        if (!/^https?:\/\//i.test(raw)) {
          errors.push(`${raw}: no es un link`);
          continue;
        }
        if (isIgCollection(raw)) {
          if (!ig.hasSession()) {
            errors.push(`${raw}: es una colección privada; para importarla conecta tu cuenta de Instagram (botón «Conectar Instagram» a la izquierda)`);
            continue;
          }
          // Pegada fuera de una carpeta, la colección va a su propia carpeta (la que ya tenga, o una nueva).
          const col = ig.parseCollectionUrl(raw);
          let lib = db.libraries.find((l) => l.id === libraryId) || rootLibrary();
          let isNew = false;
          if (lib.root) {
            lib = db.libraries.find((l) => l.igCollections?.some((c) => c.id === col.id))
              || ((isNew = true), { id: newId(), name: col.name.slice(0, 60), createdAt: now() });
          }
          try {
            created.push(...(await importIgCollection(lib, col)));
            if (isNew) db.libraries.push(lib);
          } catch (e) {
            errors.push(`${raw}: ${e.message}`);
          }
          continue;
        }
        let entries = [{ url: raw, title: null }];
        if (isPlaylist(raw)) {
          try {
            entries = await expandPlaylist(raw);
          } catch (e) {
            errors.push(`${raw}: ${e.message}`);
            continue;
          }
        }
        for (const e of entries) {
          created.push(
            newVideo(libraryOrRoot(libraryId), {
              title: e.title || titleFromUrl(e.url),
              source: { kind: 'link', url: e.url, platform: detectPlatform(e.url), file: null, mediaType: null },
            })
          );
        }
      }
      db.videos.push(...created);
      await saveDb();
      return send(res, 201, { created, errors });
    }
    if (id === 'upload' && method === 'POST') {
      const up = await receiveUpload(req);
      const v = newVideo(libraryOrRoot(String(req.headers['x-library'] || '')), {
        title: up.original.replace(/\.[^.]+$/, ''),
        source: { kind: up.mediaType === 'image' ? 'photo' : 'upload', url: '', platform: 'local', file: up.file, mediaType: up.mediaType },
      });
      db.videos.push(v);
      await saveDb();
      return send(res, 201, v);
    }
    if (id === 'delete' && method === 'POST') {
      // Borrado de varios a la vez: { ids }.
      const { ids = [] } = await readJson(req);
      const gone = db.videos.filter((v) => ids.includes(v.id));
      collab.guard((d) => (d.videos = d.videos.filter((v) => !ids.includes(v.id))));
      for (const v of gone) await deleteVideo(v);
      await saveDb();
      return send(res, 200, { deleted: gone.length });
    }
    const v = find('videos', id, 'Video');
    if (action === 'exercises' && method === 'DELETE') {
      dropExercises((e) => e.videoId === v.id);
      await saveDb();
      return send(res, 200, { ok: true });
    }
    if (!action && method === 'PUT') {
      const body = pick(await readJson(req), VIDEO_EDITABLE);
      if ('libraryId' in body) {
        find('libraries', body.libraryId, 'Carpeta');
        collab.guard((d) => (d.videos.find((x) => x.id === v.id).libraryId = body.libraryId));
      }
      if ('poster' in body && v.poster && v.poster !== body.poster) await removeUpload(v.poster);
      Object.assign(v, body);
      await saveDb();
      return send(res, 200, forClient(v));
    }
    if (!action && method === 'DELETE') {
      collab.guard((d) => (d.videos = d.videos.filter((x) => x.id !== v.id)));
      await deleteVideo(v);
      await saveDb();
      return send(res, 200, { ok: true });
    }
    if (action === 'file' && method === 'POST') {
      // Adjunta el archivo a un video que solo tenía link.
      const up = await receiveUpload(req);
      await removeUpload(v.source.file);
      await removeUpload(v.poster);
      delete v.poster;
      delete v.source.fetchError;
      Object.assign(v.source, { file: up.file, mediaType: up.mediaType });
      await saveDb();
      return send(res, 200, v);
    }
    if (action === 'fetch' && method === 'POST') {
      if (v.source.drive && v.source.file) {
        // Compartido por otra persona (o subido desde otro ordenador tuyo): de su Drive.
        if (!fs.existsSync(path.join(UPLOAD_DIR, v.source.file))) {
          if (!fetching.has(v.id)) fetching.set(v.id, fetchShared(v).finally(() => fetching.delete(v.id)));
          await fetching.get(v.id);
        }
        return send(res, 200, forClient(db.videos.find((x) => x.id === v.id) || v));
      }
      if (!v.source.url) throw fail(400, 'Este video no tiene link');
      // Ya descargado (p. ej. desde otra pestaña): no se vuelve a bajar.
      if (v.source.file) return send(res, 200, v);
      // Si otra pestaña lo está descargando ahora mismo, se espera a esa misma descarga.
      if (!fetching.has(v.id)) fetching.set(v.id, fetchVideo(v).finally(() => fetching.delete(v.id)));
      await fetching.get(v.id);
      return send(res, 200, db.videos.find((x) => x.id === v.id) || v);
    }
    if (action === 'auto' && method === 'POST') {
      // Resultado de la extracción automática: sustituye los ejercicios automáticos
      // anteriores de este video (los manuales se quedan).
      const { exercises = [] } = await readJson(req);
      dropExercises((e) => e.videoId === v.id && e.mode === 'auto');
      const created = exercises.map((e) => newExercise(v.id, { ...e, mode: 'auto' }));
      db.exercises.push(...created);
      await saveDb();
      return send(res, 200, { exercises: db.exercises.filter((e) => e.videoId === v.id) });
    }
  }

  // --- viñetas: imagen de una fase (webp/png), se guarda y se devuelve su nombre ---
  if (resource === 'frames' && !id && method === 'POST') {
    const up = await receiveUpload(req);
    if (up.mediaType !== 'image') {
      await removeUpload(up.file);
      throw fail(415, 'La viñeta tiene que ser una imagen');
    }
    return send(res, 201, { file: up.file });
  }

  // --- ejercicios (tramos de un video) ---
  if (resource === 'exercises') {
    if (!id && method === 'POST') {
      const body = await readJson(req);
      find('videos', body.videoId, 'Video');
      const ex = newExercise(body.videoId, body);
      db.exercises.push(ex);
      await saveDb();
      return send(res, 201, ex);
    }
    const ex = find('exercises', id, 'Ejercicio');
    if (method === 'PUT') {
      const before = framesOf(ex);
      Object.assign(ex, pick(await readJson(req), EXERCISE_EDITABLE));
      const now = new Set(framesOf(ex));
      for (const f of before) if (!now.has(f)) removeUpload(f); // viñetas sustituidas
      await saveDb();
      return send(res, 200, ex);
    }
    if (method === 'DELETE') {
      dropExercises((e) => e.id === ex.id);
      await saveDb();
      return send(res, 200, { ok: true });
    }
  }

  // --- rutinas ---
  if (resource === 'routines') {
    if (!id && method === 'POST') {
      const body = await readJson(req);
      const r = { id: newId(), name: String(body.name || 'Nueva rutina').slice(0, 80), notes: '', items: body.items || [], createdAt: now(), updatedAt: now() };
      db.routines.unshift(r);
      await saveDb();
      return send(res, 201, r);
    }
    const r = find('routines', id, 'Rutina');
    if (method === 'PUT') {
      Object.assign(r, pick(await readJson(req), ROUTINE_EDITABLE), { updatedAt: now() });
      await saveDb();
      return send(res, 200, r);
    }
    if (method === 'DELETE') {
      db.routines = db.routines.filter((x) => x !== r);
      await saveDb();
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: 'Ruta no encontrada' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    // Solo para este ordenador: otras webs abiertas en el navegador no pueden usar la API
    // (el servidor guarda tu sesión de Instagram).
    const LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
    if (!LOCAL.test(req.headers.host || '') || (req.headers.origin && !LOCAL.test(req.headers.origin))) {
      return send(res, 403, 'Prohibido');
    }

    // Vuelta de Google tras iniciar sesión: http://127.0.0.1:PUERTO/?code=…&state=…
    const state = url.searchParams.get('state');
    if (pathname === '/' && state && google.isPendingState(state)) {
      try {
        const err = url.searchParams.get('error');
        if (err) throw new Error(err === 'access_denied' ? 'Cancelaste el inicio de sesión con Google.' : `Google respondió: ${err}`);
        await google.finishLogin(url.searchParams.get('code'), state);
        gsync.error = null;
        syncGoogle().catch(() => {});
        collab.sync().catch(() => {});
      } catch (e) {
        gsync.error = e.message;
      }
      if (DESKTOP) {
        // Se inició sesión en el navegador (Google no deja hacerlo dentro de la app): de vuelta a la ventana.
        DESKTOP.focus();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>Diva Routine</title>
          <body style="font:16px system-ui;background:#f6f1ea;color:#2b2622;display:grid;place-items:center;height:90vh;margin:0">
          <div style="max-width:420px;text-align:center"><h2>${gsync.error ? 'No se pudo iniciar sesión' : 'Sesión iniciada'}</h2>
          <p>${gsync.error ? gsync.error.replace(/[<>&]/g, '') : 'Ya puedes cerrar esta pestaña y volver a Diva Routine.'}</p></div></body>`);
      }
      res.writeHead(302, { Location: `http://localhost:${PORT}/#/ajustes` });
      return res.end();
    }

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname.slice(5).split('/').filter(Boolean));
    }
    if (pathname.startsWith('/media/')) {
      const p = safeJoin(UPLOAD_DIR, pathname.slice(7));
      return p ? await serveFile(req, res, p) : send(res, 400, 'Ruta inválida');
    }
    const p = safeJoin(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
    return p ? await serveFile(req, res, p) : send(res, 400, 'Ruta inválida');
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.message || 'Error interno' });
    else res.end();
  }
});

/** Cuando ya escucha: el puerto (la app de escritorio abre su ventana ahí). */
export const ready = new Promise((resolve, reject) => {
  server.on('error', (e) => {
    // En la app de escritorio, si el puerto está ocupado (p. ej. por la versión de desarrollo), otro libre.
    if (e.code === 'EADDRINUSE' && DESKTOP && PORT) {
      PORT = 0;
      return server.listen(0, '127.0.0.1');
    }
    reject(e);
  });
  server.listen(PORT, '127.0.0.1', () => {
    PORT = server.address().port;
    console.log(`Diva Routine en http://localhost:${PORT}`);
    resolve(PORT);
  });
});
