// Primera vez que se abre la app: sugerencias de bibliotecas (bailes y deportes) para empezar.
import { api } from './api.js';
import { esc, toast, upsert, emit, shelves, shelfName } from './store.js';
import { tr } from './i18n.js';

const KEY = 'jr-welcome-done';
const SUGGESTED = [
  'Jazz', 'Ballet', 'Contemporáneo', 'Hip Hop', 'Breakdance', 'Bailes latinos', 'Salsa', 'Bachata', 'Merengue',
  'Reguetón', 'Tango', 'Flamenco', 'Zumba', 'K-pop', 'Danza del vientre', 'Polinesia', 'Swing', 'Claqué',
  'Calentamientos', 'Estiramientos', 'Gimnasio', 'Calistenia', 'Crossfit', 'Yoga', 'Pilates', 'Acrobacias',
  'Gimnasia', 'Fútbol', 'Baloncesto', 'Tenis', 'Pádel', 'Running', 'Natación', 'Boxeo', 'Artes marciales',
  'Rugby', 'Voleibol', 'Ciclismo', 'Escalada', 'Patinaje',
];

const done = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
};
const markDone = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* sin almacenamiento: volvería a salir */
  }
};

/** Solo en una instalación nueva: con una única biblioteca y sin haberlo visto antes. */
export function maybeWelcome() {
  if (done()) return;
  if (shelves().length > 1) return markDone();
  const dlg = document.createElement('dialog');
  dlg.className = 'ask welcome';
  dlg.innerHTML = `<h3>¿Qué quieres organizar?</h3>
    <p class="hint">Elige tus bailes y deportes: cada uno será una biblioteca. Podrás cambiarlas cuando quieras.</p>
    <div class="welcome-chips">${SUGGESTED.map((name) => `<button type="button" class="welcome-chip" aria-pressed="false" data-name="${esc(name)}">${esc(tr(name))}</button>`).join('')}</div>
    <footer><button class="btn ghost" value="skip">Ahora no</button><button class="btn primary" value="ok" disabled>Añadir ›</button></footer>`;
  document.body.append(dlg);
  const picked = new Set();
  dlg.addEventListener('click', async (e) => {
    const chip = e.target.closest('.welcome-chip');
    if (chip) {
      const on = !picked.delete(chip.dataset.name) && Boolean(picked.add(chip.dataset.name));
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', on);
      dlg.querySelector('[value="ok"]').disabled = !picked.size;
      return;
    }
    const b = e.target.closest('footer button');
    if (!b) return;
    if (b.value === 'ok') {
      b.disabled = true;
      const have = new Set(shelves().map((l) => shelfName(l).toLowerCase()));
      try {
        for (const name of picked) {
          const label = tr(name);
          if (!have.has(label.toLowerCase())) upsert('libraries', await api.createShelf(label));
        }
        emit('data');
        toast(`${picked.size} biblioteca(s) añadida(s)`);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    markDone();
    dlg.close();
    dlg.remove();
  });
  dlg.addEventListener('cancel', (e) => e.preventDefault());
  dlg.showModal();
}
