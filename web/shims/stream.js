// node:stream: lo justo para pasar una respuesta de fetch a un archivo.
export const Readable = {
  fromWeb(body) {
    return {
      async *[Symbol.asyncIterator]() {
        const r = body.getReader();
        for (;;) {
          const { done, value } = await r.read();
          if (done) return;
          yield value;
        }
      },
    };
  },
};
export default { Readable };
