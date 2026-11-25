// UI MOCKUPS — the three core screens, built from the kit and nothing else.
//
// These are CODE-BUILT, not screenshots and not images. Each function returns real DOM composed from
// `kit.ts`, so what the proof page renders is the actual UI, and a style regression would show up in
// the proof rather than being hidden behind a picture.
//
// They are deliberately static: no simulation, no data binding. The job here is to prove the visual
// system holds up at four viewport sizes across the three screen types, before Phase 4 builds them for
// real.
import { badge, button, el, gauge, iconEl, kbd, panel, resource, rule, tabs, teamChip } from './ui/kit';
import type { IconName } from './ui/icons';

/** Shared: a full-screen root. */
function screen(cls: string): HTMLElement {
  return el('div', `mock ${cls}`);
}

// ───────────────────────────────────────────────────────────────────────────── HUD

/**
 * In-match HUD.
 *
 * Layout logic: the battlefield is the content, so the HUD hugs the edges and leaves the centre clear.
 * Top bar carries the resource readouts, the left column carries the selected-unit panel, the bottom
 * bar carries the command grid — the same three-zone arrangement classic RTS HUDs converged on, because
 * it keeps every command within one thumb-reach of the right hand on a landscape phone.
 */
export function mockHud(): HTMLElement {
  const root = screen('mock--hud');

  // ---- top bar
  const top = el('div', 'hud__top plate');
  const resGroup = el('div', 'row');
  resGroup.append(
    resource('mana', '1 240', 'Mana'),
    rule(true),
    resource('supply', '18 / 30', 'Units'),
    rule(true),
    resource('power', '84', 'Power'),
  );
  const rightGroup = el('div', 'row');
  rightGroup.append(
    el('span', 'badge', '15:42'),
    button({ variant: 'quiet', icon: 'volume', label: 'Sound', iconOnly: true, size: 'sm' }),
    button({ variant: 'quiet', icon: 'gear', label: 'Settings', iconOnly: true, size: 'sm' }),
  );
  top.append(resGroup, el('div', 'spacer'), rightGroup);

  // ---- minimap
  const minimap = panel({ title: 'Field', accent: true, className: 'hud__minimap' });
  const mm = el('div', 'mock-minimap');
  for (let i = 0; i < 36; i++) mm.append(el('span', 'mock-minimap__cell'));
  minimap.body.append(mm);

  // ---- selection panel
  const sel = panel({ eyebrow: 'Selected', title: 'Stone Golem', accent: true, className: 'hud__selection' });
  const portrait = el('div', 'mock-portrait');
  portrait.append(iconEl('armour', 34, 'mock-portrait__glyph'));
  sel.body.append(portrait);
  const stats = el('div', 'col');
  const statRow = (ic: IconName, label: string, value: string): HTMLElement => {
    const r = el('div', 'row row--between');
    const l = el('div', 'row');
    l.append(iconEl(ic, 13, 'icon dim'), el('span', 'dim', label));
    r.append(l, el('span', 'num', value));
    return r;
  };
  stats.append(statRow('attack', 'Attack', '42'), statRow('armour', 'Armour', '18'), statRow('speed', 'Speed', '42'), rule());
  const hpRow = el('div', 'col');
  hpRow.style.gap = 'var(--space-2)';
  hpRow.append(el('span', 'eyebrow', 'Health'), gauge({ value: 0.72, variant: 'hp', label: 'Health' }));
  stats.append(hpRow);
  sel.body.append(stats);

  // ---- command grid
  const cmd = el('div', 'hud__cmd plate');
  const cmds: { icon: IconName; label: string; primary?: boolean }[] = [
    { icon: 'move', label: 'Move', primary: true },
    { icon: 'attack', label: 'Attack' },
    { icon: 'stop', label: 'Stop' },
    { icon: 'hold', label: 'Hold' },
    { icon: 'build', label: 'Build' },
    { icon: 'train', label: 'Train' },
  ];
  for (const c of cmds) cmd.append(button({ icon: c.icon, label: c.label, variant: c.primary ? 'primary' : 'default', block: true }));

  root.append(top, minimap.root, sel.root, cmd);

  const zoom = el('div', 'hud__zoom');
  zoom.append(
    button({ icon: 'zoom-out', label: 'Zoom out', iconOnly: true, size: 'sm' }),
    button({ icon: 'zoom-in', label: 'Zoom in', iconOnly: true, size: 'sm' }),
  );
  root.append(zoom);

  const hint = el('div', 'hud__hint');
  hint.append(el('span', 'dim', 'Pan'), kbd('WASD'), el('span', 'dim', 'Zoom'), kbd('+ / -'));
  root.append(hint);

  return root;
}

// ───────────────────────────────────────────────────────────────────────────── LOBBY

