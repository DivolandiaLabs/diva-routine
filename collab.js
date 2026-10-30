// Compartir con otras personas: carpetas de la Biblioteca (sus colaboradores pueden añadir
// cosas), rutinas (con varios editores) y dibujos.
//
// Cada cosa compartida es un «espacio» en Firebase (Firestore) que solo ven sus miembros:
//   spaces/{sid}            { type: folder|routine|drawing, rootId, name, owner, members[], syncAt }
//   spaces/{sid}/items/{k}  cada elemento (k = colección~id): { kind, rid, json, updatedAt, by, deleted, syncAt }
//   spaces/{sid}/blobs/{f}  imágenes pequeñas (viñetas y portadas): { data, syncAt }
// Los videos y fotos van al Google Drive de quien los añade, con un enlace que solo tiene la app.
//
// Cada ordenador baja de sus espacios lo nuevo, lo junta con lo suyo (gana el cambio más
// reciente) y sube lo que cambió aquí. Quién puede qué lo deciden las reglas de Firestore
// (RULES; se pegan una vez en la consola de Firebase): el dueño invita y quita gente; los
// demás añaden y cambian; algo de otro solo lo quita quien lo añadió o el dueño.
//
// Lo de cada ordenador (qué ha bajado y subido de cada espacio) va en data/colabora.json.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as google from './google.js';

