async function request(method, url, body, headers = {}) {
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

export const api = {
  state: () => request('GET', '/api/state'),
  version: () => request('GET', '/api/version'),
  settings: () => request('GET', '/api/settings'),
  google: () => request('GET', '/api/google'),
  googleClient: (json) => request('POST', '/api/google/client', { json }),
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

  createLibrary: (name, parentId = null) => request('POST', '/api/libraries', { name, parentId }),
  createShelf: (name) => request('POST', '/api/libraries', { name, shelf: true }),
  renameLibrary: (id, name) => request('PUT', `/api/libraries/${id}`, { name }),
  updateLibrary: (id, data) => request('PUT', `/api/libraries/${id}`, data),
  orderLibraries: (ids) => request('POST', '/api/libraries/order', { ids }),
  deleteLibrary: (id) => request('DELETE', `/api/libraries/${id}`),
  syncLibrary: (id) => request('POST', `/api/libraries/${id}/sync`),
  unlinkCollection: (id, collectionId) => request('DELETE', `/api/libraries/${id}/collections/${encodeURIComponent(collectionId)}`),

  socialStatus: () => request('GET', '/api/social'),
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
  deleteVideo: (id) => request('DELETE', `/api/videos/${id}`),
  deleteVideos: (ids) => request('POST', '/api/videos/delete', { ids }),
  deleteExercisesOf: (id) => request('DELETE', `/api/videos/${id}/exercises`),
  attachFile: (id, file) => request('POST', `/api/videos/${id}/file`, file, fileHeaders(file)),
  fetchVideo: (id) => request('POST', `/api/videos/${id}/fetch`),
  saveAuto: (id, exercises) => request('POST', `/api/videos/${id}/auto`, { exercises }),

  uploadFrame: (blob, name = 'fase.webp') => request('POST', '/api/frames', blob, { 'X-Filename': name, 'Content-Type': 'application/octet-stream' }),
  createExercise: (data) => request('POST', '/api/exercises', data),
  updateExercise: (id, data) => request('PUT', `/api/exercises/${id}`, data),
  deleteExercise: (id) => request('DELETE', `/api/exercises/${id}`),

  createRoutine: (data) => request('POST', '/api/routines', data),
  updateRoutine: (id, data) => request('PUT', `/api/routines/${id}`, data),
  deleteRoutine: (id) => request('DELETE', `/api/routines/${id}`),
};
