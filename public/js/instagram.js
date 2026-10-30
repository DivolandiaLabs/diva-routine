// Ventana de Instagram: conectar tu cuenta (con tu cookie de sesión) e importar tus colecciones de Guardados.
import { api } from './api.js';

const ALL_SAVED = 'ALL_MEDIA_AUTO_COLLECTION'; // «Todas las publicaciones guardadas»
import { state, emit, esc, toast, upsert, canDownload, queueDownload, libraryLabel, ask } from './store.js';

// ---------- tutorial para conectar la cuenta (dibujos de lo que se ve en cada paso) ----------

const W = 'font-family="Segoe UI,system-ui,sans-serif"';
// Ventana del navegador con instagram.com; `inside` es lo que hay dentro (x 0–320, y 34–200).
const browser = (inside, { panel = '' } = {}) => `
  <svg viewBox="0 0 320 200" ${W}>
    <rect x="1" y="1" width="318" height="198" rx="10" fill="#fff" stroke="#cfc6bb"/>
    <path d="M1 11a10 10 0 0 1 10-10h298a10 10 0 0 1 10 10v20H1z" fill="#ece6de"/>
    <circle cx="14" cy="16" r="4" fill="#e86f5a"/><circle cx="26" cy="16" r="4" fill="#e8b85a"/><circle cx="38" cy="16" r="4" fill="#7bbf6a"/>
    <rect x="54" y="9" width="190" height="14" rx="7" fill="#fff"/>
    <text x="64" y="20" font-size="9" fill="#555">🔒 instagram.com</text>
    ${inside}${panel}
  </svg>`;
const igPage = `
  <rect x="16" y="44" width="22" height="22" rx="6" fill="url(#g)"/>
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f9a43a"/><stop offset=".5" stop-color="#e1306c"/><stop offset="1" stop-color="#833ab4"/></linearGradient></defs>
  <text x="44" y="60" font-size="12" font-weight="700" fill="#222">Instagram</text>
  <rect x="16" y="78" width="120" height="110" rx="6" fill="#f2efe9"/><rect x="146" y="78" width="120" height="110" rx="6" fill="#f2efe9"/>`;
const devtools = (body) => `
  <rect x="150" y="32" width="168" height="166" fill="#f7f7f8" stroke="#cfd3da"/>
  <rect x="150" y="32" width="168" height="18" fill="#eceef1"/>${body}`;
const tabs = (hl) => {
  let x = 155;
  return ['Elementos', 'Consola', 'Red', 'Aplicación'].map((t) => {
    const w = t.length * 4.3; // ancho aproximado del texto (7,5 px)
    const out = `${t === hl ? `<rect x="${x - 3}" y="34" width="${w + 6}" height="15" rx="3" fill="#c4553a"/>` : ''}<text x="${x}" y="45" font-size="7.5" fill="${t === hl ? '#fff' : '#444'}" font-weight="${t === hl ? 700 : 400}">${t}</text>`;
    x += w + 9;
    return out;
  }).join('') + '<text x="306" y="45" font-size="9" fill="#444">»</text>';
};
const pointer = (x, y) => `<path d="M${x} ${y}l0 16 4-4 3 7 3-1-3-7 6 0z" fill="#111" stroke="#fff" stroke-width="1"/>`;

