// App entry point. Boots data, manages the menu <-> match lifecycle, wires global settings.
import './ui/styles.css';
import { loadRegistry } from './data/loader';
import { initMatch } from './sim/factory';
import { Game } from './app/game';
import { MainMenu } from './ui/screens';
import { AudioManager } from './audio/audio';
import { loadSettings, type Settings } from './storage/settings';
import { loadGame, hasSave, clearSave } from './storage/save';

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const registry = loadRegistry();
  const settings: Settings = await loadSettings();
  const audio = new AudioManager();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);

  let game: Game | null = null;

  const showMenu = async (): Promise<void> => {
    const saved = await hasSave();
    const menu = new MainMenu({
      onStart: (matchId) => {
        void clearSave();
        menu.destroy();
        const config = registry.match(matchId);
        const { state, services } = initMatch(registry, config);
        game = new Game(app, registry, state, services, audio, settings, () => {
          game = null;
          void showMenu();
        });
        void game.start();
      },
      onContinue: saved
        ? async () => {
            const loaded = await loadGame(registry);
            if (!loaded) return;
            menu.destroy();
            game = new Game(app, registry, loaded.state, loaded.services, audio, settings, () => {
              game = null;
              void showMenu();
            });
            void game.start();
          }
        : null,
    });
    app.appendChild(menu.root);
  };

  await showMenu();
}

void boot();
