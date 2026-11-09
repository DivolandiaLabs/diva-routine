// node:child_process: en el navegador no se pueden lanzar programas (yt-dlp, etc.).
import { EventEmitter } from 'events';
const nope = () => Object.assign(new Error('No disponible en la versión web'), { code: 'ENOENT' });
export function spawn() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.kill = () => {};
  queueMicrotask(() => c.emit('error', nope()));
  return c;
}
export function execFile(_cmd, _args, _opts, cb) {
  cb = [_args, _opts, cb].find((x) => typeof x === 'function');
  queueMicrotask(() => cb?.(nope(), '', ''));
  return spawn();
}
export default { spawn, execFile };
