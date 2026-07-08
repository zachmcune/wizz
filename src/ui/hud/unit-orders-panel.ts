import type { Registry } from '../../data/registry';
import type { GameState, Entity, PlayerId, UnitEntity } from '../../sim/types';
import { isUnit, isBuilding } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { el } from './dom';
import { Collapsible } from './collapsible';

export class UnitOrdersPanel {
  readonly panel: Collapsible;
  readonly row = el('div', 'card-row stance-row');
  readonly deployBtn = el('button', 'btn', 'Deploy');
  readonly packBtn = el('button', 'btn', 'Pack Up');
  readonly conjureBtn = el('button', 'btn', 'Conjure');
  readonly garrisonBtn = el('button', 'btn', 'Garrison');

  constructor(
    private state: () => GameState,
    private registry: Registry,
    private controller: InputController,
    private playerId: PlayerId,
    startOpen: boolean,
  ) {
    this.panel = new Collapsible('Unit orders', startOpen);
    this.panel.body.append(this.row);
    this.buildButtons();
  }

  private buildButtons(): void {
    const deselect = el('button', 'btn', 'Deselect');
    deselect.addEventListener('click', () => this.controller.clearSelection());
    const stop = el('button', 'btn', 'Stop');
    stop.addEventListener('click', () => this.controller.stop());
    const am = el('button', 'btn', 'Attack-Move');
    am.addEventListener('click', () => this.controller.setMode('attackMove'));
    const mio = el('button', 'btn', 'Move in Order');
    mio.addEventListener('click', () => this.controller.setMode('moveInOrder'));
    this.deployBtn.style.display = 'none';
    this.packBtn.style.display = 'none';
    this.deployBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.startDeploy(id);
    });
    this.packBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.pack(id);
    });
    this.conjureBtn.style.display = 'none';
    this.conjureBtn.addEventListener('click', () => {
      const st = this.state();
      const ids = [...this.controller.session.selection].filter((id) => {
        const e = st.entities.get(id);
        return e?.owner === this.playerId && e.kind === 'unit' && this.registry.units.get(e.defId)?.canConjureMana;
      });
      if (!ids.length) return;
      const single = st.entities.get(ids[0]!);
      this.controller.channel(ids, !(single && isUnit(single) && single.channeling));
    });
    this.garrisonBtn.style.display = 'none';
    this.garrisonBtn.addEventListener('click', () => this.controller.startGarrison());
    this.row.append(deselect, stop, am, mio, this.deployBtn, this.packBtn, this.conjureBtn, this.garrisonBtn);
  }

  update(
    single: Entity | null,
    sel: Entity[],
    inPlaceMode: boolean,
  ): void {
    const wagonReady =
      single != null &&
      isUnit(single) &&
      single.owner === this.playerId &&
      single.defId === 'waystone_wagon' &&
      single.morphProgress === undefined &&
      single.state === 'idle' &&
      single.orders.length === 0;
    const campReady =
      single != null &&
      isBuilding(single) &&
      single.owner === this.playerId &&
      single.defId === 'waystone_camp' &&
      single.morphProgress === undefined &&
      !(single.productionQueue?.length);
    this.deployBtn.style.display = wagonReady && !inPlaceMode ? '' : 'none';
    this.packBtn.style.display = campReady && !inPlaceMode ? '' : 'none';

    const weaversSelected = sel.filter(
      (e): e is UnitEntity =>
        e.owner === this.playerId && e.kind === 'unit' && !!this.registry.units.get(e.defId)?.canConjureMana,
    );
    const showConjure = !inPlaceMode && weaversSelected.length > 0;
    this.conjureBtn.style.display = showConjure ? '' : 'none';
    if (showConjure) {
      const channeling = weaversSelected.some((e) => e.channeling);
      const bal = this.registry.balance;
      this.conjureBtn.textContent = channeling
        ? 'Stop Conjuring'
        : `Conjure (${bal.conjureManaAmount}/${bal.conjureManaIntervalSeconds}s)`;
      this.conjureBtn.classList.toggle('active', channeling);
    }

    const garrisonableSelected = sel.some(
      (e) =>
        e.owner === this.playerId &&
        e.kind === 'unit' &&
        e.garrisonedIn === undefined &&
        !!this.registry.units.get(e.defId)?.canGarrison,
    );
    this.garrisonBtn.style.display = !inPlaceMode && garrisonableSelected ? '' : 'none';
  }
}
