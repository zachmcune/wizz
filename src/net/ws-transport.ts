// WebSocket transport implementing the lockstep Transport interface.
import type { Command } from '../sim/types';
import type { Transport } from './lockstep';
import type { ClientMessage, ServerMessage } from './protocol';

export class WebSocketTransport implements Transport {
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => this.handleMessage(ev));
  }

  send(forTick: number, cmds: Command[]): void {
    this.post({ t: 'commands', forTick, cmds });
  }

  reportChecksum(tick: number, hash: string): void {
    this.post({ t: 'checksum', tick, hash });
  }

  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
  }

  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
  }

  join(room: string, playerId: string): void {
    this.post({ t: 'join', room, playerId });
  }

  private post(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'tick':
        this.tickCb?.(msg.tick, msg.cmds);
        break;
      case 'peerChecksum':
        this.peerCb?.(msg.playerId, msg.tick, msg.hash);
        break;
      case 'joined':
      case 'peerLeft':
        break;
    }
  }
}

export interface LockstepJoinResult {
  playerId: string;
  seed: number;
  startTick: number;
}

/** Wait for the relay join ack after sending a join message. */
export function waitForJoin(ws: WebSocket, timeoutMs = 10_000): Promise<LockstepJoinResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('Lockstep join timed out'));
    }, timeoutMs);

    const onMessage = (ev: MessageEvent): void => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t !== 'joined') return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve({ playerId: msg.playerId, seed: msg.seed, startTick: msg.startTick });
    };

    ws.addEventListener('message', onMessage);
  });
}
