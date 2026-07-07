// Vertical zoom control on the left edge of the screen (replaces pinch-to-zoom).
import { MIN_ZOOM, MAX_ZOOM } from '../core/constants';
import type { Camera } from '../render/camera';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function zoomToRatio(zoom: number): number {
  return (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
}

function ratioToZoom(ratio: number): number {
  return MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM);
}

export class ZoomSlider {
  readonly root = el('div', 'zoom-slider');
  private track = el('div', 'zoom-slider-track');
  private thumb = el('div', 'zoom-slider-thumb');
  private dragging = false;

  constructor(private camera: Camera) {
    const minus = el('button', 'zoom-slider-btn');
    minus.type = 'button';
    minus.textContent = '−';
    minus.title = 'Zoom out';
    const plus = el('button', 'zoom-slider-btn');
    plus.type = 'button';
    plus.textContent = '+';
    plus.title = 'Zoom in';

    minus.addEventListener('click', () => this.setZoom(this.camera.zoom / 1.15));
    plus.addEventListener('click', () => this.setZoom(this.camera.zoom * 1.15));

    this.track.append(this.thumb);
    this.track.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.thumb.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPointerDown(e);
    });

    this.root.append(plus, this.track, minus);
    this.syncThumb();
  }

  private onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.track.setPointerCapture(e.pointerId);
    this.setZoomFromClientY(e.clientY);
    const move = (ev: PointerEvent) => {
      if (this.dragging) this.setZoomFromClientY(ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      this.dragging = false;
      this.track.releasePointerCapture(ev.pointerId);
      this.track.removeEventListener('pointermove', move);
      this.track.removeEventListener('pointerup', up);
      this.track.removeEventListener('pointercancel', up);
    };
    this.track.addEventListener('pointermove', move);
    this.track.addEventListener('pointerup', up);
    this.track.addEventListener('pointercancel', up);
  }

  private setZoomFromClientY(clientY: number): void {
    const rect = this.track.getBoundingClientRect();
    const ratio = 1 - (clientY - rect.top) / rect.height;
    this.setZoom(ratioToZoom(Math.max(0, Math.min(1, ratio))));
  }

  private setZoom(zoom: number): void {
    this.camera.setZoom(zoom);
    this.syncThumb();
  }

  private syncThumb(): void {
    const ratio = zoomToRatio(this.camera.zoom);
    this.thumb.style.bottom = `calc(${ratio * 100}% - 10px)`;
  }

  /** Keep the thumb in sync if zoom changes elsewhere (e.g. resize clamp). */
  syncFromCamera(): void {
    this.syncThumb();
  }
}
