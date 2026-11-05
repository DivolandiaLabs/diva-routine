// Lo que el servidor Premium guarda para el panel (D1). Las estadísticas nunca deben tumbar el
// servicio: si la base falla o no está configurada, la viñeta se sirve igual.
import { START_OFF } from './catalog.js';

const COMP = /^DIVA-/;
export const isCompKey = (key) => COMP.test(String(key));
export const tailOf = (key) => String(key).slice(-4);

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const quiet = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.error('[db]', e.message);
    return fallback;
  }
};

export const isBlocked = (env, hash) => (env.DB
  ? quiet(async () => Boolean(await env.DB.prepare('SELECT 1 FROM licenses WHERE hash = ? AND blocked = 1').bind(hash).first()), false)
  : false);

// models_off guarda los motores apagados. Los de START_OFF van al revés: una fila `on:id` los enciende,
// y si no se puede leer la base siguen apagados.
export const modelIsOff = (env, id) => {
  const startOff = START_OFF.has(id);
  if (!env.DB) return startOff;
  return quiet(async () => {
    const row = await env.DB.prepare('SELECT 1 FROM models_off WHERE id = ?').bind(startOff ? `on:${id}` : id).first();
    return startOff ? !row : Boolean(row);
  }, startOff);
};

export async function setModel(env, id, enabled) {
  const addRow = enabled === START_OFF.has(id); // la fila enciende los de START_OFF y apaga los demás
  const row = START_OFF.has(id) ? `on:${id}` : id;
  const sql = addRow ? 'INSERT OR IGNORE INTO models_off (id) VALUES (?)' : 'DELETE FROM models_off WHERE id = ?';
  await env.DB.prepare(sql).bind(row).run();
}

// Una fila `prompt:id` apaga ese motor solo para el cuadro de prompt.
export const promptIsOff = (env, id) => {
  if (!env.DB) return false;
  return quiet(async () => Boolean(await env.DB.prepare('SELECT 1 FROM models_off WHERE id = ?').bind(`prompt:${id}`).first()), false);
};

export async function setPromptModel(env, id, enabled) {
  const sql = enabled ? 'DELETE FROM models_off WHERE id = ?' : 'INSERT OR IGNORE INTO models_off (id) VALUES (?)';
  await env.DB.prepare(sql).bind(`prompt:${id}`).run();
}

/** La licencia de cortesía si sigue en vigor. Sin base de datos no hay cortesía posible. */
export async function compOf(env, hash) {
  if (!env.DB) return null;
  return env.DB.prepare('SELECT * FROM comps WHERE hash = ? AND revoked = 0 AND expires > ?').bind(hash, Date.now()).first();
}

/** El Premium concedido a esa cuenta si sigue en vigor. */
export async function grantOf(env, email) {
  if (!env.DB) return null;
  return env.DB.prepare(`SELECT g.*, l.vignettes, l.period_days FROM grants g LEFT JOIN grant_limits l ON l.email = g.email
    WHERE g.email = ? AND g.revoked = 0 AND g.expires > ?`).bind(email, Date.now()).first();
}

export const touch = (env, { hash, key, kind, plan, email = null }) => (env.DB
  ? quiet(() => env.DB.prepare(`INSERT INTO licenses (hash, tail, kind, plan, email, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (hash) DO UPDATE SET plan = excluded.plan, email = COALESCE(excluded.email, email), last_seen = excluded.last_seen`)
    .bind(hash, tailOf(key), kind, plan, email, Date.now(), Date.now()).run())
  : null);

export const record = (env, { hash, plan, model, style, ok, vignettes, cost }) => (env.DB
  ? quiet(async () => {
    const now = new Date();
    await env.DB.prepare('INSERT INTO events (ts, day, model, style, plan, ok, vignettes, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(now.getTime(), now.toISOString().slice(0, 10), model, style, plan, ok ? 1 : 0, vignettes, cost).run();
    if (ok) await env.DB.prepare('UPDATE licenses SET vignettes = vignettes + ? WHERE hash = ?').bind(vignettes, hash).run();
  })
  : null);
