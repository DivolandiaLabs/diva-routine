// Lo que el servidor espera tener a mano en Node (se inyecta al principio del paquete web).
import { Buffer as B } from 'buffer';

globalThis.Buffer ||= B;
globalThis.global ||= globalThis;
globalThis.process ||= {
  env: {},
  argv: [],
  pid: 1,
  platform: 'web',
  versions: {},
  on() {},
  exit() {},
  cwd: () => '/app',
  nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)),
};
// Esperas síncronas (reintentos al leer un archivo): en la web no hace falta esperar.
if (typeof SharedArrayBuffer === 'undefined') globalThis.SharedArrayBuffer = ArrayBuffer;
Atomics.wait = () => 'timed-out';

export const Buffer = globalThis.Buffer;
export const process = globalThis.process;
