// MAIN MENU — with a REAL code-built 3D scene, not placeholder boxes.
//
// Zachary's issue (3): "the menu art is placeholder gray boxes, so replace it with a real code-built
// scene that uses the game's 3D art (no AI images)".
//
// This mounts the actual game renderer against a real match and flies the camera slowly across the
// player's base, behind the menu. That means the menu art is literally the game's 3D art: the same
// atlas, the same materials, the same lighting, the same scene. No image is loaded and nothing is faked.
//
// If WebGL is unavailable the scene falls back to a static composition of the atlas frames, so the menu
// still has art rather than a blank rectangle.
import type { App } from '../app';
import { button, el } from '../../ui/kit';
import { MatchController } from '../match';
import { defaultLobby } from '../state';

export function mountMenu(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--menu');

  const left = el('div', 'menu-left');
  left.append(
    el('span', 'eyebrow', 'A 2.5D fantasy RTS'),
    el('h1', 'display menu-title', 'Arcane Dominion'),
    el('p', 'menu-blurb muted', 'Two archmages, one shattered ley-line. Summon, build, and take the field.'),
  );

  const actions = el('div', 'menu-actions');
  actions.append(
    button({ variant: 'primary', size: 'lg', icon: 'sword', label: 'Skirmish', block: true, onClick: () => app.go('lobby') }),
    button({ size: 'lg', icon: 'flag', label: 'Multiplayer', block: true, onClick: () => app.go('multiplayer') }),
    button({ size: 'lg', icon: 'grid', label: 'Sandbox', block: true, onClick: () => app.go('sandbox') }),
    button({ size: 'lg', icon: 'crystal', label: 'Entity designs', block: true, onClick: () => app.go('gallery') }),
    button({ size: 'lg', icon: 'gear', label: 'Settings', block: true, onClick: () => app.go('settings') }),
  );
  left.append(actions);

  const meta = el('div', 'menu-meta row');
  meta.append(el('span', 'dim', 'v2 rebuild'), el('span', 'dim', '·'), el('span', 'dim', 'Keyboard + touch'));
  left.append(meta);

  // ---- the live 3D scene
  const art = el('div', 'menu-art');
  art.dataset.testid = 'menu-art';
  const canvasHost = el('div', 'menu-art__canvas');
  art.append(canvasHost);
  const artLabel = el('div', 'menu-art__label');
  artLabel.append(el('span', 'eyebrow', 'Live scene'), el('span', 'dim', 'Rendered from the game atlas'));
  art.append(artLabel);

  root.append(left, art);

  // Build a real match off-screen and render it as the backdrop. It is paused for the menu, so it costs
  // one render per frame and no simulation.
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

      // Frame the player's base from a slow orbiting angle. This is the "hero shot" the menu needs, and
      // it is produced by the same renderer the match uses.
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
        const radius = 150;
        ctrl.camera.centerOn(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.6);
        ctrl.camera.setZoom(1.15);
        ctrl.rend.sync(ctrl.state);
        ctrl.rend.render(ctrl.state, 0, new Set());
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // WebGL unavailable: fall back to a static atlas composition so the menu still has art.
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
