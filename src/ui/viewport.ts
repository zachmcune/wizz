// Short landscape phones and typical mobile landscape widths. CSS keys off `.compact-ui`.
export const COMPACT_UI_MAX_HEIGHT = 460;
export const COMPACT_UI_MAX_WIDTH = 820;

export function isCompactUiSize(width: number, height: number): boolean {
  return height < COMPACT_UI_MAX_HEIGHT || width < COMPACT_UI_MAX_WIDTH;
}

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
    root.classList.toggle('compact-ui', isCompactUiSize(w, h));
  };

  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 200));
}
