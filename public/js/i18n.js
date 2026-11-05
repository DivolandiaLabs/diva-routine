// Idioma de la interfaz. Las plantillas siguen en español: esto traduce lo que llega a la pantalla,
// así no hay que tocar cada una. Lo que falte en i18n-data.js simplemente sale en español.
import { LANGS, ROWS, COUNTS } from './i18n-data.js';

export { LANGS };

const KEY = 'jr-lang';
const ATTRS = ['placeholder', 'title', 'aria-label'];
// Nombres que ha puesto la persona: nunca se traducen aunque coincidan con una palabra.
const SKIP = [
  '.name-edit, .ex-title, .tile-name, textarea, [contenteditable], script, style',
  '.crumbs a, .shelf-name, .shelf-pill, .tile-body h3, .tile-src, .pin-jump b, .pin-menu label',
  '.rp-t, .saved-name, .ig-col b, .ig-col-name, .ig-col-link, .sh-mail, .panel-list a, .rt-menu-lib, .lib-pick-name, .lib-pick-where, .ex-link, .c-name > b, .src',
  '#target option, #moveTo option, #igLib option, #vlib option, #toRoutine option:not([value=""])',
].join();
// Donde una frase puede llevar <b>, <a>… dentro.
const RICH = 'p, li, dd, span, small, summary, h4';

const saved = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const lang = LANGS.some(([c]) => c === saved()) ? saved() : 'es';

export function setLang(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* solo esta vez */
  }
  location.reload();
}

const column = LANGS.findIndex(([c]) => c === lang);
const table = (rows) => new Map(rows.map((r) => [r[0], r[column]]));
const SLOT = /\{\*?\}/g;
const OUT_SLOT = /\{(\d*)\*?\}/g;
const isPattern = (r) => r[0].includes('{');
const WORDS = table(ROWS.filter((r) => !isPattern(r)));
const UNITS = table(COUNTS);
const COUNT = /^\d+ \p{L}+( · \d+ \p{L}+)*$/u;

// En una clave, {} es un valor que se deja tal cual (un nombre, un número) y {*} otro texto de
// la app, que también se traduce. En la traducción los valores salen en orden, salvo que el idioma
// pida otro: entonces se numeran desde 0 ({1} {0}).
const quote = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = ROWS.filter(isPattern)
  .map((r) => ({
    re: new RegExp(`^${r[0].split(SLOT).map(quote).join('(.+?)')}$`, 's'),
    nested: r[0].match(SLOT).map((s) => s === '{*}'),
    out: r[column],
    fixed: r[0].replace(SLOT, '').length,
  }))
  .sort((a, b) => b.fixed - a.fixed); // la frase más concreta gana
const [TAGGED, PLAIN] = [(p) => p.re.source.includes('<'), (p) => !p.re.source.includes('<')].map((f) => PATTERNS.filter(f));

// Ruso y polaco cambian la palabra según el número: «форма1|форма2|форма3» (1, 2-4, 5 o más).
const plural = new Intl.PluralRules(lang);
const PLURAL_FORM = { one: 0, few: 1 };
function unit(n, word) {
  const forms = UNITS.get(word).split('|');
  return forms[PLURAL_FORM[plural.select(Number(n))] ?? forms.length - 1];
}

function fromPattern(key, patterns) {
  for (const p of patterns) {
    const m = p.re.exec(key);
    if (!m) continue;
    const values = m.slice(1).map((v, i) => (p.nested[i] ? translated(v) ?? v : v));
    let next = 0;
    return p.out.replace(OUT_SLOT, (all, i) => values[i === '' ? next++ : i]);
  }
  return null;
}

function translated(text, patterns = PLAIN) {
  const key = text.trim();
  if (!key) return null;
  const hit = WORDS.get(key) ?? fromPattern(key, patterns);
  if (hit) return text.replace(key, () => hit);
  if (!COUNT.test(key)) return null;
  return key.replace(/(\d+) (\p{L}+)/gu, (all, n, word) => (UNITS.has(word) ? `${n} ${unit(n, word)}` : all));
}

/** Para lo que no pasa por la pantalla o se compone a trozos: nombres nuevos, partes de una frase. */
export const tr = (text) => (lang === 'es' ? text : translated(text) ?? text);

// Sin atributo value, el texto de un <option> es su valor: traducirlo cambiaría lo que se guarda.
const untouchable = (el) => !el || el.closest(SKIP) || (el.tagName === 'OPTION' && !el.hasAttribute('value'));

// Una frase con etiquetas dentro se traduce entera, porque cada idioma la ordena a su manera.
// Las etiquetas se devuelven tal como estaban, con sus enlaces y clases.
function richText(el) {
  if (!el.firstElementChild || untouchable(el)) return;
  const tags = {};
  const key = el.innerHTML.replace(/<(\w+)[^>]*>/g, (tag, name) => {
    (tags[name] ||= []).push(tag);
    return `<${name}>`;
  });
  const out = translated(key, TAGGED);
  if (out) el.innerHTML = out.replace(/<(\w+)>/g, (all, name) => tags[name]?.shift() ?? all);
}

function textNode(node) {
  if (untouchable(node.parentElement)) return;
  const out = translated(node.nodeValue);
  if (out && out !== node.nodeValue) node.nodeValue = out;
}

// Los atributos no llevan nombres sueltos, solo dentro de una frase: valen también en lo protegido.
function attributes(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    const out = v && translated(v);
    if (out && out !== v) el.setAttribute(a, out);
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return textNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(RICH)) richText(root);
  root.querySelectorAll(RICH).forEach(richText);
  const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (texts.nextNode()) textNode(texts.currentNode);
  attributes(root);
  root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join()).forEach(attributes);
}

if (lang !== 'es') {
  walk(document.body);
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === 'attributes') attributes(c.target);
      else if (c.type === 'characterData') textNode(c.target);
      else c.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
document.documentElement.lang = lang;