/**
 * Skirmish lobby.
 *
 * Layout logic: the left column is who you are and who you are playing; the right column is the match
 * configuration. The Start control is pinned bottom-right so it never moves as settings change, which
 * is the mistake the v1 lobby made (its Start button jumped when a faction was picked).
 */
export function mockLobby(): HTMLElement {
  const root = screen('mock--lobby');

  const head = el('header', 'page-head');
  const titleBlock = el('div', 'col');
  titleBlock.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Skirmish'));
  head.append(titleBlock, el('div', 'spacer'), el('span', 'badge', 'Local match'));

  const grid = el('div', 'lobby');

  // ---- players
  const players = panel({ title: 'Players', eyebrow: '2 of 4', accent: true, className: 'lobby__players' });
  const rows = el('div', 'col');
  rows.style.gap = 'var(--space-3)';
  rows.append(teamChip('You', 'blue', 'Arcane Dominion'), teamChip('Rival', 'red', 'Arcane Dominion'));
  players.body.append(rows, rule());
  const addRow = el('div', 'row');
  addRow.append(button({ variant: 'quiet', icon: 'train', label: 'Add AI', size: 'sm' }));
  players.body.append(addRow);

  // ---- settings
  const cfg = panel({ title: 'Match settings', className: 'lobby__settings' });
  cfg.body.append(tabs([{ id: 'map', label: 'Map' }, { id: 'rules', label: 'Rules' }, { id: 'adv', label: 'Advanced' }], 'map'));

  const field = (label: string, control: HTMLElement): HTMLElement => {
    const f = el('div', 'col');
    f.style.gap = 'var(--space-2)';
    f.append(el('span', 'eyebrow', label), control);
    return f;
  };

  const mapRow = el('div', 'mock-maplist');
  for (const [name, note, on] of [
    ['Duel Glade', '2 players · open centre', true],
    ['Ember Reach', '4 players · cliff lanes', false],
    ['Frost Hollow', '2 players · narrow passes', false],
  ] as const) {
    const card = el('button', `mock-mapcard${on ? ' is-on' : ''}`, undefined, { type: 'button' });
    card.append(el('span', 'mock-mapcard__name', name), el('span', 'mock-mapcard__note', note));
    if (on) card.append(badge('Selected', 'ok'));
    mapRow.append(card);
  }

  const diffRow = el('div', 'row row--between');
  const diff = el('div', 'row');
  for (const [d, on] of [
    ['Gentle', false],
    ['Fair', true],
    ['Stern', false],
  ] as const) {
    diff.append(button({ variant: on ? 'primary' : 'default', label: d, size: 'sm' }));
  }
  diffRow.append(el('span', 'dim', 'AI difficulty'), diff);

  const speedRow = el('div', 'row row--between');
  speedRow.append(el('span', 'dim', 'Game speed'), el('span', 'num', '1.0x'));

  cfg.body.append(field('Map', mapRow), rule(), field('Difficulty', diffRow), rule(), field('Speed', speedRow));

  grid.append(players.root, cfg.root);

  const foot = el('footer', 'lobby__foot');
  foot.append(
    button({ variant: 'quiet', label: 'Back' }),
    el('div', 'spacer'),
    button({ variant: 'primary', icon: 'flag', label: 'Start match', size: 'lg' }),
  );

  root.append(head, grid, foot);
  return root;
}

// ───────────────────────────────────────────────────────────────────────────── MAIN MENU

/**
 * Main menu.
 *
 * Layout logic: a title block on the left with the primary action stack beneath it, and an abstract
 * plate composition filling the right. On a phone the two columns collapse and the actions become
 * full-width. The right-hand art is pure CSS geometry — no image asset.
 */
export function mockMainMenu(): HTMLElement {
  const root = screen('mock--menu');

  const left = el('div', 'menu__left');
  left.append(
    el('span', 'eyebrow', 'A 2.5D fantasy RTS'),
    el('h1', 'display menu__title', 'Arcane Dominion'),
    el('p', 'menu__blurb muted', 'Two archmages, one shattered ley-line. Summon, build, and take the field.'),
  );

  const actions = el('div', 'menu__actions');
  actions.append(
    button({ variant: 'primary', label: 'Skirmish', size: 'lg', icon: 'sword', block: true }),
    button({ label: 'Sandbox', size: 'lg', icon: 'grid', block: true }),
    button({ label: 'Settings', size: 'lg', icon: 'gear', block: true }),
  );
  left.append(actions);

  const meta = el('div', 'menu__meta row');
  meta.append(el('span', 'dim', 'v2 rebuild'), rule(true), el('span', 'dim', 'Keyboard + touch'));
  left.append(meta);

  const art = el('div', 'menu__art');
  for (let i = 0; i < 5; i++) art.append(el('div', `menu__shard menu__shard--${i}`));
  art.append(iconEl('crystal', 96, 'menu__sigil'));

  root.append(left, art);
  return root;
}