const TUTORIAL = [
  {
    title: 'Abre Instagram en el navegador',
    text: 'Abre <b>instagram.com</b> en Chrome (o Edge) y comprueba que ves <b>tu cuenta</b>; si no, inicia sesión allí. <a href="https://www.instagram.com/" target="_blank" rel="noopener">Abrir instagram.com ↗</a>',
    pic: browser(`${igPage}<circle cx="292" cy="56" r="11" fill="#e1306c"/><text x="292" y="60" font-size="10" fill="#fff" text-anchor="middle" font-weight="700">tú</text>`),
  },
  {
    title: 'Pulsa la tecla F12',
    text: 'Con instagram.com delante, pulsa <kbd>F12</kbd> (en algunos portátiles, <kbd>Fn</kbd> + <kbd>F12</kbd>). Se abre a un lado un panel de «herramientas para desarrolladores». No pasa nada por abrirlo: solo vas a copiar un dato.',
    pic: browser(igPage, { panel: `${devtools(tabs(''))}<rect x="196" y="96" width="76" height="56" rx="10" fill="#2b2622"/><rect x="200" y="98" width="68" height="46" rx="8" fill="#3d3632"/><text x="234" y="128" font-size="20" font-weight="800" fill="#fff" text-anchor="middle">F12</text>` }),
  },
  {
    title: 'Abre la pestaña «Aplicación»',
    text: 'Arriba en ese panel, pulsa la pestaña <b>Aplicación</b> (en inglés, <b>Application</b>). Si no la ves, está escondida dentro de <b>»</b>.',
    pic: browser(igPage, { panel: devtools(tabs('Aplicación')) + pointer(290, 44) }),
  },
  {
    title: 'Cookies → instagram.com',
    text: 'En la columna de la izquierda del panel, despliega <b>Cookies</b> y pulsa <code>https://www.instagram.com</code>.',
    pic: browser(igPage, {
      panel: devtools(`${tabs('Aplicación')}
        <text x="156" y="66" font-size="8" fill="#777">Almacenamiento</text>
        <text x="158" y="80" font-size="8" fill="#444">▸ Almacenamiento local</text>
        <text x="158" y="94" font-size="8" fill="#444">▾ Cookies</text>
        <rect x="160" y="99" width="140" height="14" rx="3" fill="#c4553a"/>
        <text x="166" y="109" font-size="8" fill="#fff" font-weight="700">https://www.instagram.com</text>
        ${pointer(286, 104)}`),
    }),
  },
  {
    title: 'Copia «sessionid» y pégalo aquí',
    text: 'Sale una tabla. En la fila <b>sessionid</b>, haz <b>doble clic</b> en su <b>Valor</b>, cópialo con <kbd>Ctrl</kbd>+<kbd>C</kbd> y pégalo aquí abajo con <kbd>Ctrl</kbd>+<kbd>V</kbd>. Luego cierra el panel con <kbd>F12</kbd>.',
    pic: `<svg viewBox="0 0 320 200" ${W}>
      <rect x="1" y="1" width="318" height="198" rx="10" fill="#f7f7f8" stroke="#cfd3da"/>
      <rect x="1" y="1" width="318" height="24" rx="10" fill="#eceef1"/>
      <text x="14" y="17" font-size="10" font-weight="700" fill="#444">Nombre</text><text x="120" y="17" font-size="10" font-weight="700" fill="#444">Valor</text>
      ${[['csrftoken', 'k3J9…'], ['ds_user_id', '4728…'], ['mid', 'ZsT1…'], ['sessionid', '4728%3Ab9…'], ['rur', '"CLN…"']].map(([n, val], i) => {
        const y = 44 + i * 30;
        const hl = n === 'sessionid';
        return `${hl ? `<rect x="6" y="${y - 15}" width="308" height="24" rx="4" fill="#fbe7e2" stroke="#c4553a"/><rect x="114" y="${y - 12}" width="120" height="18" rx="3" fill="#1a73e8"/>` : ''}
          <text x="14" y="${y + 1}" font-size="11" fill="#222" font-weight="${hl ? 700 : 400}">${n}</text>
          <text x="120" y="${y + 1}" font-size="11" fill="${hl ? '#fff' : '#555'}">${val}</text>`;
      }).join('')}
      ${pointer(220, 138)}
      <text x="250" y="150" font-size="10" fill="#c4553a" font-weight="700">doble clic</text>
    </svg>`,
  },
];

