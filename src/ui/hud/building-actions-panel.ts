import type { Registry } from '../../data/registry';
import type { BuildingDef } from '../../data/defs';
import type { GameState, Entity, Player } from '../../sim/types';
import { isBuilding } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { el } from './dom';

const LASER_SVG =
  '<svg class="sw-launch-svg" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2v6M12 16v6M8 6l2.5 2.5M13.5 15.5L16 18M6 8l2.5 2.5M15.5 15.5L18 18M4 12h6M14 12h6M6 16l2.5-2.5M15.5 8.5L18 6" ' +
  'stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '<circle cx="12" cy="12" r="3.5" fill="currentColor"/>' +
  '</svg>';

export class BuildingActionsPanel {
  readonly row = el('div', 'card-row building-row');
  readonly sellBtn = el('button', 'btn', 'Sell');
  readonly repairBtn = el('button', 'btn', 'Repair');
  readonly rallyBtn = el('button', 'btn', 'Rally');
  readonly launchBtn = el('button', 'btn superweapon-launch-btn');
  private launchIconGray = el('span', 'sw-launch-icon sw-launch-gray');
  private launchIconColor = el('span', 'sw-launch-icon sw-launch-color');
  private launchLabel = el('span', 'sw-launch-label', 'Astral Lance');

  constructor(
    private state: () => GameState,
    private registry: Registry,
    private controller: InputController,
  ) {
    this.row.style.display = 'none';
    this.sellBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.sellBuilding(id);
    });
    this.repairBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id === undefined) return;
      const st = this.state();
      const b = st.entities.get(id);
      this.controller.setRepair(id, !(b && isBuilding(b) && b.repairing));
    });
    this.rallyBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id === undefined) return;
      if (this.controller.session.mode === 'rally' && this.controller.session.rallyBuildingId === id) {
        this.controller.setMode('normal');
        return;
      }
      this.controller.startRally(id);
    });
    this.launchIconGray.innerHTML = LASER_SVG;
    this.launchIconColor.innerHTML = LASER_SVG;
    this.launchBtn.append(this.launchIconGray, this.launchIconColor, this.launchLabel);
    this.launchBtn.title = 'Launch Astral Lance';
    this.launchBtn.addEventListener('click', () => {
      const spellId = this.launchBtn.dataset.spellId;
      if (!spellId || this.launchBtn.disabled) return;
      this.controller.startSuperweapon(spellId);
    });
    this.row.append(this.launchBtn, this.sellBtn, this.repairBtn, this.rallyBtn);
  }

  update(
    player: Player,
    ownBuilding: BuildingDef | null | undefined,
    single: Entity | null,
    inPlaceMode: boolean,
    inRallyMode: boolean,
  ): void {
    const st = this.state();
    const building = single && isBuilding(single) ? single : null;
    const completeBuilding = ownBuilding && building && building.buildProgress === undefined && building.morphProgress === undefined;
    const canSell = !!completeBuilding && !ownBuilding.isConstructionYard;
    const canRepair = !!completeBuilding && building!.hp < building!.maxHp;
    const canRally = !!completeBuilding && !!ownBuilding.producesUnits?.length && !ownBuilding.isConstructionYard;

    const spellId = ownBuilding?.isSuperweapon ? ownBuilding.unlocksSpells?.[0] : undefined;
    const spellDef = spellId ? this.registry.spells.get(spellId) : undefined;
    const cd = spellId ? (player.spellCooldowns[spellId] ?? 0) : 0;
    const beamActive = spellId ? st.beams.some((b) => b.owner === player.id) : false;
    const canLaunch = !!completeBuilding && !!spellId && !!spellDef;
    const launchReady = canLaunch && cd === 0 && !beamActive;
    const maxCd = spellDef?.cooldownTicks ?? 1;
    const readyFrac = cd <= 0 ? 1 : Math.max(0, Math.min(1, 1 - cd / maxCd));
    const clipBottom = (1 - readyFrac) * 100;

    const showBuildingRow =
      (!inPlaceMode || inRallyMode) &&
      !!ownBuilding &&
      (canSell || canRepair || canRally || building?.repairing || canLaunch);
    this.row.style.display = showBuildingRow ? 'flex' : 'none';

    this.launchBtn.style.display = canLaunch ? '' : 'none';
    if (canLaunch && spellId) {
      this.launchBtn.dataset.spellId = spellId;
      this.launchBtn.disabled = !launchReady;
      this.launchBtn.classList.toggle('ready', launchReady);
      this.launchBtn.classList.toggle('charging', !launchReady && cd > 0);
      this.launchBtn.classList.toggle('firing', beamActive);
      this.launchIconColor.style.clipPath = `inset(0 0 ${clipBottom}% 0)`;
      if (beamActive) {
        this.launchLabel.textContent = 'Firing…';
      } else if (launchReady) {
        this.launchLabel.textContent = 'Launch';
      } else {
        const secs = Math.ceil(cd / 20);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        this.launchLabel.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }
    }

    this.sellBtn.style.display = canSell ? '' : 'none';
    if (canSell && ownBuilding) {
      const refund = Math.floor(ownBuilding.cost * this.registry.balance.sellRefundRatio);
      this.sellBtn.textContent = `Sell (+${refund})`;
      this.sellBtn.disabled = !!(building?.productionQueue?.length || building?.repairing);
    }
    this.repairBtn.style.display = canRepair || building?.repairing ? '' : 'none';
    if (canRepair || building?.repairing) {
      const repairing = !!building?.repairing;
      const costPerTick = this.registry.balance.repairHpPerTick * this.registry.balance.repairManaPerHp;
      const costLabel = costPerTick < 1 ? costPerTick.toFixed(1) : String(Math.round(costPerTick));
      this.repairBtn.textContent = repairing ? 'Stop Repair' : `Repair (${costLabel}/tick)`;
      this.repairBtn.classList.toggle('active', repairing);
      this.repairBtn.disabled = !repairing && player.mana < costPerTick;
    }
    this.rallyBtn.style.display = canRally ? '' : 'none';
    this.rallyBtn.classList.toggle('active', inRallyMode);
    if (inRallyMode) {
      this.rallyBtn.textContent = 'Cancel';
      this.rallyBtn.title = 'Cancel rally placement';
    } else if (canRally && building?.rally) {
      this.rallyBtn.textContent = 'Rally';
      this.rallyBtn.title = 'Move rally point';
    } else {
      this.rallyBtn.textContent = 'Rally';
      this.rallyBtn.title = 'Set rally point';
    }
  }
}
