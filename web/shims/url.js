// node:url: solo fileURLToPath (rutas del disco virtual).
export const fileURLToPath = (u) => decodeURIComponent(new URL(String(u)).pathname);
export const pathToFileURL = (p) => new URL('file://' + p);
export default { fileURLToPath, pathToFileURL };
