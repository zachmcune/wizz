// ART GALLERY.
//
// A review page for the illustrated sprite set: every unit at all 8 facings in all 4 team colours,
// and every building in all 4 team colours, at close-up size. This is the artifact used to judge and
// prove art quality — the in-game view is too small to evaluate a sprite.
//
// It renders by compositing the atlas textures into <canvas> elements with nearest-neighbour scaling
// OFF, so what you see is exactly the atlas pixels (not a re-render of the 3D source).

import './styles/boot.css';
import './styles/gallery.css';
import { loadAtlas, type LoadedAtlas } from './render/atlas';
import { loadRegistry } from './data/loader';
import { TEAM_RAMP } from '../art/palette';

const UNIT_IDS = [
  'wisp', 'imp_swarmling', 'arcane_archer', 'rift_familiar', 'stone_golem',
  'siege_behemoth', 'storm_caster', 'rift_skimmer', 'mana_weaver', 'waystone_wagon',
  'thornling', 'grove_warden', 'cinder_acolyte', 'obsidian_siege',
];
const BUILDING_IDS = [
  'sanctum', 'attunement_spire', 'resonance_vault', 'ley_conduit', 'summoning_circle',
  'golem_forge', 'arcane_nexus', 'astral_spire', 'scrying_obelisk', 'arcane_sentry',
  'frost_spire', 'inferno_beacon', 'storm_conductor', 'celestial_cannon', 'sanctuary_spire',
  'arcane_bunker', 'stone_wall', 'arcane_gate', 'waystone_camp', 'thorn_grove', 'obsidian_bastion',
];

/** Draw one atlas frame into a canvas at `size`, preserving alpha. */
function frameCanvas(atlas: LoadedAtlas, key: string, size: number, bg = 'transparent'): HTMLCanvasElement {
  const tex = atlas.textures.get(key);
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  if (bg !== 'transparent') {
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
  }
  if (!tex) {
    g.fillStyle = '#ff3b3b';
    g.fillRect(size / 2 - 2, size / 2 - 12, 4, 24);
    g.fillRect(size / 2 - 12, size / 2 - 2, 24, 4);
    return cv;
  }
  const src = tex.source.resource as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  const fr = tex.frame;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src as CanvasImageSource, fr.x, fr.y, fr.width, fr.height, 0, 0, size, size);
  return cv;
}

function heading(text: string, sub?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gal-heading';
  const h = document.createElement('h2');
  h.textContent = text;
  wrap.appendChild(h);
  if (sub) {
    const p = document.createElement('p');
    p.textContent = sub;
    wrap.appendChild(p);
  }
  return wrap;
}

function card(title: string, note: string): HTMLElement {
  const c = document.createElement('div');
  c.className = 'gal-card';
  const t = document.createElement('div');
  t.className = 'gal-title';
  t.textContent = title;
  const n = document.createElement('div');
  n.className = 'gal-note';
  n.textContent = note;
  c.append(t, n);
  return c;
}

