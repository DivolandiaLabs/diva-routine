// Cuenta de Google: inicio de sesión (OAuth para apps de escritorio, con PKCE y redirección
// a este mismo ordenador) y acceso a la carpeta privada de la app en tu Google Drive
// («appDataFolder»: no se ve entre tus archivos ni la ven otras apps).
//
// El identificador de cliente (lo creas tú una vez en Google Cloud) va en google-client.json,
// junto a la app, y vale para todos tus ordenadores. La sesión de cada ordenador va en su
// carpeta data/ local (google.json) y solo se envía a Google.
//
// Para compartir con otras personas: Firebase (firebase-config.json, junto a la app) con la
// misma cuenta de Google, su base de datos Firestore, y los videos compartidos en tu Drive.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const DRIVE = (process.env.GOOGLE_DRIVE_URL || 'https://www.googleapis.com').replace(/\/$/, '');
// Firebase (lo compartido con otras personas): inicio de sesión y base de datos Firestore.
const IDTK = (process.env.GOOGLE_IDTK_URL || 'https://identitytoolkit.googleapis.com').replace(/\/$/, '');
const STK = (process.env.GOOGLE_STK_URL || 'https://securetoken.googleapis.com').replace(/\/$/, '');
const FIRESTORE = (process.env.GOOGLE_FIRESTORE_URL || 'https://firestore.googleapis.com').replace(/\/$/, '');
const PUBLIC_DL = process.env.GOOGLE_PUBLIC_DL || 'https://drive.usercontent.google.com/download';
// drive.appdata: tu carpeta privada de la app; drive.file: solo los archivos que crea la app
// (los videos que compartes). Ninguno da acceso al resto de tu Drive.
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
// Solo si conectas tu Google Drive en Redes: ver (no cambiar) tus carpetas para importarlas.
const DRIVE_READ = 'https://www.googleapis.com/auth/drive.readonly';

let CLIENT_FILE;
let FIREBASE_FILE;
let TOKEN_FILE;
let client = null; // { client_id, client_secret }
let firebase = null; // { apiKey, projectId }
let tokens = null; // { access_token, refresh_token, expires_at, email, fb: { idToken, refreshToken, expiresAt, uid }, shareFolder }
const pending = new Map(); // state -> { verifier, redirect, at }

