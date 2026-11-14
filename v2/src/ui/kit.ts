// UI COMPONENT BUILDERS — every screen in the game is composed from these.
//
// These are not a framework. They are small functions that return DOM nodes built from the classes in
// `components.css`, so a screen author cannot invent a new look: if a component is not here, it does
// not exist. That is the mechanism that makes "stick with it" enforceable rather than aspirational.
//
// All colour, spacing, type and motion come from tokens via the CSS classes. This file contains no
// style values at all.
import { icon, type IconName } from './icons';

type Attrs = Record<string, string | number | boolean | undefined>;

/** Create an element with class names, text and attributes. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
  attrs?: Attrs,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k === 'html') {
        n.innerHTML = String(v);
        continue;
      }
      n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  return n;
}

/** Inline an icon into an element. */
export function iconEl(name: IconName, size = 16, cls = 'icon'): HTMLElement {
  const span = el('span');
  span.className = cls;
  span.innerHTML = icon(name, { size });
  return span;
}

// ───────────────────────────────────────────────────────────────────────────── panel

export interface PanelOpts {
  title?: string;
  /** Small uppercase eyebrow shown before the title. */
  eyebrow?: string;
  accent?: boolean;
  actions?: HTMLElement[];
  flush?: boolean;
  raised?: boolean;
  className?: string;
}

/** A metal plate with an optional header, body and action row. */
export function panel(opts: PanelOpts = {}): { root: HTMLElement; body: HTMLElement; head: HTMLElement | null; foot: HTMLElement } {
  const root = el('section', `plate panel${opts.raised ? ' plate--raised' : ''}${opts.className ? ` ${opts.className}` : ''}`);
  let head: HTMLElement | null = null;
  if (opts.title || opts.eyebrow) {
    head = el('header', `panel__head${opts.accent ? ' panel__head--accent' : ''}`);
    if (opts.eyebrow) head.append(el('span', 'eyebrow', opts.eyebrow));
    if (opts.title) head.append(el('span', 'panel__title', opts.title));
    if (opts.actions?.length) {
      const acts = el('div', 'row');
      for (const a of opts.actions) acts.append(a);
      head.append(acts);
    }
    root.append(head);
  }
  const body = el('div', `panel__body${opts.flush ? ' panel__body--flush' : ''}`);
  root.append(body);
  const foot = el('footer', 'panel__foot');
  return { root, body, head, foot };
}

// ───────────────────────────────────────────────────────────────────────────── button

export type BtnVariant = 'default' | 'primary' | 'quiet' | 'danger';

export interface BtnOpts {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  label?: string;
  /** Icon only — label becomes the accessible name. */
  iconOnly?: boolean;
  block?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/** A chamfered control. All four variants share one shape. */
export function button(opts: BtnOpts = {}): HTMLButtonElement {
  const cls = [
    'btn',
    opts.variant && opts.variant !== 'default' ? `btn--${opts.variant}` : '',
    opts.size === 'sm' ? 'btn--sm' : opts.size === 'lg' ? 'btn--lg' : '',
    opts.iconOnly ? 'btn--icon' : '',
    opts.block ? 'btn--block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const b = el('button', cls, undefined, { type: 'button' });
  if (opts.label && !opts.iconOnly) b.append(el('span', 'btn__label', opts.label));
  if (opts.icon) b.prepend(iconEl(opts.icon, opts.size === 'sm' ? 14 : 16));
  if (opts.iconOnly) {
    b.setAttribute('aria-label', opts.label ?? opts.icon ?? 'button');
    b.title = opts.label ?? '';
  }
  if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
  if (opts.disabled) b.disabled = true;
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

// ───────────────────────────────────────────────────────────────────────────── tabs

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName;
}

export function tabs(items: TabItem[], activeId: string, onSelect?: (id: string) => void): HTMLElement {
  const root = el('div', 'tabs', undefined, { role: 'tablist' });
  for (const it of items) {
    const t = el('button', 'tab', undefined, {
      type: 'button',
      role: 'tab',
      'aria-selected': String(it.id === activeId),
    });
    if (it.icon) t.append(iconEl(it.icon, 14));
    t.append(el('span', undefined, it.label));
    if (onSelect) t.addEventListener('click', () => onSelect(it.id));
    root.append(t);
  }
  return root;
}

// ───────────────────────────────────────────────────────────────────────────── readouts

/** Icon + label + tabular value. The RTS resource readout. */
export function resource(iconName: IconName, value: string | number, label?: string): HTMLElement {
  const root = el('div', 'res');
  root.append(iconEl(iconName, 16, 'res__icon'));
  const col = el('div', 'col');
  col.style.gap = 'var(--space-1)';
  col.append(el('span', 'res__value num', String(value)));
  if (label) col.append(el('span', 'res__label', label));
  root.append(col);
  return root;
}

export interface GaugeOpts {
  /** 0..1 */
  value: number;
  variant?: 'default' | 'mana' | 'supply' | 'hp';
  low?: boolean;
  critical?: boolean;
  label?: string;
}

export function gauge(opts: GaugeOpts): HTMLElement {
  const cls = [
    'gauge',
    opts.variant && opts.variant !== 'default' ? `gauge--${opts.variant}` : '',
    opts.critical ? 'is-critical' : opts.low ? 'is-low' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const root = el('div', cls, undefined, {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(Math.round(Math.max(0, Math.min(1, opts.value)) * 100)),
    'aria-label': opts.label ?? 'progress',
  });
  const fill = el('div', 'gauge__fill');
  fill.style.width = `${Math.max(0, Math.min(1, opts.value)) * 100}%`;
  root.append(fill);
  return root;
}

export function badge(text: string, tone?: 'ok' | 'warn' | 'bad'): HTMLElement {
  return el('span', `badge${tone ? ` badge--${tone}` : ''}`, text);
}

export function kbd(text: string): HTMLElement {
  return el('kbd', 'kbd', text);
}

/** Team identity chip: a colour bar on the edge, achromatic text. */
export function teamChip(name: string, team: 'blue' | 'red' | 'green' | 'gold', meta?: string): HTMLElement {
  const root = el('div', 'team-chip');
  root.style.setProperty('--team', `var(--team-${team})`);
  root.append(el('span', undefined, name));
  if (meta) root.append(el('span', 'dim', meta));
  return root;
}

export function rule(vertical = false): HTMLElement {
  return el('hr', vertical ? 'rule rule--vertical' : 'rule');
}

/** Apply a density tier to the document root. */
export function setDensity(d: 'compact' | 'regular' | 'roomy'): void {
  document.documentElement.setAttribute('data-density', d);
}

/** Pick the density tier for a viewport, matching the three real target devices. */
export function densityFor(width: number, height: number): 'compact' | 'regular' | 'roomy' {
  if (width <= 900 || height <= 430) return 'compact';
  if (width <= 1500) return 'regular';
  return 'roomy';
}
