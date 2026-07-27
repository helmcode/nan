/* Reveal al entrar en viewport. [data-reveal] = un bloque; [data-reveal-stagger]
   = contenedor cuyos hijos aparecen en cascada. Respeta prefers-reduced-motion. */
export function initReveal() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const single = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal-stagger]'));

  if (reduce) {
    single.forEach((el) => el.classList.add('is-in'));
    groups.forEach((g) => Array.from(g.children).forEach((c) => c.classList.add('is-in')));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        if (el.hasAttribute('data-reveal-stagger')) {
          Array.from(el.children).forEach((c, i) => {
            (c as HTMLElement).style.transitionDelay = `${Math.min(i * 60, 480)}ms`;
            c.classList.add('is-in');
          });
        } else {
          el.classList.add('is-in');
        }
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  single.forEach((el) => io.observe(el));
  groups.forEach((g) => io.observe(g));
}