export function initGoogle({ clientFile, firebaseFile, localDir }) {
  CLIENT_FILE = clientFile;
  FIREBASE_FILE = firebaseFile;
  TOKEN_FILE = path.join(localDir, 'google.json');
  try {
    client = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'));
  } catch {
    client = null;
  }
  try {
    firebase = JSON.parse(fs.readFileSync(FIREBASE_FILE, 'utf8'));
  } catch {
    firebase = null;
  }
  // Si el archivo está ocupado (la app anterior cerrándose al actualizar), se reintenta un poco
  // antes de dar la sesión por cerrada.
  for (let i = 1; i <= 20; i++) {
    try {
      tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      break;
    } catch (e) {
      tokens = null;
      if (e.code === 'ENOENT') break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

const saveTokens = () => fsp.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));

const gError = (message, extra = {}) => Object.assign(new Error(message), { status: 502, ...extra });

// El identificador puede aparecer con la app ya en marcha (p. ej. copiado de otro ordenador).
function loadClient() {
  if (client) return client;
  try {
    const raw = JSON.parse(fs.readFileSync(CLIENT_FILE, "utf8"));
    client = raw?.installed || raw?.web || raw;
  } catch {
    client = null;
  }
  return client;
}

function loadFirebase() {
  if (firebase) return firebase;
  try {
    firebase = JSON.parse(fs.readFileSync(FIREBASE_FILE, 'utf8'));
  } catch {
    firebase = null;
  }
  return firebase;
}

export const status = () => ({
  configured: Boolean(loadClient()?.client_id),
  connected: Boolean(tokens?.refresh_token),
  email: tokens?.email || null,
  driveRead: hasDriveRead(),
  name: tokens?.name || null,
  picture: tokens?.picture || null,
  firebase: Boolean(loadFirebase()?.apiKey),
  firebaseProject: loadFirebase()?.projectId || null,
});
/** ¿Dio permiso para ver sus carpetas de Drive? */
function hasDriveRead() {
  return Boolean(tokens?.scope?.split(' ').includes(DRIVE_READ));
}

const VIDEO_MIME = "(mimeType contains 'video/' or mimeType contains 'image/')";
/** Tus carpetas de Google Drive (con permiso de lectura). */
export async function myDriveFolders() {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const res = await drive(`/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&orderBy=name&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const d = await res.json();
    out.push(...(d.files || []));
    pageToken = d.nextPageToken || '';
  } while (pageToken && out.length < 5000);
  return out.filter((f) => f.name !== 'Diva Routine · compartido');
}
/** Videos y fotos de una carpeta de tu Drive. */
export async function driveFolderMedia(folderId) {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and ${VIDEO_MIME}`);
    const res = await drive(`/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&orderBy=name&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const d = await res.json();
    out.push(...(d.files || []));
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  return out;
}

export const connected = () => Boolean(loadClient()?.client_id && tokens?.refresh_token);
export const email = () => tokens?.email || null;
/** Se puede compartir con otras personas: sesión de Google y Firebase configurado. */
export const collabReady = () => connected() && Boolean(loadFirebase()?.apiKey);

/**
 * Configuración de Firebase: el bloque «firebaseConfig» que da la consola de Firebase
 * (se pega tal cual) o { apiKey, projectId }.
 */
export async function setFirebase(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input || {});
  const pick = (k) => (text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`)) || [])[1];
  const apiKey = pick('apiKey');
  const projectId = pick('projectId');
  if (!apiKey || !projectId) {
    throw Object.assign(new Error('No encuentro «apiKey» y «projectId». Pega el bloque firebaseConfig completo de la consola de Firebase.'), { status: 400 });
  }
  firebase = { apiKey, projectId };
  await fsp.writeFile(FIREBASE_FILE, JSON.stringify(firebase, null, 2));
  if (tokens) delete tokens.fb; // la próxima vez entra en este proyecto
  return status();
}

// ---------- identificador de cliente ----------

/** Acepta el JSON que descarga Google Cloud ({ installed: {...} }) o el id y el secreto sueltos. */
export async function setClient(input) {
  let c = input;
  if (typeof input === 'string') {
    try {
      c = JSON.parse(input);
    } catch {
      throw Object.assign(new Error('Ese archivo no es el JSON que descarga Google Cloud.'), { status: 400 });
    }
  }
  c = c?.installed || c?.web || c;
  const id = String(c?.client_id || '').trim();
  const secret = String(c?.client_secret || '').trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) {
    throw Object.assign(new Error('Falta el identificador de cliente (termina en .apps.googleusercontent.com).'), { status: 400 });
  }
  client = { client_id: id, client_secret: secret };
  await fsp.writeFile(CLIENT_FILE, JSON.stringify(client, null, 2));
  return status();
}

