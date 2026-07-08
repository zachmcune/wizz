// Ambient types for the JS lockstep relay so TS consumers (tests) can import it.
export interface RelayClientInfo {
  connId: string;
  slotId: string | null;
  lastAckTick: number;
  lastAckAtMs: number;
}

export class Room {
  constructor(id: string, rooms: Map<string, Room>);
  id: string;
  seed: number;
  tick: number;
  started: boolean;
  clients: Map<unknown, RelayClientInfo>;
  canAdvance(): boolean;
  tryAdvance(): void;
  advance(): void;
  receiveAck(ws: unknown, tick: number): void;
  requestSnapshot(ws: unknown): void;
  receiveSnapshot(ws: unknown, fromTick: number, state: unknown): void;
}

export const DEFAULT_LOBBY: unknown;

export function attachRelay(server: unknown): { readonly roomCount: number };
