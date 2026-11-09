// node:async_hooks: sin contexto asíncrono real; vale porque las acciones con historial van de una en una.
export class AsyncLocalStorage {
  #store;
  getStore() { return this.#store; }
  run(store, fn, ...args) {
    const prev = this.#store;
    this.#store = store;
    let out;
    try {
      out = fn(...args);
    } catch (e) {
      this.#store = prev;
      throw e;
    }
    if (out && typeof out.then === 'function') return out.finally(() => (this.#store = prev));
    this.#store = prev;
    return out;
  }
}
export default { AsyncLocalStorage };
