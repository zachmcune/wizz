// App entry point. Boots data and delegates navigation to AppRouter.
import './ui/styles.css';
import { initOrientation } from './ui/orientation';
import { initViewport } from './ui/viewport';
import { initPwaUpdates } from './pwa';
import { loadRegistry } from './data/loader';
import { AppRouter } from './app/app-router';
import { AudioManager } from './audio/audio';
import { loadSettings } from './storage/settings';
import { resolveProjectionMode, setProjectionMode } from './core/projection';

async function boot(): Promise<void> {
  initPwaUpdates();
  initViewport();
  initOrientation();
  const host = document.getElementById('app')!;
  const registry = loadRegistry();
  const settings = await loadSettings();
  setProjectionMode(resolveProjectionMode(settings.projectionMode));
  const audio = new AudioManager();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);

  const router = new AppRouter({ host, registry, settings, audio });
  await router.start();
}

void boot();
