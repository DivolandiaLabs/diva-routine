// Vistas de las cuadrículas, como en el explorador de archivos: las usan Bibliotecas y Rutinas.
const sq = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.5"/>`;
export const VIEW_ICON = {
  xl: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${sq(4, 4, 16)}</svg>`,
  l: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${sq(3, 3, 8) + sq(13, 3, 8) + sq(3, 13, 8) + sq(13, 13, 8)}</svg>`,
  m: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => sq(x, y, 4.5))).join('')}</svg>`,
  s: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${[3, 8, 13, 18].flatMap((y) => [3, 8, 13, 18].map((x) => `<rect x="${x}" y="${y}" width="3" height="3" rx="0.6"/>`)).join('')}</svg>`,
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><rect x="3" y="4.5" width="3" height="3" rx="0.6"/><rect x="3" y="10.5" width="3" height="3" rx="0.6"/><rect x="3" y="16.5" width="3" height="3" rx="0.6"/></svg>',
  details: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h18M3 10h18M3 15h18M3 20h18M10 3v19"/></svg>',
};

// Sin «muy grandes» ni «detalles»: quien las tenía guardadas vuelve a la de siempre.
export const VIEWS = [
  ['l', 'Iconos grandes'], ['m', 'Iconos medianos'], ['s', 'Iconos pequeños'], ['list', 'Lista'],
];

export const viewButtons = () => VIEWS.map(([k, label]) => `<button class="view-btn" data-view="${k}" title="${label} (Ctrl + rueda del ratón para cambiar)" aria-label="${label}">${VIEW_ICON[k]}</button>`).join('');

export const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>';
// Cómo se ordena: el orden propio (arrastrando) o por fecha, nombre o tipo.
export const SORTS = [
  ['custom', 'Mi orden'], ['new', 'Más recientes'], ['old', 'Más antiguos'],
  ['az', 'Nombre A–Z'], ['za', 'Nombre Z–A'], ['type', 'Tipo'],
];

export const SORT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>';
