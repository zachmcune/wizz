// RESEARCH TREE — the tech view, with the Astral Spire's unlocks shown explicitly.
//
// The plan requires §16 (research UI) and Zac's accepted decision §3.6: "surface what Astral Spire
// unlocks". The Astral Spire's `unlocksSpells` array is the data source, so the panel cannot drift from
// what the building actually grants — if a spell is added to the JSON it appears here automatically.
//
// Rendered as a dependency graph by requirement depth: root research on the left, dependants to the
// right. Nodes are real DOM plates with connectors drawn as CSS borders, so there are no images.
import type { App } from '../app';
import { badge, button, el, iconEl, panel, rule } from '../../ui/kit';

interface Node {
  id: string;
  name: string;
  cost: number;
  requires: string[];
  researchedAt: string[];
  effects: string[];
  depth: number;
}

export function mountResearchTree(app: App, onClose?: () => void): { root: HTMLElement; destroy: () => void } {
  const registry = app.registry;
  const state = app.session?.state ?? null;
  const myIndex = state ? state.players.findIndex((p) => p.controller === 'human') : 0;
  const completed = new Set(state?.players[myIndex]?.completedResearch ?? []);

  // ---- build the graph
  const nodes: Node[] = [];
  for (const r of registry.research.values()) {
    const requires = (r as unknown as { requires?: string[] }).requires ?? [];
    nodes.push({
      id: r.id,
      name: r.name,
      cost: r.cost,
      requires,
      // `researchedAt` is a single building id in the data schema, not a list. Normalising here rather
      // than assuming an array is what keeps the panel from crashing on the real content.
      researchedAt: normalizeIds((r as unknown as { researchedAt?: string | string[] }).researchedAt),
      effects: describeEffects(r),
      depth: 0,
    });
  }
  // Depth = longest chain of prerequisites. Resolved iteratively so a cycle cannot hang the loop.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const n of nodes) {
      for (const req of n.requires) {
        const parent = nodes.find((x) => x.id === req);
        if (parent && parent.depth + 1 > n.depth) {
          n.depth = parent.depth + 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const byDepth = new Map<number, Node[]>();
  for (const n of nodes) {
    const list = byDepth.get(n.depth) ?? [];
    list.push(n);
    byDepth.set(n.depth, list);
  }
  const maxDepth = Math.max(0, ...byDepth.keys());

  // ---- the Astral Spire's unlocks, read from data
  const spire = registry.buildings.get('astral_spire');
  const unlockedSpells = (spire as unknown as { unlocksSpells?: string[] })?.unlocksSpells ?? [];

  const root = el('div', 'screen screen--research');

  const head = el('header', 'page-head');
  const title = el('div', 'col');
  title.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Research'));
  head.append(title, el('div', 'spacer'), badge(`${completed.size} / ${nodes.length} complete`));
  if (onClose) head.append(button({ variant: 'quiet', label: 'Close', icon: 'close', onClick: onClose }));

  // ---- tree
  const tree = panel({ title: 'Tech tree', accent: true, flush: true });
  const graph = el('div', 'research-graph');
  graph.style.gridTemplateColumns = `repeat(${maxDepth + 1}, minmax(180px, 1fr))`;
  for (let d = 0; d <= maxDepth; d++) {
    const col = el('div', 'research-col');
    col.append(el('span', 'eyebrow', d === 0 ? 'Tier 1' : `Tier ${d + 1}`));
    for (const n of byDepth.get(d) ?? []) {
      const done = completed.has(n.id);
      const card = el('div', `research-node${done ? ' is-done' : ''}`);
      card.dataset.research = n.id;
      const top = el('div', 'research-node__top');
      top.append(el('span', 'research-node__name', n.name), done ? badge('Done', 'ok') : badge(`${n.cost}`));
      card.append(top);
      if (n.effects.length) {
        const ul = el('ul', 'research-node__effects');
        for (const e of n.effects) ul.append(el('li', undefined, e));
        card.append(ul);
      }
      if (n.researchedAt.length) {
        card.append(el('span', 'research-node__at dim', `at ${n.researchedAt.map(pretty).join(', ')}`));
      }
      if (n.requires.length) {
        card.append(el('span', 'research-node__req dim', `requires ${n.requires.map((x) => registry.research.get(x)?.name ?? x).join(', ')}`));
      }
      if (state && !done) {
        card.append(
          button({
            size: 'sm',
            variant: 'quiet',
            label: 'Research',
            onClick: () => {
              // Research runs at a building, so find one that can do it.
              const at = n.researchedAt[0];
              const bid = firstOwnedBuilding(app, at);
              if (bid === null) {
                app.appState.notice = { kind: 'warn', text: `Build a ${pretty(at ?? '')} first.` };
                return;
              }
              app.session?.issue({ type: 'research', buildingId: bid, defId: n.id });
            },
          }),
        );
      }
      col.append(card);
    }
    graph.append(col);
  }
  tree.body.append(graph);

  // ---- Astral Spire unlocks (Zac's accepted §3.6)
  const unlockPanel = panel({ title: 'Astral Spire unlocks', accent: true });
  unlockPanel.body.append(
    el('p', 'muted research-note',
      `Building an Astral Spire unlocks ${unlockedSpells.length} spells. This list is read from the ` +
      `building definition, so it cannot drift from what the building actually grants.`),
    rule(),
  );
  const spellGrid = el('div', 'research-spells');
  for (const id of unlockedSpells) {
    const sp = registry.spells.get(id);
    const card = el('div', 'research-spell');
    card.dataset.spell = id;
    card.append(iconEl('crystal', 18, 'icon'), el('span', 'research-spell__name', sp?.name ?? id));
    if (sp) {
      const d = sp as unknown as { description?: string; cooldownSeconds?: number; radius?: number };
      if (d.description) card.append(el('span', 'research-spell__desc dim', d.description));
    }
    spellGrid.append(card);
  }
  if (unlockedSpells.length === 0) spellGrid.append(el('p', 'dim', 'No unlocks defined.'));
  unlockPanel.body.append(spellGrid);

  const body = el('div', 'research-body');
  body.append(tree.root, unlockPanel.root);
  root.append(head, body);

  return { root, destroy: () => {} };
}

// ───────────────────────────────────────────────────────────────────────── helpers

function describeEffects(r: unknown): string[] {
  const out: string[] = [];
  const effects = (r as { effects?: unknown[] }).effects ?? [];
  for (const e of effects) {
    const eff = e as Record<string, unknown>;
    const kind = String(eff.kind ?? '');
    const stat = String(eff.stat ?? '');
    const op = String(eff.operation ?? '');
    const val = eff.value;
    if (kind === 'unitStatModifier') {
      const roles = Array.isArray(eff.roles) ? (eff.roles as string[]).join(', ') : 'units';
      out.push(`${roles}: ${stat} ${op === 'multiply' ? `×${val}` : `${op} ${val}`}`);
    } else if (kind === 'buildingStatModifier') {
      const ids = Array.isArray(eff.buildingIds) ? (eff.buildingIds as string[]).join(', ') : 'buildings';
      out.push(`${ids}: ${stat} ${op === 'multiply' ? `×${val}` : `${op} ${val}`}`);
    } else if (kind === 'economyModifier') {
      out.push(`${stat} ${op === 'multiply' ? `×${val}` : `${op} ${val}`}`);
    } else if (kind) {
      out.push(`${kind}${stat ? ` · ${stat}` : ''}`);
    }
  }
  return out;
}

/** Accept one id or many, always return a list. */
function normalizeIds(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pretty(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstOwnedBuilding(app: App, defId: string | undefined): number | null {
  const ctrl = app.session;
  if (!ctrl) return null;
  const st = ctrl.state;
  const myIndex = st.players.findIndex((p) => p.id === ctrl.me);
  for (let s = 0; s < st.entities.count; s++) {
    if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
    if (st.entities.ownerIndex[s] !== myIndex) continue;
    if (defId && st.entities.extras[s]!.defId !== defId) continue;
    return st.entities.id[s]!;
  }
  return null;
}
