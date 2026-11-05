// El panel es un Worker aparte del servidor público: Cloudflare Access lo protege entero y lo
// único que comparten es la base de datos. Ver PANEL.md.
import { handleAdmin } from './admin.js';
import { LIMITS, MODELS, COSTS } from './catalog.js';

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect(`${url.origin}/admin`, 302);
    return handleAdmin(request, env, { LIMITS, MODELS, COSTS }, ctx);
  },
};
