// App navigation: menu ↔ lobby ↔ match lifecycle with shared online wiring.
import { buildMatchConfig, defaultLobbyState, defaultOnlineLobbyState } from '../lobby/build-config';
import { initMatch } from '../sim/factory';
import { serializeReplay } from '../sim/replay';
import { generateRoomCode, joinMultiplayerRoom, rejoinMultiplayerRoom, relayWsUrl } from '../net/multiplayer';
import { clearSave, loadGame, hasContinuableSave } from '../storage/save';
import {
  clearOnlineSession,
  getOnlineSession,
  hasOnlineSession,
  saveOnlineSession,
  type StoredOnlineSession,
} from '../storage/online-session';
import { Game } from './game';
import { ArtGallery, shouldOpenArtGallery } from '../ui/art-gallery';
import { buildSandboxMatchConfig, shouldOpenSandbox } from '../sandbox/sandbox-config';
import { MainMenu } from '../ui/screens';
import { JoinOnlineForm } from '../ui/lobby';
import { MatchLobby } from '../ui/match-lobby';
import type { AudioManager } from '../audio/audio';
import type { Registry } from '../data/registry';
import type { MultiplayerSession } from '../net/multiplayer';
import type { Settings } from '../storage/settings';
import type { LobbyState } from '../lobby/types';
import type { WebSocketTransport } from '../net/ws-transport';

export interface AppRouterDeps {
  host: HTMLElement;
  registry: Registry;
  settings: Settings;
  audio: AudioManager;
}

/** Manages top-level screen transitions and multiplayer session lifecycle. */
export class AppRouter {
  private game: Game | null = null;
  private session: MultiplayerSession | null = null;

  constructor(private deps: AppRouterDeps) {}

  async start(): Promise<void> {
    if (shouldOpenArtGallery()) {
      await this.showArtGallery();
      return;
    }
    if (shouldOpenSandbox()) {
      this.startSandbox();
      return;
    }
    await this.showMenu();
  }

  startSandbox(): void {
    this.clearHost();
    const config = buildSandboxMatchConfig();
    const { state, services } = initMatch(this.deps.registry, config);
    this.game = new Game(this.deps.host, this.deps.registry, state, services, this.deps.audio, this.deps.settings, () => {
      this.game = null;
      void this.showMenu();
    }, {
      useWorker: false,
      matchId: 'sandbox',
      startPaused: true,
      sandbox: true,
      matchConfig: config,
    });
    void this.game.start();
  }

  private clearHost(): void {
    this.deps.host.replaceChildren();
  }

  private disconnectSession(): void {
    this.session?.disconnect();
    this.session = null;
  }

  private wireReconnect(transport: WebSocketTransport, session: StoredOnlineSession): void {
    transport.enableReconnect({
      room: session.room,
      connId: session.connId,
      relayUrl: session.relayUrl,
    });
  }

  private persistOnlineSession(session: MultiplayerSession, seed: number, lobbyState: LobbyState, slotId: string): void {
    const stored: Omit<StoredOnlineSession, 'savedAt'> = {
      room: session.room,
      connId: session.connId,
      slotId,
      seed,
      projectionMode: lobbyState.projectionMode ?? 'ortho',
      relayUrl: relayWsUrl(),
    };
    void saveOnlineSession(stored);
    this.wireReconnect(session.transport, { ...stored, savedAt: Date.now() });
  }

  private startFromLobby(
    state: LobbyState,
    opts?: { session: MultiplayerSession; localPlayerId: string; startPaused?: boolean },
  ): void {
    const config = buildMatchConfig(state);
    const { state: simState, services } = initMatch(this.deps.registry, config);
    this.game = new Game(this.deps.host, this.deps.registry, simState, services, this.deps.audio, this.deps.settings, () => {
      this.disconnectSession();
      void clearOnlineSession();
      this.game = null;
      void this.showMenu();
    }, {
      useWorker: true,
      matchId: 'custom',
      localPlayerId: opts?.localPlayerId,
      deadSpectatorReveal: config.deadSpectatorReveal ?? false,
      matchProjectionMode: state.projectionMode ?? 'ortho',
      startPaused: opts?.startPaused,
      lockstep: opts?.session?.lockstep,
      onDesync: (tick, peers, replay) => {
        console.error('[lockstep] desync at tick', tick, 'peers:', peers);
        console.error('[lockstep] replay:', serializeReplay(replay));
      },
      relayTransport: opts?.session?.transport,
    });
    void this.game.start();
  }

  private wireOnlineLobby(session: MultiplayerSession, lobby: MatchLobby): void {
    session.lobby.onLobbyState = (state) => {
      const mine = state.slots.find((s) => s.claimedBy === session.connId);
      if (mine) lobby.setLocalSlotId(mine.id);
      session.lobbyState = state;
      lobby.setRemoteState(state);
    };

    session.lobby.onMatchStart = (seed, state) => {
      const mine = state.slots.find((s) => s.claimedBy === session.connId);
      lobby.destroy();
      void clearSave();
      this.persistOnlineSession(session, seed, state, mine?.id ?? session.localPlayerId);
      this.startFromLobby({ ...state, seed }, { session, localPlayerId: mine?.id ?? session.localPlayerId });
    };

    session.transport.onError = (msg) => lobby.showError(msg);
  }

  showSoloLobby(): void {
    this.clearHost();
    const lobby = new MatchLobby({
      mode: 'solo',
      registry: this.deps.registry,
      initialState: defaultLobbyState(),
      onStart: (state) => {
        lobby.destroy();
        void clearSave();
        this.startFromLobby(state);
      },
      onBack: () => {
        lobby.destroy();
        void this.showMenu();
      },
    });
    this.deps.host.appendChild(lobby.root);
  }

