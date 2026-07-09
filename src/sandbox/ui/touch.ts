/** True on phones/tablets where the primary input is touch (no hover, coarse pointer). */
export function isTouchPrimaryDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches ||
    'ontouchstart' in window
  );
}

/** Minimum touch target per mobile HIG (44 CSS px). */
export const TOUCH_TARGET_PX = 44;
