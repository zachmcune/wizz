import type { TeamLabel } from './types';

export const TEAM_LABELS: readonly TeamLabel[] = ['a', 'b', 'c', 'd'];

export function teamLabelToId(label: TeamLabel): number {
  return TEAM_LABELS.indexOf(label);
}

export function teamIdToLabel(id: number): TeamLabel {
  return TEAM_LABELS[id] ?? 'a';
}

export function teamLabelDisplay(label: TeamLabel): string {
  return label.toUpperCase();
}
