// Keeps CSS layout in sync with the mobile browser chrome (URL bar, safe areas).
export function initViewport(): void {
  const apply = (): void => {
    const vv = window.visualViewport;
    const h = vv?.height ?? window.innerHeight;
    const w = vv?.width ?? window.innerWidth;
    const root = document.documentElement;
    root.style.setProperty('--app-h', `${h}px`);
    root.style.setProperty('--app-w', `${w}px`);
    root.style.setProperty('--vv-top', `${vv?.offsetTop ?? 0}px`);
    // Short landscape phones and typical mobile landscape widths.
    root.classList.toggle('compact-ui', h < 460 || w < 820);
  };

  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 200));
}
