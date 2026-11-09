async function baseRequest(method, url, body, headers = {}) {
  const isFile = body instanceof Blob;
  const res = await fetch(url, {
    method,
    headers: isFile ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : isFile ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const fileHeaders = (file, libraryId) => ({
  'X-Filename': encodeURIComponent(file.name),
  'Content-Type': 'application/octet-stream',
  ...(libraryId ? { 'X-Library': libraryId } : {}),
});

export function createApi(extraHeaders = {}) {
const request = (method, url, body, headers = {}) => baseRequest(method, url, body, { ...extraHeaders, ...headers });
return {
  state: () => request('GET', '/api/state'),
  libraryUndoStatus: () => request('GET', '/api/library-undo'),
  undoLibrary: () => request('POST', '/api/library-undo'),
  version: () => request('GET', '/api/version'),
  settings: () => request('GET', '/api/settings'),
  backupInfo: () => request('GET', '/api/backup/info'),
  restoreBackup: (file) => request('POST', '/api/backup', file, { 'Content-Type': 'application/octet-stream' }),
  google: () => request('GET', '/api/google'),
  googleClient: (json) => request('POST', '/api/google/client', { json }),
  googleStorage: () => request('GET', '/api/google/storage'),
  googleLogout: () => request('POST', '/api/google/logout'),
  googleSync: () => request('POST', '/api/google/sync'),
  googleFirebase: (config) => request('POST', '/api/google/firebase', { config }),
  setDataDir: (dir) => request('POST', '/api/settings/data-dir', { dir }),

  update: () => request('GET', '/api/update'),
  checkUpdate: () => request('POST', '/api/update/check'),
  installUpdate: () => request('POST', '/api/update/install'),

  collab: () => request('GET', '/api/collab'),
  collabSync: () => request('POST', '/api/collab/sync'),
  share: (type, id, email) => request('POST', '/api/collab/share', { type, id, email }),
  addMember: (sid, email) => request('POST', `/api/collab/${sid}/members`, { email }),
  removeMember: (sid, email) => request('DELETE', `/api/collab/${sid}/members/${encodeURIComponent(email)}`),
  leaveSpace: (sid) => request('POST', `/api/collab/${sid}/leave`),

  createLibrary: (name, parentId = null, kind = null) => request('POST', '/api/libraries', { name, parentId, ...(kind ? { kind } : {}) }),
  createShelf: (name) => request('POST', '/api/libraries', { name, shelf: true }),
  renameLibrary: (id, name) => request('PUT', `/api/libraries/${id}`, { name }),
  updateLibrary: (id, data) => request('PUT', `/api/libraries/${id}`, data),
  orderLibraries: (ids) => request('POST', '/api/libraries/order', { ids }),
  promoteMain: () => request('POST', '/api/libraries/promote'),
  orderVideos: (ids) => request('POST', '/api/videos/order', { ids }),
  orderItems: (items, shelf) => request('POST', '/api/order', { items, shelf }),
  deleteLibrary: (id) => request('DELETE', `/api/libraries/${id}`),
  syncLibrary: (id) => request('POST', `/api/libraries/${id}/sync`),
  unlinkCollection: (id, collectionId) => request('DELETE', `/api/libraries/${id}/collections/${encodeURIComponent(collectionId)}`),

  copyItems: (videos, folders, target) => request('POST', '/api/copy', { videos, folders, target }),
  socialStatus: () => request('GET', '/api/social'),
  cloudImport: (url, libraryId) => request('POST', '/api/cloud/import', { url, libraryId }),
  driveFolders: () => request('GET', '/api/cloud/gdrive/folders'),
  mega: () => request('GET', '/api/cloud/mega'),
  megaLogin: (email, password, code) => request('POST', '/api/cloud/mega/login', { email, password, code }),
  megaLogout: () => request('POST', '/api/cloud/mega/logout'),
  megaSync: (on) => request('POST', '/api/cloud/mega/sync', on === undefined ? {} : { on }),
  megaBrowse: (id) => request('GET', `/api/cloud/mega/browse${id ? `?id=${encodeURIComponent(id)}` : ''}`),
  megaImport: (folders, files, libraryId) => request('POST', '/api/cloud/mega/import', { folders, files, libraryId }),
  driveImport: (folder, parentId) => request('POST', '/api/cloud/gdrive/import', { ...folder, parentId }),
  socialConnect: (net, cookies) => request('POST', `/api/social/${net}`, { cookies }),
  socialDisconnect: (net) => request('DELETE', `/api/social/${net}`),
  youtubeLists: () => request('GET', '/api/social/youtube/lists'),
  importList: (url, name, libraryId, parentId) => request('POST', '/api/social/lists/import', { url, name, libraryId, parentId }),
  unlinkList: (libraryId, url) => request('POST', '/api/social/lists/unlink', { libraryId, url }),

  igStatus: () => request('GET', '/api/instagram'),
  igConnect: (cookies) => request('POST', '/api/instagram', { cookies }),
  igDisconnect: () => request('DELETE', '/api/instagram'),
  igCollections: () => request('GET', '/api/instagram/collections'),
  igImport: (collection, libraryId, parentId) => request('POST', '/api/instagram/collections/import', { ...collection, libraryId, parentId }),

  addLinks: (urls, libraryId) => request('POST', '/api/videos', { urls, libraryId }),
  upload: (file, libraryId) => request('POST', '/api/videos/upload', file, fileHeaders(file, libraryId)),
  updateVideo: (id, data) => request('PUT', `/api/videos/${id}`, data),
  spotifyCheck: (url) => request('GET', `/api/spotify/check?url=${encodeURIComponent(url)}`),
  updateVideoPoster: (id, poster) => request('PUT', `/api/videos/${id}`, { poster }, { 'X-Automatic-Poster': '1' }),
  deleteVideo: (id) => request('DELETE', `/api/videos/${id}`),
  deleteVideos: (ids) => request('POST', '/api/videos/delete', { ids }),
  deleteExercisesOf: (id) => request('DELETE', `/api/videos/${id}/exercises`),
  attachFile: (id, file) => request('POST', `/api/videos/${id}/file`, file, fileHeaders(file)),
  fetchVideo: (id) => request('POST', `/api/videos/${id}/fetch`),
  saveAuto: (id, exercises) => request('POST', `/api/videos/${id}/auto`, { exercises }),

  ai: () => request('GET', '/api/ai'),
  aiCredits: (key) => request('POST', '/api/ai/credits', { key }),
  aiActivate: (key) => request('POST', '/api/ai/license', { key }),
  aiDeactivate: () => request('DELETE', '/api/ai/license'),
  aiChoice: (choice) => request('POST', '/api/ai/choice', choice),
  redrawPhase: (id, k, image) => request('POST', `/api/exercises/${id}/redraw/${k}`, { image }),
  restoreDrawings: (id) => request('POST', `/api/exercises/${id}/restore`),
  uploadFrame: (blob, name = 'fase.webp') => request('POST', '/api/frames', blob, { 'X-Filename': name, 'Content-Type': 'application/octet-stream' }),
  createExercise: (data) => request('POST', '/api/exercises', data),
  updateExercise: (id, data) => request('PUT', `/api/exercises/${id}`, data),
  restoreFrames: (files) => request('POST', '/api/restore-frames', { files }),
  deleteExercise: (id) => request('DELETE', `/api/exercises/${id}`),

  createRoutine: (data) => request('POST', '/api/routines', data),
  updateRoutine: (id, data) => request('PUT', `/api/routines/${id}`, data),
  deleteRoutine: (id) => request('DELETE', `/api/routines/${id}`),
  orderExercises: (ids) => request('POST', '/api/exercises/order', { ids }),
  createSeqFolder: (name) => request('POST', '/api/seq-folders', { name }),
  renameSeqFolder: (id, name) => request('PUT', `/api/seq-folders/${id}`, { name }),
  deleteSeqFolder: (id) => request('DELETE', `/api/seq-folders/${id}`),
  createRoutineTab: (data) => request('POST', '/api/routine-tabs', data),
  renameRoutineTab: (id, name) => request('PUT', `/api/routine-tabs/${id}`, { name }),
  orderRoutineTabs: (ids) => request('POST', '/api/routine-tabs/order', { ids }),
  deleteRoutineTab: (id) => request('DELETE', `/api/routine-tabs/${id}`),
};

}
export const api = createApi();
