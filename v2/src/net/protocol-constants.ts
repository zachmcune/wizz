// LOCKSTEP PROTOCOL CONSTANTS — v2's own copy, byte-compatible with the shared relay.
//
// WHY A COPY AND NOT AN IMPORT: the relay at the repository root (`relay/relay-app.mjs`) reads
// `protocol-constants.json` and v1's `src/net/protocol-schema.ts`. v2 must not import from v1 — that is
// enforced by `tests/isolation.test.ts` — so the values are re-declared here in TypeScript and
// `tests/net/wire-compat.test.ts` asserts that every one of them still equals the value the relay is
// actually running with. That gives an explicit, checked link between the two without a code dependency.
//
// The numbers themselves are not arbitrary; each one is a policy decision with a measured reason, and
// they are documented below rather than in the JSON, so the reasoning survives in the place a developer
// reads.

/** Wire protocol version. Bump when a message SHAPE changes; the relay rejects nothing on equality. */
export const PROTOCOL_VERSION = 1;

/**
 * Ticks of input delay between issuing a command and the tick it executes on.
 *
 * This is the whole point of a lockstep input buffer: a command submitted for tick `T` must reach the
 * relay, be merged, and be broadcast back before any peer simulates `T`. At 20 Hz, 6 ticks is 300 ms of
 * budget for one round trip plus relay scheduling — comfortable on school wifi and short enough that
 * the game does not feel laggy.
 */
export const INPUT_DELAY_TICKS = 6;

/**
 * Max ticks the relay may run ahead of the slowest acknowledged peer.
 *
 * 60 ticks = 3 s of drift. The relay pauses its clock once it reaches this lead, which bounds how far
 * any two clients can diverge without a snapshot. Larger here would mean a brief client hitch turns
 * into a long fast-forward for everyone.
 */
export const LEAD_TICKS = 60;

/** Clients ack their processed tick at most this often. 10 ticks = every 500 ms. */
export const ACK_EVERY_TICKS = 10;

/**
 * A peer whose last ack is older than this is dropped from the relay's pacing set, so one frozen player
 * cannot stall the match for everyone. 15 s is sized above typical Chromebook/school-wifi hitches
 * (5-8 s) so a hitching peer stays in lockstep instead of being forced into a snapshot resync.
 */
export const STALL_DROP_MS = 15_000;

/**
 * When a client's sim lags the relay head by more than this, it requests a snapshot instead of replaying
 * the whole backlog. Must stay above `LEAD_TICKS` so a peer that was merely at the pacing limit does not
 * jump — otherwise normal pacing would trigger a resync on every slow frame.
 */
export const SNAPSHOT_RESYNC_TICKS = 120;

/** Report a state hash every 60 ticks (3 s). The desync-detection cadence. */
export const CHECKSUM_INTERVAL_TICKS = 60;

/** Relay advances the sim at 20 Hz. Must equal the sim's TICK_HZ, or clients outrun the clock. */
export const RELAY_TICK_MS = 50;

/** Silence after `matchStart` before the relay starts ticking, so clients can finish loading. */
export const MATCH_LOAD_GRACE_MS = 2_500;

/** No relay tick for this long shows a stall hint. Above a brief wifi hitch, below `STALL_DROP_MS`. */
export const LOCKSTEP_STALL_MS = 10_000;

/**
 * A single-frame gap past `LOCKSTEP_STALL_MS` plus this much is a tab-freeze wall-clock jump (a
 * backgrounded PWA or a ChromeOS timer catch-up), not a live disconnect — so it resets the timer
 * instead of showing the stall banner.
 */
export const LOCKSTEP_STALL_JUMP_MS = 2_500;

/** Consecutive desync reports at the same tick needed before the session declares the match corrupt. */
export const DESYNC_CONFIRM_TICKS = 2;
