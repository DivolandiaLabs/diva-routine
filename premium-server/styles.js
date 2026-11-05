// Fichas de estilo de viñeta. Una ficha son las reglas del dibujo y sus imágenes de referencia.
// Las editadas en el panel están en D1 y sus imágenes en KV. Las de BUILTIN son el punto de partida:
// valen hasta que se guardan por primera vez, o si la base falla.
import { quiet } from './db.js';

export const MAX_STYLE_REFS = 6;
const FIELD_MAX = 1000;
const IMAGE = 'image/jpeg'; // el panel convierte todo a JPEG antes de subirlo
const NEVER = 'text, numbers, frames, a watermark, or any prop not mentioned here';

export const BUILTIN = {
  ink: {
    nombre: 'Línea en blanco y negro',
    tecnica: 'detailed fine-line ink illustration with realistic anatomy: confident clean contour lines, fine hatching, solid black for hair and light line shading on clothing folds',
    paleta: 'only black ink on pure white, no colour and no grey wash',
    fondo: '',
    extras: 'only a very faint ground shadow under the feet or hands that touch the floor',
  },
  color: {
    nombre: 'Ilustración a color',
    tecnica: 'clean fitness poster illustration, like a modern exercise chart: smooth thin dark outlines, flat colour fills with subtle soft shading, tidy and simple',
    paleta: 'natural skin tones and sporty clothes in muted colours',
    fondo: 'no background scenery',
    extras: '',
  },
  muscle: {
    nombre: 'Músculos trabajados',
    tecnica: 'anatomy exercise chart with bold black ink outlines and light grey shading, with defined muscle shapes',
    paleta: 'the muscles this movement works in translucent red, the rest of the body uncoloured',
    fondo: '',
    extras: 'keep any equipment the person is using, and one simple solid red arrow beside the body showing the direction of the movement',
  },
  comic: {
    nombre: 'Cómic deportivo',
    tecnica: 'energetic sports comic with bold black ink outlines and sharp cel shading on skin and muscles',
    paleta: 'saturated flat colours and bright sportswear',
    fondo: 'white, with one loose sky-blue paint splash behind the body, halftone dots and quick diagonal brush strokes that fade into the white',
    extras: 'a soft shadow under the feet',
  },
  botanic: {
    nombre: 'Ilustración botánica',
    tecnica: 'warm modern gouache illustration with no outlines and a fine grainy paper texture',
    paleta: 'a muted earthy palette: terracotta, mustard, sage green and navy',
    fondo: 'cream paper, with a few large soft organic shapes and simple leaves in those colours behind the figure',
    extras: 'a soft oval ground shadow and one thin curved arrow in a matching colour showing the movement',
  },
  watercolor: {
    nombre: 'Acuarela',
    tecnica: 'loose hand-painted watercolour with fine dark ink contours, translucent washes on skin and clothes and soft highlights',
    paleta: 'soft natural tones with pastel blue, peach and lilac',
    fondo: 'white textured paper, with light pastel brush strokes, small paint splatters and a blue watercolour pool under the feet',
    extras: 'one thin curved coral arrow showing the movement',
  },
  '3d': {
    nombre: 'Personaje 3D',
    tecnica: 'polished stylised 3D character render, like a modern animated film, with smooth soft lighting, rounded forms, defined muscles and no outlines',
    paleta: 'bright sportswear in vivid colours such as lime green and coral',
    fondo: 'pure white, with one flat yellow oval on the floor under the feet',
    extras: '',
  },
  neon: {
    nombre: 'Neón anatómico',
    tecnica: 'glowing neon line art: the body as a translucent silhouette with thin luminous contour lines and soft glow, any equipment as simple neon outlines',
    paleta: 'electric-blue lines, with the muscles this movement works as bright violet glowing strands and everything else unfilled',
    fondo: 'plain very dark navy',
    extras: '',
  },
  atlas: {
    nombre: 'Atlas anatómico',
    tecnica: 'detailed medical anatomy atlas with realistic proportions, showing the finely shaded muscle structure on the body, with natural hair and face and minimal neutral sportswear',
    paleta: 'natural reddish-brown muscle with pale tendons, and the muscles this movement works in saturated colours, one per muscle group: red, blue, purple and green',
    fondo: '',
    extras: 'a soft floor shadow',
  },
  cartoon: {
    nombre: 'Cartoon alegre',
    tecnica: 'cheerful hand-drawn cartoon with bold dark ink outlines and a friendly smiling face',
    paleta: 'flat bright colours and colourful sportswear',
    fondo: 'a warm home gym: a cream wall, a wooden floor and a coloured exercise mat',
    extras: 'a potted plant, a dumbbell and a few small sparkles or motion lines around the body',
  },
};

