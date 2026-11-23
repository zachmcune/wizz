// RELAY RESOLUTION — which server a build talks to, and why it matters.
//
// THE BUG THIS PINS. `resolveRelayUrl` defaulted every non-localhost origin to `${origin}/relay`. That is
// correct for v1, which is served by the Railway process that also hosts the relay. The v2 preview is a
// static Cloudflare Pages bundle: there is no `/relay` path on it, so every deployed build tried to open
// a socket to a URL that returns 404, and the multiplayer screen sat on "connecting" with no cause.
//
// The fix is a resolution ORDER, and each step is asserted here:
//
//   1. `?relay=` — an explicit override, which is also how the Playwright proof points a page at a local
//      relay without rebuilding, and how a developer tests a candidate deployment.
//   2. `VITE_RELAY_URL` — the build-time variable v1 honours, so one build can target any relay.
//   3. localhost / 127.0.0.1 — the dev server has no relay, so the dev default is the relay's own port.
//   4. anything else — the live Railway relay.
//
// The normaliser is tested too, because `https://host/some/path` and a trailing slash both arrived from
// real clipboard pastes and `new WebSocket()` throws a bare `SyntaxError` on them.

import { describe, expect, it, afterEach } from 'vitest';
import {
  DEFAULT_RELAY_URL,
  inviteLinkFor,
  normalizeRelayUrl,
  resolveRelayUrl,
} from '../../src/app/screens/multiplayer';

const ORIGINAL = (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;

afterEach(() => {
  // Vitest does not restore `import.meta.env` between cases, so it is restored explicitly here.
  if (ORIGINAL === undefined) delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
  else (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL = ORIGINAL;
});

describe('relay: the deployed default is the live Railway relay', () => {
  it('a Cloudflare Pages origin resolves to the Railway relay, not a same-origin /relay path', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    const url = resolveRelayUrl('', 'https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev');
    expect(url).toBe(DEFAULT_RELAY_URL);
    expect(url).toBe('wss://wizzrts.up.railway.app');
    // The exact regression: a same-origin path would be a 404 on a static host.
    expect(url).not.toContain('pages.dev');
    expect(url).not.toContain('/relay');
  });

  it('the default is a WebSocket URL on the secure scheme', () => {
    expect(DEFAULT_RELAY_URL.startsWith('wss://')).toBe(true);
  });

  it('any http(s) origin that is not localhost gets the Railway relay', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    for (const origin of [
      'https://example.com',
      'https://wizz-aw8.pages.dev',
      'http://10.0.0.5:8080',
      'https://preview-abc.wizz.pages.dev',
    ]) {
      expect(resolveRelayUrl('', origin), origin).toBe(DEFAULT_RELAY_URL);
    }
  });
});

describe('relay: localhost points at the local dev relay', () => {
  it('http://localhost:5173 becomes ws://localhost:8787', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    expect(resolveRelayUrl('', 'http://localhost:5173')).toBe('ws://localhost:8787');
  });

  it('the relay port replaces whatever port the dev server used', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    expect(resolveRelayUrl('', 'http://127.0.0.1:5343')).toBe('ws://127.0.0.1:8787');
    expect(resolveRelayUrl('', 'http://localhost:9999')).toBe('ws://localhost:8787');
  });

  it('a bare localhost origin with no port still resolves to the relay port', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    expect(resolveRelayUrl('', 'http://localhost')).toBe('ws://localhost:8787');
  });

  it('does not treat a hostname that merely CONTAINS localhost as local', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    // "localhost.example.com" is a different host; a substring match would have sent it to :8787.
    expect(resolveRelayUrl('', 'https://localhost.example.com')).toBe(DEFAULT_RELAY_URL);
  });
});

