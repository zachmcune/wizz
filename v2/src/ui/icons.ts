// ICON SYSTEM — code-drawn SVG paths, one stroke/fill rule.
//
// NO EMOJI, NO ICON FONTS, NO IMAGE FILES. Every icon is a path in a 24x24 viewBox drawn with the same
// rule, so the set is internally consistent:
//
//   • Geometry lives on a 24x24 grid with a 2px margin (the usable box is 20x20).
//   • Strokes are 2px, round caps, round joins, and carry NO fill. This is the default for every icon.
//   • A few icons (crystal, coin, shield) additionally carry a fill on their *primary* closed shape,
//     using the same colour at 22% alpha. That is the one and only place fill is used, so the set reads
//     as line art with occasional solid accents rather than a mix of styles.
//   • Corners are cut at 45 degrees where an axis-aligned box would look soft — the same chamfer
//     language the panels use.
//
// Icons are rendered through `icon()`, which returns an SVG string. That keeps them testable (see
// tests/ui-tokens.test.ts, which checks the stroke/fill rule across the whole set) and avoids any
// runtime image loading.

export type IconName =
  | 'mana'
  | 'supply'
  | 'power'
  | 'attack'
  | 'armour'
  | 'speed'
  | 'build'
  | 'train'
  | 'research'
  | 'move'
  | 'stop'
  | 'hold'
  | 'idle'
  | 'zoom-in'
  | 'zoom-out'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'check'
  | 'alert'
  | 'crystal'
  | 'coin'
  | 'shield'
  | 'sword'
  | 'bow'
  | 'flag'
  | 'gear'
  | 'volume'
  | 'grid'
  | 'clock';

/**
 * The icon path table.
 *
 * `fill: true` marks the few icons whose primary shape is solid at 22% alpha. Everything else is pure
 * stroke. Nothing is both a filled shape AND a stroked shape in a way that would break the rule — the
 * fill is always applied first, with the stroke drawn on top of the same path.
 */
