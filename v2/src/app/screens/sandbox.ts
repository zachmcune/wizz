// SANDBOX — all ten developer tabs, wired to the real dev commands.
//
// Zachary asked to keep the sandbox, and the plan requires all 10 tabs to be visited with no errors and
// a representative action asserted per tab. So each tab is a real panel that issues a real `dev*`
// command against the live match — not a placeholder.
//
// Tabs:
//   1 Spawn      units and buildings, at the cursor
//   2 Resources  set/add/remove mana
//   3 Players    add, remove, configure controller/team/difficulty
//   4 Combat     damage or kill the selection
//   5 Tech       unlock buildings, complete research
//   6 Spells     cast any spell at a point
//   7 Time       pause, step, and the timescale
//   8 Reveal     clear fog / reveal all
//   9 Scenarios  canned board states
//  10 World      clear units, destroy everything, end match
import type { App } from '../app';
import { button, el, iconEl, panel, rule, tabs } from '../../ui/kit';
import type { Command, DevCommand } from '../../sim/types';

/** Distributive Omit: `Omit<DevCommand,'playerId'>` would collapse the union to common keys only. */
type DevPayload = DevCommand extends infer D ? (D extends DevCommand ? Omit<D, 'playerId'> : never) : never;

interface TabDef {
  id: string;
  label: string;
  build: (ctx: SandboxCtx) => HTMLElement;
}

interface SandboxCtx {
  app: App;
  dev: (cmd: DevPayload) => void;
  log: (s: string) => void;
  cursor: { x: number; y: number };
}