// ---------- iniciar sesión ----------

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** URL de Google para iniciar sesión. Google vuelve a `redirect` con ?code=…&state=… */
export function loginUrl(redirect, { drive = false } = {}) {
  if (!loadClient()) throw Object.assign(new Error('Primero añade el identificador de Google (Ajustes).'), { status: 400 });
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  pending.set(state, { verifier, redirect, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60000) pending.delete(k);
  const q = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: drive || hasDriveRead() ? `${SCOPES} ${DRIVE_READ}` : SCOPES,
    include_granted_scopes: 'true',
    access_type: 'offline', // para poder seguir sincronizando sin volver a pedir permiso
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export const isPendingState = (state) => pending.has(state);

async function tokenRequest(params) {
  let res;
  try {
    res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  } catch (e) {
    throw gError('No se pudo conectar con Google: ' + (e.cause?.code || e.message));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw gError(`Google no aceptó el inicio de sesión (${data.error_description || data.error || res.status}).`, { auth: data.error === 'invalid_grant' });
  return data;
}

/** Vuelta de Google: cambia el código por la sesión y la guarda. */
export async function finishLogin(code, state) {
  const p = pending.get(state);
  if (!p) throw Object.assign(new Error('Ese inicio de sesión caducó; vuelve a intentarlo.'), { status: 400 });
  pending.delete(state);
  const t = await tokenRequest({
    client_id: client.client_id,
    client_secret: client.client_secret,
    code,
    code_verifier: p.verifier,
    redirect_uri: p.redirect,
    grant_type: 'authorization_code',
  });
  let email = null;
  try {
    email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email || null;
  } catch {
    /* sin correo: solo es para mostrarlo */
  }
  if (!t.refresh_token) throw gError('Google no dio permiso para seguir sincronizando. Vuelve a intentarlo.');
  tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in - 60) * 1000, email, scope: t.scope || '' };
  await saveTokens();
  await loadProfile().catch(() => {});
  return status();
}

/** Nombre y foto de la cuenta (para mostrarlos arriba). Drive los da sin pedir más permisos. */
export async function loadProfile() {
  if (!tokens || tokens.picture !== undefined) return;
  const { user } = await (await drive('/drive/v3/about?fields=user(displayName,photoLink)')).json();
  tokens = { ...tokens, name: user?.displayName || null, picture: user?.photoLink || null };
  await saveTokens();
}

export async function logout() {
  if (tokens?.refresh_token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, { method: 'POST' }).catch(() => {});
  }
  tokens = null;
  await fsp.unlink(TOKEN_FILE).catch(() => {});
  return status();
}

/** Renueva el permiso de Google (y devuelve también un id_token nuevo, para Firebase). */
async function refreshGoogle() {
  const t = await tokenRequest({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' });
  tokens = { ...tokens, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
  await saveTokens();
  return t;
}

async function accessToken() {
  if (!tokens) throw gError('No has iniciado sesión con Google.', { auth: true });
  if (Date.now() < tokens.expires_at) return tokens.access_token;
  try {
    await refreshGoogle();
    return tokens.access_token;
  } catch (e) {
    if (e.auth) {
      // Permiso retirado o sesión caducada: hay que volver a iniciar sesión.
      tokens = null;
      await fsp.unlink(TOKEN_FILE).catch(() => {});
      throw gError('La sesión de Google caducó. Vuelve a iniciar sesión en Ajustes.', { auth: true });
    }
    throw e;
  }
}

// ---------- Google Drive (carpeta privada de la app) ----------

/** Petición a Drive con la sesión; reintenta si Google va saturado o falla un momento. */
async function drive(url, opts = {}, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(DRIVE + url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await accessToken()}` } }).catch((e) => {
      throw gError('No se pudo conectar con Google Drive: ' + (e.cause?.code || e.message));
    });
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      continue;
    }
    if (res.status === 401 && i < tries - 1) {
      tokens.expires_at = 0; // forzar a renovar el permiso
      continue;
    }
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw gError(`Google Drive respondió ${res.status}${msg ? ': ' + msg.slice(0, 200) : ''}`);
    }
    return res;
  }
}

/** Archivos de la carpeta de la app: Map nombre -> { id, size, version, modifiedTime }. */
export async function listFiles() {
  const out = new Map();
  let page = '';
  do {
    const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'nextPageToken,files(id,name,size,version,modifiedTime)', pageSize: '1000' });
    if (page) q.set('pageToken', page);
    const data = await (await drive(`/drive/v3/files?${q}`)).json();
    for (const f of data.files || []) {
      const prev = out.get(f.name);
      // Si hay dos con el mismo nombre (dos ordenadores a la vez), vale el más nuevo.
      if (!prev || f.modifiedTime > prev.modifiedTime) out.set(f.name, f);
    }
    page = data.nextPageToken || '';
  } while (page);
  return out;
}

export async function downloadText(id) {
  return (await drive(`/drive/v3/files/${id}?alt=media`)).text();
}

export async function downloadFile(id, dest) {
  const res = await drive(`/drive/v3/files/${id}?alt=media`);
  const tmp = `${dest}.descargando`;
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
  } catch (e) {
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
}

/**
 * Sube (o sustituye, si se da `id`) un archivo. Subida reanudable: sirve también para videos
 * grandes. Devuelve { id, version }.
 */
export async function uploadFile(name, body, { id = null, type = 'application/octet-stream', parents = ['appDataFolder'] } = {}) {
  const meta = id ? {} : { name, parents };
  const start = await drive(`/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=resumable&fields=id,version`, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type },
    body: JSON.stringify(meta),
  });
  const location = start.headers.get('location');
  if (!location) throw gError('Google Drive no aceptó la subida.');
  const res = await fetch(location, { method: 'PUT', headers: { 'Content-Type': type }, body }).catch((e) => {
    throw gError('Se cortó la subida a Google Drive: ' + (e.cause?.code || e.message));
  });
  if (!res.ok) throw gError(`Google Drive respondió ${res.status} al subir «${name}».`);
  return res.json();
}

export async function deleteFile(id) {
  await drive(`/drive/v3/files/${id}`, { method: 'DELETE' });
}

// ---------- videos compartidos: en tu Drive, con enlace solo para quien lo tenga ----------

/** Carpeta «Diva Routine · compartido» de tu Drive (la crea la app la primera vez). */
async function shareFolder() {
  if (tokens.shareFolder) return tokens.shareFolder;
  const res = await drive('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Diva Routine · compartido', mimeType: 'application/vnd.google-apps.folder' }),
  });
  tokens.shareFolder = (await res.json()).id;
  await saveTokens();
  return tokens.shareFolder;
}

/**
 * Sube un video (o foto) de algo compartido a tu Drive y le da un enlace que solo conoce quien
 * lo recibe por la app (no aparece en búsquedas). Devuelve el id del archivo.
 */
export async function uploadShared(name, body) {
  const { id } = await uploadFile(name, body, { parents: [await shareFolder()] });
  await drive(`/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
  });
  return id;
}

/** Descarga un archivo compartido por otro colaborador (con su enlace). */
export async function downloadShared(id, dest) {
  const res = await fetch(`${PUBLIC_DL}?id=${encodeURIComponent(id)}&export=download&confirm=t`).catch((e) => {
    throw gError('No se pudo descargar de Google Drive: ' + (e.cause?.code || e.message));
  });
  if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) {
    throw gError('Google Drive no dejó descargar el video compartido (¿lo borró quien lo compartió?).');
  }
  const tmp = `${dest}.descargando`;
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
  } catch (e) {
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
}

