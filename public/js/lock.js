// Bloqueo de la app con PIN o contraseña, solo en este dispositivo: lo que se guarda (una huella
// PBKDF2 con sal, nunca el PIN) vive en el almacenamiento de este navegador o de esta app, no se
// sincroniza. Es una pantalla de privacidad, no un cifrado de los datos.
const KEY = 'jr-lock';
const OPEN = 'jr-unlocked'; // en sessionStorage: abierto en esta ventana (sobrevive a recargar)
const ITER = 150_000;
const MAX_TRIES = 5; // fallos seguidos antes de esperar
const WAIT_MS = 30_000;

const read = (store, k) => {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
};
const write = (store, k, v) => {
  try {
    if (v === null) store.removeItem(k);
    else store.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
};

export function lockConfig() {
  try {
    const c = JSON.parse(read(localStorage, KEY) || 'null');
    return c?.hash && c?.salt ? c : null;
  } catch {
    return null;
  }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derive(secret, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function checkSecret(secret) {
  const c = lockConfig();
  if (!c) return true;
  return (await derive(secret, unhex(c.salt), c.iter || ITER)) === c.hash;
}

/** kind: 'pin' o 'password'. after: minutos fuera de la app tras los que se vuelve a pedir (0: solo al abrir). */
export async function setLock(kind, secret, after = 0) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const c = { kind, salt: hex(salt), iter: ITER, hash: await derive(secret, salt, ITER), after };
  write(localStorage, KEY, JSON.stringify(c));
  write(sessionStorage, OPEN, '1');
}

export function setLockAfter(after) {
  const c = lockConfig();
  if (c) write(localStorage, KEY, JSON.stringify({ ...c, after }));
}

export function clearLock() {
  write(localStorage, KEY, null);
  write(localStorage, 'jr-lock-fails', null);
}

export const validSecret = (kind, s) => (kind === 'pin' ? /^\d{4,8}$/.test(s) : s.length >= 6);

// ---------- pantalla de bloqueo ----------

let showing = null;

/** Si hay bloqueo y esta ventana no está abierta, tapa la app hasta que se escriba el PIN. */
export function lockGate() {
  if (!lockConfig() || read(sessionStorage, OPEN) === '1') return Promise.resolve();
  return showLock();
}

export function lockNow() {
  if (!lockConfig()) return Promise.resolve();
  write(sessionStorage, OPEN, null);
  return showLock();
}

function fails() {
  try {
    return JSON.parse(read(localStorage, 'jr-lock-fails') || 'null') || { n: 0, until: 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}

function showLock() {
  if (showing) return showing;
  const c = lockConfig();
  const pin = c.kind === 'pin';
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const box = document.createElement('div');
  box.className = 'lock-screen';
  box.innerHTML = `
    <form class="lock-card" autocomplete="off">
      <img class="login-logo" src="/logo.png" alt="">
      <h2>${pin ? 'Escribe tu PIN' : 'Escribe tu contraseña'}</h2>
      <input id="lockInput" type="password" ${pin ? 'inputmode="numeric" pattern="[0-9]*" maxlength="8"' : ''} autocomplete="current-password" aria-label="${pin ? 'PIN' : 'Contraseña'}" required>
      <p class="lock-msg" role="alert"></p>
      <button class="btn primary" type="submit">Desbloquear</button>
      <button class="btn small ghost" type="button" data-lock-forgot>¿Lo has olvidado?</button>
    </form>`;
  document.body.appendChild(box);
  document.documentElement.classList.add('locked');
  const input = box.querySelector('#lockInput');
  const msg = box.querySelector('.lock-msg');
  const submit = box.querySelector('[type=submit]');
  setTimeout(() => input.focus(), 50);

  let timer = null;
  const waitLeft = () => {
    const left = fails().until - Date.now();
    clearTimeout(timer);
    if (left > 0) {
      submit.disabled = input.disabled = true;
      msg.textContent = `Demasiados intentos. Espera ${Math.ceil(left / 1000)} s.`;
      timer = setTimeout(waitLeft, 1000);
      return true;
    }
    if (submit.disabled) {
      submit.disabled = input.disabled = false;
      msg.textContent = '';
      input.focus();
    }
    return false;
  };
  waitLeft();

  showing = new Promise((resolve) => {
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (waitLeft()) return;
      submit.disabled = true;
      const ok = await checkSecret(input.value);
      submit.disabled = false;
      if (ok) {
        write(localStorage, 'jr-lock-fails', null);
        write(sessionStorage, OPEN, '1');
        clearTimeout(timer);
        box.remove();
        document.documentElement.classList.remove('locked');
        showing = null;
        return resolve();
      }
      const f = fails();
      f.n += 1;
      if (f.n >= MAX_TRIES) {
        f.n = 0;
        f.until = Date.now() + WAIT_MS;
      }
      write(localStorage, 'jr-lock-fails', JSON.stringify(f));
      input.value = '';
      box.querySelector('.lock-card').classList.remove('shake');
      void box.offsetWidth;
      box.querySelector('.lock-card').classList.add('shake');
      if (!waitLeft()) msg.textContent = pin ? 'PIN incorrecto.' : 'Contraseña incorrecta.';
      input.focus();
    });
    box.querySelector('[data-lock-forgot]').addEventListener('click', () => {
      msg.innerHTML = globalThis.JR_WEB
        ? 'No se puede recuperar. Para quitar el bloqueo, borra los datos de este sitio en tu navegador. Si usabas tu cuenta de Google, tus datos vuelven al entrar de nuevo con ella; si no, se pierden los de este navegador.'
        : 'No se puede recuperar. Para quitar el bloqueo, cierra la app y borra la carpeta <code>%APPDATA%\\Diva Routine\\Local Storage</code>. Tus videos y rutinas no se tocan; solo se olvidan preferencias como el tema o el idioma.';
    });
  });
  return showing;
}

// Volver a pedirlo tras un rato fuera de la app (minimizada, otra pestaña, móvil bloqueado).
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  const c = lockConfig();
  if (!c?.after) return;
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt >= c.after * 60_000) lockNow();
});