export const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function me() { return request.auth.token.email.lower(); }
    function signedIn() { return request.auth != null && request.auth.token.email_verified == true; }
    function space(sid) { return get(/databases/$(database)/documents/spaces/$(sid)).data; }
    function isMember(sid) { return signedIn() && me() in space(sid).members; }
    function isOwner(sid) { return signedIn() && space(sid).owner == me(); }

    match /spaces/{sid} {
      allow read: if signedIn() && me() in resource.data.members;
      allow create: if signedIn() && request.resource.data.owner == me()
        && request.resource.data.members == [me()];
      // El dueño cambia lo que quiera; los demás, el nombre, o quitarse ellos mismos.
      allow update: if signedIn() && (
        (resource.data.owner == me() && request.resource.data.owner == me() && me() in request.resource.data.members)
        || (me() in resource.data.members
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members', 'name', 'syncAt'])
          && (request.resource.data.members == resource.data.members
            || request.resource.data.members.toSet() == resource.data.members.toSet().difference([me()].toSet()))));
      allow delete: if signedIn() && resource.data.owner == me();

      match /items/{iid} {
        allow read: if isMember(sid);
        allow create: if isMember(sid) && request.resource.data.by == me();
        // Cualquiera cambia; quitar (o devolver) algo, solo quien lo añadió o el dueño.
        allow update: if isMember(sid) && request.resource.data.by == resource.data.by
          && (request.resource.data.deleted == resource.data.deleted || resource.data.by == me() || isOwner(sid));
        allow delete: if isOwner(sid);
      }
      match /blobs/{bid} {
        allow read, create, update: if isMember(sid);
        allow delete: if isOwner(sid);
      }
    }
  }
}`;

const COLLECTIONS = ['libraries', 'videos', 'exercises', 'routines'];
const ROOT_KIND = { folder: 'libraries', routine: 'routines', drawing: 'exercises' };
const OVERLAP = 2 * 60e3; // margen al pedir lo nuevo (por si otro escribía justo a la vez)
const BLOB_MAX = 900 * 1024; // en Firestore caben imágenes de hasta ~1 MB
const COMMIT_BYTES = 8 * 1024 * 1024; // y en cada envío, unos 10 MB
const SAFE_FILE = /^[\w.-]+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const key = (kind, id) => `${kind}~${id}`;
const unkey = (k) => k.split('~');
const lower = (s) => String(s || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });

/** JSON con las claves ordenadas: el mismo contenido da siempre el mismo texto. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
const hash = (o) => crypto.createHash('sha1').update(stable(o)).digest('base64').slice(0, 20);

/**
 * Lo que se comparte de un elemento: sin lo que es de cada persona (dónde tiene la carpeta
 * compartida, si la rutina está en su página principal, sus colecciones de Instagram…).
 */
function strip(kind, r, sp) {
  const o = JSON.parse(JSON.stringify(r));
  delete o.updatedAt;
  if (kind === 'libraries') {
    delete o.root;
    delete o.igCollections;
    delete o.lists;
    delete o.cloudFolders;
    if (r.id === sp.rootId) delete o.parentId;
  }
  if (kind === 'routines') {
    delete o.pinned;
    delete o.pinnedIn;
  }
  if (kind === 'videos' && o.source) delete o.source.fetchError;
  return o;
}

/** Lo que llega de fuera, con lo de aquí que no se comparte. */
function withLocal(kind, local, rec, sp) {
  const r = { ...rec };
  if (kind === 'libraries') {
    if (local?.igCollections) r.igCollections = local.igCollections;
    if (local?.lists) r.lists = local.lists;
    if (local?.cloudFolders) r.cloudFolders = local.cloudFolders;
    if (rec.id === sp.rootId) r.parentId = local?.parentId ?? null;
  }
  if (kind === 'routines' && local?.pinned) r.pinned = true;
  if (kind === 'routines' && local?.pinnedIn) r.pinnedIn = local.pinnedIn;
  // El fallo al descargar es de aquí; si ahora llega el enlace de Drive, se vuelve a intentar.
  const err = local?.source?.fetchError;
  if (kind === 'videos' && err && r.source && (!r.source.drive || r.source.drive === local.source.drive)) r.source = { ...r.source, fetchError: err };
  return r;
}

/** Imágenes pequeñas de un elemento (van por Firestore; los videos y fotos, por Drive). */
const smallFiles = (kind, r) => (kind === 'videos' ? [r?.poster] : kind === 'exercises' ? (r?.keyframes || []).map((k) => k.img) : []).filter(Boolean);

function index(db) {
  const by = {};
  for (const c of COLLECTIONS) by[c] = new Map((db[c] || []).map((r) => [r.id, r]));
  const kids = new Map();
  for (const l of db.libraries || []) {
    if (!l.parentId) continue;
    if (!kids.has(l.parentId)) kids.set(l.parentId, []);
    kids.get(l.parentId).push(l.id);
  }
  return { by, kids };
}
const recOf = (ix, k) => {
  const [kind, id] = unkey(k);
  return ix.by[kind]?.get(id);
};

/** Lo que hoy forma parte de un espacio, según los datos de aquí. */
function setOf(sp, ix) {
  const keys = new Set();
  const root = ix.by[ROOT_KIND[sp.type]]?.get(sp.rootId);
  if (!root) return keys;
  if (sp.type === 'folder') {
    const libs = new Set([root.id]);
    const walk = (id) => {
      for (const c of ix.kids.get(id) || []) {
        if (libs.has(c)) continue;
        libs.add(c);
        walk(c);
      }
    };
    walk(root.id);
    for (const id of libs) keys.add(key('libraries', id));
    for (const v of ix.by.videos.values()) if (libs.has(v.libraryId)) keys.add(key('videos', v.id));
  } else if (sp.type === 'routine') {
    keys.add(key('routines', root.id));
    for (const it of root.items || []) if (ix.by.exercises.has(it.exerciseId)) keys.add(key('exercises', it.exerciseId));
  } else {
    keys.add(key('exercises', root.id));
  }
  return keys;
}
const nameOf = (root) => String(root?.name || root?.title || '').slice(0, 80);

/**
 * ctx: { localDir, uploadDir, getDb, saveDb, markSaved(r) (no cuenta como cambio de aquí), onData() }
 */
export function createCollab({ localDir, uploadDir, getDb, saveDb, markSaved, onData }) {
  const STATE_FILE = path.join(localDir, 'colabora.json');
  let st = (() => {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      return { email: null, spaces: {} };
    }
  })();
  const cs = { state: 'off', last: null, error: null, progress: null };
  let active = null;
  let queued = null;
  let timer = null;
  let saving = false; // guardando lo que llegó de fuera: no es un cambio de aquí que haya que subir
  let stateChain = Promise.resolve();

  const saveState = () => (stateChain = stateChain.then(() => fsp.writeFile(STATE_FILE, JSON.stringify(st)).catch(() => {})));
  const me = () => lower(google.email());
  const fileHere = (f) => SAFE_FILE.test(f || '') && fs.existsSync(path.join(uploadDir, f));
  const removeFile = (f) => (f && SAFE_FILE.test(f) ? fsp.unlink(path.join(uploadDir, f)).catch(() => {}) : null);
  const spaces = () => (st.email === me() ? Object.values(st.spaces) : []);
  const requireReady = () => {
    if (!google.collabReady()) throw fail(400, 'Para compartir, inicia sesión con Google y configura Firebase (en Ajustes).');
    const my = me();
    if (st.email !== my) st = { email: my, spaces: {} };
    return my;
  };

  async function persist() {
    saving = true;
    try {
      await saveDb();
    } finally {
      saving = false;
    }
    onData();
  }

  // ---------- aplicar lo que llega ----------

  /** Quita un elemento porque ya no se comparte contigo (o lo quitaron de la carpeta). */
  function removeRecord(db, kind, r) {
    db[kind] = db[kind].filter((x) => x.id !== r.id);
    for (const f of [...smallFiles(kind, r), r.source?.file]) removeFile(f);
    if (kind === 'exercises') {
      for (const rt of db.routines) if (rt.items?.some((it) => it.exerciseId === r.id)) rt.items = rt.items.filter((it) => it.exerciseId !== r.id);
    }
  }

  /** Lo que se quedó sin su carpeta (la quitó otra persona): a la carpeta compartida, o a la Biblioteca. */
  function fixRefs(db) {
    const libs = new Set(db.libraries.map((l) => l.id));
    const top = db.libraries.find((l) => l.root) || db.libraries[0];
    const home = (k, selfId) => {
      for (const sp of spaces()) if (sp.type === 'folder' && sp.known[k] && sp.rootId !== selfId && libs.has(sp.rootId)) return sp.rootId;
      return null;
    };
    for (const v of db.videos) if (!libs.has(v.libraryId)) v.libraryId = home(key('videos', v.id)) || top.id;
    for (const l of db.libraries) if (l.parentId && !libs.has(l.parentId)) l.parentId = home(key('libraries', l.id), l.id);
  }

  function apply(db, sp, it) {
    const { kind, rid } = it;
    if (!COLLECTIONS.includes(kind) || !rid) return false;
    const k = key(kind, rid);
    const i = db[kind].findIndex((r) => r.id === rid);
    const local = i >= 0 ? db[kind][i] : null;
    if (it.deleted) {
      delete sp.known[k];
      if (!local) return false;
      removeRecord(db, kind, local);
      return true;
    }
    let rec;
    try {
      rec = JSON.parse(it.json);
    } catch {
      return false;
    }
    if (rec?.id !== rid) return false;
    const h = hash(rec);
    const kn = sp.known[k];
    sp.known[k] = { h, by: it.by };
    const remoteAt = it.updatedAt || '';
    if (!local) {
      // Borrado aquí después de ese cambio: no vuelve (al subir, se quita también de allí si se puede).
      if (db.deleted?.[rid] && db.deleted[rid] >= remoteAt) return false;
      const r = { ...withLocal(kind, null, rec, sp), updatedAt: remoteAt };
      db[kind].push(r);
      if (db.deleted) delete db.deleted[rid];
      markSaved(r);
      return true;
    }
    const localH = hash(strip(kind, local, sp));
    if (localH === h) return false;
    // Cambiado aquí (aún sin subir) después que lo de fuera: se queda, y se sube luego.
    if ((!kn || localH !== kn.h) && (local.updatedAt || '') > remoteAt) return false;
    // Si lo de aquí tenía fecha más nueva (solo cambió algo propio, como «en inicio»), la nueva
    // versión se marca como la más reciente para que tus otros ordenadores también la cojan.
    const r = { ...withLocal(kind, local, rec, sp), updatedAt: (local.updatedAt || '') > remoteAt ? nowIso() : remoteAt };
    const keep = new Set([...smallFiles(kind, r), r.source?.file]);
    for (const f of [...smallFiles(kind, local), local.source?.file]) if (f && !keep.has(f)) removeFile(f);
    db[kind][i] = r;
    markSaved(r);
    return true;
  }

  async function fetchBlob(sp, f) {
    const d = await google.fsGet(`spaces/${sp.id}/blobs/${f}`).catch(() => null);
    if (!Buffer.isBuffer(d?.data?.data)) return;
    const dest = path.join(uploadDir, f);
    await fsp.writeFile(dest + '.bajando', d.data.data);
    await fsp.rename(dest + '.bajando', dest);
    if (sp.blobs) sp.blobs[f] = 1;
  }

  /** Baja lo cambiado en un espacio desde la última vez. Devuelve si cambió algo aquí. */
  async function pull(sp) {
    const since = sp.cursor ? sp.cursor - OVERLAP : 0;
    const docs = await google.fsQuery(`spaces/${sp.id}`, 'items', since > 0 ? [['syncAt', 'GREATER_THAN', new Date(since)]] : []);
    const items = docs.map((d) => d.data);
    // Primero las imágenes que falten: así se ven en cuanto llega lo demás.
    const need = new Set();
    for (const it of items) {
      if (it.deleted) continue;
      try {
        for (const f of smallFiles(it.kind, JSON.parse(it.json))) if (SAFE_FILE.test(f) && !fileHere(f)) need.add(f);
      } catch {
        /* se ignora al aplicarlo */
      }
    }
    for (const f of need) await fetchBlob(sp, f);
    // Y se junta con lo de aquí de una vez (sobre los datos de este momento).
    const db = getDb();
    let changed = false;
    for (const it of items) changed = apply(db, sp, it) || changed;
    if (changed) fixRefs(db);
    for (const it of items) if (it.syncAt > (sp.cursor || 0)) sp.cursor = it.syncAt;
    sp.pulledAt = sp.remoteAt;
    return changed;
  }

  // ---------- subir lo de aquí ----------

  /** Envía las escrituras por tandas; si alguna no está permitida, las demás sí. Devuelve las que no. */
  async function commitAll(sp, writes) {
    const bump = { path: `spaces/${sp.id}`, data: {}, mask: [], stamp: 'syncAt', exists: true }; // avisa a los demás
    const failed = new Set();
    const send = async (chunk) => {
      try {
        await google.fsCommit([...chunk, bump]);
      } catch (e) {
        if (!e.forbidden) throw e;
        if (chunk.length === 1) return failed.add(chunk[0].path);
        for (const w of chunk) await send([w]);
      }
    };
    let chunk = [];
    let bytes = 0;
    for (const w of writes) {
      if (chunk.length && (chunk.length >= 400 || bytes + w.size > COMMIT_BYTES)) {
        await send(chunk);
        chunk = [];
        bytes = 0;
      }
      chunk.push(w);
      bytes += w.size;
    }
    if (chunk.length) await send(chunk);
    return failed;
  }

  async function push(sp, my) {
    let db = getDb();
    let ix = index(db);
    const rootKind = ROOT_KIND[sp.type];
    if (!ix.by[rootKind].get(sp.rootId)) {
      // Lo compartido se borró aquí: si es tuyo, se deja de compartir; si no, te sales.
      if (db.deleted?.[sp.rootId]) {
        if (sp.owner === my) await deleteSpace(sp);
        else await leaveSpace(sp, my);
      }
      return;
    }
    // Lo que se comparte por primera vez queda a nombre de quien lo añade.
    let changed = false;
    for (const k of setOf(sp, ix)) {
      const r = recOf(ix, k);
      if (r && !r.addedBy) ((r.addedBy = my), (changed = true));
    }
    // Videos y fotos de una carpeta compartida: a tu Drive, con enlace para los demás.
    if (sp.type === 'folder') {
      const up = [...setOf(sp, ix)].filter((k) => k.startsWith('videos~')).map((k) => recOf(ix, k))
        .filter((v) => v.source && !v.source.drive && fileHere(v.source.file));
      for (let n = 0; n < up.length; n++) {
        const v = up[n];
        cs.progress = { done: n, total: up.length, what: 'Subiendo a tu Drive' };
        const driveId = await google.uploadShared(v.source.file, await fsp.readFile(path.join(uploadDir, v.source.file)));
        const cur = getDb().videos.find((x) => x.id === v.id);
        if (cur && !cur.source.drive && cur.source.file === v.source.file) {
          Object.assign(cur.source, { drive: driveId, driveBy: my });
          changed = true;
        } else {
          google.deleteFile(driveId).catch(() => {}); // mientras tanto se borró o cambió
        }
      }
      cs.progress = null;
    }
    if (changed) await persist();

    db = getDb();
    ix = index(db);
    const keys = setOf(sp, ix);
    const root = ix.by[rootKind].get(sp.rootId);

    // 1) Imágenes (antes que los datos que las usan).
    if (!sp.blobs) sp.blobs = Object.fromEntries((await google.fsQuery(`spaces/${sp.id}`, 'blobs', [], { namesOnly: true })).map((d) => [d.id, 1]));
    const blobs = [];
    for (const k of keys) {
      for (const f of smallFiles(unkey(k)[0], recOf(ix, k))) {
        if (sp.blobs[f] || !fileHere(f) || blobs.some((b) => b.file === f)) continue;
        const data = await fsp.readFile(path.join(uploadDir, f));
        if (data.length <= BLOB_MAX) blobs.push({ path: `spaces/${sp.id}/blobs/${f}`, data: { data }, stamp: 'syncAt', size: data.length * 1.4 + 200, file: f });
      }
    }
    const failedBlobs = await commitAll(sp, blobs);
    for (const b of blobs) if (!failedBlobs.has(b.path)) sp.blobs[b.file] = 1;

    // 2) Los elementos que cambiaron aquí.
    const writes = [];
    for (const k of keys) {
      const [kind] = unkey(k);
      const r = recOf(ix, k);
      const s = strip(kind, r, sp);
      const h = hash(s);
      const kn = sp.known[k];
      if (kn?.h === h) continue;
      const by = kn?.by || my;
      const json = JSON.stringify(s);
      writes.push({ path: `spaces/${sp.id}/items/${k}`, data: { kind, rid: r.id, json, updatedAt: r.updatedAt || nowIso(), by, deleted: false }, stamp: 'syncAt', size: json.length + 300, k, known: { h, by } });
    }
    // Lo que salió de una carpeta compartida (borrado o movido fuera) sale para todos, si se puede.
    if (sp.type === 'folder') {
      for (const [k, kn] of Object.entries(sp.known)) {
        if (keys.has(k)) continue;
        if (kn.by !== my && sp.owner !== my) {
          delete sp.known[k];
          continue;
        }
        const [kind, rid] = unkey(k);
        writes.push({ path: `spaces/${sp.id}/items/${k}`, data: { kind, rid, json: '', updatedAt: nowIso(), by: kn.by, deleted: true }, stamp: 'syncAt', size: 300, k, known: null });
      }
    }
    const failed = await commitAll(sp, writes);
    for (const w of writes) {
      if (w.known && !failed.has(w.path)) sp.known[w.k] = w.known;
      else if (!w.known) delete sp.known[w.k];
    }
    // Algo no se pudo subir (sin permiso): la próxima vez se baja todo para quedar igual que allí.
    if (failed.size) ((sp.cursor = 0), (sp.pulledAt = null));

    const name = nameOf(root);
    if (name && name !== sp.name) {
      await google.fsCommit([{ path: `spaces/${sp.id}`, data: { name }, mask: ['name'], exists: true }]).catch(() => {});
      sp.name = name;
    }
  }

  // ---------- espacios ----------

  /** Al dejar de compartir algo tuyo, lo que añadieron otros se queda contigo (ya no es «de otro»). */
  function adopt(sp, my) {
    const ix = index(getDb());
    let changed = false;
    for (const k of setOf(sp, ix)) {
      const r = recOf(ix, k);
      if (r?.addedBy && r.addedBy !== my) ((r.addedBy = my), (changed = true));
    }
    return changed;
  }

  async function deleteSpace(sp) {
    for (const coll of ['items', 'blobs']) {
      const docs = await google.fsQuery(`spaces/${sp.id}`, coll, [], { namesOnly: true });
      for (let i = 0; i < docs.length; i += 400) {
        await google.fsCommit(docs.slice(i, i + 400).map((d) => ({ path: `spaces/${sp.id}/${coll}/${d.id}`, delete: true })));
      }
    }
    await google.fsCommit([{ path: `spaces/${sp.id}`, delete: true }]);
    delete st.spaces[sp.id];
  }

  async function leaveSpace(sp, my) {
    // Si ya no existe (o ya no estás), Firestore no deja leerlo: ya está hecho.
    const d = await google.fsGet(`spaces/${sp.id}`).catch((e) => {
      if (e.forbidden) return null;
      throw e;
    });
    if (d && (d.data.members || []).includes(my)) {
      await google.fsCommit([{ path: `spaces/${sp.id}`, data: { members: d.data.members.filter((m) => m !== my) }, mask: ['members'], exists: true }]);
    }
    delete st.spaces[sp.id];
  }

  /** Lo de otras personas que ya no está en nada compartido contigo se quita de aquí. */
  function cleanup(my) {
    const db = getDb();
    const ix = index(db);
    const keep = new Set();
    for (const sp of spaces()) {
      for (const k of setOf(sp, ix)) keep.add(k);
      if (sp.type === 'folder') for (const k of Object.keys(sp.known)) keep.add(k);
    }
    let changed = false;
    for (const kind of COLLECTIONS) {
      for (const r of [...db[kind]]) {
        if (r.addedBy && r.addedBy !== my && !keep.has(key(kind, r.id))) {
          removeRecord(db, kind, r);
          changed = true;
        }
      }
    }
    if (changed) fixRefs(db);
    return changed;
  }

  // ---------- una vuelta de sincronización ----------

  async function run() {
    if (!google.collabReady()) {
      cs.state = 'off';
      return;
    }
    const my = me();
    if (st.email !== my) st = { email: my, spaces: {} };
    cs.state = 'syncing';
    cs.error = null;
    try {
      // Tus espacios (los tuyos y los que te compartieron).
      const found = await google.fsQuery('', 'spaces', [['members', 'ARRAY_CONTAINS', my]]);
      const ids = new Set();
      for (const d of found) {
        const x = d.data;
        if (!ROOT_KIND[x.type] || !x.rootId) continue;
        ids.add(d.id);
        const sp = (st.spaces[d.id] ||= { id: d.id, cursor: 0, pulledAt: null, known: {}, blobs: null });
        Object.assign(sp, { type: x.type, rootId: x.rootId, name: x.name || '', owner: lower(x.owner), members: (x.members || []).map(lower), remoteAt: x.syncAt || 0 });
      }
      let changed = false;
      // Los que ya no están: se dejaron de compartir, o te quitaron.
      for (const sp of Object.values(st.spaces)) {
        if (ids.has(sp.id)) continue;
        if (sp.owner === my) changed = adopt(sp, my) || changed;
        delete st.spaces[sp.id];
      }
      // Un espacio que falla (p. ej. te acaban de quitar) no para a los demás.
      const errors = [];
      const each = async (fn) => {
        for (const sp of Object.values(st.spaces)) {
          try {
            await fn(sp);
          } catch (e) {
            if (e.forbidden) continue; // ya no tienes acceso: en la próxima vuelta deja de estar
            errors.push(`«${sp.name}»: ${e.message}`);
          }
        }
      };
      await each(async (sp) => {
        if (sp.remoteAt !== sp.pulledAt) changed = (await pull(sp)) || changed;
      });
      if (changed) await persist();
      await each((sp) => push(sp, my));
      if (cleanup(my)) await persist();
      if (errors.length) throw new Error(errors.join(' · '));
      cs.state = 'idle';
      cs.last = nowIso();
    } catch (e) {
      cs.state = 'error';
      cs.error = e.message;
      console.error('[colaborar]', e.message);
    } finally {
      cs.progress = null;
      await saveState();
    }
  }

  /** Sincroniza ahora (si ya hay una vuelta en curso, se hace otra justo después). */
  function sync() {
    if (!google.collabReady()) return Promise.resolve();
    if (!active) {
      active = run().finally(() => (active = null));
      return active;
    }
    queued ||= active.then(() => {
      queued = null;
      return sync();
    });
    return queued;
  }

  /** Tras un cambio de aquí, se sube a los pocos segundos (juntando varios seguidos). */
  function schedule() {
    if (saving || !google.collabReady() || !spaces().length) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync().catch(() => {}), 4000);
  }

  // ---------- lo que pide la app ----------

  const view = (sp) => ({ id: sp.id, type: sp.type, rootId: sp.rootId, name: sp.name, owner: sp.owner, members: sp.members, mine: sp.owner === me() });
  const spaceOf = (sid) => {
    const sp = spaces().find((s) => s.id === sid);
    if (!sp) throw fail(404, 'Eso ya no está compartido contigo.');
    return sp;
  };

  async function share(type, id) {
    const my = requireReady();
    if (!ROOT_KIND[type]) throw fail(400, 'No se puede compartir eso');
    const existing = spaces().find((s) => s.type === type && s.rootId === id);
    if (existing) return view(existing);
    const root = getDb()[ROOT_KIND[type]].find((r) => r.id === id);
    if (!root) throw fail(404, 'No encontrado');
    if (type === 'folder' && root.root) throw fail(400, 'La Biblioteca entera no se comparte: comparte una carpeta.');
    const sid = crypto.randomBytes(10).toString('hex');
    const name = nameOf(root);
    await google.fsCommit([{ path: `spaces/${sid}`, data: { type, rootId: id, name, owner: my, members: [my] }, stamp: 'syncAt', exists: false }]);
    st.spaces[sid] = { id: sid, type, rootId: id, name, owner: my, members: [my], cursor: 0, pulledAt: null, remoteAt: 0, known: {}, blobs: {} };
    await saveState();
    return view(st.spaces[sid]);
  }

  async function setMembers(sp, members) {
    await google.fsCommit([{ path: `spaces/${sp.id}`, data: { members }, mask: ['members'], exists: true }]);
    sp.members = members;
    await saveState();
    return view(sp);
  }

  async function addMember(sid, email) {
    const my = requireReady();
    const sp = spaceOf(sid);
    if (sp.owner !== my) throw fail(403, `Solo ${sp.owner} puede invitar a más gente.`);
    const who = lower(email);
    if (!EMAIL_RE.test(who)) throw fail(400, 'Escribe un correo válido (el de su cuenta de Google).');
    const d = await google.fsGet(`spaces/${sid}`);
    const members = (d?.data.members || sp.members).map(lower);
    if (members.includes(who)) return view(sp);
    return setMembers(sp, [...members, who]);
  }

  async function removeMember(sid, email) {
    const my = requireReady();
    const sp = spaceOf(sid);
    const who = lower(email);
    if (who === my) return leave(sid);
    if (sp.owner !== my) throw fail(403, `Solo ${sp.owner} puede quitar a otras personas.`);
    const d = await google.fsGet(`spaces/${sid}`);
    return setMembers(sp, (d?.data.members || sp.members).map(lower).filter((m) => m !== who));
  }

  /** Salir de algo que te compartieron, o dejar de compartir algo tuyo (te lo quedas). */
  async function leave(sid) {
    const my = requireReady();
    const sp = spaceOf(sid);
    if (sp.owner === my) {
      adopt(sp, my);
      await deleteSpace(sp);
    } else {
      await leaveSpace(sp, my);
      cleanup(my);
    }
    await persist();
    await saveState();
    return { ok: true };
  }

  /**
   * Antes de borrar o sacar algo de una carpeta compartida: lo de otra persona solo lo quita
   * ella o el dueño de la carpeta. simulate(copia) hace el cambio sobre una copia de los datos.
   */
  function guard(simulate) {
    const list = spaces().filter((sp) => sp.type === 'folder' && sp.owner !== me());
    if (!list.length) return;
    const db = getDb();
    const copy = JSON.parse(JSON.stringify({ libraries: db.libraries, videos: db.videos }));
    simulate(copy);
    const before = index(db);
    const after = index({ ...copy, exercises: [], routines: [] });
    const blocked = [];
    for (const sp of list) {
      const now = setOf(sp, after);
      if (!now.size) continue; // se quita la carpeta compartida entera: es salirse de ella
      for (const k of setOf(sp, before)) {
        const by = sp.known[k]?.by;
        if (!now.has(k) && by && by !== me()) blocked.push({ r: recOf(before, k), by, sp });
      }
    }
    if (!blocked.length) return;
    const b = blocked[0];
    const what = blocked.length === 1 ? `«${b.r?.title || b.r?.name || 'eso'}» lo añadió ${b.by}` : `Hay ${blocked.length} cosas que añadieron otras personas`;
    throw fail(403, `${what} a la carpeta compartida «${b.sp.name}»: solo quien lo añadió o ${b.sp.owner} pueden quitarlo de ahí.`);
  }

  function info() {
    return {
      ready: google.collabReady(),
      firebase: google.status().firebase,
      email: me() || null,
      ...cs,
      state: google.collabReady() ? cs.state : 'off',
      spaces: spaces().map(view),
    };
  }

  return { sync, schedule, share, addMember, removeMember, leave, guard, info, status: () => ({ state: info().state, error: cs.error }) };
}