// ---------- Firebase: entrar con la misma cuenta de Google ----------

/** Permiso de Firebase (para Firestore). Se entra con el id_token de Google: sin otro inicio de sesión. */
async function fbToken() {
  if (!collabReady()) throw Object.assign(new Error('Para compartir, configura Firebase e inicia sesión con Google (Ajustes).'), { status: 400 });
  const fb = tokens.fb;
  if (fb && Date.now() < fb.expiresAt) return fb.idToken;
  const post = async (url, body, form = false) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
      body: form ? new URLSearchParams(body) : JSON.stringify(body),
    }).catch((e) => {
      throw gError('No se pudo conectar con Firebase: ' + (e.cause?.code || e.message));
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };
  if (fb?.refreshToken) {
    const r = await post(`${STK}/v1/token?key=${firebase.apiKey}`, { grant_type: 'refresh_token', refresh_token: fb.refreshToken }, true);
    if (r.ok) {
      tokens.fb = { ...fb, idToken: r.data.id_token, refreshToken: r.data.refresh_token, expiresAt: Date.now() + (Number(r.data.expires_in) - 60) * 1000 };
      await saveTokens();
      return tokens.fb.idToken;
    }
  }
  // Entrar de nuevo con un id_token fresco de Google.
  const t = await refreshGoogle();
  if (!t.id_token) throw gError('Google no devolvió la identidad para Firebase. Cierra sesión y vuelve a entrar.');
  const r = await post(`${IDTK}/v1/accounts:signInWithIdp?key=${firebase.apiKey}`, {
    postBody: `id_token=${t.id_token}&providerId=google.com`,
    requestUri: 'http://localhost',
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  if (!r.ok) {
    const msg = r.data.error?.message || 'error';
    if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(msg)) throw gError('En Firebase falta activar el acceso con Google (Authentication → Sign-in method → Google).');
    if (/INVALID_IDP_RESPONSE|audience/i.test(msg)) {
      throw gError(`Firebase no reconoce el identificador de Google de la app. Usa el mismo proyecto para los dos, o añade ${client.client_id} en Authentication → Sign-in method → Google → «IDs de cliente de proyectos externos».`);
    }
    throw gError(`Firebase no aceptó la sesión (${msg}).`);
  }
  tokens.fb = { idToken: r.data.idToken, refreshToken: r.data.refreshToken, expiresAt: Date.now() + (Number(r.data.expiresIn) - 60) * 1000, uid: r.data.localId };
  await saveTokens();
  return tokens.fb.idToken;
}

// ---------- Firestore (REST) ----------

const dbPath = () => `projects/${firebase.projectId}/databases/(default)`;
const docsBase = () => `${FIRESTORE}/v1/${dbPath()}/documents`;

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Buffer.isBuffer(v)) return { bytesValue: v.toString('base64') };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
function dec(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue); // en milisegundos
  if ('bytesValue' in v) return Buffer.from(v.bytesValue, 'base64');
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
}
const encFields = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)]));
const decDoc = (d) => ({ id: d.name.split('/').pop(), path: d.name.split('/documents/')[1], data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, dec(x)])) });

