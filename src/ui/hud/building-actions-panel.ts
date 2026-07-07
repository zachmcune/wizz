import type { Registry } from '../../data/registry';
import type { BuildingDef } from '../../data/defs';
import type { GameState, Entity, Player } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { el } from './dom';

export class BuildingActionsPanel {
  readonly row = el('div', 'card-row building-row');
  readonly sellBtn = el('button', 'btn', 'Sell');
  readonly repairBtn = el('button', 'btn', 'Repair');
  readonly rallyBtn = el('button', 'btn', 'Set Rally');

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
      this.controller.setRepair(id, !b?.repairing);
    });
    this.rallyBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.startRally(id);
    });
    this.row.append(this.sellBtn, this.repairBtn, this.rallyBtn);
  }

  update(
    player: Player,
    ownBuilding: BuildingDef | null | undefined,
    single: Entity | null,
    inPlaceMode: boolean,
    inRallyMode: boolean,
  ): void {
    const completeBuilding = ownBuilding && single && single.buildProgress === undefined && single.morphProgress === undefined;
    const canSell = !!completeBuilding && !ownBuilding.isConstructionYard;
    const canRepair = !!completeBuilding && single!.hp < single!.maxHp;
    const canRally = !!completeBuilding && !!ownBuilding.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showBuildingRow =
      (!inPlaceMode || inRallyMode) && !!ownBuilding && (canSell || canRepair || canRally || single?.repairing);
    this.row.style.display = showBuildingRow ? 'flex' : 'none';
    this.sellBtn.style.display = canSell ? '' : 'none';
    if (canSell && ownBuilding) {
      const refund = Math.floor(ownBuilding.cost * this.registry.balance.sellRefundRatio);
      this.sellBtn.textContent = `Sell (+${refund})`;
      this.sellBtn.disabled = !!(single?.productionQueue?.length || single?.repairing);
    }
    this.repairBtn.style.display = canRepair || single?.repairing ? '' : 'none';
    if (canRepair || single?.repairing) {
      const repairing = !!single?.repairing;
      const costPerTick = this.registry.balance.repairHpPerTick * this.registry.balance.repairManaPerHp;
      const costLabel = costPerTick < 1 ? costPerTick.toFixed(1) : String(Math.round(costPerTick));
      this.repairBtn.textContent = repairing ? 'Stop Repair' : `Repair (${costLabel}/tick)`;
      this.repairBtn.classList.toggle('active', repairing);
      this.repairBtn.disabled = !repairing && player.mana < costPerTick;
    }
    this.rallyBtn.style.display = canRally ? '' : 'none';
    this.rallyBtn.classList.toggle('active', inRallyMode);
    if (canRally && single?.rally) {
      this.rallyBtn.textContent = 'Set Rally ✓';
    } else {
      this.rallyBtn.textContent = inRallyMode ? 'Cancel Rally' : 'Set Rally';
    }
  }
}
