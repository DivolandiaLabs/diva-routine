// Servicios en la nube (Google Drive, Dropbox, OneDrive, MEGA): se importa pegando el link
// compartido de un archivo o de una carpeta, sin iniciar sesión. Se leen solo los videos y fotos.
// list() dice qué hay detrás del link; download() baja un archivo a data/uploads.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { File as MegaFile } from 'megajs';

export const CLOUDS = {
  gdrive: { name: 'Google Drive' },
  dropbox: { name: 'Dropbox' },
  onedrive: { name: 'OneDrive' },
  mega: { name: 'MEGA' },
};

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const isMedia = (name) => VIDEO_EXT.has(path.extname(name).toLowerCase()) || IMAGE_EXT.has(path.extname(name).toLowerCase());
const mediaType = (name) => (VIDEO_EXT.has(path.extname(name).toLowerCase()) ? 'video' : 'image');
const fail = (status, message) => Object.assign(new Error(message), { status });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };

/** De qué servicio es un link (o null). */
export function cloudOf(url) {
  const u = String(url || '').toLowerCase();
  if (/drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com/.test(u)) return 'gdrive';
  if (/dropbox\.com|dropboxusercontent\.com/.test(u)) return 'dropbox';
  if (/1drv\.ms|onedrive\.live\.com|sharepoint\.com/.test(u)) return 'onedrive';
  if (/mega\.nz|mega\.co\.nz/.test(u)) return 'mega';
  return null;
}

async function get(url, opts = {}) {
  const res = await fetch(url, { redirect: 'follow', ...opts, headers: { ...UA, ...(opts.headers || {}) } }).catch((e) => {
    throw fail(502, 'No se pudo conectar: ' + (e.cause?.code || e.message));
  });
  return res;
}

const nameFromDisposition = (h) => {
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(h || '');
  return m ? decodeURIComponent(m[1] || m[2]) : null;
};

// ---------- Google Drive ----------

const driveId = (url) => /\/folders\/([\w-]{10,})/.exec(url)?.[1] || /\/d\/([\w-]{10,})/.exec(url)?.[1] || /[?&]id=([\w-]{10,})/.exec(url)?.[1];
const driveFileUrl = (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

async function listDrive(url) {
  const id = driveId(url);
  if (!id) throw fail(400, 'No reconozco ese link de Google Drive.');
  if (/\/folders\//.test(url)) {
    // La vista incrustada de una carpeta pública trae los archivos sin pedir cuenta.
    const res = await get(`https://drive.google.com/embeddedfolderview?id=${id}#list`);
    if (!res.ok) throw fail(400, 'Google Drive no deja ver esa carpeta. Compártela como «Cualquier persona con el enlace».');
    const html = await res.text();
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || 'Google Drive';
    const items = [];
    const re = /href="https:\/\/drive\.google\.com\/file\/d\/([\w-]+)[^"]*"[\s\S]*?class="flip-entry-title">([^<]+)</g;
    for (let m; (m = re.exec(html)); ) {
      const name = decodeHtml(m[2].trim());
      if (isMedia(name)) items.push({ name, ref: { cloud: 'gdrive', id: m[1], name } });
    }
    return { name: decodeHtml(title), folder: true, items };
  }
  const res = await get(driveFileUrl(id), { method: 'GET' });
  const name = nameFromDisposition(res.headers.get('content-disposition')) || `drive-${id}`;
  res.body?.cancel();
  if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) {
    throw fail(400, 'Google Drive no deja bajar ese archivo. Compártelo como «Cualquier persona con el enlace».');
  }
  return { name, folder: false, items: isMedia(name) ? [{ name, ref: { cloud: 'gdrive', id, name } }] : [] };
}

const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------- Dropbox ----------

const dropboxDirect = (url) => {
  const u = new URL(url);
  u.searchParams.set('dl', '1');
  return u.toString();
};

