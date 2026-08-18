// Shared VFX density (0–1). Renderer sets this from the graphics profile.
// Combat-critical tells stay on; decorative motes/runes scale down.

let density = 1;

export function setVfxDensity(value: number): void {
  density = Math.max(0, Math.min(1, value));
}

export function vfxDensity(): number {
  return density;
}

export function vfxCount(full: number): number {
  if (density <= 0 || full <= 0) return 0;
  return Math.max(density >= 0.5 ? 1 : 0, Math.round(full * density));
}

export function vfxDecorEnabled(): boolean {
  return density >= 0.4;
}
