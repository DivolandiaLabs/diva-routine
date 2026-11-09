// node:fs/promises sobre el disco virtual.
import { Buffer } from 'buffer';
import path from 'path-browserify';
import * as v from './vfs.js';

const enc = (data, o) => {
  const e = typeof o === 'string' ? o : o?.encoding;
  return e ? data.toString(e) : data;
};
const dirent = (dir, name) => ({ name, isFile: () => !v.isDir(path.join(dir, name)), isDirectory: () => v.isDir(path.join(dir, name)) });

export async function readFile(p, o) {
  const e = v.get(p);
  if (!e) throw v.err('ENOENT', p);
  return enc(await v.bytes(e), o);
}
export async function writeFile(p, data) {
  if (data instanceof Blob) return v.put(p, data);
  v.put(p, typeof data === 'string' ? data : Buffer.from(data));
}
export async function stat(p) {
  const e = v.get(p);
  if (e) return { size: v.size(e), mtimeMs: e.mtime, mtime: new Date(e.mtime), isFile: () => true, isDirectory: () => false };
  if (v.isDir(p)) return { size: 0, mtimeMs: 0, mtime: new Date(0), isFile: () => false, isDirectory: () => true };
  throw v.err('ENOENT', p);
}
export async function mkdir(p) {
  v.mkdir(p);
}
export async function readdir(p, o) {
  const names = v.list(p);
  return o?.withFileTypes ? names.map((n) => dirent(p, n)) : names;
}
export async function rename(a, b) {
  v.rename(a, b);
}
export async function rm(p, o = {}) {
  try {
    v.remove(p, o);
  } catch (e) {
    if (!o.force) throw e;
  }
}
export async function unlink(p) {
  v.remove(p);
}
export async function copyFile(a, b) {
  const e = v.get(a);
  if (!e) throw v.err('ENOENT', a);
  v.put(b, e.data);
}
export async function cp(a, b) {
  const e = v.get(a);
  if (e) return v.put(b, e.data);
  for (const n of v.list(a)) await cp(path.join(a, n), path.join(b, n));
}
let tmpN = 0;
export async function mkdtemp(prefix) {
  const p = `${prefix}${Date.now().toString(36)}${tmpN++}`;
  v.mkdir(p);
  return p;
}
export async function open(p) {
  const chunks = [];
  return {
    write: async (c) => chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c),
    close: async () => v.put(p, new Blob(chunks)),
  };
}

export default { readFile, writeFile, stat, mkdir, readdir, rename, rm, unlink, copyFile, cp, mkdtemp, open };
