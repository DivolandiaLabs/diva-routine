// Cuenta de MEGA: iniciar sesión con correo y contraseña, ver tus carpetas para importar videos
// y fotos, y guardar una copia de tus datos en la carpeta «Diva Routine» de tu MEGA.
//
// La contraseña NO se guarda nunca: solo sirve para iniciar sesión. Lo que se guarda (en data/
// local, mega.json) es la sesión de MEGA, cifrada con el sistema (Windows: DPAPI, vía Electron
// safeStorage). Sin ese cifrado (p. ej. el servidor sin la app de escritorio), la sesión solo
// vive en memoria y hay que volver a entrar al reiniciar.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Storage } from 'megajs';

const FOLDER = 'Diva Routine';
const MEDIA = /\.(mp4|m4v|mov|webm|mkv|jpe?g|png|gif|webp|heic|avif)$/i;

let FILE;
let protect = null; // { encrypt(str) -> str, decrypt(str) -> str }
let storage = null; // megajs Storage con la sesión iniciada
let saved = null; // { session (cifrada), email, sync }
let loaded = 0; // cuándo se cargó el árbol de archivos

const mError = (msg, extra = {}) => Object.assign(new Error(msg), { status: 400, ...extra });

export function initMega({ localDir, crypt }) {
  FILE = path.join(localDir, 'mega.json');
  protect = crypt || null;
  try {
    saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    saved = null;
  }
}

const persist = () => (saved ? fsp.writeFile(FILE, JSON.stringify(saved, null, 2)) : fsp.unlink(FILE).catch(() => {}));

/** La sesión guardada, abierta (sin volver a pedir la contraseña). */
async function session() {
  if (storage) return storage;
  if (!saved?.session || !protect) throw mError('Conecta tu cuenta de MEGA en Ajustes › Nube.', { auth: true });
  let json;
  try {
    json = JSON.parse(protect.decrypt(saved.session));
  } catch {
    throw mError('No se pudo abrir la sesión de MEGA guardada. Vuelve a conectar la cuenta.', { auth: true });
  }
  storage = Storage.fromJSON(json);
  loaded = 0;
  return storage;
}

/** Carga (o recarga) el árbol de archivos; como mucho una vez cada `maxAge` ms. */
async function tree(maxAge = 20000) {
  const s = await session();
  if (!s.root || Date.now() - loaded > maxAge) {
    try {
      await s.reload(true);
    } catch (e) {
      if (/ESID|EEXPIRED|-15|-11/.test(String(e.message))) {
        storage = null;
        throw mError('La sesión de MEGA caducó. Vuelve a conectar la cuenta en Ajustes › Nube.', { auth: true });
      }
      throw mError('MEGA no responde: ' + e.message);
    }
    loaded = Date.now();
  }
  return s;
}

export const connected = () => Boolean(storage || (saved?.session && protect));
export const syncOn = () => connected() && Boolean(saved?.sync);
export const status = () => ({ connected: connected(), email: saved?.email || storage?.email || null, sync: syncOn(), persistent: Boolean(protect) });

/** Inicia sesión. Si la cuenta tiene verificación en dos pasos, hace falta `code`. */
export async function login({ email, password, code }) {
  email = String(email || '').trim();
  if (!email || !password) throw mError('Escribe tu correo y tu contraseña de MEGA.');
  let s;
  try {
    s = await new Storage({ email, password: String(password), secondFactorCode: code ? String(code).trim() : undefined, keepalive: false, autoload: true }).ready;
  } catch (e) {
    const m = String(e.message || e);
    if (/EMFAREQUIRED|-26/.test(m)) throw mError('Tu cuenta tiene verificación en dos pasos: escribe el código de 6 cifras.', { mfa: true });
    if (/ENOENT|EKEY|-9|-14|invalid credentials/i.test(m)) throw mError('Correo o contraseña de MEGA incorrectos.');
    if (/EBLOCKED|-16/.test(m)) throw mError('MEGA tiene bloqueada esa cuenta.');
    throw mError('No se pudo entrar en MEGA: ' + m);
  }
  const json = s.toJSON();
  delete json.options.password; // (megajs ya la quita; por si acaso)
  delete json.options.secondFactorCode;
  storage = s;
  loaded = Date.now();
  saved = { email: s.email, sync: saved?.sync || false, session: protect ? protect.encrypt(JSON.stringify(json)) : null };
  await persist();
  return status();
}

export async function logout() {
  storage?.close?.();
  storage = null;
  saved = null;
  await persist();
  return status();
}

export async function setSync(on) {
  if (!connected()) throw mError('Primero conecta tu cuenta de MEGA.');
  saved = { ...(saved || { email: storage?.email }), sync: Boolean(on) };
  await persist();
  return status();
}

