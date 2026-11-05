// Qué proveedor atiende a cada motor. Lo usan el servidor público y el botón Probar del panel.
import { callGemini } from './gemini.js';
import { callOpenAI } from './openai.js';

const isOpenAI = (model) => model.startsWith('gpt-');

export const callEngine = (env, model, ...rest) => (isOpenAI(model) ? callOpenAI : callGemini)(env, model, ...rest);

/** El aviso si al panel le falta la clave de ese motor. */
export function missingKey(env, model) {
  if (isOpenAI(model)) return env.OPENAI_KEY ? null : 'Falta guardar la clave de OpenAI en el panel.';
  return env.GEMINI_KEY ? null : 'Falta guardar la clave de Google en el panel.';
}
