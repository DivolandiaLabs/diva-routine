// Ventana de YouTube, TikTok y Facebook: tutorial para conectar tu cuenta (pegando tu sesión,
// como con Instagram) e importar listas, que quedan enlazadas a una carpeta para sincronizarlas.
import { api } from './api.js';
import { state, emit, esc, toast, upsert, refresh, canDownload, queueDownload, libraryLabel } from './store.js';

export const NET_INFO = {
  youtube: {
    name: 'YouTube',
    site: 'https://www.youtube.com/',
    host: 'www.youtube.com',
    color: '#ff0033',
    lists: 'Tus listas de reproducción (también privadas), «Ver más tarde» y «Videos que me gustan», o cualquier lista o canal pegando su link.',
    why: 'Sin conectar ya se pueden importar videos y listas públicas. Conectando tu cuenta, además tus listas privadas, «Ver más tarde», «Me gusta» y videos que piden iniciar sesión.',
  },
  tiktok: {
    name: 'TikTok',
    site: 'https://www.tiktok.com/',
    host: 'www.tiktok.com',
    color: '#25f4ee',
    lists: 'Pega el link de una colección (tiktok.com/@usuario/collection/…) o de un perfil (tiktok.com/@usuario). TikTok no deja a otras apps leer tus «Favoritos» privados: guárdalos en una colección pública.',
    why: 'Sin conectar ya se pueden importar videos, colecciones públicas y perfiles. Conectando tu cuenta, también los que TikTok solo enseña con sesión iniciada.',
  },
  facebook: {
    name: 'Facebook',
    site: 'https://www.facebook.com/',
    host: 'www.facebook.com',
    color: '#1877f2',
    lists: null,
    why: 'Facebook no deja a otras apps leer tus listas ni tus «Guardados»: se importan los videos uno a uno pegando su link en «Importar». Conectando tu cuenta se pueden bajar también los de grupos o perfiles privados que tú ves.',
  },
};

// ---------- dibujos del tutorial ----------

const F = 'font-family="Segoe UI,system-ui,sans-serif"';
const frame = (host, inside) => `
  <svg viewBox="0 0 320 200" ${F}>
    <rect x="1" y="1" width="318" height="198" rx="10" fill="#fff" stroke="#cfc6bb"/>
    <path d="M1 11a10 10 0 0 1 10-10h298a10 10 0 0 1 10 10v20H1z" fill="#ece6de"/>
    <circle cx="14" cy="16" r="4" fill="#e86f5a"/><circle cx="26" cy="16" r="4" fill="#e8b85a"/><circle cx="38" cy="16" r="4" fill="#7bbf6a"/>
    <rect x="54" y="9" width="190" height="14" rx="7" fill="#fff"/><text x="64" y="20" font-size="9" fill="#555">🔒 ${host}</text>
    ${inside}
  </svg>`;
const page = (n) => `<rect x="14" y="42" width="22" height="16" rx="4" fill="${n.color}"/><text x="42" y="55" font-size="11" font-weight="700" fill="#222">${n.name}</text>
  <rect x="14" y="68" width="122" height="120" rx="6" fill="#f2efe9"/>`;
const panel = (body) => `<rect x="146" y="32" width="172" height="166" fill="#f7f7f8" stroke="#cfd3da"/><rect x="146" y="32" width="172" height="18" fill="#eceef1"/>${body}`;
const tabsRed = (hl) => {
  let x = 151;
  return ['Elementos', 'Consola', 'Red', 'Aplicación'].map((t) => {
    const w = t.length * 4.3;
    const o = `${t === hl ? `<rect x="${x - 3}" y="34" width="${w + 6}" height="15" rx="3" fill="#c4553a"/>` : ''}<text x="${x}" y="45" font-size="7.5" fill="${t === hl ? '#fff' : '#444'}" font-weight="${t === hl ? 700 : 400}">${t}</text>`;
    x += w + 9;
    return o;
  }).join('');
};
const ptr = (x, y) => `<path d="M${x} ${y}l0 16 4-4 3 7 3-1-3-7 6 0z" fill="#111" stroke="#fff" stroke-width="1"/>`;