/** Espacio de la cuenta: { used, total }. */
export async function storageInfo() {
  const a = await (await session()).getAccountInfo();
  return { used: a.spaceUsed, total: a.spaceTotal };
}

// ---------- explorar e importar ----------

const nodeOf = (s, id) => (id ? s.files[id] : s.root);

/** Contenido de una carpeta: { id, name, parent, folders: [{id,name}], files: [{id,name,size}] }. */
export async function browse(id) {
  const s = await tree();
  const dir = nodeOf(s, id);
  if (!dir?.directory) throw mError('Esa carpeta ya no está en tu MEGA.');
  const kids = (dir.children || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return {
    id: dir === s.root ? null : dir.nodeId,
    name: dir === s.root ? 'MEGA' : dir.name,
    parent: dir === s.root ? null : dir.parent && dir.parent !== s.root ? dir.parent.nodeId : null,
    folders: kids.filter((n) => n.directory && !(dir === s.root && n.name === FOLDER)).map((n) => ({ id: n.nodeId, name: n.name })),
    files: kids.filter((n) => !n.directory && MEDIA.test(n.name || '')).map((n) => ({ id: n.nodeId, name: n.name, size: n.size })),
  };
}

/** Videos y fotos de una carpeta (y sus subcarpetas, con su ruta). */
export async function folderMedia(id) {
  const s = await tree();
  const dir = nodeOf(s, id);
  if (!dir?.directory) throw mError('Esa carpeta ya no está en tu MEGA.');
  const out = [];
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.directory) walk(c);
      else if (MEDIA.test(c.name || '')) out.push({ id: c.nodeId, name: c.name });
    }
  };
  walk(dir);
  return out;
}

export async function fileInfo(id) {
  const s = await tree();
  const n = s.files[id];
  if (!n || n.directory) throw mError('Ese archivo ya no está en tu MEGA.');
  return { id: n.nodeId, name: n.name };
}

// ---------- sincronizar: la carpeta «Diva Routine» de tu MEGA ----------
// Misma forma que google.js: listFiles / downloadText / downloadFile / uploadFile / deleteFile.

async function appFolder(s) {
  let dir = (s.root.children || []).find((n) => n.directory && n.name === FOLDER);
  if (!dir) {
    dir = await s.root.mkdir(FOLDER);
    loaded = 0;
  }
  return dir;
}

/** Map nombre -> { id, size, version, modifiedTime }. En MEGA cada subida es un nodo nuevo: su id es la versión. */
export async function listFiles() {
  const s = await tree(0);
  const dir = await appFolder(s);
  const out = new Map();
  for (const n of dir.children || []) {
    if (n.directory) continue;
    const f = { id: n.nodeId, name: n.name, size: n.size, version: n.nodeId, modifiedTime: new Date((n.timestamp || 0) * 1000).toISOString() };
    const prev = out.get(n.name);
    if (!prev || f.modifiedTime > prev.modifiedTime) out.set(n.name, f);
  }
  return out;
}

async function fileNode(id) {
  const s = await session();
  let n = s.files[id];
  if (!n) n = (await tree(0)).files[id];
  if (!n) throw mError('Ese archivo ya no está en MEGA.');
  return n;
}

export async function downloadText(id) {
  return (await (await fileNode(id)).downloadBuffer()).toString('utf8');
}

export async function downloadFile(id, dest) {
  const n = await fileNode(id);
  const tmp = `${dest}.descargando`;
  try {
    await pipeline(n.download(), fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
  } catch (e) {
    await fsp.unlink(tmp).catch(() => {});
    throw mError('Se cortó la descarga de MEGA: ' + e.message);
  }
}

/** Sube un archivo (Buffer o ruta local) a la carpeta de la app; si se da `id`, sustituye ese. */
export async function uploadFile(name, body, { id = null } = {}) {
  const s = await tree();
  const dir = await appFolder(s);
  let src = body;
  let size;
  if (typeof body === 'string') {
    size = (await fsp.stat(body)).size;
    src = fs.createReadStream(body);
  } else size = body.length;
  let node;
  try {
    node = await dir.upload({ name, size, allowUploadBuffering: true }, src).complete;
  } catch (e) {
    throw mError(`Se cortó la subida a MEGA de «${name}»: ` + e.message);
  }
  if (id && id !== node.nodeId) await deleteFile(id).catch(() => {});
  return { id: node.nodeId, version: node.nodeId };
}

export async function deleteFile(id) {
  const n = (await session()).files[id];
  if (n) await n.delete(true);
}
