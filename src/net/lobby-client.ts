// Client-side lobby sync over the relay WebSocket.
import type { LobbyState } from '../lobby/types';
import { lobbyStateFromWire, lobbyStateToWire } from './lobby-wire';
import type { ClientMessage, LobbyStateWire, ServerMessage } from './protocol';
import type { WebSocketTransport } from './ws-transport';

export interface LobbyJoinResult {
  connId: string;
  playerId: string;
  seed: number;
  isHost: boolean;
  lobbyState: LobbyState;
  waiting: boolean;
}

export class LobbyClient {
  onLobbyState: ((state: LobbyState) => void) | null = null;
  onWaiting: ((count: number, max: number) => void) | null = null;
  onPeerJoined: ((playerId: string) => void) | null = null;
  onPeerLeft: ((playerId: string) => void) | null = null;
  onMatchStart: ((seed: number, state: LobbyState) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor(private transport: WebSocketTransport) {
    transport.onLobbyMessage = (msg) => this.handle(msg);
  }

  updateLobby(state: LobbyState): void {
    this.post({ t: 'lobbyUpdate', state: lobbyStateToWire(state) });
  }

  claimSlot(
    slotId: string,
    team: string,
    color: string,
    startIndex: number,
    factionId: string,
  ): void {
    this.post({ t: 'claimSlot', slotId, team, color, startIndex, factionId });
  }

  setReady(slotId: string, ready: boolean): void {
    this.post({ t: 'slotReady', slotId, ready });
  }

  startMatch(): void {
    this.post({ t: 'startMatch' });
  }

  private post(msg: ClientMessage): void {
    this.transport.sendRaw(msg);
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'lobbyState':
        this.onLobbyState?.(lobbyStateFromWire(msg.state));
        break;
      case 'waiting':
        this.onWaiting?.(msg.playerCount, msg.maxPlayers);
        break;
      case 'peerJoined':
        this.onPeerJoined?.(msg.playerId);
        break;
      case 'peerLeft':
        this.onPeerLeft?.(msg.playerId);
        break;
      case 'matchStart':
        this.onMatchStart?.(msg.seed, lobbyStateFromWire(msg.state));
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
      default:
        break;
    }
  }
}

export function parseLobbyJoin(msg: ServerMessage): LobbyJoinResult | null {
  if (msg.t !== 'joined') return null;
  return {
    connId: msg.connId,
    playerId: msg.playerId,
    seed: msg.seed,
    isHost: msg.isHost,
    lobbyState: lobbyStateFromWire(msg.lobbyState),
    waiting: msg.waiting,
  };
}

export function wireLobbyForJoin(state: LobbyState): LobbyStateWire {
  return lobbyStateToWire(state);
}
