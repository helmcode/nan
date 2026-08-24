/* Pestañas del informe de la encuesta: los datos y el roadmap.
 *
 * Sin JavaScript los dos paneles quedan visibles uno tras otro (el `hidden` lo
 * pone este script, no el marcado), así que la página se lee entera igual.
 *
 * El hash de la URL selecciona pestaña (`/survey#roadmap`) y se actualiza al
 * cambiarla, para poder compartir el enlace apuntando a lo que quieres que se
 * lea. Va con replaceState: mover pestaña no es navegar, y no debería llenar
 * el botón de atrás. */
export function initSurveyTabs() {
  const list = document.querySelector<HTMLElement>('[data-survey-tabs]');
  if (!list) return;

  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length < 2) return;

  const panelOf = (tab: HTMLButtonElement) =>
    document.getElementById(tab.getAttribute('aria-controls') ?? '');

  const select = (tab: HTMLButtonElement, opts: { focus?: boolean; hash?: boolean } = {}) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const panel = panelOf(t);
      if (panel) panel.hidden = !on;
    }
    if (opts.focus) tab.focus();
    if (opts.hash) {
      const name = tab.dataset.tab;
      if (name) history.replaceState(null, '', `${location.pathname}#${name}`);
    }
  };

  // Estado inicial: lo que pida el hash, y si no la primera pestaña.
  const wanted = tabs.find((t) => t.dataset.tab === location.hash.slice(1));
  select(wanted ?? tabs[0]);

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      select(tab, { hash: true });
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
      select(tabs[(i + step) % tabs.length], { focus: true, hash: true });
    });
  });
}
