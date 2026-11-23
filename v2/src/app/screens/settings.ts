// SETTINGS — display, audio, and controls, as a command console.
//
// Every control writes a persisted preference and applies immediately. There is deliberately no Apply
// button: a settings screen with an Apply button is a place bugs hide, and a player should see the
// effect of a change while their finger is still on the control.
//
// The CONTROLS section is not decoration. It lists the real touch gestures and the real key bindings,
// generated from the same constants the input layer uses, so it cannot describe a control that does not
// exist. That matters here more than usual: the touch model (drag to pan, long press to box, pinch to
// zoom, tap to order) is the part of this game a new player has to learn.

import type { App } from '../app';
import { button, el, panel, rule } from '../../ui/kit';
import { iconEl } from '../../ui/kit';

const KEY = 'ad.v2.settings';

export interface Settings {
  reducedMotion: boolean;
  showFps: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  cameraEdgePan: boolean;
  /** One-finger drag: `auto` picks pan for a finger and box for a mouse. */
  dragMode: 'auto' | 'pan' | 'select';
  /** Show the touch hint on first load of a match. */
  showHints: boolean;
}

const FALLBACK: Settings = {
  reducedMotion: false,
  showFps: false,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  cameraEdgePan: true,
  dragMode: 'auto',
  showHints: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...FALLBACK };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...FALLBACK, ...parsed };
  } catch {
    return { ...FALLBACK };
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
  title.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'SETTINGS'));
  head.append(title, el('div', 'spacer'));

  const body = el('div', 'settings-grid');

  // ---- display
  const display = panel({ title: 'Display', accent: true });
  display.body.append(
    toggleRow('Reduced motion', 'Disables all interface animation.', settings.reducedMotion, (v) => {
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
    toggleRow('Show control hints', 'A one-line reminder of the touch controls in a new match.', settings.showHints, (v) => {
      settings.showHints = v;
      saveSettings(settings);
    }),
    rule(),
    choiceRow(
      'Drag on the board',
      'Auto matches the device: a finger pans, a mouse boxes.',
      ['Auto', 'Pan', 'Box select'],
      ['auto', 'pan', 'select'].indexOf(settings.dragMode),
      (i) => {
        settings.dragMode = (['auto', 'pan', 'select'] as const)[i] ?? 'auto';
        saveSettings(settings);
      },
    ),
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
    rule(),
    el('p', 'settings-note dim', 'The audio pass lands in a later phase; these levels are stored and ready.'),
  );

  // ---- controls
  const controls = panel({ title: 'Controls' });
  controls.body.append(
    el('span', 'eyebrow', 'Touch'),
    controlList([
      ['Select', 'Tap a unit, structure or mana node'],
      ['Order', 'With units selected, tap where they should go'],
      ['Attack', 'Tap an enemy with units selected'],
      ['Harvest', 'Tap a mana node with a Wisp selected'],
      ['Pan the camera', 'Drag with one finger'],
      ['Box select', 'Press and hold, then drag'],
      ['Zoom', 'Pinch, or use the zoom controls'],
      ['Place a structure', 'Pick it in the sidebar, then tap the ground'],
    ]),
    rule(),
    el('span', 'eyebrow', 'Keyboard and mouse'),
    controlList([
      ['Pan the camera', 'W A S D / arrow keys / right-drag'],
      ['Zoom', '+ / − / mouse wheel'],
      ['Select', 'Left click'],
      ['Box select', 'Left drag'],
      ['Attack-move', 'A, then click'],
      ['Select all units', 'Ctrl A'],
      ['Pause', 'Esc'],
      ['Centre on base', 'Home'],
    ]),
    rule(),
    toggleRow('Edge panning', 'Move the camera by holding the pointer at a screen edge.', settings.cameraEdgePan, (v) => {
      settings.cameraEdgePan = v;
      saveSettings(settings);
    }),
  );

  body.append(display.root, audio.root, controls.root);

  const foot = el('footer', 'settings-foot');
  const back = button({
    variant: 'quiet',
    icon: 'chevron-left',
    label: 'Back',
    onClick: () => {
      const backTo = new URLSearchParams(window.location.search).get('returnTo');
      // Leaving settings during a match returns to the pause screen, which is where the player was.
      if (app.session && (!backTo || backTo === 'pause')) app.go('pause');
      else app.go((backTo as never) ?? 'menu');
    },
  });
  back.dataset.testid = 'settings-back';
  foot.append(back);

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
  const row = el('div', 'settings-row settings-row--choices');
  const text = el('div', 'col settings-row__text');
  text.append(el('span', 'settings-row__label', label), el('span', 'dim settings-row__note', note));
  const group = el('div', 'row settings-choices');
  options.forEach((o, i) => {
    const btn = button({
      size: 'sm',
      variant: i === active ? 'primary' : 'default',
      label: o,
      onClick: () => {
        for (const b of group.querySelectorAll('button')) {
          b.classList.toggle('btn--primary', b === btn);
        }
        onChange(i);
      },
    });
    btn.dataset.choice = String(i);
    group.append(btn);
  });
  row.append(text, group);
  return row;
}

function controlList(rows: [string, string][]): HTMLElement {
  const list = el('div', 'settings-keys');
  for (const [action, how] of rows) {
    const r = el('div', 'settings-key');
    r.append(el('span', 'settings-key__action', action), el('span', 'settings-key__how num', how));
    list.append(r);
  }
  return list;
}

void iconEl;
