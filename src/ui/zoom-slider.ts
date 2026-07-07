// Vertical zoom control on the left edge of the screen (replaces pinch-to-zoom).
import { MIN_ZOOM, MAX_ZOOM } from '../core/constants';
import type { Camera } from '../render/camera';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export class ZoomSlider {
  readonly root = el('div', 'zoom-slider');
  private input = el('input', 'zoom-slider-input') as HTMLInputElement;
  private syncing = false;

  constructor(private camera: Camera) {
    this.input.type = 'range';
    this.input.min = String(MIN_ZOOM);
    this.input.max = String(MAX_ZOOM);
    this.input.step = '0.02';
    this.input.value = String(camera.zoom);
    this.input.setAttribute('orient', 'vertical');
    this.input.title = 'Zoom';

    const minus = el('button', 'zoom-slider-btn');
    minus.textContent = '−';
    minus.title = 'Zoom out';
    const plus = el('button', 'zoom-slider-btn');
    plus.textContent = '+';
    plus.title = 'Zoom in';

    minus.addEventListener('click', () => this.setZoom(camera.zoom / 1.15));
    plus.addEventListener('click', () => this.setZoom(camera.zoom * 1.15));
    this.input.addEventListener('input', () => this.setZoom(parseFloat(this.input.value)));

    this.root.append(plus, this.input, minus);
  }

  private setZoom(zoom: number): void {
    this.camera.setZoom(zoom);
    this.syncing = true;
    this.input.value = String(this.camera.zoom);
    this.syncing = false;
  }

  /** Keep the thumb in sync if zoom changes elsewhere (e.g. resize clamp). */
  syncFromCamera(): void {
    if (this.syncing) return;
    const z = this.camera.zoom;
    if (this.input.value !== String(z)) this.input.value = String(z);
  }
}
