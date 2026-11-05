// Llamada a Google. La usan el servidor público y el botón Probar del panel.
import { promptFor, styleImages } from './styles.js';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const fail = (status, error) => Object.assign(new Error(error), { status });

// La documentación no da un ejemplo de respuesta con imagen: se busca el primer bloque que la traiga.
function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.data === 'string' && /^image\//.test(node.mime_type || '')) return node;
  for (const child of Object.values(node)) {
    const found = findImage(child);
    if (found) return found;
  }
  return null;
}

/** references: fases ya dibujadas del ejercicio. image: el frame, que manda en la pose. */
export async function callGemini(env, model, ficha, image, references, prompt) {
  const examples = await styleImages(env, ficha);
  const text = promptFor(ficha, examples.length, references.length, prompt);
  const res = await fetch(env.GEMINI_URL || GEMINI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text },
        ...[...examples, ...references].map((r) => ({ type: 'image', mime_type: r.mime, data: r.data })),
        { type: 'image', mime_type: 'image/jpeg', data: image },
      ],
      store: false,
      response_format: { type: 'image', mime_type: 'image/jpeg', image_size: '1K' },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('gemini', res.status, JSON.stringify(data)?.slice(0, 500));
    throw fail(502, 'El servicio de IA no pudo generar la imagen. No se te ha descontado. Prueba otra vez.');
  }
  const found = findImage(data);
  if (!found) throw fail(502, 'El servicio de IA no devolvió ninguna imagen (puede que la haya bloqueado). No se te ha descontado.');
  return { mime_type: found.mime_type, data: found.data };
}