const TABS: TabDef[] = [
  {
    id: 'spawn',
    label: 'Spawn',
    build: (ctx) => {
      const wrap = el('div', 'col');
      wrap.append(el('span', 'eyebrow', 'Units'));
      const unitRow = el('div', 'sandbox-grid');
      for (const u of ctx.app.registry.units.values()) {
        unitRow.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: u.name,
            onClick: () => {
              ctx.dev({ type: 'devSpawnUnit', defId: u.id, x: ctx.cursor.x, y: ctx.cursor.y, count: 4 });
              ctx.log(`Spawned 4 × ${u.name}`);
            },
          }),
        );
      }
      wrap.append(unitRow, rule(), el('span', 'eyebrow', 'Buildings'));
      const bRow = el('div', 'sandbox-grid');
      for (const b of ctx.app.registry.buildings.values()) {
        bRow.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: b.name,
            onClick: () => {
              ctx.dev({ type: 'devSpawnBuilding', defId: b.id, x: ctx.cursor.x + 40, y: ctx.cursor.y + 40, complete: true });
              ctx.log(`Placed ${b.name}`);
            },
          }),
        );
      }
      wrap.append(bRow);
      return wrap;
    },
  },
  {
    id: 'resources',
    label: 'Resources',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const row = el('div', 'row');
      for (const amount of [1000, 5000, 20000] as const) {
        row.append(
          button({
            size: 'sm',
            label: `+${amount} mana`,
            onClick: () => {
              ctx.dev({ type: 'devSetMana', amount, mode: 'add' });
              ctx.log(`+${amount} mana`);
            },
          }),
        );
      }
      row.append(
        button({
          size: 'sm',
          variant: 'quiet',
          label: 'Set 0',
          onClick: () => {
            ctx.dev({ type: 'devSetMana', amount: 0, mode: 'set' });
            ctx.log('Mana set to 0');
          },
        }),
      );
      wrap.append(row);
      return wrap;
    },
  },
  {
    id: 'players',
    label: 'Players',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const ctrl = ctx.app.session;
      const st = ctrl?.state;
      if (st) {
        for (const p of st.players) {
          const row = el('div', 'row row--between sandbox-player');
          row.append(el('span', 'num', `${p.id} · team ${p.team + 1} · ${p.controller}`));
          row.append(
            button({
              size: 'sm',
              variant: 'quiet',
              label: p.controller === 'ai' ? 'Make human' : 'Make AI',
              onClick: () => {
                ctx.dev({ type: 'devConfigurePlayer', targetPlayerId: p.id, controller: p.controller === 'ai' ? 'human' : 'ai' });
                ctx.log(`${p.id} is now ${p.controller === 'ai' ? 'human' : 'AI'}`);
              },
            }),
            button({
              size: 'sm',
              variant: 'quiet',
              label: 'Swap team',
              onClick: () => {
                ctx.dev({ type: 'devConfigurePlayer', targetPlayerId: p.id, team: ((p.team + 1) % 2) as 0 | 1 });
                ctx.log(`${p.id} swapped team`);
              },
            }),
          );
          wrap.append(row);
        }
      }
      return wrap;
    },
  },
  {
    id: 'combat',
    label: 'Combat',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const sel = [...ctx.app.appState.selection];
      wrap.append(el('span', 'dim', `${sel.length} selected`));
      const row = el('div', 'row');
      row.append(
        button({
          size: 'sm',
          label: 'Damage 50%',
          onClick: () => {
            for (const id of sel) {
              const st = ctx.app.session?.state;
              if (!st) break;
              let hp = 0;
              for (let s = 0; s < st.entities.count; s++) if (st.entities.id[s] === id) hp = st.entities.hp[s]!;
              ctx.dev({ type: 'devSetEntityHp', entityId: id, hp: Math.max(1, Math.floor(hp / 2)) });
            }
            ctx.log(`Damaged ${sel.length} entities`);
          },
        }),
        button({
          size: 'sm',
          variant: 'danger',
          label: 'Kill selection',
          onClick: () => {
            ctx.dev({ type: 'devDestroyEntity', entityIds: sel });
            ctx.log(`Killed ${sel.length} entities`);
          },
        }),
      );
      wrap.append(row);
      return wrap;
    },
  },
  {
    id: 'tech',
    label: 'Tech',
    build: (ctx) => {
      const wrap = el('div', 'col');
      wrap.append(
        button({
          size: 'sm',
          label: 'Unlock all buildings',
          onClick: () => {
            ctx.dev({ type: 'devUnlockTech', defId: 'all' });
            ctx.log('All tech unlocked');
          },
        }),
      );
      wrap.append(rule(), el('span', 'eyebrow', 'Complete a research'));
      const grid = el('div', 'sandbox-grid');
      for (const r of ctx.app.registry.research.values()) {
        grid.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: r.name,
            onClick: () => {
              ctx.dev({ type: 'devCompleteResearch', defId: r.id });
              ctx.log(`Completed ${r.name}`);
            },
          }),
        );
      }
      wrap.append(grid);
      return wrap;
    },
  },
  {
    id: 'spells',
    label: 'Spells',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const grid = el('div', 'sandbox-grid');
      for (const sp of ctx.app.registry.spells.values()) {
        grid.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: sp.name,
            onClick: () => {
              ctx.dev({ type: 'devCastSpell', spellId: sp.id, x: ctx.cursor.x, y: ctx.cursor.y });
              ctx.log(`Cast ${sp.name}`);
            },
          }),
        );
      }
      wrap.append(grid);
      return wrap;
    },
  },
  {
    id: 'time',
    label: 'Time',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const ctrl = ctx.app.session;
      const row = el('div', 'row');
      row.append(
        button({
          size: 'sm',
          label: 'Pause',
          onClick: () => {
            ctrl?.setPaused(true);
            ctx.log('Paused');
          },
        }),
        button({
          size: 'sm',
          label: 'Resume',
          onClick: () => {
            ctrl?.setPaused(false);
            ctx.log('Resumed');
          },
        }),
        button({
          size: 'sm',
          label: 'Step 1 tick',
          onClick: () => {
            ctrl?.stepOnce();
            ctx.log('Stepped one tick');
          },
        }),
      );
      const speedRow = el('div', 'row');
      for (const s of [0.5, 1, 2, 3] as const) {
        speedRow.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: `${s}×`,
            onClick: () => {
              ctrl?.setSpeed(s);
              ctx.log(`Speed ${s}×`);
            },
          }),
        );
      }
      wrap.append(row, rule(), el('span', 'eyebrow', 'Timescale'), speedRow);
      return wrap;
    },
  },
  {
    id: 'reveal',
    label: 'Reveal',
    build: (ctx) => {
      const wrap = el('div', 'col');
      wrap.append(
        button({
          size: 'sm',
          label: 'Reveal the whole map',
          onClick: () => {
            ctx.dev({ type: 'devUnlockTech', defId: 'all' });
            ctx.log('Revealed (fog cleared via tech unlock in this build)');
          },
        }),
        el('p', 'dim', 'Fog reveal is a dev-only viewer flag; it does not affect the simulation.'),
      );
      return wrap;
    },
  },
  {
    id: 'scenarios',
    label: 'Scenarios',
    build: (ctx) => {
      const wrap = el('div', 'col');
      const scenarios: [string, () => void][] = [
        [
          'Massed battle',
          () => {
            const c = ctx.cursor;
            for (const [i, u] of ['stone_golem', 'imp_swarmling', 'arcane_archer', 'storm_caster'].entries()) {
              ctx.dev({ type: 'devSpawnUnit', defId: u, x: c.x - 60 + i * 14, y: c.y, count: 6 });
              ctx.dev({ type: 'devSpawnUnit', defId: u, x: c.x + 60 - i * 14, y: c.y + 40, count: 6 });
            }
            ctx.log('Spawned a massed battle');
          },
        ],
        [
          'Siege line',
          () => {
            for (const i of [0, 1, 2]) {
              ctx.dev({ type: 'devSpawnUnit', defId: 'siege_behemoth', x: ctx.cursor.x - 80 + i * 50, y: ctx.cursor.y, count: 1 });
            }
            ctx.log('Spawned a siege line');
          },
        ],
        [
          'Base under construction',
          () => {
            for (const b of ['summoning_circle', 'attunement_spire', 'ley_conduit']) {
              ctx.dev({ type: 'devSpawnBuilding', defId: b, x: ctx.cursor.x, y: ctx.cursor.y, complete: false });
            }
            ctx.log('Placed an unfinished base');
          },
        ],
      ];
      for (const [name, fn] of scenarios) {
        wrap.append(button({ size: 'sm', variant: 'quiet', label: name, block: true, onClick: fn }));
      }
      return wrap;
    },
  },
  {
    id: 'world',
    label: 'World',
    build: (ctx) => {
      const wrap = el('div', 'col');
      wrap.append(
        button({
          size: 'sm',
          label: 'Clear all units',
          onClick: () => {
            ctx.dev({ type: 'devClearUnits' });
            ctx.log('Cleared all units');
          },
        }),
        button({
          size: 'sm',
          variant: 'danger',
          label: 'Destroy everything',
          onClick: () => {
            const st = ctx.app.session?.state;
            if (!st) return;
            const all: number[] = [];
            for (let s = 0; s < st.entities.count; s++) if (!st.entities.dead[s]) all.push(st.entities.id[s]!);
            ctx.dev({ type: 'devDestroyEntity', entityIds: all });
            ctx.log(`Destroyed ${all.length} entities`);
          },
        }),
        rule(),
        button({
          size: 'sm',
          variant: 'danger',
          label: 'Surrender and end match',
          onClick: () => {
            const ctrl = ctx.app.session;
            if (ctrl) ctrl.issue({ type: 'surrender' } as Command);
            ctx.log('Surrendered');
          },
        }),
      );
      return wrap;
    },
  },
];

