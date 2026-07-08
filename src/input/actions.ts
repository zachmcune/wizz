export const CONTROL_ACTIONS = {
  select: 'select',
  moveOrder: 'moveOrder',
  boxSelect: 'boxSelect',
  panCamera: 'panCamera',
  zoomCamera: 'zoomCamera',
  deselect: 'deselect',
  castSpellTarget: 'castSpellTarget',
  placeBuilding: 'placeBuilding',
  deployUnit: 'deployUnit',
  setRallyPoint: 'setRallyPoint',
  garrisonUnit: 'garrisonUnit',
  unloadGarrison: 'unloadGarrison',
  attackMoveTarget: 'attackMoveTarget',
  moveInOrderTarget: 'moveInOrderTarget',
} as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[keyof typeof CONTROL_ACTIONS];

export interface ControlBinding {
  touch: boolean;
  mouse: boolean;
  keyboard: boolean;
  description: string;
}

export const CONTROL_BINDINGS = {
  [CONTROL_ACTIONS.select]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click friendly units or buildings to select them.',
  },
  [CONTROL_ACTIONS.moveOrder]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map with movable units selected to issue a move order.',
  },
  [CONTROL_ACTIONS.boxSelect]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Long-press/drag or left-drag a rectangle to select multiple units.',
  },
  [CONTROL_ACTIONS.panCamera]: {
    touch: true,
    mouse: true,
    keyboard: true,
    description: 'Two-finger drag, middle-mouse drag, touchpad scroll, or WASD/arrows pan the camera.',
  },
  [CONTROL_ACTIONS.zoomCamera]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Use the on-screen zoom slider and buttons.',
  },
  [CONTROL_ACTIONS.deselect]: {
    touch: true,
    mouse: true,
    keyboard: true,
    description: 'Use the HUD deselect control or Escape.',
  },
  [CONTROL_ACTIONS.castSpellTarget]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map while a spell or superweapon is targeting.',
  },
  [CONTROL_ACTIONS.placeBuilding]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map to place a building preview.',
  },
  [CONTROL_ACTIONS.deployUnit]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map to deploy a packed unit or building.',
  },
  [CONTROL_ACTIONS.setRallyPoint]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map while setting a production rally point.',
  },
  [CONTROL_ACTIONS.garrisonUnit]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Select garrison-capable ranged units, then tap/click a friendly bunker or use the Garrison button.',
  },
  [CONTROL_ACTIONS.unloadGarrison]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Select an occupied bunker and use its garrison button to unload all occupants.',
  },
  [CONTROL_ACTIONS.attackMoveTarget]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map while attack-move targeting is active.',
  },
  [CONTROL_ACTIONS.moveInOrderTarget]: {
    touch: true,
    mouse: true,
    keyboard: false,
    description: 'Tap/click the map while move-in-order targeting is active.',
  },
} satisfies Record<ControlAction, ControlBinding>;