async function listDropbox(url) {
  const folder = /\/(scl\/fo|sh)\//.test(url);
  if (!folder) {
    const res = await get(dropboxDirect(url));
    const name = nameFromDisposition(res.headers.get('content-disposition')) || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'dropbox');
    res.body?.cancel();
    if (!res.ok) throw fail(400, 'Dropbox no deja bajar ese archivo. Comprueba que el link sea público.');
    return { name, folder: false, items: isMedia(name) ? [{ name, ref: { cloud: 'dropbox', url: dropboxDirect(url), name } }] : [] };
  }
  // Una carpeta de Dropbox solo se puede bajar entera (en .zip): se baja y se mira qué trae.
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'diva-dropbox-'));
  const zip = path.join(tmp, 'carpeta.zip');
  const res = await get(dropboxDirect(url));
  if (!res.ok || !res.body) throw fail(400, 'Dropbox no deja bajar esa carpeta. Comprueba que el link sea público.');
  const name = (nameFromDisposition(res.headers.get('content-disposition')) || 'Dropbox').replace(/\.zip$/i, '');
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  const out = path.join(tmp, 'x');
  await fsp.mkdir(out);
  await new Promise((resolve, reject) => execFile('tar', ['-xf', zip, '-C', out], (e) => (e ? reject(fail(500, 'No pude abrir el .zip de Dropbox: ' + e.message)) : resolve())));
  const items = [];
  const walk = async (dir) => {
    for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (isMedia(ent.name)) items.push({ name: ent.name, ref: { cloud: 'dropbox', local: p, name: ent.name } });
    }
  };
  await walk(out);
  return { name, folder: true, items, cleanup: () => fsp.rm(tmp, { recursive: true, force: true }) };
}

// ---------- OneDrive ----------

const shareToken = (url) => 'u!' + Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');

async function listOneDrive(url) {
  const res = await get(`https://api.onedrive.com/v1.0/shares/${shareToken(url)}/root?expand=children`);
  if (!res.ok) throw fail(400, 'OneDrive no deja ver ese link. Compártelo como «Cualquier persona con el vínculo».');
  const d = await res.json();
  const files = d.folder ? d.children || [] : [d];
  const items = files
    .filter((f) => f.file && isMedia(f.name))
    .map((f) => ({ name: f.name, ref: { cloud: 'onedrive', url: null, share: url, itemId: f.id, name: f.name } }));
  return { name: d.name || 'OneDrive', folder: Boolean(d.folder), items };
}

// ---------- MEGA ----------

async function listMega(url) {
  let root;
  try {
    root = MegaFile.fromURL(url);
    await root.loadAttributes();
  } catch (e) {
    throw fail(400, 'MEGA no deja abrir ese link (¿lleva la clave, lo que va detrás de #?): ' + e.message);
  }
  const items = [];
  const walk = (node, trail) => {
    if (node.directory) for (const c of node.children || []) walk(c, [...trail, c.name]);
    else if (isMedia(node.name || '')) items.push({ name: node.name, ref: { cloud: 'mega', url, path: trail, name: node.name } });
  };
  walk(root, []);
  return { name: root.name || 'MEGA', folder: Boolean(root.directory), items };
}

/** Qué hay detrás de un link: { name, folder, items: [{ name, ref }], cleanup? }. */
export function list(url) {
  const c = cloudOf(url);
  if (c === 'gdrive') return listDrive(url);
  if (c === 'dropbox') return listDropbox(url);
  if (c === 'onedrive') return listOneDrive(url);
  if (c === 'mega') return listMega(url);
  throw fail(400, 'Ese link no es de Google Drive, Dropbox, OneDrive ni MEGA.');
}

/** Baja un archivo de la nube a dir con el nombre base dado: { file, mediaType }. */
export async function download(ref, dir, base) {
  const ext = path.extname(ref.name || '').toLowerCase() || '.mp4';
  const file = base + ext;
  const dest = path.join(dir, file);
  if (ref.local) {
    await fsp.copyFile(ref.local, dest);
  } else if (ref.cloud === 'mega') {
    let node = MegaFile.fromURL(ref.url);
    await node.loadAttributes();
    for (const n of ref.path || []) node = (node.children || []).find((c) => c.name === n) || node;
    await pipeline(node.download(), fs.createWriteStream(dest));
  } else {
    let url = ref.cloud === 'gdrive' ? driveFileUrl(ref.id) : ref.url;
    if (ref.cloud === 'onedrive' && !url) url = `https://api.onedrive.com/v1.0/shares/${shareToken(ref.share)}/items/${ref.itemId}/content`;
    const res = await get(url);
    if (!res.ok || !res.body || /text\/html/.test(res.headers.get('content-type') || '')) {
      throw fail(502, `No se pudo bajar «${ref.name}» de ${CLOUDS[ref.cloud]?.name || 'la nube'} (¿sigue compartido?).`);
    }
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  }
  return { file, mediaType: mediaType(ref.name || file) };
}