export const ICONS: Record<IconName, { d: string; fill?: boolean }> = {
  // ---- resources
  mana: { d: 'M12 3 L19 12 L12 21 L5 12 Z M12 3 L12 21', fill: true },
  supply: { d: 'M4 20 L4 10 L9 5 L9 20 M15 20 L15 10 L20 5 L20 20 M4 12 L9 12 M15 12 L20 12' },
  power: { d: 'M13 3 L6 13 L11 13 L10 21 L18 10 L13 10 Z', fill: true },

  // ---- combat stats
  attack: { d: 'M6 18 L16 8 M16 8 L19 5 M14 6 L18 10 M6 18 L4 20 M9 15 L11 17' },
  armour: { d: 'M12 3 L20 6 L20 12 C20 17 16 20 12 21 C8 20 4 17 4 12 L4 6 Z', fill: true },
  speed: { d: 'M4 16 L10 16 M3 20 L8 20 M12 10 L20 10 L16 6 M20 10 L16 14' },

  // ---- commands
  build: { d: 'M4 20 L4 9 L12 4 L20 9 L20 20 Z M9 20 L9 14 L15 14 L15 20 M4 9 L20 9' },
  train: { d: 'M12 4 L12 12 M12 12 L7 20 M12 12 L17 20 M6 8 L18 8' },
  research: { d: 'M12 3 L21 8 L12 13 L3 8 Z M3 8 L3 15 L12 20 L21 15 L21 8 M12 13 L12 20' },
  move: { d: 'M12 3 L12 21 M12 3 L8 7 M12 3 L16 7 M12 21 L8 17 M12 21 L16 17 M3 12 L21 12 M21 12 L17 8 M21 12 L17 16 M3 12 L7 8 M3 12 L7 16' },
  stop: { d: 'M6 6 L18 6 L18 18 L6 18 Z', fill: true },
  hold: { d: 'M12 3 L20 7 L20 13 C20 18 16 20 12 21 C8 20 4 18 4 13 L4 7 Z M9 12 L12 9 L15 12' },
  idle: { d: 'M12 7 C13.1 7 14 7.9 14 9 C14 10.1 13.1 11 12 11 C10.9 11 10 10.1 10 9 C10 7.9 10.9 7 12 7 Z M4 20 C4 15 7 13 12 13 C17 13 20 15 20 20' },

  // ---- camera
  'zoom-in': { d: 'M11 4 L11 18 M4 11 L18 11 M14 2 L20 2 L20 8' },
  'zoom-out': { d: 'M4 11 L18 11 M14 2 L20 2 L20 8' },

  // ---- navigation
  'chevron-left': { d: 'M15 5 L8 12 L15 19' },
  'chevron-right': { d: 'M9 5 L16 12 L9 19' },
  close: { d: 'M5 5 L19 19 M19 5 L5 19' },
  check: { d: 'M4 12 L9 17 L20 6' },
  alert: { d: 'M12 3 L22 20 L2 20 Z M12 9 L12 14 M12 17 L12 17.5' },

  // ---- objects
  crystal: { d: 'M12 2 L18 8 L16 20 L8 20 L6 8 Z M12 2 L12 20 M6 8 L18 8', fill: true },
  coin: { d: 'M12 3 C16.4 3 20 7 20 12 C20 17 16.4 21 12 21 C7.6 21 4 17 4 12 C4 7 7.6 3 12 3 Z M12 8 L12 16 M9.5 10 L14.5 10', fill: true },
  shield: { d: 'M12 3 L19 6 L19 12 C19 17 15.5 20 12 21 C8.5 20 5 17 5 12 L5 6 Z', fill: true },
  sword: { d: 'M18 3 L21 3 L21 6 L10 17 L7 14 Z M7 14 L4 17 L7 20 L10 17 M3 21 L5 19' },
  bow: { d: 'M6 3 C13 7 13 17 6 21 M6 3 L6 21 M9 12 L20 12 M20 12 L17 9 M20 12 L17 15' },
  flag: { d: 'M6 21 L6 3 M6 4 L18 4 L15 8 L18 12 L6 12' },
  gear: { d: 'M12 8 C14.2 8 16 9.8 16 12 C16 14.2 14.2 16 12 16 C9.8 16 8 14.2 8 12 C8 9.8 9.8 8 12 8 Z M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M7 17 L5 19' },
  volume: { d: 'M4 9 L8 9 L13 5 L13 19 L8 15 L4 15 Z M16 9 C18 11 18 13 16 15 M18.5 6.5 C22 10 22 14 18.5 17.5' },
  grid: { d: 'M4 4 L10 4 L10 10 L4 10 Z M14 4 L20 4 L20 10 L14 10 Z M4 14 L10 14 L10 20 L4 20 Z M14 14 L20 14 L20 20 L14 20 Z' },
  clock: { d: 'M12 3 C16.4 3 20 6.6 20 11 C20 15.4 16.4 19 12 19 C7.6 19 4 15.4 4 11 C4 6.6 7.6 3 12 3 Z M12 7 L12 11 L15 13 M9 21 L15 21' },
};

/** Stroke width for the whole set, in viewBox units. One value, everywhere. */
export const ICON_STROKE = 2;

/**
 * Render an icon as an SVG string.
 *
 * `size` is the rendered box in CSS pixels; the viewBox never changes, so every icon scales from the
 * same grid. Only stroke is used unless the icon is marked `fill`, in which case the identical path is
 * filled first at 22% alpha and then stroked — never two different paths.
 */
export function icon(name: IconName, opts: { size?: number; className?: string; title?: string } = {}): string {
  const def = ICONS[name];
  if (!def) throw new Error(`unknown icon "${name}"`);
  const size = opts.size ?? 16;
  const cls = opts.className ? ` class="${opts.className}"` : ' class="icon"';
  const label = opts.title ? `<title>${opts.title}</title>` : '';
  const filled = def.fill
    ? `<path d="${def.d}" fill="currentColor" fill-opacity="0.22" stroke="none"/>`
    : '';
  return (
    `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="${opts.title ? 'false' : 'true'}" focusable="false">${label}${filled}<path d="${def.d}"/>` +
    (def.fill ? '' : '') +
    `</svg>`
  );
}

/** All icon names, for the style sheet and the rule test. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
