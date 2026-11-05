// Tema y logotipo. Van aparte y sin módulos para aplicarse antes de pintar, sin parpadeo.
// auto (por defecto): sigue a Windows. La elección se guarda en este ordenador.
(() => {
  const KEY = 'jr-theme';
  const LOGO_KEY = 'jr-logo';
  const LOGOS = 11;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const chosen = () => {
    try {
      return localStorage.getItem(KEY) || 'auto';
    } catch {
      return 'auto';
    }
  };
  const apply = () => {
    const t = chosen();
    document.documentElement.dataset.theme = t === 'auto' ? (system.matches ? 'dark' : 'light') : t;
  };
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  document.documentElement.dataset.logo = read(LOGO_KEY) || '1';
  // Cargados de antemano: si no, el primer clic deja un instante la cabecera sin logotipo.
  addEventListener('load', () => {
    for (let n = 2; n <= LOGOS; n++) new Image().src = `/logo-texto-${n}.png`;
  });
  system.addEventListener('change', apply);
  apply();
  window.appTheme = {
    get: chosen,
    set(id) {
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* solo esta vez */
      }
      apply();
    },
    toggleLogo() {
      const next = String((Number(document.documentElement.dataset.logo) % LOGOS) + 1);
      document.documentElement.dataset.logo = next;
      try {
        localStorage.setItem(LOGO_KEY, next);
      } catch {
        /* solo esta vez */
      }
    },
  };
})();
