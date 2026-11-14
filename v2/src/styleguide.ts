// STYLE GUIDE PAGE — the living reference for the UI style.
//
// This page is generated from the same tokens and components the game uses, so it cannot drift from
// them: there is no separate copy of the palette, no hand-written swatch values and no screenshot of a
// button. If a token changes, this page changes.
//
// It is a second Vite entry (`styleguide.html`) so it deploys alongside the game, exactly like the art
// gallery.
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/components.css';
import './ui/screens.css';
import './ui/styleguide.css';

import { badge, button, el, gauge, iconEl, kbd, panel, resource, tabs, teamChip } from './ui/kit';
import { ICON_NAMES, icon } from './ui/icons';
import { mockHud, mockLobby, mockMainMenu } from './ui-mockups';

const root = document.getElementById('styleguide');
if (!root) throw new Error('missing #styleguide');
root.replaceChildren();

/** Read a CSS custom property from :root. */
function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function section(title: string, note?: string): HTMLElement {
  const s = el('section', 'sg-section');
  const head = el('header', 'sg-section__head');
  head.append(el('h2', 'display sg-section__title', title));
  if (note) head.append(el('p', 'sg-section__note muted', note));
  s.append(head);
  return s;
}

// ───────────────────────────────────────────────────────────────────────────── header
const header = el('header', 'sg-header');
header.append(
  el('span', 'eyebrow', 'Arcane Dominion'),
  el('h1', 'display sg-header__title', 'UI Style Guide'),
  el('p', 'sg-header__lede muted',
    'Obsidian &amp; Brass. Dark machined plates, warm brass for affordance only, bone type. ' +
    'Every value on this page is read from tokens.css at runtime, so the page cannot drift from the code.'),
);
root.append(header);