function steps(net) {
  const n = NET_INFO[net];
  return [
    {
      title: `Abre ${n.name} en el navegador`,
      text: `Abre <b>${n.host}</b> en Chrome (o Edge) y comprueba que ves <b>tu cuenta</b>; si no, inicia sesión allí. <a href="${n.site}" target="_blank" rel="noopener">Abrir ${n.name} ↗</a>`,
      pic: frame(n.host, `${page(n)}<circle cx="292" cy="50" r="11" fill="${n.color}"/><text x="292" y="54" font-size="10" fill="#fff" text-anchor="middle" font-weight="700">tú</text>`),
    },
    {
      title: 'Pulsa F12 y abre la pestaña «Red»',
      text: 'Pulsa <kbd>F12</kbd> (en algunos portátiles, <kbd>Fn</kbd> + <kbd>F12</kbd>). En el panel que se abre, pulsa la pestaña <b>Red</b> (en inglés, <b>Network</b>). Si no se ve, está dentro de <b>»</b>.',
      pic: frame(n.host, page(n) + panel(tabsRed('Red')) + ptr(242, 44)),
    },
    {
      title: 'Recarga la página',
      text: `Con el panel abierto, recarga con <kbd>F5</kbd>. En la lista aparecen muchas filas: pulsa la <b>primera</b>, la que se llama <code>${n.host}</code> (o empieza así).`,
      pic: frame(n.host, page(n) + panel(`${tabsRed('Red')}
        <rect x="150" y="56" width="164" height="14" rx="3" fill="#c4553a"/><text x="154" y="66" font-size="8" fill="#fff" font-weight="700">${n.host}</text>
        ${[0, 1, 2, 3].map((i) => `<rect x="150" y="${74 + i * 14}" width="${120 - i * 14}" height="9" rx="2" fill="#dde1e6"/>`).join('')}${ptr(280, 62)}`)),
    },
    {
      title: 'Copia el valor de «cookie»',
      text: 'A la derecha, en <b>Encabezados</b> → <b>Encabezados de solicitud</b>, busca la línea <b>cookie:</b>. Haz <b>clic derecho</b> sobre su valor → <b>Copiar valor</b> y pégalo aquí abajo.',
      pic: `<svg viewBox="0 0 320 200" ${F}>
        <rect x="1" y="1" width="318" height="198" rx="10" fill="#f7f7f8" stroke="#cfd3da"/>
        <text x="14" y="22" font-size="10" font-weight="700" fill="#444">▾ Encabezados de solicitud</text>
        ${[['accept', 'text/html,…'], ['accept-language', 'es-ES,es;q=0.9'], ['cookie', 'SID=g.a00…; xs=…; …'], ['user-agent', 'Mozilla/5.0 …']].map(([k, v], i) => {
          const y = 48 + i * 32;
          const hl = k === 'cookie';
          return `${hl ? `<rect x="6" y="${y - 15}" width="308" height="24" rx="4" fill="#fbe7e2" stroke="#c4553a"/><rect x="108" y="${y - 12}" width="150" height="18" rx="3" fill="#1a73e8"/>` : ''}
            <text x="14" y="${y + 1}" font-size="11" fill="#222" font-weight="${hl ? 700 : 400}">${k}:</text>
            <text x="114" y="${y + 1}" font-size="11" fill="${hl ? '#fff' : '#555'}">${v}</text>`;
        }).join('')}
        <rect x="200" y="124" width="104" height="40" rx="5" fill="#fff" stroke="#cfd3da"/>
        <text x="210" y="140" font-size="9" fill="#999">Copiar</text><text x="210" y="156" font-size="9" fill="#222" font-weight="700">Copiar valor</text>
        ${ptr(250, 148)}
      </svg>`,
    },
  ];
}

