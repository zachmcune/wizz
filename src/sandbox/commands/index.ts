import { registerCommand, type SandboxContext } from '../command-registry';

function reg(
  id: string,
  category: import('../command-registry').CommandCategory,
  aliases: string[],
  description: string,
  params: import('../command-registry').ParamDef[],
  help: string,
  execute: (ctx: SandboxContext, args: Record<string, string | number | boolean>) => string | null,
): void {
  registerCommand({ id, category, aliases, description, params, help, execute });
}

function idsFromRegistry(ctx: SandboxContext, kind: 'units' | 'buildings' | 'spells'): string[] {
  const map =
    kind === 'units' ? ctx.registry.units : kind === 'buildings' ? ctx.registry.buildings : ctx.registry.spells;
  return [...map.keys()].sort();
}

export function registerSandboxCommands(): void {
  reg('give', 'economy', ['give mana'], 'Add mana to local player', [{ name: 'amount', type: 'number' }], 'give 50000', (ctx, a) => {
    ctx.controller.setPlayerMana(ctx.humanId, a.amount as number, 'add');
    return null;
  });

  reg('set', 'economy', ['set mana'], 'Set mana for local player', [{ name: 'amount', type: 'number' }], 'set 5000', (ctx, a) => {
    ctx.controller.setPlayerMana(ctx.humanId, a.amount as number, 'set');
    return null;
  });

  reg('spawn', 'units', ['spawn unit'], 'Spawn units at camera', [
    { name: 'defId', type: 'string', autocomplete: (ctx, p) => idsFromRegistry(ctx, 'units').filter((id) => id.includes(p)) },
    { name: 'count', type: 'number', optional: true },
  ], 'spawn archer 20', (ctx, a) => {
    const defId = a.defId as string;
    if (!ctx.registry.units.has(defId)) return `Unknown unit: ${defId}`;
    ctx.controller.spawnUnit(ctx.humanId, defId, (a.count as number) || 1);
    return null;
  });

  reg('build', 'buildings', [], 'Spawn building at camera', [
    { name: 'defId', type: 'string', autocomplete: (ctx, p) => idsFromRegistry(ctx, 'buildings').filter((id) => id.includes(p)) },
  ], 'build arcane_nexus', (ctx, a) => {
    const defId = a.defId as string;
    if (!ctx.registry.buildings.has(defId)) return `Unknown building: ${defId}`;
    ctx.controller.spawnBuilding(ctx.humanId, defId, true);
    return null;
  });

  reg('delete', 'units', ['delete selected'], 'Delete selected entities', [], 'delete selected', (ctx) => {
    ctx.controller.destroySelected();
    return null;
  });

  reg('heal', 'units', ['heal selected'], 'Heal selected to full', [], 'heal selected', (ctx) => {
    ctx.controller.healSelected();
    return null;
  });

  reg('kill', 'units', ['kill selected', 'kill all'], 'Kill selected units', [], 'kill selected', (ctx) => {
    ctx.controller.killSelected();
    return null;
  });

  reg(
    'toggle-infinite-mana',
    'economy',
    ['infinite mana', 'toggle infinite mana'],
    'Toggle infinite mana',
    [{ name: 'state', type: 'string', optional: true }],
    'infinite mana on',
    (ctx) => {
      ctx.controller.toggleSetting('economy', 'infiniteMana');
      return null;
    },
  );

  reg(
    'toggle-infinite-power',
    'economy',
    ['infinite power', 'toggle infinite power'],
    'Toggle infinite power',
    [{ name: 'state', type: 'string', optional: true }],
    'infinite power on',
    (ctx) => {
      ctx.controller.toggleSetting('economy', 'infinitePower');
      return null;
    },
  );

  reg('reveal', 'map', ['reveal map'], 'Reveal entire map', [], 'reveal map', (ctx) => {
    ctx.controller.setSetting('map', { revealMap: true, fogEnabled: false });
    return null;
  });

  reg('restart', 'sandbox', ['restart scenario'], 'Restart current scenario', [], 'restart scenario', (ctx) => {
    ctx.controller.restartScenario();
    return null;
  });

  reg('clear', 'combat', ['clear battlefield'], 'Remove all units', [], 'clear battlefield', (ctx) => {
    ctx.controller.clearUnits();
    return null;
  });

  reg('unlock', 'research', ['unlock tech'], 'Unlock all building tech', [], 'unlock tech', (ctx) => {
    ctx.controller.unlockAllTech();
    return null;
  });

  reg('cast', 'spells', [], 'Cast spell at camera', [
    { name: 'spellId', type: 'string', autocomplete: (ctx, p) => idsFromRegistry(ctx, 'spells').filter((id) => id.includes(p)) },
  ], 'cast overcharge', (ctx, a) => {
    const spellId = a.spellId as string;
    if (!ctx.registry.spells.has(spellId)) return `Unknown spell: ${spellId}`;
    ctx.controller.castSpell(spellId);
    return null;
  });
}

registerSandboxCommands();