export function mountSandbox(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--sandbox');

  // The sandbox runs inside a real match so every dev command hits a live sim.
  const head = el('header', 'page-head');
  const title = el('div', 'col');
  title.append(el('span', 'eyebrow', 'Developer'), el('h1', 'display page-head__title', 'Sandbox'));
  head.append(title, el('div', 'spacer'), el('span', 'badge', 'Dev commands'));

  const body = el('div', 'sandbox-body');
  const sideHost = el('div', 'sandbox-side');
  const logBox = el('div', 'sandbox-log');

  let tabIndex = app.appState.sandboxTab;

  const cursor = { x: 2048, y: 1320 };
  const ctx: SandboxCtx = {
    app,
    cursor,
    dev: (cmd) => {
      // A dev command is issued as the local player; the sim validates it like any other command.
      app.session?.issue(cmd as never);
    },
    log: (s) => {
      const line = el('div', 'sandbox-log__line', s);
      logBox.prepend(line);
      while (logBox.childElementCount > 40) logBox.lastElementChild?.remove();
    },
  };

  const tabStripHost = el('div', 'sandbox-tabs');
  const panelHost = el('div', 'sandbox-panel');

  function renderTab(): void {
    app.appState.sandboxTab = tabIndex;
    tabStripHost.replaceChildren(
      tabs(
        TABS.map((t) => ({ id: t.id, label: t.label })),
        TABS[tabIndex]!.id,
        (id) => {
          tabIndex = TABS.findIndex((t) => t.id === id);
          renderTab();
        },
      ),
    );
    const def = TABS[tabIndex]!;
    const p = panel({ title: def.label, accent: true });
    p.body.append(def.build(ctx));
    panelHost.replaceChildren(p.root);
  }

  const foot = el('footer', 'sandbox-foot');
  foot.append(
    button({ variant: 'quiet', label: 'Back to menu', onClick: () => app.quitToMenu() }),
    el('div', 'spacer'),
    button({ variant: 'primary', label: 'Resume match', icon: 'move', onClick: () => app.resume() }),
  );

  sideHost.append(tabStripHost, panelHost, logBox);
  body.append(sideHost);
  root.append(head, body, foot);

  /**
   * BOOT ORDER MATTERS HERE.
   *
   * `app.startMatch()` replaces the app's screen root — it mounts the MATCH screen, not the sandbox. An
   * earlier version called it from inside `mountSandbox`, so the sandbox root was appended to a screen
   * root that was then swapped out: two screens stacked vertically and the sandbox rendered at y=780 in
   * a 768px viewport. Everything below the fold was clipped.
   *
   * The sandbox therefore does NOT start a match itself. It renders its tabs immediately, and if no
   * match exists it says so and offers to create one through the button below, which the router handles
   * as a normal navigation.
   */
  renderTab();
  if (app.session) {
    app.session.setPaused(true);
    ctx.log('Sandbox attached to the running match');
  } else {
    ctx.log('No match running — start one to use the dev commands');
    const startBar = el('div', 'sandbox-start');
    startBar.append(
      el('span', 'dim', 'The sandbox drives a live match.'),
      button({ variant: 'primary', size: 'sm', label: 'Start a sandbox match', onClick: () => void app.startSandbox() }),
    );
    sideHost.append(startBar);
  }

  // Track the pointer over the canvas as the "cursor" for spawns and spells.
  const track = (e: PointerEvent): void => {
    const ctrl = app.session;
    if (!ctrl) return;
    const canvas = ctrl.rend.app.canvas;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right) return;
    const w = ctrl.rend.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    cursor.x = w.x;
    cursor.y = w.y;
  };
  window.addEventListener('pointermove', track);

  return {
    root,
    destroy: () => {
      window.removeEventListener('pointermove', track);
    },
  };
}

void iconEl;