  async showHostLobby(room: string): Promise<void> {
    this.clearHost();
    const initialState = defaultOnlineLobbyState();
    const hostSlot = initialState.slots[0]!;
    hostSlot.claimedBy = 'pending';
    hostSlot.ready = true;

    try {
      this.session = await joinMultiplayerRoom(room, initialState);
      hostSlot.claimedBy = this.session.connId;

      const mine = this.session.lobbyState.slots.find((s) => s.claimedBy === this.session!.connId);
      const localSlotId = mine?.id ?? this.session.localPlayerId;

      const lobby = new MatchLobby({
        mode: 'host',
        registry: this.deps.registry,
        initialState: this.session.lobbyState,
        room,
        connId: this.session.connId,
        localSlotId,
        isHost: true,
        lobbyClient: this.session.lobby,
        onStart: () => {},
        onBack: () => {
          this.disconnectSession();
          lobby.destroy();
          void this.showMenu();
        },
      });
      this.deps.host.appendChild(lobby.root);
      lobby.setStatus('Share the room code. Configure slots, then start when everyone is ready.');
      this.wireOnlineLobby(this.session, lobby);
    } catch (err) {
      this.disconnectSession();
      const errLobby = new MatchLobby({
        mode: 'solo',
        registry: this.deps.registry,
        initialState: defaultLobbyState(),
        room,
        onStart: () => {},
        onBack: () => {
          errLobby.destroy();
          void this.showMenu();
        },
      });
      this.deps.host.appendChild(errLobby.root);
      errLobby.showError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  async showGuestLobby(room: string): Promise<void> {
    this.clearHost();
    try {
      this.session = await joinMultiplayerRoom(room);
      const lobby = new MatchLobby({
        mode: 'guest',
        registry: this.deps.registry,
        initialState: this.session.lobbyState,
        room,
        connId: this.session.connId,
        localSlotId: undefined,
        lobbyClient: this.session.lobby,
        onStart: () => {},
        onBack: () => {
          this.disconnectSession();
          lobby.destroy();
          void this.showMenu();
        },
      });
      this.deps.host.appendChild(lobby.root);
      lobby.setStatus('Claim a slot, configure your settings, then ready up.');
      this.wireOnlineLobby(this.session, lobby);
    } catch (err) {
      this.disconnectSession();
      const form = new JoinOnlineForm();
      form.onBack = () => {
        form.destroy();
        void this.showMenu();
      };
      form.onJoin = (code) => {
        form.destroy();
        void this.showGuestLobby(code);
      };
      this.deps.host.appendChild(form.root);
      form.showError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  showJoinForm(): void {
    this.clearHost();
    const form = new JoinOnlineForm();
    form.onBack = () => {
      form.destroy();
      void this.showMenu();
    };
    form.onJoin = (room) => {
      form.destroy();
      void this.showGuestLobby(room);
    };
    this.deps.host.appendChild(form.root);
  }

  async showArtGallery(): Promise<void> {
    this.clearHost();
    const gallery = new ArtGallery(this.deps.registry, () => {
      gallery.destroy();
      void this.showMenu();
    });
    this.deps.host.appendChild(gallery.root);
    await gallery.init();
  }

  private async rejoinOnlineMatch(stored: StoredOnlineSession): Promise<void> {
    this.clearHost();
    try {
      this.session = await rejoinMultiplayerRoom(stored.room, stored.connId, stored.relayUrl);
      this.persistOnlineSession(this.session, stored.seed, this.session.lobbyState, stored.slotId);
      this.startFromLobby(
        { ...this.session.lobbyState, seed: stored.seed },
        { session: this.session, localPlayerId: stored.slotId },
      );
    } catch (err) {
      this.disconnectSession();
      await clearOnlineSession();
      await this.showMenu();
      console.error('[rejoin] failed:', err);
    }
  }

  async showMenu(): Promise<void> {
    this.clearHost();
    const [saved, online] = await Promise.all([hasContinuableSave(), hasOnlineSession()]);
    const menu = new MainMenu({
      onCustomGame: () => {
        menu.destroy();
        this.showSoloLobby();
      },
      onCreateOnline: () => {
        menu.destroy();
        void this.showHostLobby(generateRoomCode());
      },
      onJoinOnline: () => {
        menu.destroy();
        this.showJoinForm();
      },
      onContinue: saved
        ? async () => {
            const loaded = await loadGame(this.deps.registry);
            if (!loaded) return;
            menu.destroy();
            this.game = new Game(
              this.deps.host,
              this.deps.registry,
              loaded.state,
              loaded.services,
              this.deps.audio,
              this.deps.settings,
              () => {
                this.game = null;
                void this.showMenu();
              },
              {
                matchProjectionMode: loaded.meta.projectionMode,
                saveMeta: loaded.meta,
                startPaused: loaded.meta.paused,
                localPlayerId: loaded.meta.localPlayerId,
              },
            );
            void this.game.start();
          }
        : null,
      onRejoinOnline: online
        ? async () => {
            const stored = await getOnlineSession();
            if (!stored) return;
            menu.destroy();
            await this.rejoinOnlineMatch(stored);
          }
        : null,
      onDevGallery: () => {
        menu.destroy();
        void this.showArtGallery();
      },
      onDevSandbox: () => {
        menu.destroy();
        this.startSandbox();
      },
    });
    this.deps.host.appendChild(menu.root);
  }
}
