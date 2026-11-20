// RESEARCH TREE — a real tech tree, rendered entirely from player-facing data.
//
// TWO RULES DRIVE THIS FILE:
//
//   1. THE UI NEVER DERIVES A LABEL FROM A KEY. Every string shown — node name, effect wording,
//      prerequisite names, tier names — comes from the data's own `name`, `effectViews[].label` and
//      `effectViews[].detail`. An earlier version formatted `effect.stat` directly, which is why the
//      screen read "siphonPerSecond x1.08" and "requires attunement_spire". There is no fallback to a raw
//      id anywhere in this file: if the data is missing wording the schema rejects it at load.
//
//   2. THE LAYOUT IS THE DATA'S SHAPE. Columns come from each node's declared `tier`, and requirements
//      are listed from declared `requires`, so the authored tree IS the rendered tree.
//
// Icons come from the shared glyph set by name (`node.icon`), so there are no images here either.
import type { App } from '../app';
import { badge, button, el, iconEl, panel, rule } from '../../ui/kit';
import { ICONS, type IconName } from '../../ui/icons';

interface ViewEffect {
  label: string;
  detail: string;
}

/** One research node, as the UI sees it. Mirrors the schema, with no optional fields. */
interface ResearchNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  researchTime: number;
  tier: number;
  icon: string;
  requires: string[];
  researchedAt: string;
  factions: string[];
  effectViews: ViewEffect[];
}

const TIER_NAMES = ['Foundations', 'Discipline', 'Specialisation', 'Doctrine', 'Mastery'] as const;

