import type { BuildingDef, WeaponDef } from '../../data/defs';
import type { Registry } from '../../data/registry';
import { el } from './dom';

export interface InspectPlayer {
  mana: number;
  unlockedTech: readonly string[];
}

export interface BuildingRequirement {
  id: string;
  name: string;
  met: boolean;
}

export interface BuildingInspectFact {
  label: string;
  text: string;
}

export interface BuildingInspectInfo {
  id: string;
  name: string;
  description: string;
  cost: number;
  buildTime: number;
  hp: number;
  powerUsed: number;
  powerProduced: number;
  requires: BuildingRequirement[];
  missingRequires: BuildingRequirement[];
  facts: BuildingInspectFact[];
  statsLine: string;
  statusLine: string;
  subtitle: string;
  unlocked: boolean;
  affordable: boolean;
  canPlace: boolean;
}

function buildingName(registry: Registry, id: string): string {
  return registry.buildings.get(id)?.name ?? id;
}

function joinNames(names: string[]): string {
  return names.join(', ');
}

function weaponFact(weapon: WeaponDef): string {
  const parts: string[] = [`range ${Math.round(weapon.range)}`, `${weapon.damage} dmg`];
  if (weapon.minRange) parts.push(`min ${Math.round(weapon.minRange)}`);
  if (weapon.beam?.kind === 'frost') parts.push('frost beam');
  else if (weapon.beam?.kind === 'flame') parts.push('flame stream');
  if (weapon.chain) parts.push(`chains ${weapon.chain.jumps}×`);
  if (weapon.splashRadius) parts.push('splash');
  if (weapon.impactRadius) parts.push('area impact');
  if (weapon.targetsAir) parts.push('hits air');
  if (weapon.targetsGround === false) parts.push('air only');
  return parts.join(' · ');
}

function capabilityFacts(def: BuildingDef, registry: Registry): BuildingInspectFact[] {
  const facts: BuildingInspectFact[] = [];
  if (def.isRefinery) facts.push({ label: 'Role', text: 'Mana drop-off' });
  if (def.spawnsFreeWisp) facts.push({ label: 'Bonus', text: 'Spawns a free Wisp' });
  if (def.powerProduced) facts.push({ label: 'Power', text: `+${def.powerProduced} for your base` });
  if (def.isRadar) facts.push({ label: 'Radar', text: 'Reveals the full minimap while powered' });
  if (def.isWall) facts.push({ label: 'Role', text: 'Blocks movement' });
  if (def.isGate) facts.push({ label: 'Role', text: 'Allies pass; enemies must break it' });
  if (def.isSuperweapon) facts.push({ label: 'Role', text: 'Superweapon' });
  if (def.packsInto) {
    const packed = registry.units.get(def.packsInto);
    facts.push({ label: 'Packs into', text: packed?.name ?? def.packsInto });
  }
  if (def.producesUnits?.length) {
    const names = def.producesUnits.map((id) => registry.units.get(id)?.name ?? id);
    facts.push({ label: 'Trains', text: joinNames(names) });
  }
  if (def.unlocksSpells?.length) {
    const names = def.unlocksSpells.map((id) => registry.spells.get(id)?.name ?? id);
    facts.push({ label: def.isSuperweapon ? 'Weapon' : 'Spells', text: joinNames(names) });
  }
  if (def.garrison) {
    const allowed = def.garrison.allowedUnitIds?.map((id) => registry.units.get(id)?.name ?? id);
    const who = allowed?.length ? ` (${joinNames(allowed)})` : '';
    facts.push({ label: 'Garrison', text: `${def.garrison.capacity} units${who}` });
  }
  if (def.aura) {
    const who = def.aura.affects === 'buildings' ? 'buildings' : def.aura.affects === 'allies' ? 'allies' : 'friendly units';
    facts.push({ label: 'Aura', text: `Heals ${who} within ${Math.round(def.aura.radius)}` });
  }
  if (def.weapon) facts.push({ label: 'Combat', text: weaponFact(def.weapon) });

  const researchedHere = [...registry.research.values()].filter((r) => r.researchedAt === def.id);
  if (researchedHere.length) {
    facts.push({ label: 'Research', text: joinNames(researchedHere.map((r) => r.name)) });
  }

  const unlockedBuildings = [...registry.buildings.values()]
    .filter((b) => !b.isConstructionYard && b.menuCategory && b.requires.includes(def.id))
    .map((b) => b.name);
  if (unlockedBuildings.length) facts.push({ label: 'Unlocks', text: joinNames(unlockedBuildings) });

  const unlockedUnits = [...registry.units.values()]
    .filter((u) => u.requires.includes(def.id) && u.producedBy !== def.id)
    .map((u) => u.name);
  if (unlockedUnits.length) facts.push({ label: 'Unlocks units', text: joinNames(unlockedUnits) });

  return facts;
}

export function missingRequiresLabel(missing: readonly BuildingRequirement[]): string {
  if (!missing.length) return '';
  return `Needs ${missing.map((r) => r.name).join(' + ')}`;
}

