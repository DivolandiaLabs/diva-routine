// Llamada a OpenAI. Mismo contrato que callGemini: el frame va el último porque manda en la pose.
import { promptFor, styleImages } from './styles.js';

const OPENAI_API = 'https://api.openai.com/v1/images/edits';
const fail = (status, error) => Object.assign(new Error(error), { status });

function imageFile(data, mime) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** references: fases ya dibujadas del ejercicio. image: el frame, en JPEG. */
export async function callOpenAI(env, model, ficha, image, references, prompt) {
  if (!env.OPENAI_KEY) throw fail(503, 'Ese motor no está disponible ahora. Elige otro.');
  const examples = await styleImages(env, ficha);
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', promptFor(ficha, examples.length, references.length, prompt));
  form.append('quality', 'medium');
  form.append('output_format', 'jpeg');
  const images = [...examples, ...references, { mime: 'image/jpeg', data: image }];
  // OpenAI rechaza los archivos sin nombre.
  images.forEach((r, i) => form.append('image[]', imageFile(r.data, r.mime), `image-${i}.${r.mime === 'image/png' ? 'png' : 'jpg'}`));
  const res = await fetch(env.OPENAI_URL || OPENAI_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_KEY}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('openai', res.status, JSON.stringify(data)?.slice(0, 500));
    throw fail(502, 'El servicio de IA no pudo generar la imagen. No se te ha descontado. Prueba otra vez.');
  }
  const found = data?.data?.[0]?.b64_json;
  if (!found) throw fail(502, 'El servicio de IA no devolvió ninguna imagen (puede que la haya bloqueado). No se te ha descontado.');
  return { mime_type: 'image/jpeg', data: found };
}
