// Ventana para compartir una carpeta, una rutina o un dibujo con otras personas (por su Gmail).
// Lo ven en su propia app al iniciar sesión con esa cuenta de Google.
import { api } from './api.js';
import { state, refresh, emit, esc, toast, libraryById, routineById, exerciseById, spaceFor, who } from './store.js';

const WHAT = {
  folder: {
    title: (n) => `Compartir la carpeta «${n}»`,
    people: 'Colaboradores',
    perms: 'Ven la carpeta y sus subcarpetas y pueden <b>añadir</b> videos, fotos y subcarpetas. Lo que añade una persona solo lo quitan ella o quien comparte la carpeta.',
  },
  routine: {
    title: (n) => `Editores de la rutina «${n}»`,
    people: 'Editores',
    perms: 'Ven la rutina y pueden <b>cambiarla</b>: añadir o quitar dibujos, el orden, las repeticiones y las notas.',
  },
  drawing: {
    title: (n) => `Compartir el dibujo «${n}»`,
    people: 'Editores',
    perms: 'Lo ven en su apartado Rutinas, pueden <b>cambiarlo</b> (nombre, categoría, notas) y usarlo en sus rutinas.',
  },
};
/** Icono de «compartido» (dos personas), para el menú y los recuadros. */
export const SHARE_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/></svg>';

const recordOf = (type, id) => (type === 'folder' ? libraryById(id) : type === 'routine' ? routineById(id) : exerciseById(id));

function syncText(c) {
  if (c.state === 'syncing') return c.progress?.total ? `${c.progress.what} (${c.progress.done + 1}/${c.progress.total})…` : 'Sincronizando…';
  if (c.state === 'error') return `No se pudo sincronizar: ${c.error || ''}`;
  return c.last ? 'Al día. Lo que cambies llega a los demás en uno o dos minutos.' : '';
}

