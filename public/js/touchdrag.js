// Arrastrar con el dedo en pantallas táctiles. Lo que se arrastra con el arrastrar del navegador
// (draggable="true": secuencias, rutinas, pestañas…) no funciona con el dedo en el móvil: aquí,
// mantener pulsado medio segundo lo «levanta» y, al mover el dedo, se mandan los mismos eventos
// (dragstart, dragover, drop…) que con el ratón, así que cada pantalla no tiene que hacer nada.
// Si el dedo se mueve antes de tiempo, es desplazar la página como siempre.

const HOLD_MS = 450;
const SLOP = 8; // píxeles que el dedo puede moverse sin que deje de ser «mantener pulsado»

let hold = null; // { el, x, y, timer }
let drag = null; // { el, dt, ghost, over, ok, dx, dy }
let lastTouch = false;
let swallowClick = false;

const fire = (type, target, x, y, dt) => {
  const ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt });
  target.dispatchEvent(ev);
  return ev;
};

function start() {
  const { el, x, y } = hold;
  hold = null;
  const dt = new DataTransfer();
  const ev = fire('dragstart', el, x, y, dt);
  if (ev.defaultPrevented) return;
  navigator.vibrate?.(15);
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  Object.assign(ghost.style, {
    position: 'fixed', left: '0', top: '0', width: r.width + 'px', height: r.height + 'px', margin: '0',
    pointerEvents: 'none', zIndex: '9999', opacity: '0.85', transformOrigin: `${x - r.left}px ${y - r.top}px`,
    transform: `translate(${r.left}px, ${r.top}px) scale(0.6)`, transition: 'none', boxShadow: '0 12px 30px rgba(0,0,0,.35)',
  });
  document.body.append(ghost);
  drag = { el, dt, ghost, over: null, ok: false, dx: x - r.left, dy: y - r.top };
  move(x, y);
}

function move(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) scale(0.6)`;
  const under = document.elementFromPoint(x, y);
  if (under !== drag.over) {
    if (drag.over) fire('dragleave', drag.over, x, y, drag.dt);
    if (under) fire('dragenter', under, x, y, drag.dt);
    drag.over = under;
  }
  drag.ok = under ? fire('dragover', under, x, y, drag.dt).defaultPrevented : false;
}

function finish(x, y, cancelled) {
  const d = drag;
  drag = null;
  d.ghost.remove();
  if (!cancelled && d.over && d.ok) fire('drop', d.over, x, y, d.dt);
  else if (d.over) fire('dragleave', d.over, x, y, d.dt);
  fire('dragend', d.el, x, y, d.dt);
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 400);
}

export function installTouchDrag() {
  document.addEventListener('pointerdown', (e) => {
    lastTouch = e.pointerType === 'touch';
    if (!lastTouch || drag) return;
    const el = e.target.closest?.('[draggable="true"]');
    if (!el || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    clearTimeout(hold?.timer);
    hold = { el, x: e.clientX, y: e.clientY, timer: setTimeout(start, HOLD_MS) };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > SLOP) {
      clearTimeout(hold.timer);
      hold = null;
    }
    if (drag) move(e.clientX, e.clientY);
  }, true);
  const up = (e) => {
    if (hold) {
      clearTimeout(hold.timer);
      hold = null;
    }
    if (drag) finish(e.clientX, e.clientY, e.type === 'pointercancel');
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  // Con el dedo levantando algo, la página no se desplaza (si no, el navegador cortaría el arrastre).
  document.addEventListener('touchmove', (e) => drag && e.preventDefault(), { passive: false });
  // Ni el menú del navegador al mantener pulsado, ni su propio arrastre (va por aquí).
  document.addEventListener('contextmenu', (e) => {
    if (lastTouch && e.target.closest?.('[draggable="true"]')) e.preventDefault();
  }, true);
  document.addEventListener('dragstart', (e) => {
    if (e.isTrusted && lastTouch) e.preventDefault();
  }, true);
  // Al soltar no se abre lo que había debajo.
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
