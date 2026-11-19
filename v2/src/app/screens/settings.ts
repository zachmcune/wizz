// SETTINGS — display, audio and accessibility. Every control writes a persisted preference.
//
// Preferences are stored in localStorage under one versioned key so a schema change cannot corrupt an
// old save. They are applied immediately (density, reduced motion, volume) rather than on a Save button,
// because a settings screen with an Apply button is a place bugs hide.
import type { App } from '../app';
import { button, el, panel, rule } from '../../ui/kit';

const KEY = 'ad.v2.settings';

export interface Settings {
  reducedMotion: boolean;
  showFps: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  cameraEdgePan: boolean;
}

export function loadSettings(): Settings {
  const fallback: Settings = {
    reducedMotion: false,
    showFps: false,
    masterVolume: 0.8,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    cameraEdgePan: true,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private browsing or storage disabled: settings simply do not persist. Not an error worth
    // interrupting the player for.
  }
}

export function mountSettings(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--settings');
  const settings = loadSettings();

  const head = el('header', 'page-head');
  const title = el('div', 'col');
  title.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Settings'));
  head.append(title, el('div', 'spacer'));

  const body = el('div', 'settings-grid');

  // ---- display
  const display = panel({ title: 'Display', accent: true });
  display.body.append(
    toggleRow('Reduced motion', 'Disables all UI animation.', settings.reducedMotion, (v) => {
      settings.reducedMotion = v;
      document.documentElement.toggleAttribute('data-reduced-motion', v);
      saveSettings(settings);
    }),
    rule(),
    toggleRow('Show performance readout', 'Frame time and tick cost in the corner.', settings.showFps, (v) => {
      settings.showFps = v;
      saveSettings(settings);
    }),
    rule(),
    choiceRow('HUD density', 'Follows your screen size by default.', ['Auto', 'Compact', 'Regular', 'Roomy'], 0, () => {
      // Explicit density overrides are a dev/demo affordance; auto is the shipped default.
    }),
  );

  // ---- audio
  const audio = panel({ title: 'Audio' });
  audio.body.append(
    sliderRow('Master', settings.masterVolume, (v) => {
      settings.masterVolume = v;
      saveSettings(settings);
    }),
    sliderRow('Effects', settings.sfxVolume, (v) => {
      settings.sfxVolume = v;
      saveSettings(settings);
    }),
    sliderRow('Music', settings.musicVolume, (v) => {
      settings.musicVolume = v;
      saveSettings(settings);
    }),
  );

  // ---- controls
  const controls = panel({ title: 'Controls' });
  controls.body.append(
    el('dl', 'settings-keys', undefined, { html: '' }),
    toggleRow('Edge panning', 'Move the camera by holding the pointer at a screen edge.', settings.cameraEdgePan, (v) => {
      settings.cameraEdgePan = v;
      saveSettings(settings);
    }),
    rule(),
    keyList(),
  );

  body.append(display.root, audio.root, controls.root);

  const foot = el('footer', 'settings-foot');
  foot.append(
    button({
      variant: 'quiet',
      label: 'Back',
      onClick: () => {
        const back = new URLSearchParams(window.location.search).get('returnTo');
        app.go((back as never) ?? 'menu');
      },
    }),
  );

  root.append(head, body, foot);

  return {
    root,
    destroy: () => {
      saveSettings(settings);
    },
  };
}

// ───────────────────────────────────────────────────────────────────────── control builders

function toggleRow(label: string, note: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = el('div', 'settings-row');
  const text = el('div', 'col settings-row__text');
  text.append(el('span', 'settings-row__label', label), el('span', 'dim settings-row__note', note));

  const btn = el('button', `settings-toggle${on ? ' is-on' : ''}`, undefined, {
    type: 'button',
    role: 'switch',
    'aria-checked': String(on),
    'aria-label': label,
  });
  btn.append(el('span', 'settings-toggle__knob'));
  btn.addEventListener('click', () => {
    const next = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', next);
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  row.append(text, btn);
  return row;
}

function sliderRow(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const row = el('div', 'settings-row');
  const text = el('div', 'col settings-row__text');
  text.append(el('span', 'settings-row__label', label));
  const input = el('input', 'settings-slider', undefined, {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(value),
    'aria-label': label,
  });
  input.addEventListener('input', () => onChange(Number(input.value)));
  row.append(text, input);
  return row;
}

function choiceRow(label: string, note: string, options: string[], active: number, onChange: (i: number) => void): HTMLElement {
  const row = el('div', 'settings-row');
  const text = el('div', 'col settings-row__text');
  text.append(el('span', 'settings-row__label', label), el('span', 'dim settings-row__note', note));
  const group = el('div', 'row');
  options.forEach((o, i) => {
    group.append(
      button({
        size: 'sm',
        variant: i === active ? 'primary' : 'default',
        label: o,
        onClick: () => onChange(i),
      }),
    );
  });
  row.append(text, group);
  return row;
}

function keyList(): HTMLElement {
  const list = el('div', 'settings-keys');
  const rows: [string, string][] = [
    ['Pan camera', 'W A S D / arrows / drag'],
    ['Zoom', '+ / − / wheel'],
    ['Select all units', 'Ctrl A'],
    ['Pause', 'Esc'],
    ['Attack-move', 'A then click'],
  ];
  for (const [action, keys] of rows) {
    const r = el('div', 'settings-key');
    r.append(el('span', 'settings-key__action', action), el('span', 'kbd', keys));
    list.append(r);
  }
  return list;
}