async function main(): Promise<void> {
  const host = document.getElementById('gallery');
  if (!host) return;
  const [atlas, registry] = await Promise.all([loadAtlas('/atlas/'), Promise.resolve(loadRegistry())]);
  host.replaceChildren();

  const header = document.createElement('header');
  header.className = 'gal-header';
  const h1 = document.createElement('h1');
  h1.textContent = 'Arcane Dominion v2 — Illustrated Art';
  const sub = document.createElement('p');
  sub.textContent =
    `${UNIT_IDS.length} units (8 facings × 4 team colours) · ${BUILDING_IDS.length} buildings (4 team colours) · ` +
    `baked atlas: ${atlas.textures.size} frames`;
  header.append(h1, sub);
  host.appendChild(header);

  // ---- 1. FACING SHEETS: every unit, 8 facings, in the blue team.
  host.appendChild(
    heading(
      'Unit facings',
      'All 8 baked yaw angles per unit, in team blue, at close-up size. The silhouette must change as a unit turns — this is the check that v1 (which rotated one drawing) always failed.',
    ),
  );
  const facingWrap = document.createElement('div');
  facingWrap.className = 'gal-facings';
  for (const id of UNIT_IDS) {
    const row = card(registry.units.get(id)?.name ?? id, id);
    const strip = document.createElement('div');
    strip.className = 'gal-strip';
    for (let f = 0; f < 8; f++) {
      const cell = document.createElement('div');
      cell.className = 'gal-cell';
      cell.appendChild(frameCanvas(atlas, `unit/${id}/blue/${f}`, 96, '#151228'));
      const lab = document.createElement('span');
      lab.textContent = `${f}`;
      cell.appendChild(lab);
      strip.appendChild(cell);
    }
    row.appendChild(strip);
    facingWrap.appendChild(row);
  }
  host.appendChild(facingWrap);

  // ---- 2. TEAM COLOURS: each unit at facing 2, four team colours side by side.
  host.appendChild(
    heading(
      'Team colours',
      'Facing 2 in each of the four baked team colours. Note that only the accents change — stone stays stone, wood stays wood. That is the mask-layer difference from v1\'s whole-sprite tint.',
    ),
  );
  const teamWrap = document.createElement('div');
  teamWrap.className = 'gal-teams';
  for (const id of UNIT_IDS) {
    const row = card(registry.units.get(id)?.name ?? id, id);
    const strip = document.createElement('div');
    strip.className = 'gal-strip';
    for (const team of TEAM_RAMP) {
      const cell = document.createElement('div');
      cell.className = 'gal-cell';
      cell.appendChild(frameCanvas(atlas, `unit/${id}/${team.id}/2`, 88, '#151228'));
      const lab = document.createElement('span');
      lab.textContent = team.id;
      cell.appendChild(lab);
      strip.appendChild(cell);
    }
    row.appendChild(strip);
    teamWrap.appendChild(row);
  }
  host.appendChild(teamWrap);

  // ---- 3. BUILDINGS in all four team colours.
  host.appendChild(
    heading('Buildings', 'Every structure in all four team colours, at close-up size.'),
  );
  const bWrap = document.createElement('div');
  bWrap.className = 'gal-buildings';
  for (const id of BUILDING_IDS) {
    const row = card(registry.buildings.get(id)?.name ?? id, id);
    const strip = document.createElement('div');
    strip.className = 'gal-strip';
    for (const team of TEAM_RAMP) {
      const cell = document.createElement('div');
      cell.className = 'gal-cell';
      cell.appendChild(frameCanvas(atlas, `building/${id}/${team.id}/0`, 148, '#151228'));
      const lab = document.createElement('span');
      lab.textContent = team.id;
      cell.appendChild(lab);
      strip.appendChild(cell);
    }
    row.appendChild(strip);
    bWrap.appendChild(row);
  }
  host.appendChild(bWrap);

  // ---- 4. SILHOUETTE SHEET: all units at 40 px, which is the real on-screen size at phone zoom.
  host.appendChild(
    heading(
      'Silhouette check at 40 px',
      'All 14 units drawn at 40 px — roughly their size on a 667×375 phone at minimum zoom. If a unit is not identifiable at this size, its silhouette needs work.',
    ),
  );
  const sil = document.createElement('div');
  sil.className = 'gal-silhouettes';
  for (const id of UNIT_IDS) {
    const cell = document.createElement('div');
    cell.className = 'gal-cell';
    cell.appendChild(frameCanvas(atlas, `unit/${id}/blue/2`, 40, '#151228'));
    const lab = document.createElement('span');
    lab.textContent = id.replace(/_/g, ' ');
    cell.appendChild(lab);
    sil.appendChild(cell);
  }
  host.appendChild(sil);

  // Expose counts for the proof harness to assert against.
  (window as unknown as { __gallery?: unknown }).__gallery = {
    units: UNIT_IDS.length,
    buildings: BUILDING_IDS.length,
    frames: atlas.textures.size,
    teams: TEAM_RAMP.length,
  };
}

main().catch((err) => {
  const host = document.getElementById('gallery');
  if (host) host.textContent = `Gallery failed: ${String(err)}`;
});
