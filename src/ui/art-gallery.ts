// Dev gallery: preview every troop/building design in ortho, oblique, and HUD-icon sizes.
import { Application } from 'pixi.js';
import type { Registry } from '../data/registry';
import type { ArtDef } from '../data/defs';
import { ShapeSpriteProvider } from '../render/shape-sprite';
import { setProjectionMode } from '../core/projection';
import { el } from './dom';

const TEAM_COLORS = [
  { label: 'Blue', color: '#4f9dff' },
  { label: 'Red', color: '#ff5d5d' },
  { label: 'Green', color: '#5cff8a' },
];

interface GalleryEntry {
  id: string;
  name: string;
  kind: 'unit' | 'building';
  art: ArtDef;
}

export class ArtGallery {
  readonly root = el('div', 'menu-screen art-gallery');
  private pixiHost = el('div', 'art-gallery-pixi-host');
  private grid = el('div', 'art-gallery-grid');
  private app: Application | null = null;
  private provider: ShapeSpriteProvider | null = null;
  private teamColor = TEAM_COLORS[0]!.color;
  private destroyed = false;

  constructor(
    private registry: Registry,
    private onBack: () => void,
  ) {
    const header = el('div', 'art-gallery-header');
    const back = el('button', 'btn', '← Back');
    back.addEventListener('click', () => this.onBack());
    const title = el('h1', 'art-gallery-title', 'Entity Designs');
    const sub = el('p', 'art-gallery-sub', 'Ortho · Oblique · HUD icon — team tint preview');

    const controls = el('div', 'art-gallery-controls');
    const colorLabel = el('span', 'art-gallery-control-label', 'Team color');
    controls.appendChild(colorLabel);
    for (const team of TEAM_COLORS) {
      const btn = el('button', 'btn art-gallery-color-btn');
      btn.type = 'button';
      btn.title = team.label;
      btn.style.backgroundColor = team.color;
      btn.dataset.color = team.color;
      btn.addEventListener('click', () => {
        this.teamColor = team.color;
        for (const b of controls.querySelectorAll<HTMLButtonElement>('.art-gallery-color-btn')) {
          b.classList.toggle('active', b.dataset.color === team.color);
        }
        this.renderGrid();
      });
      if (team.color === this.teamColor) btn.classList.add('active');
      controls.appendChild(btn);
    }

    header.append(back, title, sub, controls);
    this.root.append(this.pixiHost, header, this.grid);
  }

  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: '#0a0a12',
      width: 4,
      height: 4,
      antialias: true,
      resolution: 2,
    });
    this.pixiHost.appendChild(this.app.canvas);
    this.provider = new ShapeSpriteProvider(this.app.renderer);
    this.renderGrid();
  }

  private entries(): GalleryEntry[] {
    const units: GalleryEntry[] = [...this.registry.units.values()]
      .map((u) => ({ id: u.id, name: u.name, kind: 'unit' as const, art: u.art }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const buildings: GalleryEntry[] = [...this.registry.buildings.values()]
      .map((b) => ({ id: b.id, name: b.name, kind: 'building' as const, art: b.art }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...units, ...buildings];
  }

  private canvasFor(mode: 'ortho' | 'oblique' | 'icon', art: ArtDef): HTMLCanvasElement {
    const provider = this.provider!;
    const app = this.app!;
    if (mode === 'icon') {
      return app.renderer.extract.canvas(provider.iconTexture(art, this.teamColor)) as unknown as HTMLCanvasElement;
    }
    setProjectionMode(mode);
    const tex = provider.texture(art, this.teamColor);
    return app.renderer.extract.canvas(tex) as unknown as HTMLCanvasElement;
  }

  private renderGrid(): void {
    if (!this.provider || this.destroyed) return;
    this.provider.clearCache();
    this.grid.replaceChildren();

    let lastKind: 'unit' | 'building' | null = null;
    for (const entry of this.entries()) {
      if (entry.kind !== lastKind) {
        lastKind = entry.kind;
        const heading = el('h2', 'art-gallery-section', lastKind === 'unit' ? 'Troops' : 'Buildings');
        this.grid.appendChild(heading);
      }

      const card = el('div', 'art-gallery-card');
      const meta = el('div', 'art-gallery-meta');
      meta.append(
        el('span', 'art-gallery-name', entry.name),
        el('span', 'art-gallery-id', entry.id),
      );
      const accent = el('span', 'art-gallery-accent');
      accent.style.backgroundColor = entry.art.accent;
      accent.title = `accent ${entry.art.accent}`;
      meta.appendChild(accent);

      const previews = el('div', 'art-gallery-previews');
      for (const [label, mode] of [
        ['Ortho', 'ortho'],
        ['Oblique', 'oblique'],
        ['HUD', 'icon'],
      ] as const) {
        const col = el('div', 'art-gallery-preview');
        col.append(el('span', 'art-gallery-preview-label', label));
        const frame = el('div', `art-gallery-frame art-gallery-frame-${mode}`);
        const canvas = this.canvasFor(mode, entry.art);
        frame.appendChild(canvas);
        col.append(frame);
        previews.appendChild(col);
      }

      card.append(meta, previews);
      this.grid.appendChild(card);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.provider?.clearCache();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.provider = null;
    this.root.remove();
  }
}

/** Open the gallery directly via `?gallery=1` in the URL. */
export function shouldOpenArtGallery(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('gallery') === '1';
}