export function openInstagram({ view = state.instagram.connected ? 'collections' : 'connect', message = '' } = {}) {
  document.getElementById('igDialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'igDialog';
  dlg.className = 'ig-dialog';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();

  const $ = (s) => dlg.querySelector(s);
  const head = (title) => `<header><h2>${title}</h2><button class="x" data-ig="close" aria-label="Cerrar">✕</button></header>`;

  // ---------- conectar ----------

  // Tutorial paso a paso (con un dibujo de lo que se ve en cada paso); en el último se pega.
  let step = 0;
  function showConnect(msg = '') {
    if (msg) step = TUTORIAL.length - 1; // si falló, directo a pegarla otra vez
    const s = TUTORIAL[step];
    const last = step === TUTORIAL.length - 1;
    dlg.innerHTML = `
      ${head('Conectar tu Instagram')}
      ${msg ? `<p class="ig-msg error">${esc(msg)}</p>` : ''}
      ${step === 0 ? '<p>La app entra con <b>tu sesión</b> para leer tus colecciones de Guardados y descargar sus videos. Se hace una vez, en 5 pasos (unos 2 minutos). La sesión se guarda solo en este ordenador y solo se envía a Instagram.</p>' : ''}
      <div class="tuto">
        <div class="tuto-pic" aria-hidden="true">${s.pic}</div>
        <div class="tuto-text">
          <p class="tuto-n">Paso ${step + 1} de ${TUTORIAL.length}</p>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </div>
      </div>
      <div class="tuto-dots">${TUTORIAL.map((_, i) => `<button class="${i === step ? 'on' : ''}" data-ig="step" data-step="${i}" aria-label="Paso ${i + 1}"></button>`).join('')}</div>
      ${last ? '' : `<footer><span class="hint"></span>
        ${step ? '<button class="btn ghost" data-ig="prev">← Anterior</button>' : ''}
        <button class="btn primary" data-ig="next">Siguiente →</button></footer>`}
      ${last ? `
      ${step ? '<p><button class="btn small ghost" data-ig="prev">← Anterior</button></p>' : ''}
      <input type="password" id="igSession" placeholder="Pega aquí el valor de sessionid" autocomplete="off" spellcheck="false" aria-label="Valor de la cookie sessionid o todas las cookies">
      <details class="hint">
        <summary><b>¿No conecta? Pega todas las cookies de Instagram</b> (a veces no basta con sessionid)</summary>
        <ol class="ig-steps">
          <li>Con el panel de F12 abierto en instagram.com, pulsa la pestaña <b>Red</b> (o <b>Network</b>) y recarga la página con <kbd>F5</kbd>.</li>
          <li>En la lista, pulsa la primera fila, <code>www.instagram.com</code>.</li>
          <li>A la derecha, en <b>Encabezados</b> → <b>Encabezados de solicitud</b>, busca <b>cookie:</b>, haz clic derecho sobre su valor → <b>Copiar valor</b>, y pégalo en el cuadro de arriba.</li>
        </ol>
      </details>
      <p class="hint">O, si tienes una extensión que exporta cookies (p. ej. «Get cookies.txt LOCALLY»), sube el archivo de instagram.com:
        <label class="btn small">Subir cookies.txt<input type="file" id="igFile" accept=".txt,.json" hidden></label></p>
      <p class="hint warn">Esa cookie funciona como tu contraseña: no la pegues en ningún otro sitio ni se la des a nadie. Si cierras sesión en Instagram deja de valer y tendrás que volver a conectar.</p>
      <footer><span class="hint" id="igBusy"></span><button class="btn primary" data-ig="connect">Conectar</button></footer>` : ''}`;
    if (!last) return $('[data-ig="next"]').focus();
    $('#igSession').focus();
    $('#igSession').addEventListener('keydown', (e) => e.key === 'Enter' && connect($('#igSession').value));
    $('#igFile').addEventListener('change', async (e) => e.target.files[0] && connect(await e.target.files[0].text()));
  }

  async function connect(raw) {
    if (!String(raw).trim()) return $('#igSession').focus();
    const btn = $('[data-ig="connect"]');
    btn.disabled = true;
    $('#igBusy').textContent = 'Comprobando con Instagram…';
    try {
      state.instagram = await api.igConnect(raw);
      emit('data');
      toast(`Instagram conectado${state.instagram.username ? ` como @${state.instagram.username}` : ''}`);
      showCollections();
    } catch (e) {
      showConnect(e.message);
    }
  }

  // ---------- colecciones ----------

  async function showCollections() {
    dlg.innerHTML = `
      ${head(`Tus colecciones de Instagram${state.instagram.username ? ` <small>@${esc(state.instagram.username)}</small>` : ''}`)}
      <div id="igMsg"></div>
      <div class="ig-cols" id="igCols"><p class="hint">Leyendo tus colecciones…</p></div>`;
    let collections;
    let listError = null;
    try {
      ({ collections } = await api.igCollections());
    } catch (e) {
      state.instagram = await api.igStatus().catch(() => state.instagram);
      emit('data');
      if (!state.instagram.connected) return showConnect(e.message);
      // Sin la lista se puede seguir: todos los guardados, o cada colección pegando su link.
      listError = e.message;
      collections = [{ id: ALL_SAVED, name: 'Todas las publicaciones guardadas', count: null, cover: null, libraries: linkedTo(ALL_SAVED) }];
    }
    if (!dlg.open) return;
    dlg._collections = collections;
    if (listError) {
      $('#igMsg').innerHTML = `<p class="ig-msg warn">Instagram no me deja leer la lista de tus colecciones. Añade cada una pegando su link aquí abajo (en instagram.com abre la colección y copia la dirección de arriba), o importa todas tus publicaciones guardadas.<br><small>${esc(listError)}</small></p>`;
    }
    drawCols();
    dlg.insertAdjacentHTML('beforeend', `
      <div class="ig-add">
        <input id="igColLink" placeholder="Link de una colección: instagram.com/tu_usuario/saved/nombre/123…/" aria-label="Link de una colección de Instagram">
        <button class="btn small" data-ig="add-link">Añadir</button>
      </div>
      <div class="ig-dest">
        <label><input type="radio" name="igDest" value="own" checked> Cada colección en su propia carpeta</label>
        <label><input type="radio" name="igDest" value="one"> Todas en
          <select id="igLib">${state.libraries.map((l) => `<option value="${l.id}">${esc(libraryLabel(l))}</option>`).join('')}</select></label>
      </div>
      <footer>
        <button class="btn small ghost danger" data-ig="disconnect">Desconectar Instagram</button>
        <span class="hint" id="igBusy"></span>
        <button class="btn primary" data-ig="import">Importar seleccionadas</button>
      </footer>`);
    $('#igColLink').addEventListener('keydown', (e) => e.key === 'Enter' && addByLink());
  }

  const linkedTo = (id) => state.libraries.filter((l) => l.igCollections?.some((c) => c.id === id)).map((l) => l.id);

  function drawCols() {
    const checked = new Set([...dlg.querySelectorAll('.ig-col input:checked')].map((i) => i.value));
    const libName = (id) => libraryLabel(state.libraries.find((l) => l.id === id));
    $('#igCols').innerHTML = dlg._collections.length
      ? dlg._collections.map((c) => `
        <label class="ig-col">
          <input type="checkbox" value="${esc(c.id)}" ${checked.has(c.id) ? 'checked' : ''}>
          ${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="ig-cover"></span>'}
          <span><b>${esc(c.name)}</b>
            <small>${c.count != null ? `${c.count} publicaciones` : ''}${c.libraries.length ? `${c.count != null ? ' · ' : ''}ya en «${esc(libName(c.libraries[0]) || '')}», se sincroniza` : ''}</small></span>
        </label>`).join('')
      : '<p class="hint">No tienes colecciones guardadas.</p>';
  }

  // instagram.com/usuario/saved/nombre/123…/ -> se añade a la lista, ya marcada.
  function addByLink() {
    const input = $('#igColLink');
    const m = input.value.trim().match(/instagram\.com\/[^/?#]+\/saved\/([^/?#]+)\/(\d+)/i);
    if (!m) return toast('Ese link no es de una colección. Debe ser como instagram.com/tu_usuario/saved/nombre/123…/', 'error');
    let name = m[1];
    try {
      name = decodeURIComponent(name);
    } catch {
      /* se deja tal cual */
    }
    if (!dlg._collections.some((c) => c.id === m[2])) {
      dlg._collections.push({ id: m[2], name: name.replace(/[-_]+/g, ' '), count: null, cover: null, libraries: linkedTo(m[2]) });
    }
    drawCols();
    dlg.querySelector(`.ig-col input[value="${m[2]}"]`).checked = true;
    input.value = '';
    input.focus();
  }

  async function importSelected(btn) {
    const ids = [...dlg.querySelectorAll('.ig-col input:checked')].map((i) => i.value);
    if (!ids.length) return toast('Marca al menos una colección', 'error');
    const into = dlg.querySelector('[name="igDest"]:checked').value === 'one' ? $('#igLib').value : null;
    btn.disabled = true;
    const created = [];
    const libs = new Set();
    for (const [n, id] of ids.entries()) {
      const c = dlg._collections.find((x) => x.id === id);
      $('#igBusy').textContent = `Importando «${c.name}» (${n + 1} de ${ids.length})…`;
      try {
        const r = await api.igImport({ id: c.id, name: c.name }, into);
        upsert('libraries', r.library);
        r.created.forEach((v) => upsert('videos', v));
        created.push(...r.created);
        libs.add(r.library.id);
      } catch (e) {
        emit('data');
        return onError(e);
      }
    }
    emit('data');
    queueDownload(created.filter(canDownload).map((v) => v.id));
    dlg.close();
    toast(created.length ? `${created.length} video(s) importado(s). Se descargan solos.` : 'No había publicaciones nuevas en esas colecciones.');
    if (libs.size === 1) location.hash = `#/biblioteca/${[...libs][0]}`;
  }

  async function onError(e) {
    state.instagram = await api.igStatus().catch(() => state.instagram);
    emit('data');
    if (!dlg.open) return toast(e.message, 'error');
    if (!state.instagram.connected) return showConnect(e.message);
    if ($('#igBusy')) $('#igBusy').textContent = '';
    dlg.querySelector('[data-ig="import"]')?.removeAttribute('disabled');
    toast(e.message, 'error');
    if (!dlg._collections) dlg.querySelector('#igCols').innerHTML = `<p class="ig-msg error">${esc(e.message)}</p>`;
  }

  dlg.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ig]');
    if (!btn) return;
    const act = btn.dataset.ig;
    if (act === 'close') dlg.close();
    else if (act === 'next' || act === 'prev' || act === 'step') {
      step = act === 'step' ? Number(btn.dataset.step) : Math.max(0, Math.min(TUTORIAL.length - 1, step + (act === 'next' ? 1 : -1)));
      showConnect();
    }
    else if (act === 'connect') connect($('#igSession').value);
    else if (act === 'import') importSelected(btn);
    else if (act === 'add-link') addByLink();
    else if (act === 'disconnect') {
      if (!await ask('¿Desconectar tu cuenta de Instagram? Las bibliotecas importadas se quedan, pero no se podrán sincronizar hasta que vuelvas a conectar.')) return;
      state.instagram = await api.igDisconnect();
      emit('data');
      dlg.close();
      toast('Instagram desconectado');
    }
  });

  if (view === 'connect') showConnect(message);
  else showCollections();
}
