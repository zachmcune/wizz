// Persisted online match session so a player can rejoin after disconnect or app reload.
import { del, get, set } from 'idb-keyval';
import type { ProjectionMode } from '../core/projection';

const SESSION_KEY = 'arcane:online-session';
/** Drop stale sessions after this window (matches relay rejoin grace). */
export const ONLINE_SESSION_TTL_MS = 30 * 60 * 1000;

export interface StoredOnlineSession {
  room: string;
  connId: string;
  slotId: string;
  seed: number;
  projectionMode: ProjectionMode;
  relayUrl: string;
  savedAt: number;
}

export async function saveOnlineSession(session: Omit<StoredOnlineSession, 'savedAt'>): Promise<void> {
  await set(SESSION_KEY, { ...session, savedAt: Date.now() } satisfies StoredOnlineSession);
}

export async function getOnlineSession(): Promise<StoredOnlineSession | null> {
  const raw = (await get(SESSION_KEY)) as StoredOnlineSession | undefined;
  if (!raw?.room || !raw.connId || !raw.slotId) return null;
  if (Date.now() - raw.savedAt > ONLINE_SESSION_TTL_MS) {
    await clearOnlineSession();
    return null;
  }
  return raw;
}

export async function hasOnlineSession(): Promise<boolean> {
  return (await getOnlineSession()) !== null;
}

export async function clearOnlineSession(): Promise<void> {
  await del(SESSION_KEY);
}
