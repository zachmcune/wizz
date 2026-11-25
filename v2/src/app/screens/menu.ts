// MAIN MENU — a command console, with the game's own 3D art behind it.
//
// Zachary's brief: "the menus should very much feel like mobile command and conquer", and separately
// the menu art must be real code-built 3D, never a placeholder or a generated image. Both are met here
// without a compromise: the background is a live render of a real match through the real renderer, and
// the foreground is the same Obsidian & Brass console the HUD uses.
//
// THE LAYOUT IS THE C&C MAIN MENU, adapted for a phone:
//
//   • a title block with the game's name and a single-line standfirst;
//   • one PRIMARY action (Skirmish) — the thing you almost always came here to do;
//   • a stack of secondary command plates, each with an icon and a one-line description, because a phone
//     user reads the label, not the glyph;
//   • a status strip along the bottom carrying the build and the fact that it is a PWA.
//
// In landscape the art occupies the right; in portrait the art becomes a full-bleed background and the
// console sits over it in a single column. That is the same content in one DOM, switched by CSS.

import type { App } from '../app';
import { button, el } from '../../ui/kit';
import { iconEl } from '../../ui/kit';
import { MatchController } from '../match';
import { defaultLobby } from '../state';
import type { IconName } from '../../ui/icons';

interface MenuEntry {
  id: 'skirmish' | 'multiplayer' | 'sandbox' | 'gallery' | 'settings';
  label: string;
  note: string;
  icon: IconName;
  go: () => void;
}

export function mountMenu(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--menu');

  // ---- live scene behind everything. Built first so it is the bottom layer.
  const art = el('div', 'menu-art');
  art.dataset.testid = 'menu-art';
  const canvasHost = el('div', 'menu-art__canvas');
  art.append(canvasHost);
  const artLabel = el('div', 'menu-art__label');
  artLabel.append(el('span', 'eyebrow', 'Live scene'), el('span', 'dim', 'Rendered from the game atlas'));
  art.append(artLabel);
  root.append(art);

  // ---- the console
  const console_ = el('div', 'menu-console');

  const title = el('header', 'menu-title-block');
  title.append(
    el('span', 'eyebrow menu-eyebrow', 'A 2.5D fantasy RTS'),
    el('h1', 'display menu-title', 'ARCANE DOMINION'),
    el('p', 'menu-standfirst', 'Two archmages. One shattered ley-line. Take the field.'),
  );
  console_.append(title);

  const entries: MenuEntry[] = [
    { id: 'skirmish', label: 'SKIRMISH', note: 'Play a single match against the AI', icon: 'sword', go: () => app.go('lobby') },
    { id: 'multiplayer', label: 'MULTIPLAYER', note: 'Host or join a room with a code', icon: 'flag', go: () => app.go('multiplayer') },
    { id: 'sandbox', label: 'SANDBOX', note: 'Test units and structures freely', icon: 'grid', go: () => app.go('sandbox') },
    { id: 'gallery', label: 'ENTITY DESIGNS', note: 'Every sprite in the game', icon: 'crystal', go: () => app.go('gallery') },
    { id: 'settings', label: 'SETTINGS', note: 'Display, audio and controls', icon: 'gear', go: () => app.go('settings') },
  ];

  const actions = el('div', 'menu-actions');
  const primary = entries[0]!;
  const primaryBtn = button({
    variant: 'primary',
    size: 'lg',
    icon: primary.icon,
    label: primary.label,
    block: true,
    onClick: primary.go,
  });
  primaryBtn.dataset.testid = 'menu-skirmish';
  primaryBtn.classList.add('menu-primary');
  const primaryWrap = el('div', 'menu-primary-wrap');
  primaryWrap.append(primaryBtn, el('span', 'menu-primary__note', primary.note));
  actions.append(primaryWrap);

  const secondary = el('div', 'menu-secondary');
  for (const e of entries.slice(1)) {
    const b = el('button', 'menu-entry', undefined, { type: 'button' });
    b.dataset.testid = `menu-${e.id}`;
    b.dataset.menu = e.id;
    const glyph = el('span', 'menu-entry__icon');
    glyph.append(iconEl(e.icon, 20));
    const text = el('span', 'menu-entry__text');
    text.append(el('span', 'menu-entry__label', e.label), el('span', 'menu-entry__note dim', e.note));
    const chev = el('span', 'menu-entry__chev');
    chev.append(iconEl('chevron-right', 16));
    b.append(glyph, text, chev);
    b.addEventListener('click', e.go);
    secondary.append(b);
  }
  actions.append(secondary);
  console_.append(actions);

  const strip = el('footer', 'menu-strip');
  strip.append(
    el('span', 'menu-strip__item', 'v2 rebuild'),
    el('span', 'menu-strip__dot', '·'),
    el('span', 'menu-strip__item', 'Touch + keyboard'),
    el('span', 'menu-strip__dot', '·'),
    el('span', 'menu-strip__item', 'Installable PWA'),
  );
  console_.append(strip);

  root.append(console_);

  // ---- the live scene: a real match, paused, with the camera drifting over the player's base.
  let ctrl: MatchController | null = null;
  let raf = 0;
  let cancelled = false;
  let angle = 0;

  void (async () => {
    try {
      const lobby = defaultLobby(app.registry);
      ctrl = await MatchController.create(app.registry, app.atlas, lobby, canvasHost, {
        onTick: () => {},
        onEnd: () => {},
        onReject: () => {},
      });
      if (cancelled) {
        ctrl.destroy();
        return;
      }
      ctrl.setPaused(true);

      // Frame the player's base from a slow orbit. This is the "hero shot", and it is produced by the
      // same renderer the match uses — so it cannot drift from what the game looks like.
      const st = ctrl.state;
      let baseX = 0;
      let baseY = 0;
      let n = 0;
      for (let s = 0; s < st.entities.count; s++) {
        if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
        if (st.entities.ownerIndex[s] !== 0) continue;
        baseX += st.entities.posX[s]!;
        baseY += st.entities.posY[s]!;
        n++;
      }
      const cx = n > 0 ? baseX / n : 2048;
      const cy = n > 0 ? baseY / n : 1320;

      const tick = (): void => {
        if (cancelled || !ctrl) return;
        angle += 0.0016;
        const radius = 120;
        ctrl.camera.centerOn(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.6);
        ctrl.camera.setZoom(1.2);
        ctrl.rend.sync(ctrl.state);
        ctrl.rend.render(ctrl.state, 0, new Set());
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // WebGL unavailable: fall back to a static composition so the menu still has art.
      if (!cancelled) {
        canvasHost.classList.add('menu-art__fallback');
        canvasHost.append(el('div', 'menu-art__sigil'));
      }
    }
  })();

  return {
    root,
    destroy: () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ctrl?.destroy();
    },
  };
}
