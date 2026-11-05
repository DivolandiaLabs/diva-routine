// Motores y cuotas: lo comparten el servidor público y el panel.
export const LIMITS = { week: 60, month: 150, year: 1200 };
// Créditos que gasta cada viñeta: lo que cuesta cada motor respecto al recomendado.
export const MODELS = { 'gemini-nano-banana-2.1': 1, 'gemini-3.1-flash-image': 2, 'gemini-3-pro-image': 4, 'gpt-image-2': 2 };
// Lo que cobra el proveedor por imagen, en dólares: solo para estimar el gasto en el panel.
// OpenAI cobra por tokens, así que su cifra es aproximada: ajústala con las primeras facturas.
export const COSTS = { 'gemini-nano-banana-2.1': 0.0336, 'gemini-3.1-flash-image': 0.067, 'gemini-3-pro-image': 0.134, 'gpt-image-2': 0.06 };
// Nombre que ve la gente en la app.
export const LABELS = { 'gemini-nano-banana-2.1': 'Nano Banana 2.1 (recomendado)', 'gemini-3.1-flash-image': 'Nano Banana 2', 'gemini-3-pro-image': 'Nano Banana Pro', 'gpt-image-2': 'GPT Image 2' };
// Nacen apagados: la app no los enseña hasta encenderlos en el panel.
export const START_OFF = new Set(['gpt-image-2']);
