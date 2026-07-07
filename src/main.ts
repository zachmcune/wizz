// App entry point. Boots data, manages the menu <-> match lifecycle, wires global settings.
import './ui/styles.css';
import { initOrientation } from './ui/orientation';
import { initViewport } from './ui/viewport';
import { initPwaUpdates } from './pwa';
import { loadRegistry } from './data/loader';
import { buildMatchConfig } from './lobby/build-config';
import { defaultLobbyState, defaultOnlineLobbyState } from './lobby/build-config';
import { initMatch } from './sim/factory';
import { Game } from './app/game';
import { MainMenu } from './ui/screens';
import { JoinOnlineForm } from './ui/lobby';
import { MatchLobby } from './ui/match-lobby';
import { AudioManager } from './audio/audio';
import { loadSettings, type Settings } from './storage/settings';
import { loadGame, hasSave, clearSave } from './storage/save';
import { generateRoomCode, joinMultiplayerRoom } from './net/multiplayer';
import { serializeReplay } from './sim/replay';
import type { MultiplayerSession } from './net/multiplayer';
import type { LobbyState } from './lobby/types';

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
  let lobby: MatchLobby | null = null;

  const startFromLobby = (state: LobbyState, opts?: { session: MultiplayerSession; localPlayerId: string }): void => {
    const config = buildMatchConfig(state);
    const { state: simState, services } = initMatch(registry, config);
    game = new Game(app, registry, simState, services, audio, settings, () => {
      session?.disconnect();
      session = null;
      game = null;
      void showMenu();
    }, {
      useWorker: !opts?.session,
      matchId: 'custom',
      localPlayerId: opts?.localPlayerId,
      lockstep: opts?.session?.lockstep,
      onDesync: (tick, peers, replay) => {
        console.error('[lockstep] desync at tick', tick, 'peers:', peers);
        console.error('[lockstep] replay:', serializeReplay(replay));
      },
      relayTransport: opts?.session?.transport,
    });
    void game.start();
  };

  const showSoloLobby = (): void => {
    lobby = new MatchLobby({
      mode: 'solo',
      registry,
      initialState: defaultLobbyState(),
      onStart: (state) => {
        lobby?.destroy();
        lobby = null;
        void clearSave();
        startFromLobby(state);
      },
      onBack: () => {
        lobby?.destroy();
        lobby = null;
        void showMenu();
      },
    });
    app.appendChild(lobby.root);
  };

  const showHostLobby = async (room: string): Promise<void> => {
    const initialState = defaultOnlineLobbyState();
    const hostSlot = initialState.slots[0]!;
    hostSlot.claimedBy = 'pending';
    hostSlot.ready = true;

    try {
      session = await joinMultiplayerRoom(room, initialState);
      hostSlot.claimedBy = session.connId;

      const mine = session.lobbyState.slots.find((s) => s.claimedBy === session!.connId);
      const localSlotId = mine?.id ?? session.localPlayerId;

      lobby = new MatchLobby({
        mode: 'host',
        registry,
        initialState: session.lobbyState,
        room,
        connId: session.connId,
        localSlotId,
        isHost: true,
        lobbyClient: session.lobby,
        onStart: () => {},
        onBack: () => {
          session?.disconnect();
          session = null;
          lobby?.destroy();
          lobby = null;
          void showMenu();
        },
      });
      app.appendChild(lobby.root);
      lobby.setStatus('Share the room code. Configure slots, then start when everyone is ready.');

      session.lobby.onLobbyState = (state) => {
        const hostMine = state.slots.find((s) => s.claimedBy === session?.connId);
        if (hostMine) lobby?.setLocalSlotId(hostMine.id);
        session!.lobbyState = state;
        lobby?.setRemoteState(state);
      };

      session.lobby.onMatchStart = (seed, state) => {
        const hostMine = state.slots.find((s) => s.claimedBy === session?.connId);
        lobby?.destroy();
        lobby = null;
        void clearSave();
        startFromLobby({ ...state, seed }, { session: session!, localPlayerId: hostMine?.id ?? session!.localPlayerId });
      };
      session.transport.onError = (msg) => lobby?.showError(msg);
    } catch (err) {
      session?.disconnect();
      session = null;
      const errLobby = new MatchLobby({
        mode: 'solo',
        registry,
        initialState: defaultLobbyState(),
        room,
        onStart: () => {},
        onBack: () => {
          errLobby.destroy();
          void showMenu();
        },
      });
      app.appendChild(errLobby.root);
      errLobby.showError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const showGuestLobby = async (room: string): Promise<void> => {
    try {
      session = await joinMultiplayerRoom(room);
      lobby = new MatchLobby({
        mode: 'guest',
        registry,
        initialState: session.lobbyState,
        room,
        connId: session.connId,
        localSlotId: undefined,
        lobbyClient: session.lobby,
        onStart: () => {},
        onBack: () => {
          session?.disconnect();
          session = null;
          lobby?.destroy();
          lobby = null;
          void showMenu();
        },
      });
      app.appendChild(lobby.root);
      lobby.setStatus('Claim a slot, configure your settings, then ready up.');

      session.lobby.onLobbyState = (state) => {
        const mine = state.slots.find((s) => s.claimedBy === session?.connId);
        if (mine) lobby?.setLocalSlotId(mine.id);
        session!.lobbyState = state;
        lobby?.setRemoteState(state);
      };

      session.lobby.onMatchStart = (seed, state) => {
        const mine = state.slots.find((s) => s.claimedBy === session?.connId);
        lobby?.destroy();
        lobby = null;
        void clearSave();
        startFromLobby({ ...state, seed }, { session: session!, localPlayerId: mine?.id ?? session!.localPlayerId });
      };
      session.transport.onError = (msg) => lobby?.showError(msg);
    } catch (err) {
      session?.disconnect();
      session = null;
      const form = new JoinOnlineForm();
      form.onBack = () => {
        form.destroy();
        void showMenu();
      };
      form.onJoin = (code) => {
        form.destroy();
        void showGuestLobby(code);
      };
      app.appendChild(form.root);
      form.showError(err instanceof Error ? err.message : 'Connection failed');
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
      void showGuestLobby(room);
    };
    app.appendChild(form.root);
  };

  const showMenu = async (): Promise<void> => {
    const saved = await hasSave();
    const menu = new MainMenu({
      onCustomGame: () => {
        menu.destroy();
        showSoloLobby();
      },
      onCreateOnline: () => {
        menu.destroy();
        void showHostLobby(generateRoomCode());
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
