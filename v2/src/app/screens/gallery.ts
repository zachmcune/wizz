// ENTITY DESIGNS GALLERY — every unit at 8 facings and 4 team colours, on the live v2 atlas.
//
// This is the v1 gallery rebuilt on the design system: it fixes v1's layout bug (which pushed content
// under the phone's bottom bar) by using the same tokenised spacing and scroll container as every other
// screen. It also renders live 2.5D previews by pulling the frames straight out of the loaded atlas, so
// what you see is exactly what the game draws.
import type { App } from '../app';
import { badge, button, el, panel, rule } from '../../ui/kit';
import type { TeamId } from '../../render/renderer';
import { TEAM_IDS, teamIdForColor } from '../../render/renderer';

export function mountGallery(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--gallery');
  let team: TeamId = 'blue';
  let zoom = 96;

  const head = el('header', 'page-head');
  const title = el('div', 'col');
  title.append(el('span', 'eyebrow', 'Reference'), el('h1', 'display page-head__title', 'Entity designs'));
  const teams = el('div', 'row');
  const teamLabels: Record<TeamId, string> = { blue: 'Blue', red: 'Red', green: 'Green', gold: 'Gold' };
  for (const t of TEAM_IDS) {
    const b = button({
      size: 'sm',
      variant: t === team ? 'primary' : 'default',
      label: teamLabels[t],
      onClick: () => {
        team = t;
        render();
      },
    });
    b.dataset.team = t;
    teams.append(b);
  }
  const zoomBtns = el('div', 'row');
  for (const z of [64, 96, 128] as const) {
    zoomBtns.append(
      button({
        size: 'sm',
        variant: zoom === z ? 'quiet' : 'default',
        label: `${z}px`,
        onClick: () => {
          zoom = z;
          render();
        },
      }),
    );
  }
  head.append(title, el('div', 'spacer'), el('span', 'eyebrow', 'Team'), teams, el('span', 'eyebrow', 'Size'), zoomBtns, button({ variant: 'quiet', label: 'Back', onClick: () => app.go('menu') }));

  const scroll = el('div', 'gallery-scroll');
  root.append(head, scroll);

  function frameCanvas(unitId: string, teamId: TeamId, facing: number, size: number, isBuilding: boolean): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    c.className = 'gallery-frame';
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const key = isBuilding ? `building/${unitId}/${teamId}/0` : `unit/${unitId}/${teamId}/${facing}`;
    const rect = app.atlas.frames.get(key);
    const tex = app.atlas.textures.get(key);
    if (!rect || !tex) return c;
    const source = (tex.source as unknown as { resource?: CanvasImageSource }).resource;
    if (!source) return c;
    // Draw the atlas sub-rect straight onto a canvas — no image files, no network requests.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size);
    return c;
  }

  function unitRow(id: string, name: string, isBuilding: boolean, facings: number): HTMLElement {
    const row = el('div', 'gallery-row');
    const label = el('div', 'gallery-row__label');
    label.append(el('span', 'gallery-row__name', name), el('span', 'code dim', id));
    row.append(label);
    const strip = el('div', 'gallery-strip');
    for (let f = 0; f < facings; f++) {
      const cell = el('div', 'gallery-cell');
      cell.append(frameCanvas(id, team, f, zoom, isBuilding));
      cell.append(el('span', 'gallery-cell__cap num', isBuilding ? '—' : String(f)));
      strip.append(cell);
    }
    row.append(strip);
    return row;
  }

  function render(): void {
    scroll.replaceChildren();

    const units = el('div', 'col');
    units.append(el('h2', 'eyebrow gallery-h2', `Units · 8 facings · ${teamLabels[team]}`), rule());
    for (const u of app.registry.units.values()) {
      units.append(unitRow(u.id, u.name, false, 8));
    }
    scroll.append(units);

    const buildings = el('div', 'col');
    buildings.append(
      el('h2', 'eyebrow gallery-h2', `Structures · ${teamLabels[team]}`),
      el('p', 'dim gallery-note', 'Structures are static and bake a single facing, so one frame per team.'),
      rule(),
    );
    for (const b of app.registry.buildings.values()) {
      buildings.append(unitRow(b.id, b.name, true, 1));
    }
    // The mana node is a map resource drawn as a structure, so it belongs here too.
    buildings.append(unitRow('mana_node', 'Mana Node', true, 1));
    scroll.append(buildings);

    // Summary line: proves the gallery loaded the real atlas rather than a stub.
    const total = app.atlas.frames.size;
    const summary = panel({ title: 'Atlas', raised: true });
    const teamCount = new Set([...app.atlas.frames.keys()].map((k) => k.split('/')[2])).size;
    summary.body.append(
      el('p', 'muted', `${total} frames loaded · ${teamCount} team variants · ${app.registry.units.size} units · ${app.registry.buildings.size} structures`),
      el('div', 'row', undefined, {}),
    );
    const line = el('div', 'row');
    line.append(badge(`${total} frames`, 'ok'), badge('8 facings'), badge('4 teams'));
    summary.body.append(line);
    scroll.append(summary.root);
  }

  render();

  return {
    root,
    destroy: () => {
      // Canvases are released with the DOM.
    },
  };
}

void teamIdForColor;