// ---------- ventana ----------

export function openNet(net, { view = null } = {}) {
  const n = NET_INFO[net];
  document.getElementById('netDialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'netDialog';
  dlg.className = 'ig-dialog';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  const $ = (s) => dlg.querySelector(s);
  const head = (title) => `<header><h2>${title}</h2><button class="x" data-n="close" aria-label="Cerrar">✕</button></header>`;
  const isOn = () => state.social?.[net]?.connected;
  let step = 0;

  function showConnect(msg = '') {
    const all = steps(net);
    if (msg) step = all.length - 1;
    const s = all[step];
    const last = step === all.length - 1;
    dlg.innerHTML = `
      ${head(`Conectar tu ${n.name}`)}
      ${msg ? `<p class="ig-msg error">${esc(msg)}</p>` : ''}
      ${step === 0 ? `<p>${n.why} Se hace una vez, en ${all.length} pasos. Tu sesión se guarda solo en este ordenador y solo se envía a ${n.name}.</p>` : ''}
      <div class="tuto">
        <div class="tuto-pic" aria-hidden="true">${s.pic}</div>
        <div class="tuto-text"><p class="tuto-n">Paso ${step + 1} de ${all.length}</p><h3>${s.title}</h3><p>${s.text}</p></div>
      </div>
      <div class="tuto-dots">${all.map((_, i) => `<button class="${i === step ? 'on' : ''}" data-n="step" data-step="${i}" aria-label="Paso ${i + 1}"></button>`).join('')}</div>
      ${last ? `
        <p><button class="btn small ghost" data-n="prev">← Anterior</button></p>
        <input type="password" id="netCookie" placeholder="Pega aquí el valor de cookie" autocomplete="off" spellcheck="false" aria-label="Valor de la cookie de ${n.name}">
        <p class="hint">También vale el archivo de una extensión que exporta cookies: <label class="btn small">Subir cookies.txt<input type="file" id="netFile" accept=".txt,.json" hidden></label></p>
        <p class="hint warn">Eso funciona como tu contraseña: no lo pegues en ningún otro sitio. Si cierras sesión en ${n.name}, deja de valer y habrá que volver a conectar.</p>
        <footer><span class="hint" id="netBusy"></span><button class="btn primary" data-n="connect">Conectar</button></footer>`
      : `<footer><span class="hint"></span>${step ? '<button class="btn ghost" data-n="prev">← Anterior</button>' : ''}<button class="btn primary" data-n="next">Siguiente →</button></footer>`}`;
    if (!last) return $('[data-n="next"]').focus();
    $('#netCookie').focus();
    $('#netCookie').addEventListener('keydown', (e) => e.key === 'Enter' && connect($('#netCookie').value));
    $('#netFile').addEventListener('change', async (e) => e.target.files[0] && connect(await e.target.files[0].text()));
  }

  async function connect(raw) {
    if (!String(raw).trim()) return $('#netCookie').focus();
    $('[data-n="connect"]').disabled = true;
    $('#netBusy').textContent = 'Comprobando…';
    try {
      await api.socialConnect(net, raw);
      state.social = await api.socialStatus();
      emit('data');
      toast(`${n.name} conectado`);
      n.lists ? showLists() : dlg.close();
    } catch (e) {
      showConnect(e.message);
    }
  }

  // ---------- listas ----------

  async function showLists(msg = '') {
    const linked = state.libraries.filter((l) => l.lists?.some((x) => (x.net || '') === net || new RegExp(net).test(x.url)));
    dlg.innerHTML = `
      ${head(`Listas de ${n.name}`)}
      ${msg ? `<p class="ig-msg error">${esc(msg)}</p>` : ''}
      <p class="hint">${n.lists} Cada lista va a su carpeta y se puede <b>sincronizar</b> después para traer lo nuevo.</p>
      <div class="row ig-add"><input id="listUrl" placeholder="Pega el link de la lista" aria-label="Link de la lista"><button class="btn primary" data-n="import-url">Importar</button></div>
      <div id="mine">${net === 'youtube' && isOn() ? '<p class="hint">Leyendo tus listas…</p>' : ''}</div>
      ${linked.length ? `<h4 class="sh-sub">Ya enlazadas</h4><ul class="panel-list">${linked.map((l) => `<li><a href="#/biblioteca/${l.id}" data-n="close">${esc(libraryLabel(l))}</a></li>`).join('')}</ul>` : ''}
      <footer><span class="hint" id="netBusy"></span>${isOn()
        ? `<button class="btn small ghost danger" data-n="disconnect">Desconectar ${n.name}</button>`
        : `<button class="btn small" data-n="connect-view">Conectar mi cuenta</button>`}</footer>`;
    if (net !== 'youtube' || !isOn()) return;
    try {
      const { lists } = await api.youtubeLists();
      if (!dlg.open || !$('#mine')) return;
      $('#mine').innerHTML = `<h4 class="sh-sub">Tus listas</h4><ul class="ig-cols">${lists.map((l, i) => `
        <li class="ig-col"><span class="ig-col-name">${esc(l.name)}</span>${l.libraries.length ? '<span class="hint">ya importada</span>' : ''}
          <button class="btn small" data-n="import-mine" data-i="${i}">${l.libraries.length ? 'Traer lo nuevo' : 'Importar'}</button></li>`).join('')}</ul>`;
      dlg._lists = lists;
    } catch (e) {
      if ($('#mine')) $('#mine').innerHTML = `<p class="ig-msg warn">No pude leer tus listas: ${esc(e.message)}</p>`;
    }
  }

  async function importList(url, name, btn) {
    if (!url) return $('#listUrl').focus();
    if (btn) btn.disabled = true;
    $('#netBusy').textContent = 'Leyendo la lista (puede tardar un poco)…';
    try {
      const r = await api.importList(url, name);
      upsert('libraries', r.library);
      r.created.forEach((v) => upsert('videos', v));
      await refresh();
      emit('data');
      queueDownload(r.created.filter(canDownload).map((v) => v.id));
      toast(`«${r.library.name}»: ${r.created.length} video(s) nuevo(s). Se descargan solos.`);
      $('#netBusy').textContent = '';
      if (btn) btn.disabled = false;
      if ($('#listUrl')) $('#listUrl').value = '';
    } catch (e) {
      $('#netBusy').textContent = '';
      if (btn) btn.disabled = false;
      toast(e.message, 'error');
    }
  }

  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    const act = b.dataset.n;
    if (act === 'close') return dlg.close();
    if (act === 'next' || act === 'prev' || act === 'step') {
      step = act === 'step' ? Number(b.dataset.step) : Math.max(0, Math.min(steps(net).length - 1, step + (act === 'next' ? 1 : -1)));
      return showConnect();
    }
    if (act === 'connect') return connect($('#netCookie').value);
    if (act === 'connect-view') return ((step = 0), showConnect());
    if (act === 'import-url') return importList($('#listUrl').value.trim(), null, b);
    if (act === 'import-mine') {
      const l = dlg._lists[Number(b.dataset.i)];
      return importList(l.url, l.name, b);
    }
    if (act === 'disconnect') {
      if (!confirm(`¿Desconectar tu cuenta de ${n.name}? Lo importado se queda.`)) return;
      await api.socialDisconnect(net);
      state.social = await api.socialStatus();
      emit('data');
      dlg.close();
      toast(`${n.name} desconectado`);
    }
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.target.id === 'listUrl' && e.key === 'Enter') importList(e.target.value.trim(), null, $('[data-n="import-url"]'));
  });

  if (view === 'lists' && n.lists) showLists();
  else showConnect();
}
