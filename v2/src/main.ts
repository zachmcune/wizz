// v2 entry point.
//
// Phase 1 is the foundation: this boot screen exists to make the phase's work VISIBLE and
// verifiable in a browser at all four target viewports. It intentionally renders real data from
// the real registry — content counts, faction rosters, map lint results, and a live RNG probe —
// rather than placeholder text, so a screenshot is evidence rather than decoration.
//
// The game proper arrives in Phase 2+ ; this file is replaced by the app shell then.

import './styles/boot.css';
import { loadRegistry } from './data/loader';
import { lintMaps } from './map-lint';
import { RNG_STREAMS, streamFor } from './core/rng';
import { hashState } from './sim/hash';
import { EntityStore } from './sim/entity-store';
import { TICK_HZ, MAX_UNITS_PER_PLAYER } from './core/constants';
import type { Registry } from './data/registry';

interface BootFacts {
  units: number;
  buildings: number;
  spells: number;
  projectiles: number;
  factions: number;
  maps: number;
  matches: number;
  research: number;
  mapLintIssues: number;
  factionRosters: { id: string; name: string; units: number; buildings: number; accent: string }[];
  seedsDiffer: boolean;
  hashA: string;
  hashB: string;
  rngDraws: Record<string, number>;
  loadMs: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Build a throwaway state so the RNG and hash proofs run in the browser too. */
function proveSeedIsLive(reg: Registry): Pick<BootFacts, 'seedsDiffer' | 'hashA' | 'hashB' | 'rngDraws'> {
  const makeState = (seed: number) => {
    const entities = new EntityStore(16);
    entities.setOwners(['player0', 'player1']);
    entities.spawnUnit(1, 0, 'wisp', 0, 900, 900, reg.unit('wisp').hp, reg.unit('wisp').radius);
    return {
      tick: 0,
      seed,
      rng: Object.fromEntries(RNG_STREAMS.map((s) => [s, streamFor(seed, s).state()])),
      players: [
        {
          id: 'player0',
          controller: 'human' as const,
          team: 0,
          color: '#4f9dff',
          mana: reg.balance.startingMana,
          power: 0,
          powerUsed: 0,
          unlockedTech: [] as string[],
          completedResearch: [] as string[],
          spellCooldowns: {},
          defeated: false,
          explored: [] as number[],
          visible: [] as number[],
          knownBuildings: {},
        },
      ],
      relations: { player0: { player0: 'ally' as const } },
      entities,
      nextEntityId: 2,
      mapId: 'duel_glade',
      winnerTeam: null,
      ended: false,
      beams: [],
      oneSuperweaponPerPlayer: true,
    };
  };

  const a = makeState(1);
  const b = makeState(99999);
  const hashA = hashState(a);
  const hashB = hashState(b);

  // Prove the streams are genuinely consumed, not just stored.
  const draws: Record<string, number> = {};
  for (const stream of RNG_STREAMS) {
    const rng = streamFor(12345, stream);
    rng.uint32();
    rng.uint32();
    draws[stream] = rng.draws;
  }

  return { seedsDiffer: hashA !== hashB, hashA, hashB, rngDraws: draws };
}

function collectFacts(reg: Registry, loadMs: number): BootFacts {
  const seedProof = proveSeedIsLive(reg);
  const factionRosters = [...reg.factions.values()].map((f) => ({
    id: f.id,
    name: f.name,
    units: reg.unitsForFaction(f.id).length,
    buildings: reg.buildingsForFaction(f.id).length,
    accent: f.accent ?? '#9b8cff',
  }));

  return {
    units: reg.units.size,
    buildings: reg.buildings.size,
    spells: reg.spells.size,
    projectiles: reg.projectiles.size,
    factions: reg.factions.size,
    maps: reg.maps.size,
    matches: reg.matches.size,
    research: reg.research.size,
    mapLintIssues: lintMaps(reg.maps.values()).length,
    factionRosters,
    loadMs: Math.round(loadMs * 10) / 10,
    ...seedProof,
  };
}

function statRow(label: string, value: string | number, ok?: boolean): HTMLElement {
  const row = el('div', 'kv');
  row.append(el('span', 'k', label), el('span', `v${ok === undefined ? '' : ok ? ' ok' : ' bad'}`, String(value)));
  return row;
}

function render(host: HTMLElement, facts: BootFacts, reg: Registry): void {
  host.replaceChildren();

  const header = el('div');
  header.append(
    el('h1', undefined, 'Arcane Dominion'),
    el('p', 'sub', `v2 · Phase 1 foundation · ${TICK_HZ} Hz deterministic sim`),
  );

  const content = el('div', 'card');
  content.append(el('h2', undefined, 'Content loaded'));
  const contentRow = el('div', 'row');
  contentRow.append(
    statRow('units', facts.units),
    statRow('buildings', facts.buildings),
    statRow('spells', facts.spells),
    statRow('projectiles', facts.projectiles),
    statRow('factions', facts.factions),
    statRow('maps', facts.maps),
    statRow('matches', facts.matches),
    statRow('research', facts.research),
    statRow('load', `${facts.loadMs} ms`),
  );
  content.append(contentRow);

  const integrity = el('div', 'card');
  integrity.append(el('h2', undefined, 'Integrity checks'));
  const integrityRow = el('div', 'row');
  integrityRow.append(
    statRow('map lint issues', facts.mapLintIssues, facts.mapLintIssues === 0),
    statRow('seeds differ', facts.seedsDiffer ? 'yes' : 'NO', facts.seedsDiffer),
    statRow('hash(seed 1)', facts.hashA),
    statRow('hash(seed 99999)', facts.hashB),
    statRow(`RNG draws/stream`, Object.values(facts.rngDraws).join('/'), Object.values(facts.rngDraws).every((n) => n > 0)),
    statRow('unit cap', MAX_UNITS_PER_PLAYER),
  );
  integrity.append(integrityRow);

  const factions = el('div', 'card');
  factions.append(el('h2', undefined, 'Faction rosters'));
  const fgrid = el('div', 'grid');
  for (const f of facts.factionRosters) {
    const chip = el('div', 'chip');
    const nameWrap = el('span');
    const dot = el('span');
    dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${f.accent};margin-right:6px`;
    nameWrap.append(dot, document.createTextNode(f.name));
    chip.append(nameWrap, el('span', 'cost', `${f.units}u / ${f.buildings}b`));
    fgrid.append(chip);
  }
  factions.append(fgrid);

  const maps = el('div', 'card');
  maps.append(el('h2', undefined, 'Maps'));
  const mgrid = el('div', 'grid');
  for (const m of reg.maps.values()) {
    const chip = el('div', 'chip');
    chip.append(
      el('span', undefined, m.name),
      el('span', 'cost', `${m.tileW}×${m.tileH} · ${m.startLocations.length}p`),
    );
    mgrid.append(chip);
  }
  maps.append(mgrid);

  host.append(header, content, integrity, factions, maps);
}

function renderError(host: HTMLElement, err: unknown): void {
  host.replaceChildren();
  host.append(el('h1', undefined, 'Arcane Dominion'));
  const card = el('div', 'card err');
  card.append(el('h2', undefined, 'Content failed to load'));
  card.append(document.createTextNode(err instanceof Error ? err.message : String(err)));
  host.append(card);
}

function boot(): void {
  const host = document.getElementById('boot');
  if (!host) return;
  const t0 = performance.now();
  try {
    const reg = loadRegistry();
    const facts = collectFacts(reg, performance.now() - t0);
    render(host, facts, reg);
    // Expose for the Playwright proof harness so screenshots can assert real values.
    (window as unknown as { __v2Boot?: BootFacts }).__v2Boot = facts;
  } catch (err) {
    renderError(host, err);
    (window as unknown as { __v2BootError?: string }).__v2BootError =
      err instanceof Error ? err.message : String(err);
  }
}

boot();
