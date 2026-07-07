// App entry point. Boots data, manages the menu <-> match lifecycle, wires global settings.
import './ui/styles.css';
import { initOrientation } from './ui/orientation';
import { initViewport } from './ui/viewport';
import { initPwaUpdates } from './pwa';
import { loadRegistry } from './data/loader';
import { initMatch } from './sim/factory';
import { Game } from './app/game';
import { MainMenu } from './ui/screens';
import { OnlineLobby, JoinOnlineForm } from './ui/lobby';
import { AudioManager } from './audio/audio';
import { loadSettings, type Settings } from './storage/settings';
import { loadGame, hasSave, clearSave } from './storage/save';
import { generateRoomCode, joinMultiplayerRoom, ONLINE_MATCH_ID } from './net/multiplayer';
import { serializeReplay } from './sim/replay';
import type { MultiplayerSession } from './net/multiplayer';

async function boot(): Promise<void> {
  initPwaUpdates();
  initViewport();
  initOrientation();
  const app = document.getElementById('app')!;
  const registry = loadRegistry();
  const settings: Settings = await loadSettings();
  const audio = new AudioManager();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);

  let game: Game | null = null;
  let session: MultiplayerSession | null = null;

  const startLocal = (matchId: string): void => {
    void clearSave();
    const config = registry.match(matchId);
    const { state, services } = initMatch(registry, config);
    game = new Game(app, registry, state, services, audio, settings, () => {
      game = null;
      void showMenu();
    }, { useWorker: true, matchId });
    void game.start();
  };

  const startOnline = async (room: string): Promise<void> => {
    void clearSave();
    const lobby = new OnlineLobby({
      room,
      onCancel: () => {
        session?.disconnect();
        session = null;
        lobby.destroy();
        void showMenu();
      },
    });
    app.appendChild(lobby.root);

    try {
      session = await joinMultiplayerRoom(room, ONLINE_MATCH_ID);
      lobby.setStatus(`You are ${session.localPlayerId}. Waiting for opponent…`);

      session.transport.onWaiting = (count, max) => lobby.setPlayerCount(count, max);
      session.transport.onPeerJoined = (playerId) => lobby.setStatus(`${playerId} joined the room`);

      await session.waitForOpponent();
      lobby.destroy();

      const config = { ...registry.match(session.matchId), seed: session.seed };
      const { state, services } = initMatch(registry, config);

      game = new Game(app, registry, state, services, audio, settings, () => {
        session?.disconnect();
        session = null;
        game = null;
        void showMenu();
      }, {
        lockstep: session.lockstep,
        matchId: session.matchId,
        localPlayerId: session.localPlayerId,
        onDesync: (tick, peers, replay) => {
          console.error('[lockstep] desync at tick', tick, 'peers:', peers);
          console.error('[lockstep] replay:', serializeReplay(replay));
        },
      });
      await game.start();
    } catch (err) {
      session?.disconnect();
      session = null;
      lobby.setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const showJoinForm = (): void => {
    const form = new JoinOnlineForm();
    form.onBack = () => {
      form.destroy();
      void showMenu();
    };
    form.onJoin = (room) => {
      form.destroy();
      void startOnline(room);
    };
    app.appendChild(form.root);
  };

  const showMenu = async (): Promise<void> => {
    const saved = await hasSave();
    const menu = new MainMenu({
      onStart: (matchId) => {
        menu.destroy();
        startLocal(matchId);
      },
      onCreateOnline: () => {
        menu.destroy();
        void startOnline(generateRoomCode());
      },
      onJoinOnline: () => {
        menu.destroy();
        showJoinForm();
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
