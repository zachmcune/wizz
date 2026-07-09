// Sandbox settings persisted on GameState for scenario save/load.

export interface SandboxEconomySettings {
  infiniteMana: boolean;
  noCosts: boolean;
  instantBuild: boolean;
  instantProduce: boolean;
  instantResearch: boolean;
  ignoreTechRequirements: boolean;
}

export interface SandboxBuildSettings {
  ignorePlacementRestrictions: boolean;
}

export interface SandboxAiSettings {
  paused: boolean;
  disabled: boolean;
  forceMode: 'none' | 'attack' | 'defend' | 'expand';
  revealIntel: boolean;
}

export interface SandboxMapSettings {
  fogEnabled: boolean;
  revealMap: boolean;
}

export interface SandboxGameplaySettings {
  disableWinCheck: boolean;
  freezeUnits: boolean;
  freezeProjectiles: boolean;
  freezeAi: boolean;
  /** When enabled, switch the local human to any player slot from the sandbox panel. */
  multiPlayerControl: boolean;
}

export interface SandboxSpellSettings {
  noCooldowns: boolean;
  noManaCost: boolean;
}

export interface SandboxOverlaySettings {
  fps: boolean;
  frameTime: boolean;
  memory: boolean;
  unitIds: boolean;
  healthBars: boolean;
  currentTarget: boolean;
  aiState: boolean;
  currentPath: boolean;
  collisionShapes: boolean;
  attackRadius: boolean;
  visionRadius: boolean;
  cooldownTimers: boolean;
  spellRadius: boolean;
  pathfinding: boolean;
  collision: boolean;
  navigationGrid: boolean;
  buildingFootprints: boolean;
}

export interface SandboxSettings {
  economy: SandboxEconomySettings;
  build: SandboxBuildSettings;
  ai: SandboxAiSettings;
  map: SandboxMapSettings;
  gameplay: SandboxGameplaySettings;
  spells: SandboxSpellSettings;
  overlays: SandboxOverlaySettings;
}

export interface SandboxRuntime {
  enabled: true;
  settings: SandboxSettings;
}

export function defaultSandboxSettings(overrides?: Partial<SandboxSettings>): SandboxSettings {
  const base: SandboxSettings = {
    economy: {
      infiniteMana: false,
      noCosts: false,
      instantBuild: false,
      instantProduce: false,
      instantResearch: false,
      ignoreTechRequirements: false,
    },
    build: {
      ignorePlacementRestrictions: false,
    },
    ai: {
      paused: false,
      disabled: false,
      forceMode: 'none',
      revealIntel: false,
    },
    map: {
      fogEnabled: true,
      revealMap: false,
    },
    gameplay: {
      disableWinCheck: true,
      freezeUnits: false,
      freezeProjectiles: false,
      freezeAi: false,
      multiPlayerControl: false,
    },
    spells: {
      noCooldowns: false,
      noManaCost: false,
    },
    overlays: {
      fps: true,
      frameTime: false,
      memory: false,
      unitIds: false,
      healthBars: false,
      currentTarget: false,
      aiState: false,
      currentPath: false,
      collisionShapes: false,
      attackRadius: false,
      visionRadius: false,
      cooldownTimers: false,
      spellRadius: false,
      pathfinding: false,
      collision: false,
      navigationGrid: false,
      buildingFootprints: false,
    },
  };
  if (!overrides) return base;
  return {
    economy: { ...base.economy, ...overrides.economy },
    build: { ...base.build, ...overrides.build },
    ai: { ...base.ai, ...overrides.ai },
    map: { ...base.map, ...overrides.map },
    gameplay: { ...base.gameplay, ...overrides.gameplay },
    spells: { ...base.spells, ...overrides.spells },
    overlays: { ...base.overlays, ...overrides.overlays },
  };
}
