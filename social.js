// Otras redes sociales (YouTube, TikTok, Facebook): conectar tu cuenta pegando tu sesión
// (las cookies de la web, como con Instagram) para importar tus listas y descargar videos que
// piden cuenta. Todo va por yt-dlp con un archivo de cookies temporal. Las sesiones se guardan
// solo en este ordenador (data/redes.json) y solo se envían a su red.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const NETS = {
  youtube: { name: 'YouTube', domain: 'youtube.com', need: [['SAPISID', '__Secure-3PAPISID']], home: 'https://www.youtube.com/' },
  tiktok: { name: 'TikTok', domain: 'tiktok.com', need: [['sessionid', 'sessionid_ss']], home: 'https://www.tiktok.com/' },
  facebook: { name: 'Facebook', domain: 'facebook.com', need: [['c_user'], ['xs']], home: 'https://www.facebook.com/' },
};

let FILE;
let LOCAL;
let saved = {}; // red -> { cookies: {nombre: valor}, at }

export function initSocial(localDir) {
  LOCAL = localDir;
  FILE = path.join(localDir, 'redes.json');
  try {
    saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    saved = {};
  }
}
const save = () => fsp.writeFile(FILE, JSON.stringify(saved, null, 2));
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Red de un link (solo las de aquí). */
export function netOf(url) {
  const u = String(url || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube';
  if (/tiktok\.com/.test(u)) return 'tiktok';
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook';
  return null;
}

export const connected = (net) => Boolean(saved[net]?.cookies);
export const status = () => Object.fromEntries(Object.keys(NETS).map((n) => [n, { connected: connected(n), at: saved[n]?.at || null }]));

/** Lee lo pegado: la cabecera «cookie: a=b; c=d», un cookies.txt o un JSON de una extensión. */
function readCookies(net, raw) {
  const text = String(raw || '').trim().replace(/^cookie:\s*/i, '');
  const mine = (d) => String(d || NETS[net].domain).replace(/^\./, '').toLowerCase().endsWith(NETS[net].domain);
  const jar = {};
  if (/^[[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      for (const c of [].concat(data.cookies || data)) if (c?.name && mine(c.domain)) jar[c.name] = String(c.value ?? '');
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
      if (f.length >= 7 && mine(f[0])) jar[f[5]] = f[6].trim();
    }
    return jar;
  }
  for (const part of text.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return jar;
}

export async function connect(net, raw) {
  if (!NETS[net]) throw fail(400, 'Red desconocida');
  const cookies = readCookies(net, raw);
  const missing = NETS[net].need.filter((alts) => !alts.some((k) => cookies[k]));
  if (missing.length) {
    throw fail(400, `No encuentro tu sesión de ${NETS[net].name} en lo pegado (falta ${missing.map((a) => a[0]).join(' y ')}). Copia el valor completo de «cookie» como explica el tutorial, con la cuenta iniciada.`);
  }
  saved[net] = { cookies, at: new Date().toISOString() };
  await save();
  return status()[net];
}

export async function disconnect(net) {
  delete saved[net];
  await save();
  return status()[net];
}

/** Ejecuta fn(argumentos de yt-dlp) con tus cookies de esa red (si está conectada). */
export async function withCookies(net, fn) {
  if (!connected(net)) return fn([]);
  const file = path.join(LOCAL, `cookies-${net}-${process.pid}-${Date.now()}.txt`);
  const lines = ['# Netscape HTTP Cookie File'];
  for (const [k, v] of Object.entries(saved[net].cookies)) lines.push([`.${NETS[net].domain}`, 'TRUE', '/', 'TRUE', '2147483647', k, v].join('\t'));
  await fsp.writeFile(file, lines.join('\n') + '\n');
  try {
    return await fn(['--cookies', file]);
  } finally {
    await fsp.unlink(file).catch(() => {});
  }
}