export function openShare(type, id) {
  document.getElementById('shareDialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'shareDialog';
  dlg.className = 'ig-dialog share-dialog';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  const $ = (s) => dlg.querySelector(s);
  let busy = '';
  let msg = null; // { text, error }

  function draw() {
    const rec = recordOf(type, id);
    const name = rec?.name || rec?.title || '';
    const c = state.collab || {};
    const sp = spaceFor(type, id);
    const w = WHAT[type];
    const head = `<header><h2>${esc(w.title(name))}</h2><button class="x" data-sh="close" aria-label="Cerrar">✕</button></header>`;
    if (!c.ready) {
      dlg.innerHTML = `${head}
        <p>Para compartir con otras personas, una sola vez:</p>
        <ol class="ig-steps">
          ${state.google?.connected ? '' : '<li>Inicia sesión con tu cuenta de Google.</li>'}
          ${c.firebase ? '' : '<li>Configura Firebase (gratis, unos minutos).</li>'}
        </ol>
        <p class="hint">Los pasos están en Ajustes. Las personas con quienes compartas también necesitan la app (cópiasela) e iniciar sesión con su Gmail.</p>
        <footer><span class="hint"></span><a class="btn primary" href="#/ajustes" data-sh="close">Ir a Ajustes</a></footer>`;
      return;
    }
    const mine = !sp || sp.mine;
    const owner = sp ? sp.owner : c.email;
    const members = sp ? sp.members : [c.email];
    const keep = $('#shEmail')?.value || '';
    dlg.innerHTML = `${head}
      <p class="hint">${w.perms} Cada persona lo verá en su app al iniciar sesión con esa cuenta de Google.</p>
      ${msg ? `<p class="ig-msg ${msg.error ? 'error' : 'ok'}">${esc(msg.text)}</p>` : ''}
      <h4 class="sh-sub">${w.people}</h4>
      <ul class="sh-people">
        ${members.map((m) => `
          <li><span class="avatar" aria-hidden="true">${esc((who(m)[0] || '?').toUpperCase())}</span>
            <span class="sh-mail">${esc(m)}${m === c.email ? ' <small>(tú)</small>' : ''}</span>
            ${m === owner ? '<small class="sh-role">comparte</small>'
              : mine ? `<button class="row-del" data-sh-remove="${esc(m)}" title="Quitar a ${esc(m)}" aria-label="Quitar a ${esc(m)}">✕</button>` : ''}
          </li>`).join('')}
      </ul>
      ${mine
        ? `<div class="row sh-add">
            <input type="email" id="shEmail" placeholder="Gmail de la persona (p. ej. ana@gmail.com)" autocomplete="off" spellcheck="false" aria-label="Correo de la persona" value="${esc(keep)}">
            <button class="btn primary" data-sh="add" ${busy ? 'disabled' : ''}>Invitar</button>
          </div>`
        : `<p class="hint">${type === 'drawing' ? 'Lo' : 'La'} comparte contigo <b>${esc(owner)}</b>; solo esa persona invita o quita gente.</p>`}
      <footer>
        <span class="hint">${esc(busy || syncText(c))}</span>
        ${sp ? (mine
          ? '<button class="btn ghost danger" data-sh="stop" title="Las demás personas dejan de verlo; tú lo conservas">Dejar de compartir</button>'
          : '<button class="btn ghost danger" data-sh="leave" title="Deja de estar en tu app">Salir</button>') : ''}
      </footer>`;
    $('#shEmail')?.focus();
  }

  const reload = async () => {
    state.collab = await api.collab().catch(() => state.collab);
  };

  async function run(label, fn) {
    busy = label;
    msg = null;
    draw();
    try {
      const text = await fn();
      if (text) msg = { text };
    } catch (e) {
      msg = { text: e.message, error: true };
    }
    busy = '';
    await reload();
    emit('data');
    if (dlg.open) draw();
  }

  async function invite() {
    const email = $('#shEmail').value.trim().toLowerCase();
    if (!email) return $('#shEmail').focus();
    await run('Invitando…', async () => {
      const sp = spaceFor(type, id);
      if (sp) await api.addMember(sp.id, email);
      else await api.share(type, id, email);
      $('#shEmail') && ($('#shEmail').value = '');
      return `${email} ya puede verlo: le aparecerá en su app (si la tiene abierta, en un par de minutos).`;
    });
  }

  dlg.addEventListener('keydown', (e) => {
    if (e.target.id !== 'shEmail' || e.key !== 'Enter') return;
    e.preventDefault();
    invite();
  });
  dlg.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-sh], [data-sh-remove]');
    if (!t) return;
    const sp = spaceFor(type, id);
    if (t.dataset.shRemove) {
      const m = t.dataset.shRemove;
      if (!confirm(`¿Quitar a ${m}? Dejará de verlo en su app.`)) return;
      return run('Quitando…', async () => {
        await api.removeMember(sp.id, m);
        return `${m} ya no lo ve.`;
      });
    }
    const act = t.dataset.sh;
    if (act === 'close') return dlg.close();
    if (act === 'add') return invite();
    if (act === 'stop') {
      if (!confirm('¿Dejar de compartirlo? Las demás personas dejarán de verlo. Tú lo conservas, con lo que hayan añadido.')) return;
      await run('Dejando de compartir…', async () => {
        await api.leaveSpace(sp.id);
        await refresh();
        return 'Ya no está compartido.';
      });
      return;
    }
    if (act === 'leave') {
      if (!confirm(`¿Salir? Dejará de estar en tu app${type === 'folder' ? ' (lo que añadiste tú a la carpeta se queda en tu Biblioteca)' : ''}.`)) return;
      busy = 'Saliendo…';
      draw();
      try {
        await api.leaveSpace(sp.id);
        await refresh();
        emit('data');
        dlg.close();
        toast('Has salido. Ya no está en tu app.');
      } catch (err) {
        busy = '';
        msg = { text: err.message, error: true };
        draw();
      }
    }
  });

  draw();
  // Lo último (quién está, si se está sincronizando).
  reload().then(() => dlg.open && !busy && draw());
}
