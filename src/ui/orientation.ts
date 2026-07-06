// Landscape lock + portrait overlay for the mobile PWA.

let overlay: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.innerHTML =
    '<div class="rotate-card"><div class="rotate-icon">↻</div><p>Rotate your device to landscape</p></div>';
  document.body.appendChild(overlay);
  return overlay;
}

function syncOverlay(): void {
  const el = ensureOverlay();
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  el.classList.toggle('visible', portrait);
}

export function initOrientation(): void {
  syncOverlay();
  window.matchMedia('(orientation: portrait)').addEventListener('change', syncOverlay);
  window.addEventListener('resize', syncOverlay);
  void lockLandscape();
}

export async function lockLandscape(): Promise<void> {
  try {
    const orient = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    await orient.lock?.('landscape');
  } catch {
    // iOS / some browsers only allow lock after a user gesture.
  }
}
