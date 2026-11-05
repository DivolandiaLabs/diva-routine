// La página del panel. Sin dependencias: todo va en este archivo y los datos llegan de /admin/api.
// Cualquier texto que venga de la base pasa por esc(): correos y notas no son de fiar.
import { LOGO, FAVICON } from './admin-logo.js';

export const PAGE = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel Diva Routine</title>
<link rel="icon" type="image/png" href="${FAVICON}">
<style>
:root { --bg: #14110f; --surface: #1f1b18; --surface-2: #2a2521; --line: #3b3430; --text: #f1e9e1; --muted: #b0a59b; --accent: #e0745a; --ok: #6fbf8f; --bad: #e0695a; color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, "Segoe UI", Roboto, sans-serif; }
header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--surface); }
h1 { margin: 0; font-size: 1.05rem; }
/* El final de las letras es casi negro: el halo claro las separa del fondo oscuro. */
h1 img { display: block; height: 24px; width: auto; filter: drop-shadow(0 0 1px #ffffffd0); }
nav { display: flex; gap: 4px; flex-wrap: wrap; }
nav button { padding: 7px 14px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
nav button:hover { color: var(--text); }
nav button.on { background: var(--surface-2); color: var(--text); }
main { max-width: 1120px; margin: 0 auto; padding: 24px 16px 60px; }
h2 { margin: 0 0 4px; font-size: 1.3rem; }
h3 { margin: 0 0 12px; font-size: 1rem; }
.lead { margin: 0 0 18px; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 18px; }
.card, .box { padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.box { margin-bottom: 16px; }
.card span { display: block; color: var(--muted); font-size: 0.85rem; }
.card b { display: block; margin-top: 2px; font-size: 1.7rem; font-variant-numeric: tabular-nums; line-height: 1.2; }
.card small { color: var(--muted); }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.days { display: flex; align-items: flex-end; gap: 3px; height: 140px; }
.days i { flex: 1; min-width: 2px; max-width: 28px; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--accent); }
.axis { display: flex; justify-content: space-between; margin-top: 6px; color: var(--muted); font-size: 0.8rem; }
.bar { display: grid; grid-template-columns: minmax(0, 1fr) 54px; gap: 2px 10px; margin-bottom: 10px; font-size: 0.9rem; }
.bar em { grid-column: 1; height: 6px; border-radius: 3px; background: var(--accent); font-style: normal; }
.bar b { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 600; text-align: left; white-space: nowrap; }
td { padding: 9px 10px; border-bottom: 1px solid var(--surface-2); white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
code { font: 0.86rem ui-monospace, Consolas, monospace; color: var(--muted); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); font-size: 0.8rem; }
.tag.ok { color: var(--ok); } .tag.bad { color: var(--bad); }
button.act, .primary { padding: 7px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
button.act:hover { border-color: var(--muted); }
button.danger { color: var(--bad); }
.primary { border-color: var(--accent); background: var(--accent); color: #1b1412; font-weight: 700; }
form { display: grid; grid-template-columns: minmax(180px, 2fr) repeat(2, minmax(120px, 1fr)) auto; gap: 10px; align-items: end; }
label { display: grid; gap: 4px; color: var(--muted); font-size: 0.85rem; }
input, select { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--text); font: inherit; }
input:focus, select:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.search { max-width: 340px; margin-bottom: 12px; }
.key { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; padding: 12px; border: 1px solid var(--accent); border-radius: 10px; background: #2c1f1a; }
.key code { color: var(--text); font-size: 1rem; word-break: break-all; }
.key p { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 0.85rem; }
.empty { padding: 18px 4px; color: var(--muted); }
.style-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.style-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.style-card:hover { border-color: var(--muted); }
.style-card img, .style-card .noimg { display: block; width: 100%; aspect-ratio: 5 / 6; border-radius: 8px; object-fit: cover; background: #fff; }
.style-card small { color: var(--muted); }
.bar-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.bar-top > div { display: flex; gap: 8px; flex-wrap: wrap; }
.fields { display: grid; gap: 12px; }
.hint { color: var(--muted); font-size: 0.85rem; }
textarea { width: 100%; min-height: 72px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--text); font: inherit; resize: vertical; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
textarea.json { min-height: 220px; font: 0.86rem ui-monospace, Consolas, monospace; }
.thumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.thumb { position: relative; width: 110px; height: 110px; }
.thumb img { width: 100%; height: 100%; border-radius: 8px; object-fit: cover; }
.thumb button { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: #000a; color: #fff; font: inherit; cursor: pointer; }
.file { display: inline-block; padding: 7px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--text); font-size: 0.95rem; cursor: pointer; }
.file input { display: none; }
.test { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-bottom: 12px; }
.test img { max-width: 100%; max-height: 420px; border-radius: 8px; }
details summary { cursor: pointer; font-weight: 600; }
details > * + * { margin-top: 12px; }
#msg { position: fixed; right: 16px; bottom: 16px; max-width: 340px; padding: 10px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); }
#msg.err { border-color: var(--bad); }
@media (max-width: 640px) { form { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1><img src="${LOGO}" alt="Diva Routine"></h1>
  <nav id="tabs">
    <button data-tab="summary" class="on">Resumen</button>
    <button data-tab="licenses">Licencias</button>
    <button data-tab="grants">Usuarios</button>
    <button data-tab="comps">Cortesía</button>
    <button data-tab="models">Motores</button>
    <button data-tab="styles">Estilos</button>
  </nav>
</header>
<main id="view"><p class="empty">Cargando…</p></main>
<div id="msg" role="status" hidden></div>
<script>
const view = document.getElementById('view');
const msg = document.getElementById('msg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => Number(v || 0).toLocaleString('es-ES');
const usd = (v, digits = 2) => Number(v || 0).toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (t) => new Date(t).toLocaleDateString('es-ES', { dateStyle: 'medium' });
const PLANS = { week: '1 semana', month: '1 mes', year: '1 año', custom: 'Personalizada' };
const MODEL_NAMES = { 'gemini-nano-banana-2.1': 'Nano Banana 2.1', 'gemini-3.1-flash-image': 'Nano Banana 2', 'gemini-3-pro-image': 'Nano Banana Pro', 'gpt-image-2': 'GPT Image 2' };
const STYLE_NAMES = { ink: 'Línea en blanco y negro', color: 'Ilustración a color', muscle: 'Músculos trabajados', comic: 'Cómic deportivo', botanic: 'Ilustración botánica', watercolor: 'Acuarela', '3d': 'Personaje 3D', neon: 'Neón anatómico', atlas: 'Atlas anatómico', cartoon: 'Cartoon alegre' };
const modelName = (id) => MODEL_NAMES[id] || STYLE_NAMES[id] || id;
let timer;
function say(text, isError) {
  msg.textContent = text;
  msg.className = isError ? 'err' : '';
  msg.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (msg.hidden = true), 4000);
}
async function call(path, body) {
  const res = await fetch('/admin/api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}
const bars = (list) => {
  const top = Math.max(1, ...list.map((x) => x.calls));
  return list.length ? list.map((x) => '<div class="bar"><span>' + esc(modelName(x.name)) + '</span><b>' + n(x.calls) + '</b><em style="width:' + Math.round(x.calls / top * 100) + '%"></em></div>').join('') : '<p class="empty">Aún sin datos.</p>';
};

async function summary() {
  const [d, s] = await Promise.all([call('summary?days=30'), call('styles')]);
  s.styles.forEach((x) => { STYLE_NAMES[x.id] = x.nombre; });
  const top = Math.max(1, ...d.perDay.map((x) => x.vignettes));
  const errRate = d.totals.calls ? Math.round(d.totals.errors / d.totals.calls * 100) : 0;
  view.innerHTML = '<h2>Resumen</h2><p class="lead">Últimos ' + d.days + ' días.</p>'
    + '<div class="cards">'
    + '<div class="card"><span>Licencias activas</span><b>' + n(d.licenses.active) + '</b><small>con uso en 30 días</small></div>'
    + '<div class="card"><span>De pago</span><b>' + n(d.licenses.paid) + '</b><small>' + n(d.licenses.comp) + ' de cortesía</small></div>'
    + '<div class="card"><span>Créditos hoy</span><b>' + n(d.today) + '</b><small>' + n(d.totals.vignettes) + ' en el periodo</small></div>'
    + '<div class="card"><span>Coste estimado</span><b>' + usd(d.totals.cost) + '</b><small>según precios de Google</small></div>'
    + '<div class="card"><span>Errores</span><b>' + n(d.totals.errors) + '</b><small>' + errRate + ' % de las llamadas</small></div>'
    + '</div>'
    + '<div class="box"><h3>Créditos por día</h3>' + (d.perDay.length
      ? '<div class="days">' + d.perDay.map((x) => '<i style="height:' + Math.max(2, Math.round(x.vignettes / top * 100)) + '%" title="' + esc(x.day) + ': ' + n(x.vignettes) + ' créditos"></i>').join('') + '</div><div class="axis"><span>' + esc(d.perDay[0].day) + '</span><span>' + esc(d.perDay[d.perDay.length - 1].day) + '</span></div>'
      : '<p class="empty">Aún sin datos.</p>') + '</div>'
    + '<div class="two"><div class="box"><h3>Motores más usados</h3>' + bars(d.perModel) + '</div><div class="box"><h3>Estilos más usados</h3>' + bars(d.perStyle) + '</div></div>';
}

async function licenses(q = '') {
  const { licenses: list } = await call('licenses?q=' + encodeURIComponent(q));
  const body = list.map((l) => '<tr><td>' + esc(l.email || '—') + '</td><td><code>…' + esc(l.tail) + '</code></td><td><span class="tag">' + (l.kind === 'comp' ? 'Cortesía' : 'De pago') + '</span></td><td>' + esc(PLANS[l.plan] || l.plan) + '</td><td class="num">' + n(l.vignettes) + '</td><td>' + date(l.last_seen) + '</td><td>'
    + (l.blocked ? '<span class="tag bad">Bloqueada</span>' : '<span class="tag ok">Activa</span>') + '</td><td><button class="act' + (l.blocked ? '' : ' danger') + '" data-block="' + esc(l.hash) + '" data-to="' + (l.blocked ? 0 : 1) + '">' + (l.blocked ? 'Desbloquear' : 'Bloquear') + '</button></td></tr>').join('');
  if (!document.getElementById('q')) {
    view.innerHTML = '<h2>Licencias</h2><p class="lead">Aparecen cuando se usan por primera vez.</p><input id="q" class="search" type="search" placeholder="Buscar por correo o final de la clave" aria-label="Buscar"><div class="box"><div class="scroll" id="list"></div></div>';
    let wait;
    document.getElementById('q').addEventListener('input', (e) => {
      clearTimeout(wait);
      wait = setTimeout(() => licenses(e.target.value).catch((err) => say(err.message, true)), 250);
    });
  }
  document.getElementById('list').innerHTML = list.length
    ? '<table><thead><tr><th>Correo</th><th>Clave</th><th>Tipo</th><th>Cuota</th><th class="num">Créditos</th><th>Último uso</th><th>Estado</th><th></th></tr></thead><tbody>' + body + '</tbody></table>'
    : '<p class="empty">No hay licencias.</p>';
}

let grantList = [];
const quotaText = (g) => (g.plan === 'custom' ? n(g.vignettes) + ' créditos en ' + n(g.period_days) + ' días' : PLANS[g.plan] || g.plan);

async function grants(edit = null) {
  const { grants: list } = await call('grants');
  grantList = list;
  const now = Date.now();
  const g = edit ? list.find((x) => x.email === edit) : null;
  const left = g ? Math.max(1, Math.ceil((g.expires - now) / 864e5)) : 30;
  const plan = g?.plan || 'month';
  const option = (value, text) => '<option value="' + value + '"' + (plan === value ? ' selected' : '') + '>' + text + '</option>';
  const body = list.map((x) => {
    const on = !x.revoked && x.expires >= now;
    const state = x.revoked ? '<span class="tag bad">Retirado</span>' : on ? '<span class="tag ok">En vigor</span>' : '<span class="tag">Caducado</span>';
    return '<tr><td>' + esc(x.email) + '</td><td>' + esc(x.note || '—') + '</td><td>' + esc(quotaText(x)) + '</td><td>' + date(x.expires) + '</td><td>' + state + '</td><td class="acts">'
      + '<button class="act" data-grant-edit="' + esc(x.email) + '">Editar</button>'
      + (on ? '<button class="act danger" data-ungrant="' + esc(x.email) + '">Retirar</button>' : '')
      + '<button class="act danger" data-grant-del="' + esc(x.email) + '">Eliminar</button></td></tr>';
  }).join('');
  view.innerHTML = '<h2>Usuarios</h2><p class="lead">Activa Premium a una cuenta de Google. La persona no necesita ninguna clave: le basta con iniciar sesión en la app con ese correo. Para consultar su consumo o bloquearla, usa Licencias.</p>'
    + '<div class="box"><h3>' + (g ? 'Editar a ' + esc(g.email) : 'Activar Premium') + '</h3><form id="newGrant">'
    + '<label>Correo de Google<input name="email" type="email" maxlength="200" required placeholder="nombre@gmail.com" value="' + esc(g?.email || '') + '"' + (g ? ' readonly' : '') + '></label>'
    + '<label>Nota<input name="note" maxlength="80" placeholder="Opcional" value="' + esc(g?.note || '') + '"></label>'
    + '<label>Cuota de créditos<select name="plan" id="grantPlan">' + option('week', '100 por semana') + option('month', '200 al mes') + option('year', '1.200 al año') + option('custom', 'Personalizada') + '</select></label>'
    + '<label data-custom' + (plan === 'custom' ? '' : ' hidden') + '>Créditos<input name="vignettes" type="number" min="1" max="100000" value="' + (g?.vignettes || 100) + '"></label>'
    + '<label>Duración (días)<input name="days" type="number" min="1" max="3660" value="' + left + '" required></label>'
    + '<button class="primary">' + (g ? 'Guardar' : 'Activar') + '</button>'
    + (g ? '<button type="button" class="act" data-grant-cancel>Cancelar</button>' : '')
    + '</form></div>'
    + '<div class="box"><div class="scroll">' + (list.length ? '<table><thead><tr><th>Correo</th><th>Nota</th><th>Cuota</th><th>Caduca</th><th>Estado</th><th></th></tr></thead><tbody>' + body + '</tbody></table>' : '<p class="empty">Aún no has activado Premium a nadie.</p>') + '</div></div>';
}

async function comps(newKey) {
  const { comps: list } = await call('comps');
  const now = Date.now();
  const body = list.map((c) => {
    const state = c.revoked ? '<span class="tag bad">Retirada</span>' : c.expires < now ? '<span class="tag">Caducada</span>' : '<span class="tag ok">En vigor</span>';
    return '<tr><td>' + esc(c.label) + '</td><td><code>…' + esc(c.tail) + '</code></td><td>' + esc(PLANS[c.plan] || c.plan) + '</td><td>' + date(c.expires) + '</td><td>' + state + '</td><td>' + (c.revoked || c.expires < now ? '' : '<button class="act danger" data-revoke="' + esc(c.hash) + '">Retirar</button>') + '</td></tr>';
  }).join('');
  view.innerHTML = '<h2>Cortesía</h2><p class="lead">Premium sin pago, para colaboradores o pruebas. La persona pega la clave en Ajustes, igual que una comprada.</p>'
    + '<div class="box"><h3>Nueva licencia</h3><form id="newComp">'
    + '<label>Para quién<input name="label" maxlength="80" required placeholder="Nombre o motivo"></label>'
    + '<label>Cuota de créditos<select name="plan"><option value="week">100 por semana</option><option value="month" selected>200 al mes</option><option value="year">1.200 al año</option></select></label>'
    + '<label>Duración (días)<input name="days" type="number" min="1" max="3660" value="30" required></label>'
    + '<button class="primary">Crear</button></form>'
    + (newKey ? '<div class="key"><code id="newKey">' + esc(newKey) + '</code><button class="act" data-copy>Copiar</button><p>Cópiala ahora: no se guarda y no podrás volver a verla.</p></div>' : '')
    + '</div><div class="box"><div class="scroll">' + (list.length ? '<table><thead><tr><th>Para quién</th><th>Clave</th><th>Cuota</th><th>Caduca</th><th>Estado</th><th></th></tr></thead><tbody>' + body + '</tbody></table>' : '<p class="empty">Aún no hay licencias de cortesía.</p>') + '</div></div>';
}

async function models() {
  const { models: list } = await call('models');
  view.innerHTML = '<h2>Motores</h2><p class="lead">Si apagas un motor, la app avisa a quien lo tenga elegido para que escoja otro. Añadir un proveedor nuevo requiere programarlo una vez.</p>'
    + '<div class="box"><div class="scroll"><table><thead><tr><th>Motor</th><th class="num">Créditos por viñeta</th><th class="num">Coste por viñeta</th><th>Estado</th><th></th></tr></thead><tbody>'
    + list.map((m) => '<tr><td>' + esc(modelName(m.id)) + '</td><td class="num">' + n(m.vignettes) + (m.vignettes === 1 ? ' crédito' : ' créditos') + '</td><td class="num">' + usd(m.cost, 4) + '</td><td>' + (m.enabled ? '<span class="tag ok">Disponible</span>' : '<span class="tag bad">Apagado</span>') + '</td><td><button class="act' + (m.enabled ? ' danger' : '') + '" data-model="' + esc(m.id) + '" data-to="' + (m.enabled ? 0 : 1) + '">' + (m.enabled ? 'Apagar' : 'Encender') + '</button></td></tr>').join('')
    + '</tbody></table></div></div>'
    + '<h2 style="margin-top:28px">Motores del cuadro de prompt</h2><p class="lead">Los que puede elegir la gente al escribir instrucciones para la IA. Es aparte de la lista de arriba: un motor apagado arriba tampoco se puede usar aquí.</p>'
    + '<div class="box"><div class="scroll"><table><thead><tr><th>Motor</th><th class="num">Créditos por viñeta</th><th class="num">Coste por viñeta</th><th>Estado</th><th></th></tr></thead><tbody>'
    + list.map((m) => '<tr><td>' + esc(modelName(m.id)) + '</td><td class="num">' + n(m.vignettes) + (m.vignettes === 1 ? ' crédito' : ' créditos') + '</td><td class="num">' + usd(m.cost, 4) + '</td><td>' + (!m.enabled ? '<span class="tag bad">Motor apagado</span>' : m.prompt ? '<span class="tag ok">Disponible</span>' : '<span class="tag bad">Apagado</span>') + '</td><td><button class="act' + (m.prompt ? ' danger' : '') + '" data-prompt-model="' + esc(m.id) + '" data-to="' + (m.prompt ? 0 : 1) + '">' + (m.prompt ? 'Apagar' : 'Encender') + '</button></td></tr>').join('')
    + '</tbody></table></div></div>';
}

const FIELDS = [
  ['tecnica', 'Técnica', 'Cómo está dibujado: línea, sombreado y acabado.'],
  ['paleta', 'Colores', 'Qué colores usa y dónde.'],
  ['fondo', 'Fondo', 'Si lo dejas vacío, será blanco liso.'],
  ['extras', 'Extras', 'Flechas, sombras u objetos que se pueden añadir.'],
  ['prohibido', 'Prohibido', 'Lo que no debe aparecer. Texto y marcas de agua ya están prohibidos siempre.'],
];
const imageUrl = (key) => '/admin/api/styles/image?key=' + encodeURIComponent(key);
let stylesInfo = null;
let editing = null; // la ficha abierta en el editor

/** Cualquier imagen pasa a JPEG con fondo blanco y como mucho 1024 px, igual que los frames. */
async function toJpeg(file, size = 1024) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, size / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

async function styles() {
  stylesInfo = await call('styles');
  editing = null;
  view.innerHTML = '<div class="bar-top"><div><h2>Estilos</h2></div><div><button class="primary" data-style-new>Nuevo estilo</button></div></div>'
    + '<p class="lead">Lo que guardes aquí llega a la app sin actualizarla. Un estilo nuevo no se muestra hasta que lo actives.</p>'
    + '<div class="style-list">' + stylesInfo.styles.map((s) => '<button class="style-card" data-style-open="' + esc(s.id) + '">'
      + (s.miniatura ? '<img src="' + imageUrl(s.miniatura) + '" alt="">' : '<span class="noimg"></span>')
      + '<b>' + esc(s.nombre) + '</b><small>Versión ' + n(s.version) + ' · ' + n(s.referencias.length) + ' referencias</small>'
      + (s.activo ? '<span><span class="tag ok">Activo</span></span>' : '<span><span class="tag bad">Apagado</span></span>') + '</button>').join('') + '</div>';
}

function readEditor() {
  document.querySelectorAll('[data-field]').forEach((el) => { editing[el.dataset.field] = el.value; });
}

function drawImages() {
  document.getElementById('thumbBox').innerHTML = editing.miniatura ? '<div class="thumb"><img src="' + imageUrl(editing.miniatura) + '" alt="Miniatura"><button data-thumb-remove aria-label="Quitar miniatura">×</button></div>' : '';
  document.getElementById('refBox').innerHTML = editing.referencias.map((key) => '<div class="thumb"><img src="' + imageUrl(key) + '" alt="Referencia"><button data-ref-remove="' + esc(key) + '" aria-label="Quitar referencia">×</button></div>').join('');
  document.getElementById('refCount').textContent = editing.referencias.length + ' de ' + stylesInfo.maxRefs;
}

const jsonOf = () => JSON.stringify({ nombre: editing.nombre, tecnica: editing.tecnica, paleta: editing.paleta, fondo: editing.fondo, extras: editing.extras, prohibido: editing.prohibido || '', referencias: editing.referencias, miniatura: editing.miniatura }, null, 2);

function editStyle(style) {
  editing = { prohibido: '', referencias: [], miniatura: '', ...style };
  const isNew = !editing.id;
  view.innerHTML = '<div class="bar-top"><div><button class="act" data-style-back>Volver</button></div><div>'
    + (isNew ? '' : '<button class="act' + (editing.activo ? ' danger' : '') + '" data-style-active="' + (editing.activo ? 0 : 1) + '">' + (editing.activo ? 'Apagar' : 'Activar') + '</button>')
    + '<button class="primary" data-style-save>Guardar</button></div></div>'
    + '<h2>' + (isNew ? 'Nuevo estilo' : esc(editing.nombre)) + '</h2>'
    + '<p class="lead">' + (isNew ? 'Se guardará apagado.' : 'Versión ' + n(editing.version) + ' · ' + (editing.activo ? 'activo' : 'apagado')) + '</p>'
    + '<div class="box fields"><label>Nombre<input data-field="nombre" maxlength="60" value="' + esc(editing.nombre) + '"></label>'
    + FIELDS.map(([k, label, hint]) => '<label>' + label + '<textarea data-field="' + k + '" maxlength="1000">' + esc(editing[k]) + '</textarea><span class="hint">' + hint + '</span></label>').join('') + '</div>'
    + '<div class="box"><h3>Miniatura</h3><p class="hint">La que ven los usuarios en el selector de estilos.</p><div class="thumbs" id="thumbBox"></div><label class="file">Elegir imagen<input type="file" accept="image/*" data-upload="thumb"></label></div>'
    + '<div class="box"><h3>Imágenes de referencia <span class="tag" id="refCount"></span></h3><p class="hint">El motor copia de ellas la técnica, no la pose. Usa poses y cuerpos distintos, e imágenes propias o con permiso.</p><div class="thumbs" id="refBox"></div><label class="file">Añadir imágenes<input type="file" accept="image/*" multiple data-upload="ref"></label></div>'
    + '<div class="box"><h3>Probar</h3><p class="hint">' + (stylesInfo.canTest ? 'Prueba lo que hay escrito ahora, aunque no esté guardado. Cada prueba gasta una imagen real de Google.' : 'Estará disponible cuando guardes la clave de Google en el panel.') + '</p>'
    + '<div class="test"><label class="file">Elegir frame<input type="file" accept="image/*" data-upload="frame"></label><span class="hint" id="frameName">Sin frame</span>'
    + '<label>Motor<select id="testModel">' + stylesInfo.models.map((m) => '<option value="' + esc(m.id) + '">' + esc(MODEL_NAMES[m.id] || m.id) + ' (' + usd(m.cost, 4) + ')</option>').join('') + '</select></label>'
    + '<button class="act" data-style-test' + (stylesInfo.canTest ? '' : ' disabled') + '>Probar</button></div><div id="testOut"></div></div>'
    + '<div class="box"><details><summary>JSON de la ficha</summary><textarea class="json" id="fichaJson" spellcheck="false" aria-label="JSON de la ficha"></textarea><button class="act" data-json-apply>Aplicar al formulario</button></details></div>'
    + (isNew ? '' : '<div class="box"><details id="history"><summary>Versiones anteriores</summary><div id="versions"><p class="empty">Cargando…</p></div></details></div>');
  drawImages();
  document.getElementById('fichaJson').value = jsonOf();
  document.getElementById('history')?.addEventListener('toggle', loadVersions, { once: true });
}

async function loadVersions() {
  const { versions } = await call('styles/versions?id=' + encodeURIComponent(editing.id));
  document.getElementById('versions').innerHTML = versions.length
    ? '<table><tbody>' + versions.map((v) => '<tr><td>Versión ' + n(v.version) + '</td><td>' + date(v.updated) + '</td><td><button class="act" data-style-restore="' + n(v.version) + '">Volver a esta</button></td></tr>').join('') + '</tbody></table>'
    : '<p class="empty">Aún no hay versiones anteriores.</p>';
}

async function upload(file) {
  const { key } = await call('styles/image', { data: await toJpeg(file) });
  return key;
}

let frame = null; // el frame elegido para probar

async function onUpload(input) {
  const files = [...input.files];
  input.value = '';
  readEditor();
  if (input.dataset.upload === 'frame') {
    frame = await toJpeg(files[0]);
    document.getElementById('frameName').textContent = files[0].name;
    return;
  }
  if (input.dataset.upload === 'thumb') {
    editing.miniatura = await upload(files[0]);
  } else {
    if (editing.referencias.length + files.length > stylesInfo.maxRefs) throw new Error('Máximo ' + stylesInfo.maxRefs + ' imágenes por estilo.');
    for (const f of files) editing.referencias.push(await upload(f));
  }
  drawImages();
  say('Imagen subida. Pulsa Guardar para conservarla.');
}

async function saveEditor() {
  readEditor();
  const { style } = await call('styles', { id: editing.id, ficha: editing });
  say('Guardado como versión ' + style.version);
  stylesInfo = await call('styles');
  editStyle(style);
}

async function testEditor() {
  readEditor();
  if (!frame) throw new Error('Elige un frame de prueba.');
  const out = document.getElementById('testOut');
  out.innerHTML = '<p class="empty">Dibujando…</p>';
  try {
    const { image } = await call('styles/test', { id: editing.id, ficha: editing, model: document.getElementById('testModel').value, image: frame });
    out.innerHTML = '<img src="data:' + esc(image.mime_type) + ';base64,' + esc(image.data) + '" alt="Resultado de la prueba">';
  } catch (e) {
    out.innerHTML = '';
    throw e;
  }
}

const VIEWS = { summary, licenses, grants, comps, models, styles };
function show(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  view.innerHTML = '<p class="empty">Cargando…</p>';
  VIEWS[tab]().catch((e) => { view.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
}
document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (tab) show(tab);
});
view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    if (e.target.id === 'newGrant') {
      const edit = f.get('email') && e.target.email.readOnly;
      await call('grants', { email: f.get('email'), note: f.get('note'), plan: f.get('plan'), days: Number(f.get('days')), vignettes: Number(f.get('vignettes')), edit });
      await grants();
      say(edit ? 'Cambios guardados' : 'Premium activado');
      return;
    }
    const { key } = await call('comps', { label: f.get('label'), plan: f.get('plan'), days: Number(f.get('days')) });
    await comps(key);
  } catch (err) {
    say(err.message, true);
  }
});
view.addEventListener('change', (e) => {
  if (e.target.id !== 'grantPlan') return;
  view.querySelectorAll('[data-custom]').forEach((l) => (l.hidden = e.target.value !== 'custom'));
});
view.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if ('copy' in b.dataset) {
      await navigator.clipboard.writeText(document.getElementById('newKey').textContent);
      say('Clave copiada');
    } else if (b.dataset.block) {
      await call('licenses/block', { hash: b.dataset.block, blocked: b.dataset.to === '1' });
      await licenses(document.getElementById('q').value);
    } else if (b.dataset.revoke) {
      if (!confirm('¿Retirar esta licencia? Dejará de funcionar y no se puede deshacer.')) return;
      await call('comps/revoke', { hash: b.dataset.revoke });
      await comps();
    } else if (b.dataset.grantEdit) {
      await grants(b.dataset.grantEdit);
    } else if ('grantCancel' in b.dataset) {
      await grants();
    } else if (b.dataset.grantDel) {
      if (!confirm('¿Eliminar a ' + b.dataset.grantDel + '? Perderá Premium y desaparecerá de esta lista.')) return;
      await call('grants/delete', { email: b.dataset.grantDel });
      await grants();
    } else if (b.dataset.ungrant) {
      if (!confirm('¿Retirar Premium a ' + b.dataset.ungrant + '? Podrás volver a activarlo.')) return;
      await call('grants/revoke', { email: b.dataset.ungrant });
      await grants();
    } else if (b.dataset.promptModel) {
      await call('models', { id: b.dataset.promptModel, enabled: b.dataset.to === '1', prompt: true });
      models();
    } else if (b.dataset.model) {
      await call('models', { id: b.dataset.model, enabled: b.dataset.to === '1' });
      await models();
    } else if ('styleNew' in b.dataset) {
      editStyle({ nombre: '', tecnica: '', paleta: '', fondo: '', extras: '', activo: false });
    } else if (b.dataset.styleOpen) {
      editStyle(stylesInfo.styles.find((s) => s.id === b.dataset.styleOpen));
    } else if ('styleBack' in b.dataset) {
      await styles();
    } else if ('styleSave' in b.dataset) {
      await saveEditor();
    } else if (b.dataset.styleActive) {
      await call('styles/active', { id: editing.id, activo: b.dataset.styleActive === '1' });
      await styles();
    } else if ('styleTest' in b.dataset) {
      await testEditor();
    } else if ('thumbRemove' in b.dataset) {
      editing.miniatura = '';
      drawImages();
    } else if (b.dataset.refRemove) {
      editing.referencias = editing.referencias.filter((k) => k !== b.dataset.refRemove);
      drawImages();
    } else if ('jsonApply' in b.dataset) {
      const parsed = JSON.parse(document.getElementById('fichaJson').value);
      editStyle({ ...editing, ...parsed, id: editing.id, version: editing.version, activo: editing.activo });
    } else if (b.dataset.styleRestore) {
      if (!confirm('¿Volver a esta versión? Se guardará como una versión nueva.')) return;
      const { style } = await call('styles/restore', { id: editing.id, version: Number(b.dataset.styleRestore) });
      stylesInfo = await call('styles');
      editStyle(style);
      say('Versión recuperada');
    }
  } catch (err) {
    say(err.message, true);
  }
});
view.addEventListener('change', (e) => {
  if (e.target.dataset.upload) onUpload(e.target).catch((err) => say(err.message, true));
});
show('summary');
</script>
</body>
</html>`;