describe('relay: the ?relay= override wins, and is normalised', () => {
  it('an explicit ws URL is used verbatim', () => {
    expect(resolveRelayUrl('?relay=ws://127.0.0.1:8787', 'https://anything.example')).toBe('ws://127.0.0.1:8787');
  });

  it('an https URL is rewritten to wss and stripped of a trailing slash', () => {
    expect(resolveRelayUrl('?relay=https://relay.example.com/', 'https://anything.example')).toBe(
      'wss://relay.example.com',
    );
  });

  it('a bare host is assumed secure', () => {
    expect(resolveRelayUrl('?relay=relay.example.com', 'https://anything.example')).toBe('wss://relay.example.com');
  });

  it('overrides every other source, including the environment', () => {
    (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL = 'wss://from-env.example';
    expect(resolveRelayUrl('?relay=ws://from-query:9000', 'https://anything.example')).toBe('ws://from-query:9000');
  });

  it('an empty ?relay= falls back to the default rather than producing an empty URL', () => {
    delete (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
    expect(resolveRelayUrl('?relay=', 'https://anything.example')).toBe(DEFAULT_RELAY_URL);
  });
});

describe('relay: VITE_RELAY_URL is honoured like v1', () => {
  it('the build-time variable overrides the origin default', () => {
    (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL = 'wss://staging-relay.example';
    expect(resolveRelayUrl('', 'https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev')).toBe('wss://staging-relay.example');
  });

  it('the environment also wins over the localhost default', () => {
    (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL = 'ws://127.0.0.1:9999';
    expect(resolveRelayUrl('', 'http://localhost:5173')).toBe('ws://127.0.0.1:9999');
  });

  it('an http scheme in the variable is normalised to ws', () => {
    (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL = 'https://relay.example.com';
    expect(resolveRelayUrl('', 'https://anything.example')).toBe('wss://relay.example.com');
  });
});

describe('relay: normalizeRelayUrl accepts what a person actually pastes', () => {
  it('passes a clean wss URL through unchanged', () => {
    expect(normalizeRelayUrl('wss://wizzrts.up.railway.app')).toBe('wss://wizzrts.up.railway.app');
  });

  it('strips trailing slashes from every scheme', () => {
    expect(normalizeRelayUrl('wss://host/')).toBe('wss://host');
    expect(normalizeRelayUrl('https://host//')).toBe('wss://host');
    expect(normalizeRelayUrl('ws://host:8787/')).toBe('ws://host:8787');
  });

  it('trims whitespace', () => {
    expect(normalizeRelayUrl('  wss://host  ')).toBe('wss://host');
  });

  it('an empty string becomes the default', () => {
    expect(normalizeRelayUrl('')).toBe(DEFAULT_RELAY_URL);
    expect(normalizeRelayUrl('   ')).toBe(DEFAULT_RELAY_URL);
  });

  it('keeps a path, because a relay can legitimately live under one', () => {
    expect(normalizeRelayUrl('https://example.com/relay')).toBe('wss://example.com/relay');
  });
});

describe('relay: the invite link carries everything a guest needs', () => {
  it('names the screen, the room and the relay', () => {
    const link = inviteLinkFor('ABC42', 'wss://wizzrts.up.railway.app', 'https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev/v2/app.html?screen=menu');
    const url = new URL(link);
    expect(url.searchParams.get('screen')).toBe('multiplayer');
    expect(url.searchParams.get('room')).toBe('ABC42');
    expect(url.searchParams.get('relay')).toBe('wss://wizzrts.up.railway.app');
    // And it points at the host the link was built from, not a hard-coded one.
    expect(url.host).toBe('cursor-rebuild-v2-5642.wizz-aw8.pages.dev');
  });

  it('upper-cases the room so a guest typing lower case still lands', () => {
    const url = new URL(inviteLinkFor('abc42', 'wss://relay', 'https://x.example/v2/app.html'));
    expect(url.searchParams.get('room')).toBe('ABC42');
  });

  it('replaces an existing room parameter instead of adding a second one', () => {
    const url = new URL(inviteLinkFor('NEW42', 'wss://relay', 'https://x.example/v2/app.html?room=OLD42'));
    expect(url.searchParams.getAll('room')).toEqual(['NEW42']);
  });

  it('the relay in the link is what a guest resolves, so an invite works across hosts', () => {
    const link = inviteLinkFor('ROOM1', 'ws://127.0.0.1:8787', 'https://x.example/v2/app.html');
    const url = new URL(link);
    // A guest opening this link on a completely different host still resolves the host's relay.
    expect(resolveRelayUrl(url.search, 'https://some-other-host.example')).toBe('ws://127.0.0.1:8787');
  });
});
