// Disco virtual para la versión web: los archivos viven en IndexedDB y en memoria.
// Los textos pequeños (db.json, ajustes) se leen al instante; los vídeos e imágenes son Blobs.
import { Buffer } from 'buffer';
import path from 'path-browserify';

const files = new Map(); // ruta -> { data: string | Uint8Array | Blob, mtime }
const dirs = new Set(['/']);
let idb = null;
let pending = Promise.resolve();

const norm = (p) => path.resolve('/', String(p).replace(/\\/g, '/'));
const err = (code, p) => Object.assign(new Error(`${code}: ${p}`), { code });

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('diva-routine-fs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const tx = (mode, fn) => new Promise((resolve, reject) => {
  const t = idb.transaction('files', mode);
  const out = fn(t.objectStore('files'));
  t.oncomplete = () => resolve(out?.result);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

/** Carga todo lo guardado (antes de arrancar el servidor). */
export async function init() {
  if (idb) return;
  idb = await openDb();
  await new Promise((resolve, reject) => {
    const t = idb.transaction('files', 'readonly');
    const req = t.objectStore('files').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve();
      const v = c.value;
      if (v.dir) dirs.add(c.key);
      else files.set(c.key, { data: v.data, mtime: v.mtime });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// Lo escrito se guarda en orden; idle() espera a que todo esté en IndexedDB.
const persist = (fn) => (pending = pending.then(() => tx('readwrite', fn)).catch((e) => console.error('vfs', e)));
export const idle = () => pending;

function addDirs(p) {
  for (let d = path.dirname(p); !dirs.has(d); d = path.dirname(d)) {
    dirs.add(d);
    const key = d;
    persist((s) => s.put({ dir: true }, key));
  }
}

export function put(p, data) {
  p = norm(p);
  if (data instanceof ArrayBuffer) data = new Uint8Array(data);
  else if (ArrayBuffer.isView(data) && !(data instanceof Uint8Array)) data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  addDirs(p);
  const entry = { data, mtime: Date.now() };
  files.set(p, entry);
  persist((s) => s.put(entry, p));
}
export const get = (p) => files.get(norm(p));
export const exists = (p) => files.has(norm(p)) || dirs.has(norm(p));
export const isDir = (p) => dirs.has(norm(p));
export function remove(p, { recursive = false } = {}) {
  p = norm(p);
  if (files.delete(p)) return persist((s) => s.delete(p));
  if (!dirs.has(p)) throw err('ENOENT', p);
  const kids = [...files.keys(), ...dirs].filter((k) => k.startsWith(p + '/'));
  if (kids.length && !recursive) throw err('ENOTEMPTY', p);
  for (const k of kids) {
    files.delete(k);
    dirs.delete(k);
  }
  dirs.delete(p);
  persist((s) => {
    for (const k of [p, ...kids]) s.delete(k);
  });
}
export function mkdir(p) {
  p = norm(p);
  if (dirs.has(p)) return;
  addDirs(p + '/x');
}
export function list(p) {
  p = norm(p);
  if (!dirs.has(p)) throw err('ENOENT', p);
  const pre = p === '/' ? '/' : p + '/';
  const out = new Set();
  for (const k of [...files.keys(), ...dirs]) if (k.startsWith(pre) && k !== p) out.add(k.slice(pre.length).split('/')[0]);
  return [...out];
}
export function rename(a, b) {
  a = norm(a);
  b = norm(b);
  const f = files.get(a);
  if (f) {
    put(b, f.data);
    files.delete(a);
    return persist((s) => s.delete(a));
  }
  if (!dirs.has(a)) throw err('ENOENT', a);
  for (const k of [...files.keys()].filter((k) => k.startsWith(a + '/'))) rename(k, b + k.slice(a.length));
  mkdir(b);
  remove(a, { recursive: true });
}
export const size = (e) => (e.data instanceof Blob ? e.data.size : typeof e.data === 'string' ? new TextEncoder().encode(e.data).length : e.data.byteLength);

/** Lo guardado, como Buffer (para leerlo de una vez). */
export async function bytes(e) {
  if (e.data instanceof Blob) return Buffer.from(await e.data.arrayBuffer());
  return typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data);
}
export function bytesSync(e, p) {
  if (e.data instanceof Blob) throw err('EBLOB', p); // un Blob no se puede leer de forma síncrona
  return typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data);
}
export const blob = (e) => (e.data instanceof Blob ? e.data : new Blob([e.data]));
export { norm, err };