export function buildingInspectInfo(
  def: BuildingDef,
  registry: Registry,
  player: InspectPlayer,
): BuildingInspectInfo {
  const requires = def.requires.map((id) => ({
    id,
    name: buildingName(registry, id),
    met: player.unlockedTech.includes(id),
  }));
  const missingRequires = requires.filter((r) => !r.met);
  const unlocked = missingRequires.length === 0;
  const affordable = player.mana >= def.cost;
  const stats: string[] = [`${def.cost} mana`, `${def.buildTime}s`, `${def.hp} HP`];
  if (def.powerUsed) stats.push(`${def.powerUsed} pwr`);
  if (def.powerProduced) stats.push(`+${def.powerProduced} pwr`);

  let subtitle = stats[0]!;
  if (def.powerUsed) subtitle += ` · ${def.powerUsed} pwr`;
  else if (def.powerProduced) subtitle += ` · +${def.powerProduced} pwr`;
  if (!unlocked) subtitle = missingRequiresLabel(missingRequires);
  else if (!affordable) subtitle = `${def.cost} mana`;

  const statusLine = !unlocked
    ? missingRequiresLabel(missingRequires)
    : !affordable
      ? `Need ${def.cost} mana`
      : 'Ready to place';

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    cost: def.cost,
    buildTime: def.buildTime,
    hp: def.hp,
    powerUsed: def.powerUsed ?? 0,
    powerProduced: def.powerProduced ?? 0,
    requires,
    missingRequires,
    facts: capabilityFacts(def, registry),
    statsLine: stats.join(' · '),
    statusLine,
    subtitle,
    unlocked,
    affordable,
    canPlace: unlocked && affordable,
  };
}

export class BuildingInspectCard {
  readonly root = el('div', 'build-inspect');
  private nameEl = el('div', 'build-inspect-name');
  private closeBtn = el('button', 'build-inspect-close', '×');
  private descEl = el('p', 'build-inspect-desc');
  private statsEl = el('div', 'build-inspect-stats');
  private reqsEl = el('div', 'build-inspect-reqs');
  private factsEl = el('div', 'build-inspect-facts');
  private statusEl = el('div', 'build-inspect-status');
  private shownId: string | null = null;
  private reqKey = '';

  constructor(onClose: () => void) {
    this.closeBtn.type = 'button';
    this.closeBtn.title = 'Close';
    this.closeBtn.setAttribute('aria-label', 'Close building info');
    this.closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClose();
    });
    const head = el('div', 'build-inspect-head');
    head.append(this.nameEl, this.closeBtn);
    this.root.append(head, this.descEl, this.statsEl, this.reqsEl, this.factsEl, this.statusEl);
    this.root.hidden = true;
  }

  get defId(): string | null {
    return this.shownId;
  }

  show(info: BuildingInspectInfo): void {
    const reqKey = info.requires.map((r) => `${r.id}:${r.met ? 1 : 0}`).join(',');
    const same = this.shownId === info.id && this.reqKey === reqKey;
    this.shownId = info.id;
    this.reqKey = reqKey;
    this.root.hidden = false;
    this.root.classList.toggle('locked', !info.unlocked);
    this.root.classList.toggle('unaffordable', info.unlocked && !info.affordable);
    this.statusEl.textContent = info.statusLine;
    this.statusEl.className = `build-inspect-status ${!info.unlocked ? 'locked' : !info.affordable ? 'unaffordable' : 'ready'}`;
    if (same) return;
    this.nameEl.textContent = info.name;
    this.descEl.textContent = info.description;
    this.statsEl.textContent = info.statsLine;
    this.renderRequires(info);
    this.renderFacts(info.facts);
  }

  hide(): void {
    this.shownId = null;
    this.reqKey = '';
    this.root.hidden = true;
  }

  private renderRequires(info: BuildingInspectInfo): void {
    this.reqsEl.innerHTML = '';
    if (!info.requires.length) {
      this.reqsEl.hidden = true;
      return;
    }
    this.reqsEl.hidden = false;
    this.reqsEl.appendChild(el('span', 'build-inspect-reqs-label', info.unlocked ? 'Requires' : 'Needs'));
    for (const req of info.requires) {
      const chip = el('span', `build-req ${req.met ? 'met' : 'missing'}`, req.name);
      chip.title = req.met ? `Have ${req.name}` : `Build ${req.name} first`;
      this.reqsEl.appendChild(chip);
    }
  }

  private renderFacts(facts: BuildingInspectFact[]): void {
    this.factsEl.innerHTML = '';
    if (!facts.length) {
      this.factsEl.hidden = true;
      return;
    }
    this.factsEl.hidden = false;
    for (const fact of facts) {
      const row = el('div', 'build-inspect-fact');
      row.append(el('span', 'build-inspect-fact-label', fact.label), el('span', 'build-inspect-fact-text', fact.text));
      this.factsEl.appendChild(row);
    }
  }
}