async function firestore(url, opts = {}, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${await fbToken()}` } }).catch((e) => {
      throw gError('No se pudo conectar con Firestore: ' + (e.cause?.code || e.message));
    });
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      continue;
    }
    if (res.status === 401 && i < tries - 1) {
      tokens.fb && (tokens.fb.expiresAt = 0);
      continue;
    }
    return res;
  }
}

const fsError = async (res, what) => {
  const body = await res.json().catch(() => ({}));
  const msg = body.error?.message || res.status;
  if (res.status === 403) return gError(`Firestore no deja ${what} (sin permiso: ¿te quitaron de esa colaboración, o faltan las reglas de seguridad?).`, { forbidden: true });
  if (res.status === 404 && /database/i.test(String(msg))) return gError('En Firebase falta crear la base de datos Firestore.');
  return gError(`Firestore respondió ${res.status} al ${what}: ${msg}`);
};

/** Un documento (o null si no existe). */
export async function fsGet(docPath) {
  const res = await firestore(`${docsBase()}/${docPath}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await fsError(res, 'leer');
  return decDoc(await res.json());
}

/**
 * Varias escrituras a la vez (o todas o ninguna). Cada una:
 *   { path, data, mask?: [campos que se cambian], stamp?: campo con la hora del servidor, exists?: bool }
 *   { path, delete: true }
 */
export async function fsCommit(writes) {
  const name = (p) => `${dbPath()}/documents/${p}`;
  const body = {
    writes: writes.map((w) => (w.delete
      ? { delete: name(w.path) }
      : {
          update: { name: name(w.path), fields: encFields(w.data || {}) },
          ...(w.mask ? { updateMask: { fieldPaths: w.mask } } : {}),
          ...(w.stamp ? { updateTransforms: [{ fieldPath: w.stamp, setToServerValue: 'REQUEST_TIME' }] } : {}),
          ...(w.exists != null ? { currentDocument: { exists: w.exists } } : {}),
        })),
  };
  const res = await firestore(`${docsBase()}:commit`, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await fsError(res, 'guardar');
  return res.json();
}

/**
 * Consulta. parent: '' (raíz) o 'spaces/abc'; collection: 'spaces' | 'items'…;
 * where: [[campo, op, valor]] con op 'ARRAY_CONTAINS' | 'GREATER_THAN' | 'EQUAL'.
 * namesOnly: solo los ids (sin traer los datos).
 */
export async function fsQuery(parent, collection, where = [], { namesOnly = false } = {}) {
  const filters = where.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op, value: enc(value) } }));
  const structuredQuery = {
    from: [{ collectionId: collection }],
    ...(filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {}),
    ...(namesOnly ? { select: { fields: [{ fieldPath: '__name__' }] } } : {}),
  };
  const res = await firestore(`${docsBase()}${parent ? '/' + parent : ''}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  if (!res.ok) throw await fsError(res, 'consultar');
  return (await res.json()).filter((r) => r.document).map((r) => decDoc(r.document));
}
