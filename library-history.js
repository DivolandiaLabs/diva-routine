import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual as equal } from 'node:util';

const collections = ['libraries', 'videos', 'exercises', 'routines', 'routineTabs'];
const clean = (record) => {
  if (!record) return null;
  const { updatedAt, ...rest } = record;
  return structuredClone(rest);
};
const snapshot = (db) => new Map(collections.flatMap(kind => db[kind].map((r, index) => [`${kind}:${r.id}`, { kind, index, value: clean(r) }])));
const conflict = () => Object.assign(new Error('No se puede deshacer: esos elementos han cambiado después. Se conservan los cambios actuales.'), { status: 409 });

// Only saves made by an explicitly tagged Library request enter its history.
// Other views, downloads and synchronization update the baseline without becoming undo steps.
export class LibraryHistory {
  context = new AsyncLocalStorage();
  baseline = new Map();
  stacks = new Map();
  resetBaseline(db) { this.baseline = snapshot(db); }
  active() { return this.context.getStore()?.active; }
  async run(owner, group, fn) {
    const context = { owner, group, active: true };
    return this.context.run(context, async () => {
      try { return await fn(); } finally { context.active = false; }
    });
  }
  capture(db) {
    const next = snapshot(db), ctx = this.context.getStore();
    if (ctx?.active) {
      const changes = [];
      for (const key of new Set([...this.baseline.keys(), ...next.keys()])) {
        const before = this.baseline.get(key), after = next.get(key);
        if (!equal(before?.value, after?.value)) changes.push({ key, kind: (before || after).kind, index: before?.index, before: structuredClone(before?.value || null), after: structuredClone(after?.value || null) });
      }
      if (changes.length) {
        const stack = this.stacks.get(ctx.owner) || [];
        let entry = stack.at(-1);
        if (!entry || entry.group !== ctx.group) {
          entry = { group: ctx.group, changes: new Map(), order: Object.fromEntries(collections.map(kind => [kind, [...this.baseline.values()].filter(r => r.kind === kind).map(r => r.value.id)])) };
          stack.push(entry);
        }
        for (const change of changes) {
          const previous = entry.changes.get(change.key);
          const originalIndex = entry.order[change.kind].indexOf((change.before || change.after).id);
          entry.changes.set(change.key, { ...change, index: originalIndex < 0 ? change.index : originalIndex, before: previous ? previous.before : change.before });
          const combined = entry.changes.get(change.key);
          if (equal(combined.before, combined.after)) entry.changes.delete(change.key);
        }
        if (!entry.changes.size) stack.pop();
        this.stacks.set(ctx.owner, stack.slice(-50));
      }
    }
    this.baseline = next;
  }
  status(owner) { return { count: this.stacks.get(owner)?.length || 0 }; }
  // A background download/thumbnail belongs to the original creation, not to a
  // later user edit. Rebase only fields that still match the saved creation.
  acceptAutomatic(kind, before, after, fields) {
    before = clean(before); after = clean(after);
    for (const stack of this.stacks.values()) for (const entry of stack) {
      const change = entry.changes.get(`${kind}:${after.id}`);
      if (!change || change.before || !change.after) continue;
      for (const field of fields) {
        if (equal(before[field], after[field]) || !equal(change.after[field], before[field])) continue;
        if (Object.hasOwn(after, field)) change.after[field] = structuredClone(after[field]);
        else delete change.after[field];
      }
    }
  }
  prepare(owner, db) {
    const entry = this.stacks.get(owner)?.at(-1);
    if (!entry) throw Object.assign(new Error('No hay cambios para deshacer.'), { status: 409 });
    const next = structuredClone(db);
    for (const { kind, before, after, index: originalIndex } of [...entry.changes.values()].sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity))) {
      const id = (before || after).id;
      const index = next[kind].findIndex(r => r.id === id);
      const current = clean(next[kind][index]);
      if (!before || !after) {
        if (!equal(current, after)) throw conflict();
        if (before) next[kind].splice(originalIndex, 0, structuredClone(before));
        else next[kind].splice(index, 1);
      } else {
        if (!current) throw conflict();
        for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (equal(before[field], after[field])) continue;
          if (!equal(current[field], after[field])) throw conflict();
          if (Object.hasOwn(before, field)) next[kind][index][field] = structuredClone(before[field]);
          else delete next[kind][index][field];
        }
      }
    }
    // Undoing a creation must not remove a container now used by later work.
    const removed = new Set(collections.flatMap(k => db[k].filter(r => !next[k].some(n => n.id === r.id)).map(r => r.id)));
    if (next.libraries.some(l => removed.has(l.parentId)) || next.videos.some(v => removed.has(v.libraryId))
      || next.exercises.some(e => removed.has(e.videoId)) || next.routines.some(r => r.items.some(it => removed.has(it.exerciseId)))) throw conflict();
    return { next, entry };
  }
  commit(owner, entry) {
    const stack = this.stacks.get(owner);
    if (stack?.at(-1) !== entry) throw conflict();
    stack.pop();
  }
}