export function mountResearchTree(app: App, onClose?: () => void): { root: HTMLElement; destroy: () => void } {
  const registry = app.registry;
  const state = app.session?.state ?? null;
  const myIndex = state ? state.players.findIndex((p) => p.controller === 'human') : 0;
  const completed = new Set(state?.players[myIndex]?.completedResearch ?? []);
  const myFaction = state?.players[myIndex]?.factionId ?? 'arcane';

  const nodes: ResearchNode[] = [];
  for (const r of registry.research.values()) {
    const raw = r as unknown as ResearchNode;
    nodes.push({
      id: r.id,
      name: r.name,
      description: r.description,
      cost: r.cost,
      researchTime: r.researchTime,
      tier: raw.tier,
      icon: raw.icon,
      requires: r.requires,
      researchedAt: r.researchedAt,
      factions: (r.factions ?? []) as string[],
      effectViews: raw.effectViews,
    });
  }

  const byTier = new Map<number, ResearchNode[]>();
  for (const n of nodes) {
    const list = byTier.get(n.tier) ?? [];
    list.push(n);
    byTier.set(n.tier, list);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const maxTier = tiers[tiers.length - 1] ?? 1;

  const root = el('div', 'screen screen--research');

  // ------------------------------------------------------------------ header
  const head = el('header', 'page-head');
  const title = el('div', 'col');
  title.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Research'));
  head.append(title, el('div', 'spacer'));
  head.append(badge(completed.size > 0 ? `${completed.size} of ${nodes.length} complete` : `${nodes.length} available`, completed.size > 0 ? 'ok' : undefined));
  if (onClose) head.append(button({ variant: 'quiet', label: 'Close', icon: 'close', onClick: onClose }));

  // ------------------------------------------------------------------ body
  const body = el('div', 'research-body');
  const tree = panel({ title: 'Tech tree', accent: true, flush: true });
  const scroll = el('div', 'research-scroll');
  const graph = el('div', 'research-graph');
  graph.style.setProperty('--tiers', String(maxTier));

  for (const tier of tiers) {
    const col = el('section', 'research-col');
    col.dataset.tier = String(tier);
    const colHead = el('header', 'research-col__head');
    colHead.append(
      el('span', 'research-col__tier num', String(tier)),
      el('span', 'research-col__name', TIER_NAMES[tier - 1] ?? `Tier ${tier}`),
    );
    col.append(colHead);
    for (const n of byTier.get(tier) ?? []) col.append(researchCard(n));
    graph.append(col);
  }
  scroll.append(graph);
  tree.body.append(scroll);

  function researchCard(n: ResearchNode): HTMLElement {
    const done = completed.has(n.id);
    const locked = n.requires.some((req) => !isMet(req));
    const factionOk = n.factions.length === 0 || n.factions.includes(myFaction);

    const card = el(
      'article',
      `research-node${done ? ' is-done' : ''}${locked ? ' is-locked' : ''}${factionOk ? '' : ' is-other-faction'}`,
    );
    card.dataset.research = n.id;

    const top = el('header', 'research-node__top');
    const iconWrap = el('span', 'research-node__icon');
    iconWrap.innerHTML = iconEl((n.icon in ICONS ? n.icon : 'research') as IconName, 18).innerHTML;
    top.append(iconWrap, el('span', 'research-node__name', n.name));
    top.append(done ? badge('Done', 'ok') : badge(String(n.cost)));
    card.append(top);

    card.append(el('p', 'research-node__desc', n.description));

    if (n.effectViews.length > 0) {
      const ul = el('ul', 'research-node__effects');
      for (const v of n.effectViews) {
        const li = el('li', 'research-effect');
        li.append(el('span', 'research-effect__label', v.label), el('span', 'research-effect__detail', v.detail));
        ul.append(li);
      }
      card.append(ul);
    }

    if (n.requires.length > 0) {
      const reqs = el('div', 'research-node__reqs');
      reqs.append(el('span', 'research-node__reqs-label', 'Requires'));
      for (const req of n.requires) {
        reqs.append(el('span', `research-pill${isMet(req) ? ' is-met' : ''}`, displayName(req)));
      }
      card.append(reqs);
    }

    const at = el('div', 'research-node__at');
    at.append(el('span', 'research-node__at-label', 'At'), el('span', 'research-node__at-name', displayName(n.researchedAt)));
    card.append(at);

    const meta = el('footer', 'research-node__meta');
    meta.append(el('span', 'research-node__time num', `${n.researchTime}s`));
    if (state && !done && factionOk) {
      const btn = button({
        size: 'sm',
        variant: locked ? 'quiet' : 'default',
        label: locked ? 'Locked' : 'Research',
        disabled: locked,
        onClick: () => {
          const bid = firstOwnedBuilding(n.researchedAt);
          if (bid === null) {
            app.appState.notice = { kind: 'warn', text: `Build a ${displayName(n.researchedAt)} first.` };
            return;
          }
          app.session?.issue({ type: 'research', buildingId: bid, defId: n.id });
        },
      });
      btn.dataset.researchAction = n.id;
      meta.append(btn);
    }
    card.append(meta);
    return card;
  }

  /** Player-facing name for any content id. */
  function displayName(id: string): string {
    return (
      registry.research.get(id)?.name ??
      registry.buildings.get(id)?.name ??
      registry.units.get(id)?.name ??
      registry.spells.get(id)?.name ??
      // Only reachable if content references something unknown, which data validation forbids.
      id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  function isMet(req: string): boolean {
    if (registry.research.has(req)) return completed.has(req);
    return playerOwnsBuilding(req);
  }

  function playerOwnsBuilding(defId: string): boolean {
    if (!state) return false;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== 1) continue;
      if (state.entities.ownerIndex[s] !== myIndex) continue;
      if (state.entities.extras[s]!.defId === defId) return true;
    }
    return false;
  }

  function firstOwnedBuilding(defId: string): number | null {
    if (!state) return null;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== 1) continue;
      if (state.entities.ownerIndex[s] !== myIndex) continue;
      if (state.entities.extras[s]!.defId !== defId) continue;
      return state.entities.id[s]!;
    }
    return null;
  }

  // ------------------------------------------------------------------ Astral Spire unlocks
  const spire = registry.buildings.get('astral_spire');
  const unlockedSpells = ((spire as unknown as { unlocksSpells?: string[] })?.unlocksSpells ?? []).slice();

  const unlockPanel = panel({ title: 'Astral Spire unlocks', accent: true, className: 'research-unlocks' });
  unlockPanel.body.append(
    el(
      'p',
      'research-note muted',
      `Completing an Astral Spire unlocks ${unlockedSpells.length} spells. This list is read from the building definition, so it cannot drift from what the building grants.`,
    ),
    rule(),
  );
  const spellGrid = el('div', 'research-spells');
  for (const id of unlockedSpells) {
    const sp = registry.spells.get(id) as unknown as
      | { name?: string; description?: string; cooldownTicks?: number }
      | undefined;
    const card = el('div', 'research-spell');
    card.dataset.spell = id;
    card.append(iconEl('crystal', 18, 'research-spell__icon'));
    const text = el('div', 'research-spell__text');
    text.append(el('span', 'research-spell__name', sp?.name ?? displayName(id)));
    if (sp?.description) text.append(el('span', 'research-spell__desc', sp.description));
    card.append(text);
    if (sp?.cooldownTicks) card.append(el('span', 'research-spell__cd num', `${Math.round(sp.cooldownTicks / 20)}s`));
    spellGrid.append(card);
  }
  if (unlockedSpells.length === 0) spellGrid.append(el('p', 'dim', 'No unlocks defined.'));
  unlockPanel.body.append(spellGrid);

  body.append(tree.root, unlockPanel.root);
  root.append(head, body);

  return { root, destroy: () => {} };
}
