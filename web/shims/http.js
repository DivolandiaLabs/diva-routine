// node:http para la versión web: el «servidor» atiende las peticiones que le pasa el service worker.
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

let handler = null;

export function createServer(fn) {
  handler = fn;
  const server = new EventEmitter();
  server.listen = (...args) => {
    const cb = args.find((a) => typeof a === 'function');
    queueMicrotask(() => cb?.());
    return server;
  };
  server.address = () => ({ port: 5177 });
  server.close = (cb) => cb?.();
  return server;
}

/** Convierte un Request del navegador en req/res de Node, lo atiende y devuelve un Response. */
export async function dispatch(request, url) {
  if (!handler) throw new Error('El servidor aún no ha arrancado');
  const body = request.method === 'GET' || request.method === 'HEAD' ? null : request.body;
  const req = new EventEmitter();
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = { host: 'localhost:5177' };
  for (const [k, val] of request.headers) req.headers[k.toLowerCase()] = val;
  req.headers.host = 'localhost:5177';
  delete req.headers.origin;
  req[Symbol.asyncIterator] = async function* () {
    if (!body) return;
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  };
  req.pipe = (dest) => {
    (async () => {
      for await (const c of req) dest.write(c);
      dest.end();
    })().catch((e) => req.emit('error', e));
    return dest;
  };

  return new Promise((resolve) => {
    const res = new EventEmitter();
    const headers = new Headers();
    const chunks = [];
    res.statusCode = 200;
    res.headersSent = false;
    res.setHeader = (k, val) => headers.set(k, String(val));
    res.getHeader = (k) => headers.get(k);
    res.removeHeader = (k) => headers.delete(k);
    res.writeHead = (status, h = {}) => {
      res.statusCode = status;
      for (const [k, val] of Object.entries(h)) if (val != null) headers.set(k, String(val));
      res.headersSent = true;
      return res;
    };
    res.write = (c) => {
      chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
      return true;
    };
    const finish = (bodyInit) => {
      res.headersSent = true;
      res.writableEnded = true;
      const noBody = request.method === 'HEAD' || [204, 304].includes(res.statusCode);
      resolve(new Response(noBody ? null : bodyInit, { status: res.statusCode, headers }));
      res.emit('finish');
      res.emit('close');
    };
    res.end = (c) => {
      if (c != null) res.write(c);
      finish(chunks.length ? new Blob(chunks) : null);
    };
    res.endBlob = (b) => finish(b); // los vídeos: el trozo del Blob tal cual
    res.flushHeaders = () => {};
    Promise.resolve(handler(req, res)).catch((e) => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
}

export default { createServer };
