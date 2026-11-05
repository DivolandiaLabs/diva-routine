// Backups: un .tar (se abre con cualquier programa de comprimidos) con db.json, los archivos de
// uploads/ y, al final, manifest.json. Sin el manifest el archivo está incompleto: al restaurar
// es lo que demuestra que llegó entero. Las sesiones y la licencia no entran: son credenciales.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const BLOCK = 512;
const APP = 'diva-routine';
const FORMAT = 1;
const ALLOWED = /^(manifest\.json|db\.json|uploads\/\w[\w.-]*)$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

const padOf = (size) => (BLOCK - (size % BLOCK)) % BLOCK;

/** Archivos de la carpeta uploads, con su tamaño. */
export async function listUploads(dir) {
  const out = [];
  for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ALLOWED.test(`uploads/${ent.name}`)) continue;
    const { size } = await fsp.stat(path.join(dir, ent.name));
    out.push({ name: ent.name, size });
  }
  return out;
}

function header(name, size) {
  const h = Buffer.alloc(BLOCK);
  h.write(name, 0, 100);
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  // Los tamaños que no caben en 11 dígitos octales (8 GB) van en binario, como hace GNU tar.
  if (size < 8 ** 11) h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  else {
    h[124] = 0x80;
    h.writeBigUInt64BE(BigInt(size), 128);
  }
  h.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136);
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0' + '00', 257, 'latin1');
  h.write(`${h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

/** Escribe el backup en `out` (la respuesta). Si se corta la descarga, para sin más. */
export async function writeArchive(out, { dbJson, uploadDir, version }) {
  const put = async (chunk) => {
    if (out.destroyed) throw fail(499, 'Descarga cancelada');
    if (out.write(chunk)) return;
    await new Promise((resolve) => {
      const done = () => {
        out.off('drain', done);
        out.off('close', done);
        resolve();
      };
      out.on('drain', done);
      out.on('close', done);
    });
  };
  const putFile = async (name, data) => {
    await put(header(name, data.length));
    await put(data);
    await put(Buffer.alloc(padOf(data.length)));
  };
  const files = await listUploads(uploadDir);
  await putFile('db.json', Buffer.from(dbJson));
  for (const { name, size } of files) {
    await put(header(`uploads/${name}`, size));
    let sent = 0;
    if (size) {
      try {
        for await (const chunk of fs.createReadStream(path.join(uploadDir, name), { end: size - 1 })) {
          await put(chunk);
          sent += chunk.length;
        }
      } catch (e) {
        if (e.status) throw e;
        console.error('[backup]', name, e.message); // borrado a media copia: se rellena para no descuadrar
      }
    }
    await put(Buffer.alloc(size - sent));
    await put(Buffer.alloc(padOf(size)));
  }
  await putFile('manifest.json', Buffer.from(JSON.stringify({ app: APP, format: FORMAT, version, createdAt: new Date().toISOString(), files: files.length })));
  await put(Buffer.alloc(BLOCK * 2));
  out.end();
}

function parseHeader(h) {
  const stored = parseInt(h.toString('latin1', 148, 156).trim(), 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  if (sum !== stored) throw fail(400, 'Ese archivo no es un backup de Diva Routine.');
  const name = h.toString('utf8', 0, 100).replace(/\0.*$/s, '');
  const size = h[124] & 0x80 ? Number(h.readBigUInt64BE(128)) : parseInt(h.toString('latin1', 124, 136).trim(), 8);
  if (!ALLOWED.test(name) || !Number.isSafeInteger(size) || size < 0) throw fail(400, 'Ese archivo no es un backup de Diva Routine.');
  return { name, size };
}

/** Saca el backup a `dir`, sin tocar nada más. Solo acepta los nombres previstos. */
export async function readArchive(stream, dir) {
  await fsp.mkdir(path.join(dir, 'uploads'), { recursive: true });
  let buf = Buffer.alloc(0);
  let file = null;
  let left = 0;
  let skip = 0;
  for await (const chunk of stream) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (left) {
        const part = buf.subarray(0, left);
        if (!part.length) break;
        await file.write(part);
        left -= part.length;
        buf = buf.subarray(part.length);
        if (!left) {
          await file.close();
          file = null;
        }
      } else if (skip) {
        const n = Math.min(skip, buf.length);
        if (!n) break;
        skip -= n;
        buf = buf.subarray(n);
      } else {
        if (buf.length < BLOCK) break;
        const h = buf.subarray(0, BLOCK);
        buf = buf.subarray(BLOCK);
        if (h.every((b) => b === 0)) continue;
        const { name, size } = parseHeader(h);
        file = await fsp.open(path.join(dir, name), 'w');
        left = size;
        skip = padOf(size);
        if (!size) {
          await file.close();
          file = null;
        }
      }
    }
  }
  await file?.close();
  if (left) throw fail(400, 'El backup está incompleto.');
  return checkArchive(dir);
}

async function checkArchive(dir) {
  const read = (name) => fsp.readFile(path.join(dir, name), 'utf8').then(JSON.parse).catch(() => null);
  const manifest = await read('manifest.json');
  if (!manifest) throw fail(400, 'El backup está incompleto.');
  if (manifest.app !== APP) throw fail(400, 'Ese archivo no es un backup de Diva Routine.');
  if (manifest.format !== FORMAT) throw fail(400, 'Ese backup es de una versión más nueva de la app. Actualízala primero.');
  const db = await read('db.json');
  if (!['libraries', 'videos', 'exercises', 'routines'].every((k) => Array.isArray(db?.[k]))) throw fail(400, 'El backup está dañado.');
  const files = await fsp.readdir(path.join(dir, 'uploads'));
  if (files.length !== manifest.files) throw fail(400, 'El backup está incompleto.');
  return { db, manifest };
}
