import type { BuildMenuCategory, MenuCategory, TrainMenuCategory } from '../../data/defs';

export const BUILD_MENU_CATEGORIES: BuildMenuCategory[] = ['buildings', 'defenses', 'advanced'];

export const TRAIN_MENU_CATEGORIES: TrainMenuCategory[] = [
  'workers',
  'small_troops',
  'large_troops',
  'wizards',
];

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  buildings: 'Buildings',
  defenses: 'Defenses',
  advanced: 'Advanced',
  workers: 'Workers',
  small_troops: 'Small Troops',
  large_troops: 'Large Troops',
  wizards: 'Wizards',
};

export function isBuildCategory(category: MenuCategory): category is BuildMenuCategory {
  return (BUILD_MENU_CATEGORIES as readonly string[]).includes(category);
}

export function isTrainCategory(category: MenuCategory): category is TrainMenuCategory {
  return (TRAIN_MENU_CATEGORIES as readonly string[]).includes(category);
}
