// Service worker registration with automatic update checks.
// The injected registerSW.js script only registers once and never polls for updates.
import { registerSW } from 'virtual:pwa-register';

const CHECK_MS = 3 * 60 * 1000;

export function initPwaUpdates(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      window.setInterval(check, CHECK_MS);
    },
  });
}
