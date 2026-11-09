// node:fs sobre el disco virtual (solo lo que usa el servidor de Diva Routine).
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import * as v from './vfs.js';
import promises from './fsp.js';

const enc = (data, o) => {
  const e = typeof o === 'string' ? o : o?.encoding;
  return e ? data.toString(e) : data;
};
const statOf = (p) => {
  const e = v.get(p);
  if (e) return { size: v.size(e), mtimeMs: e.mtime, mtime: new Date(e.mtime), isFile: () => true, isDirectory: () => false };
  if (v.isDir(p)) return { size: 0, mtimeMs: 0, mtime: new Date(0), isFile: () => false, isDirectory: () => true };
  throw v.err('ENOENT', p);
};

export const existsSync = (p) => v.exists(p);
export const mkdirSync = (p) => v.mkdir(p);
export function readFileSync(p, o) {
  const e = v.get(p);
  if (!e) throw v.err('ENOENT', p);
  return enc(v.bytesSync(e, p), o);
}
export const writeFileSync = (p, data) => v.put(p, typeof data === 'string' ? data : Buffer.from(data));
export function rmSync(p, o = {}) {
  try {
    v.remove(p, o);
  } catch (e) {
    if (!o.force) throw e;
  }
}
export const unlinkSync = (p) => v.remove(p);
export function copyFileSync(a, b) {
  const e = v.get(a);
  if (!e) throw v.err('ENOENT', a);
  v.put(b, e.data);
}
export const statSync = statOf;
export const readdirSync = (p) => v.list(p);
export const renameSync = (a, b) => v.rename(a, b);

/** Lectura: .pipe(res) envía el trozo pedido (los vídeos se piden por partes). */
export function createReadStream(p, { start, end } = {}) {
  const s = new EventEmitter();
  const e = v.get(p);
  s.pipe = (dest) => {
    if (!e) {
      s.emit('error', v.err('ENOENT', p));
      return dest;
    }
    const b = v.blob(e);
    const part = start != null || end != null ? b.slice(start || 0, end == null ? undefined : end + 1) : b;
    if (dest.endBlob) dest.endBlob(part);
    else part.arrayBuffer().then((ab) => dest.end(Buffer.from(ab)));
    return dest;
  };
  s[Symbol.asyncIterator] = async function* () {
    if (!e) throw v.err('ENOENT', p);
    yield await v.bytes(e);
  };
  return s;
}

/** Escritura: junta los trozos y al acabar los guarda como un Blob. */
export function createWriteStream(p) {
  const s = new EventEmitter();
  const chunks = [];
  s.write = (c, _enc, cb) => {
    chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
    cb?.();
    return true;
  };
  s.end = (c, _enc, cb) => {
    if (typeof c === 'function') cb = c;
    else if (c != null) s.write(c);
    v.put(p, new Blob(chunks));
    queueMicrotask(() => {
      s.emit('finish');
      s.emit('close');
      cb?.();
    });
  };
  s.destroy = () => s.emit('close');
  return s;
}

export { promises };
export default { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync, copyFileSync, statSync, readdirSync, renameSync, createReadStream, createWriteStream, promises };
