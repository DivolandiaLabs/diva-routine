// Shared by the API and the UI: older routines keep their original table.
export const ROUTINE_TABLE_STYLES = [
  { id: 'classic', name: 'Clásica', hint: 'La tabla original, con bandas por categoría.' },
  { id: 'minimal', name: 'Minimalista', hint: 'Papel blanco, líneas finas y más espacio.' },
  { id: 'color', name: 'Bloques de color', hint: 'Secciones suaves para distinguir cada bloque.' },
  { id: 'cards', name: 'Fichas', hint: 'Cada ejercicio en su propia tarjeta visual.' },
  { id: 'sport', name: 'Deportiva', hint: 'Cabecera azul y números bien destacados.' },
  { id: 'notebook', name: 'Cuaderno', hint: 'Papel cálido y detalles de cuaderno de práctica.' },
];

export const normalizeTableStyle = (value) => ROUTINE_TABLE_STYLES.some((s) => s.id === value) ? value : 'classic';
export const tableStyleName = (value) => ROUTINE_TABLE_STYLES.find((s) => s.id === normalizeTableStyle(value)).name;

// Small vector previews of the layouts, without downloading extra images.
export function tableStylePreview(value) {
  const id = normalizeTableStyle(value);
  const paper = id === 'notebook' ? '#fff8e9' : id === 'classic' ? '#fffdf9' : '#ffffff';
  const ink = id === 'sport' ? '#173f65' : id === 'color' ? '#24766b' : '#423c37';
  const line = id === 'notebook' ? '#b7cfc9' : '#dfdfdc';
  const rect = (x, y, w, h, fill, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
  const pose = (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"><circle cy="-9" r="3" fill="${color}" stroke="none"/><path d="M0-4v12m0-9-8 6m8-6 8-8M0 8l-7 10m7-10 7 10"/></g>`;
  let body = rect(0, 0, 240, 156, paper, 6);
  if (id === 'notebook') {
    for (let y = 48; y < 156; y += 12) body += rect(12, y, 216, 0.6, '#dce4d5', 0);
    body += rect(27, 10, 1, 136, '#df9f91', 0);
  }
  body += rect(12, 12, 216, 27, id === 'sport' ? ink : paper, 4);
  body += rect(20, 19, 108, 6, id === 'sport' ? '#ffffff' : ink);
  body += rect(20, 30, 67, 2, id === 'sport' ? '#b8d4eb' : '#a7a49c');
  if (id === 'cards') {
    for (let i = 0; i < 4; i++) {
      const x = 14 + (i % 2) * 110, y = 48 + Math.floor(i / 2) * 49;
      body += `<rect x="${x}" y="${y}" width="102" height="43" rx="5" fill="#fff" stroke="#dfdfdc"/>`;
      body += rect(x + 6, y + 6, 9, 9, '#e7eee9', 3) + rect(x + 20, y + 8, 53, 3, ink);
      body += pose(x + 31, y + 27, '#5b8678') + pose(x + 64, y + 27, '#5b8678');
    }
  } else {
    for (let i = 0; i < 2; i++) {
      const y = 48 + i * 48, accent = i ? '#8375a4' : '#548d7f';
      const tint = id === 'color' ? (i ? '#eeebf7' : '#e5f2ee') : id === 'minimal' ? '#fff' : '#f0eee7';
      body += rect(14, y, 212, 10, tint) + rect(14, y + 45, 212, 0.7, line);
      body += rect(20, y + 4, 45, 2, id === 'minimal' ? '#666' : accent);
      if (id === 'sport') body += rect(14, y + 14, 14, 27, ink, 3);
      else body += rect(18, y + 22, 5, 8, id === 'minimal' ? ink : accent);
      body += rect(34, y + 21, 44, 3, ink) + rect(34, y + 28, 29, 2, '#b2afa8');
      body += pose(112, y + 24, accent) + pose(143, y + 24, accent);
      body += rect(171, y + 20, 42, 2, '#92958e') + rect(171, y + 26, 34, 2, '#b2b6ad') + rect(171, y + 32, 39, 2, '#b2b6ad');
    }
  }
  return `<svg class="table-style-preview" viewBox="0 0 240 156" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function tableStylePicker(value, name = 'routineTableStyle') {
  const current = normalizeTableStyle(value);
  // name is an internal, fixed identifier supplied by the two routine views.
  return `<fieldset class="table-style-picker"><legend>Estilo de tabla</legend><div class="table-style-options">${ROUTINE_TABLE_STYLES.map((s) => `
    <label class="table-style-option">
      <input type="radio" name="${name}" value="${s.id}" data-table-style-choice ${current === s.id ? 'checked' : ''}>
      <span class="table-style-card">${tableStylePreview(s.id)}<span class="table-style-caption"><b>${s.name}</b><small>${s.hint}</small></span><span class="table-style-check" aria-hidden="true">✓</span></span>
    </label>`).join('')}</div></fieldset>`;
}