const isBuiltin = (id) => Object.hasOwn(BUILTIN, id);
const builtinOf = (id) => ({ id, version: 1, activo: true, builtin: true, referencias: [], miniatura: '', ...BUILTIN[id] });
const fromRow = (r) => ({ ...JSON.parse(r.data), id: r.id, version: r.version, activo: Boolean(r.activo), builtin: isBuiltin(r.id) });

/** Todas las fichas: primero las de partida, en su orden, y luego las nuevas. */
export async function listStyles(env) {
  const rows = env.DB ? await quiet(async () => (await env.DB.prepare('SELECT * FROM styles ORDER BY created').all()).results, []) : [];
  const saved = new Map(rows.map((r) => [r.id, fromRow(r)]));
  return [...Object.keys(BUILTIN).map((id) => saved.get(id) || builtinOf(id)), ...[...saved.values()].filter((s) => !s.builtin)];
}

export async function styleOf(env, id) {
  const row = env.DB ? await quiet(() => env.DB.prepare('SELECT * FROM styles WHERE id = ?').bind(String(id)).first(), null) : null;
  if (row) return fromRow(row);
  return isBuiltin(id) ? builtinOf(id) : null;
}

export const isImageKey = (key) => /^[0-9a-f]{64}$/.test(String(key));
const kvKey = (key) => `style-img:${key}`;
export const putImage = (env, key, bytes) => env.USAGE.put(kvKey(key), bytes);
export const getImage = (env, key) => env.USAGE.get(kvKey(key), { type: 'arrayBuffer', cacheTtl: 3600 });

function toB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Las imágenes de referencia de la ficha, listas para el motor. Si falta alguna se sigue sin ella. */
export async function styleImages(env, ficha) {
  const found = await Promise.all((ficha.referencias || []).map((key) => getImage(env, key).catch(() => null)));
  return found.filter(Boolean).map((b) => ({ mime: IMAGE, data: toB64(b) }));
}

/** Valida lo que llega del panel. Devuelve solo los campos de la ficha. */
export function cleanFicha(input) {
  const text = (k) => (typeof input?.[k] === 'string' ? input[k].trim().slice(0, FIELD_MAX) : '');
  const refs = Array.isArray(input?.referencias) ? input.referencias : [];
  const ficha = {
    nombre: text('nombre').slice(0, 60),
    tecnica: text('tecnica'),
    paleta: text('paleta'),
    fondo: text('fondo'),
    extras: text('extras'),
    prohibido: text('prohibido'),
    referencias: [...new Set(refs.filter(isImageKey))].slice(0, MAX_STYLE_REFS),
    miniatura: isImageKey(input?.miniatura) ? input.miniatura : '',
  };
  return ficha;
}

/** Las instrucciones para el motor. El orden de las imágenes es: ejemplos, fases, frame. */
export function promptFor(ficha, examples, phases, extra) {
  const never = [NEVER, ficha.prohibido].filter(Boolean).join('; ');
  return [
    'Redraw the person in the LAST image as an exercise illustration.',
    'Keep exactly the same body pose, limb positions, proportions and framing.',
    `Style: ${ficha.tecnica}.`,
    ficha.paleta && `Colours: ${ficha.paleta}.`,
    `Background: ${ficha.fondo || 'plain white'}.`,
    ficha.extras && `Extras: ${ficha.extras}.`,
    `Do not add: ${never}.`,
    examples && `The first ${examples} image(s) are examples of this drawing style. Copy their technique, line, colour and finish, but never their people, poses, objects or composition.`,
    phases && `The next ${phases} image(s) are previous steps of the same exercise: keep the same character, hair and clothes as them, but take the pose only from the LAST image.`,
    extra && `Extra instructions from the user, to complete what the image shows. Follow them, but never change the pose:\n${extra}`,
  ].filter(Boolean).join('\n');
}