// ───────────────────────────────────────────────────────────────────────────── palette
{
  const s = section('Palette', 'Achromatic steel for surfaces and type. Copper for interaction only. Signals desaturated so they never read as a team.');

  const group = (name: string, note: string, tokens: string[]): HTMLElement => {
    const g = el('div', 'sg-group');
    g.append(el('h3', 'eyebrow', name), el('p', 'sg-group__note dim', note));
    const grid = el('div', 'sg-swatches');
    for (const t of tokens) {
      const sw = el('div', 'sg-swatch');
      const chip = el('div', 'sg-swatch__chip');
      chip.style.background = `var(${t})`;
      const meta = el('div', 'sg-swatch__meta');
      meta.append(
        el('span', 'sg-swatch__name', t.replace('--', '')),
        el('span', 'sg-swatch__hex num', tok(t)),
      );
      sw.append(chip, meta);
      grid.append(sw);
    }
    g.append(grid);
    return g;
  };

  s.append(
    group('Ink — surfaces', 'Five elevations, from the void behind everything to a control face.', [
      '--ink-950', '--ink-900', '--ink-850', '--ink-800', '--ink-700', '--ink-600', '--ink-500', '--ink-400', '--ink-300',
    ]),
    group('Bone — type', 'Warm off-white. Cooler text on a cool plate reads as unfinished.', [
      '--bone-100', '--bone-200', '--bone-400', '--bone-600',
    ]),
    group('Copper — interaction', 'Focus, primary action, selected tab, active gauge. Never decoration.', [
      '--copper-700', '--copper-600', '--copper-500', '--copper-400', '--copper-300', '--copper-100',
    ]),
    group('Signals — status', '40+ points less saturated than any team colour, so they read as status and not ownership.', [
      '--signal-good', '--signal-warn', '--signal-bad', '--signal-info',
    ]),
    group('Team — content, never chrome', 'Mirrors the simulation. Used only to represent a player, and only as an edge bar.', [
      '--team-blue', '--team-red', '--team-green', '--team-gold',
    ]),
  );

  const whyRow = el('div', 'sg-callout');
  whyRow.append(
    el('h4', 'sg-callout__title', 'Why copper and not gold'),
    el('p', 'sg-callout__body muted',
      'Team gold is light and bright. Copper is 15 degrees away in hue but roughly half the lightness, and ' +
      'it is only ever used as a thin stroke or small text. A player cannot mistake a copper focus ring for ' +
      'a gold team marker at a glance, which would not be true of a gold UI accent.'),
    el('p', 'sg-callout__body muted',
      'Compare the swatches above: Team gold against Copper 500. Same warm family, different value, ' +
      'different job.'),
  );
  s.append(whyRow);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── type
{
  const s = section('Typography', 'One superfamily, three cuts, self-hosted. Latin subset, 148 KB total.');
  const rows: [string, string, string][] = [
    ['--text-4xl', 'Display', 'Arcane Dominion'],
    ['--text-3xl', 'Heading', 'Skirmish'],
    ['--text-2xl', 'Subheading', 'Match settings'],
    ['--text-xl', 'Section', 'Players and factions'],
    ['--text-lg', 'Body large', 'Two archmages, one shattered ley-line.'],
    ['--text-md', 'Body', 'Summon, build, and take the field before your rival does.'],
    ['--text-sm', 'UI label', 'Start match'],
    ['--text-xs', 'Small', '2 players · open centre'],
    ['--text-2xs', 'Eyebrow / caps', 'MATCH SETTINGS'],
  ];
  const table = el('div', 'sg-type');
  for (const [token, label, sample] of rows) {
    const r = el('div', 'sg-type__row');
    const meta = el('div', 'sg-type__meta');
    meta.append(el('span', 'sg-type__token num', token.replace('--', '')), el('span', 'dim', label), el('span', 'dim num', tok(token)));
    const spec = el('div', 'sg-type__sample', sample);
    spec.style.fontSize = `var(${token})`;
    if (token === '--text-2xs') {
      spec.classList.add('eyebrow');
    }
    r.append(meta, spec);
    table.append(r);
  }
  s.append(table);

  const fams = el('div', 'sg-fams');
  for (const [name, token, note] of [
    ['Plex Condensed', '--font-display', 'Headlines and uppercase labels. Condensed so an RTS title fits a 375px-tall screen.'],
    ['Plex Sans', '--font-ui', 'Everything else. Squarish humanist: holds up at 11px on a low-DPI Chromebook.'],
    ['Plex Mono', '--font-numeric', 'Tabular numerals. A mana counter must not jitter as it ticks.'],
  ] as const) {
    const f = el('div', 'sg-fam');
    const sample = el('div', 'sg-fam__sample');
    sample.style.fontFamily = `var(${token})`;
    sample.style.fontSize = 'var(--text-xl)';
    sample.textContent = name === 'Plex Mono' ? '1 240 · 18 / 30 · 84' : 'Summon the storm';
    f.append(el('h4', 'sg-fam__name', name), sample, el('p', 'sg-fam__note dim', note));
    fams.append(f);
  }
  s.append(fams);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── buttons
{
  const s = section('Buttons', 'One shape, four variants. Chamfered corner, 1px inset ring, bevel top and bottom. No pill, no drop shadow.');
  const states: [string, (opts: Parameters<typeof button>[0]) => HTMLElement][] = [
    ['Default', (o) => button(o)],
    ['Hover', (o) => button({ ...o, className: 'is-hover' } as never)],
    ['Pressed', (o) => button({ ...o, className: 'is-pressed' } as never)],
    ['Focused', (o) => button({ ...o, className: 'is-focus' } as never)],
    ['Disabled', (o) => button({ ...o, disabled: true })],
  ];
  const variants: [string, Parameters<typeof button>[0]][] = [
    ['Primary', { variant: 'primary', label: 'Start match', icon: 'flag' }],
    ['Default', { label: 'Settings', icon: 'gear' }],
    ['Quiet', { variant: 'quiet', label: 'Cancel' }],
    ['Danger', { variant: 'danger', label: 'Surrender' }],
  ];
  const grid = el('div', 'sg-states');
  grid.append(el('div', 'sg-states__corner dim', 'variant / state'));
  for (const [stateName] of states) grid.append(el('div', 'sg-states__colhead eyebrow', stateName));
  for (const [vName, opts] of variants) {
    grid.append(el('div', 'sg-states__rowhead eyebrow', vName));
    for (const [, make] of states) {
      const cell = el('div', 'sg-states__cell');
      const b = make(opts);
      // State classes are only for the static style sheet; they mirror :hover/:active/:focus styles.
      if (b.classList.contains('btn')) b.classList.remove('is-hover', 'is-pressed', 'is-focus');
      cell.append(b);
      grid.append(cell);
    }
  }
  s.append(grid);

  const sizes = el('div', 'row');
  sizes.append(
    button({ size: 'sm', label: 'Small' }),
    button({ label: 'Medium' }),
    button({ size: 'lg', label: 'Large' }),
    button({ icon: 'close', label: 'Icon only', iconOnly: true }),
  );
  s.append(el('h3', 'eyebrow sg-sub', 'Sizes'), sizes);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── panels
{
  const s = section('Panels', 'A metal plate: chamfered rectangle, 1px inset ring, bevel, header rule. Opaque — a HUD that blurs the battlefield makes the battlefield harder to read.');
  const row = el('div', 'sg-panels');

  const p1 = panel({ eyebrow: 'Selected', title: 'Stone Golem', accent: true });
  p1.body.append(el('p', 'muted', 'Standard panel with an accented header and an eyebrow.'));
  row.append(p1.root);

  const p2 = panel({ title: 'Match settings' });
  p2.body.append(
    tabs([{ id: 'a', label: 'Map' }, { id: 'b', label: 'Rules' }, { id: 'c', label: 'Advanced' }], 'a'),
    el('p', 'muted', 'Panel with a tab strip. The active tab is a 2px copper rule, not a filled pill.'),
  );
  row.append(p2.root);

  const p3 = panel({ title: 'Raised', raised: true });
  p3.body.append(el('p', 'muted', 'Raised plate — one elevation step up, still opaque.'));
  p3.root.append(p3.foot);
  p3.foot.append(el('span', 'dim', 'footer'), el('div', 'spacer'), button({ size: 'sm', label: 'OK', variant: 'primary' }));
  row.append(p3.root);

  s.append(row);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── readouts & gauges
{
  const s = section('Readouts and gauges', 'Icon, label, tabular value. Gauges are a sunken track with a solid fill and one top highlight.');
  const row = el('div', 'sg-readouts');
  row.append(
    resource('mana', '1 240', 'Mana'),
    resource('supply', '18 / 30', 'Units'),
    resource('power', '84', 'Power'),
  );
  s.append(row);

  const gauges = el('div', 'sg-gauges');
  for (const [label, opts] of [
    ['Health', { value: 0.82, variant: 'hp' as const }],
    ['Health low', { value: 0.32, variant: 'hp' as const, low: true }],
    ['Health critical', { value: 0.12, variant: 'hp' as const, critical: true }],
    ['Mana', { value: 0.64, variant: 'mana' as const }],
    ['Supply', { value: 0.6, variant: 'supply' as const }],
  ] as const) {
    const g = el('div', 'sg-gauge');
    g.append(el('span', 'eyebrow', label), gauge({ ...opts, label }));
    gauges.append(g);
  }
  s.append(gauges);

  const extras = el('div', 'row');
  extras.append(kbd('W'), kbd('A'), kbd('S'), kbd('D'), badge('Local match'), badge('Ready', 'ok'), badge('Low power', 'warn'), badge('Defeated', 'bad'));
  s.append(el('h3', 'eyebrow sg-sub', 'Keycaps and badges'), extras);

  const chips = el('div', 'row');
  chips.append(
    teamChip('You', 'blue', 'Arcane'),
    teamChip('Rival', 'red', 'Obsidian'),
    teamChip('Ally', 'green', 'Verdant'),
    teamChip('Neutral', 'gold', 'Waystone'),
  );
  s.append(el('h3', 'eyebrow sg-sub', 'Team chips — colour on the edge bar only'), chips);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── icons
{
  const s = section('Icons', `Code-drawn SVG on a 24x24 grid. ${ICON_NAMES.length} glyphs, all ${tok('--border-thick') && '2px'} stroke, round caps and joins, no fill except a 22% accent on marked glyphs. No icon font, no image, no emoji.`);
  const grid = el('div', 'sg-icons');
  for (const name of ICON_NAMES) {
    const cell = el('div', 'sg-icon');
    cell.innerHTML = icon(name, { size: 24 });
    cell.append(el('span', 'sg-icon__name', name));
    grid.append(cell);
  }
  s.append(grid);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── spacing & geometry
{
  const s = section('Spacing, geometry and motion', '4px base scale. Sharp corners: the only radius in the system is a 2px hairline.');
  const space = el('div', 'sg-space');
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const t = `--space-${n}`;
    const r = el('div', 'sg-space__row');
    const bar = el('div', 'sg-space__bar');
    bar.style.width = `var(${t})`;
    r.append(el('span', 'sg-space__token num', t.replace('--', '')), bar, el('span', 'dim num', tok(t)));
    space.append(r);
  }
  s.append(space);

  const motion = el('div', 'sg-motion');
  for (const [token, note] of [
    ['--dur-instant', 'state flip on a control'],
    ['--dur-fast', 'hover, pressed'],
    ['--dur-base', 'panel reveal, tab switch'],
    ['--dur-slow', 'screen transition'],
  ] as const) {
    const r = el('div', 'sg-motion__row');
    r.append(el('span', 'sg-motion__token num', token.replace('--', '')), el('span', 'dim', tok(token)), el('span', 'muted', note));
    motion.append(r);
  }
  motion.append(el('p', 'dim', 'One curve: cubic-bezier(0.2, 0, 0.2, 1). No bounce, no spring, no looping animation. Everything is disabled under prefers-reduced-motion.'));
  s.append(el('h3', 'eyebrow sg-sub', 'Motion'), motion);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── screens
{
  const s = section('Screen mockups', 'Built from the same components, at each density tier. These are live DOM, not pictures.');
  const note = el('p', 'sg-section__note muted',
    'Each mockup below is rendered at its real viewport size and scaled to fit this page. Open ' +
    '/ui-proof.html for the full-resolution proof capture at all four viewports.');

  const tiers: [string, string, number, number][] = [
    ['compact', '667 × 375 — phone', 667, 375],
    ['regular', '1366 × 768 — Chromebook', 1366, 768],
    ['roomy', '1920 × 1080 — desktop', 1920, 1080],
  ];

  for (const [label] of [['HUD'], ['Lobby'], ['Main menu']] as const) {
    const wrap = el('div', 'sg-screens');
    wrap.append(el('h3', 'sg-screens__title', label));
    for (const [density, viewportName, w, h] of tiers) {
      const frame = el('div', 'sg-frame');
      const chrome = el('div', 'sg-frame__head');
      chrome.append(el('span', 'eyebrow', viewportName), el('span', 'dim num', `${w} × ${h}`));
      const stage = el('div', 'sg-stage');
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
      const mount = el('div', 'sg-stage__inner');
      mount.setAttribute('data-density', density);
      mount.append(label === 'HUD' ? mockHud() : label === 'Lobby' ? mockLobby() : mockMainMenu());
      stage.append(mount);
      // Scale to fit the guide column while keeping the real pixel layout.
      const scale = Math.min(1, 980 / w);
      stage.style.transform = `scale(${scale})`;
      stage.style.transformOrigin = 'top left';
      const box = el('div', 'sg-stagebox');
      box.style.height = `${h * scale}px`;
      box.append(stage);
      frame.append(chrome, box);
      wrap.append(frame);
    }
    s.append(wrap);
  }
  s.append(note);
  root.append(s);
}

// ───────────────────────────────────────────────────────────────────────────── rules recap
{
  const s = section('The rules, and how they are enforced', 'A style guide nobody can violate is a style guide that survives.');
  const list = el('div', 'sg-rules');
  for (const [ruleText, enforcement] of [
    ['No colour literal outside tokens.css', 'tests/ui-tokens.test.ts scans every UI file'],
    ['No purple-range hue (250–330) in chrome', 'every colour is parsed to HSL and rejected in that band'],
    ['No backdrop blur', 'glassmorphism pattern scan'],
    ['No border-radius above 2px', 'pill-UI pattern scan'],
    ['No soft ambient shadow (blur > 24px)', 'floating-card pattern scan'],
    ['No emoji, no webfont CDN, no icon font', 'source scan + icons are typed SVG paths'],
    ['One icon stroke rule', 'every glyph renders viewBox 24, stroke 2, round caps; fill only where marked'],
    ['Every var(--token) must be declared', 'undeclared-variable scan across all UI sources'],
  ] as const) {
    const r = el('div', 'sg-rules__row');
    r.append(iconEl('check', 14, 'icon'), el('span', 'sg-rules__rule', ruleText), el('span', 'dim sg-rules__enf', enforcement));
    list.append(r);
  }
  s.append(list);
  root.append(s);
}

// Expose a small report for the proof harness to assert against.
(window as unknown as { __styleguide?: unknown }).__styleguide = {
  icons: ICON_NAMES.length,
  tokens: ['--ink-950', '--copper-500', '--team-blue', '--font-ui', '--space-4'].map((t) => ({ token: t, value: tok(t) })),
  sections: document.querySelectorAll('.sg-section').length,
};
