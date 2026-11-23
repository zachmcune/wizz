# Phase 6 — Multiplayer (2–4 players): evidence

**Measured:** 2026-11-23 on branch `cursor/rebuild-v2-5642`.
**Reader:** anyone checking the Phase 6 claims, and the next agent picking up Phase 7.

Everything here came from a command that was run on this branch. Where a target was not met it says so with the
number rather than describing the work as done.

---

## 1. What was built

| Component | File | What it does |
|---|---|---|
| Wire protocol | `v2/src/net/protocol.ts` | v2's message types, structurally identical to v1's so the unchanged relay accepts them |
| Protocol constants | `v2/src/net/protocol-constants.ts` | typed copy of the shared values, with a drift test against `protocol-constants.json` |
| Lockstep client | `v2/src/net/lockstep.ts` | input-delay scheduling, tick confirmation, gap filling, ack pacing, desync comparison |
| Session | `v2/src/net/session.ts` | one peer's match: sim + AI fill-in + stall policy + desync capture + snapshot adopt |
| In-process relay | `v2/src/net/in-process-relay.ts` | the relay's merge semantics with no sockets, for deterministic tests |
| Harness | `v2/src/net/harness.ts` | drives N peers through a relay with injectable latency, jitter, drops and corruption |
| Lobby | `v2/src/net/lobby.ts` | create/join, claim, ready, start validation, AI fill-in, corner assignment |
| Stall policy | `v2/src/net/stall.ts` | pure decision: hint / syncing / silence, with hidden-tab and freeze handling |
| WebSocket transport | `v2/src/net/ws-transport.ts` | the browser pipe, with buffering and rejoin-on-reconnect |
| Bot client | `v2/src/net/bot-client.ts` | a headless player whose AI commands travel over the network |
| State snapshot | `v2/src/sim/snapshot.ts` | serialise/restore a `GameState` so a peer can rejoin mid-match |
| UI | `v2/src/app/screens/multiplayer.ts`, `v2/src/app/networked-match.ts` | create/join screen and a lockstep-backed match the existing HUD drives |

**The relay is unmodified v1 code.** Nothing under `relay/` or `src/` (v1) was touched in this phase; the relay
was only *run*. `git diff` against `main` for those paths is empty apart from a `public/_headers` change made in
an earlier phase.

---

## 2. Lockstep correctness — headless, through the relay

`tests/net/lockstep-relay.test.ts` runs real sessions through the in-process relay. Each human seat is played by
a shipped `AiBrain` whose commands travel the real channel (issue → input-delay schedule → relay merge → broadcast
→ `applyCommands`), so the match is decided by traffic rather than by a locally-run AI.

| Configuration | Result |
|---|---|
| 2 peers (1v1) | identical final tick and state hash, 0 desyncs, decided |
| 3 peers (three teams) | identical, 0 desyncs, decided |
| 4 peers (free-for-all) | identical, 0 desyncs, decided |
| 4 peers (2v2 teams) | identical, 0 desyncs, decided |
| human + AI fill-in seat | identical, 0 desyncs, decided |

Every case also asserts the channel was actually used (each peer issued >100 commands) and that the match ran
past the opening, so "the peers agree" is not a statement about an idle world. The suite additionally reports the
number of checksum comparisons made, so "0 desyncs" is quantified rather than vacuous.

Run: `npx vitest run tests/net/lockstep-relay.test.ts` → **6 passed**.

---

## 3. Latency and jitter

`tests/net/latency-jitter.test.ts`. Delay is expressed in ticks and generated from a seeded hash, so a case is
reproducible rather than a timing race. Delivery is **monotonic**, modelling a TCP stream: a WebSocket cannot
deliver message N+1 before N, and a harness that allowed it measured a failure that could not occur in reality
(this is recorded in the harness source, because the first version did exactly that).

| Case | Result |
|---|---|
| equal 2-tick latency, both peers | in sync, 0 desyncs |
| asymmetric latency (0 vs 6 ticks) | in sync, 0 desyncs |
| jitter up to 4 ticks, both peers | in sync, 0 desyncs |
| 4 peers, four different delay profiles, jitter up to 5 | in sync, 0 desyncs |
| the same jittered run twice | byte-identical final hashes and tick counts |

Run: `npx vitest run tests/net/latency-jitter.test.ts` → **5 passed**.

---

## 4. Desync detection

`tests/net/desync.test.ts`. A detector that never fires is indistinguishable from one that cannot fire, so one
peer is deliberately corrupted mid-match (`mana += 5000` at tick 600) and the failure must be caught.

| Case | Result |
|---|---|
| forced divergence | detected; capture carries the tick, both hashes, seed, map, slot list, and a command log from tick 0 with real commands in it |
| clean match (control) | **no** desync reported — the detector is not always-on |
| single-tick corruption | the peers do diverge, and the test asserts that honestly rather than claiming the confirmation rule prevents divergence |

Run: `npx vitest run tests/net/desync.test.ts` → **3 passed**.

---

## 5. Disconnect and rejoin

`tests/net/rejoin.test.ts`.

| Case | Result |
|---|---|
| peer drops 3 s (60 ticks, exactly `SNAPSHOT_RESYNC_TICKS`) | in sync afterwards, 0 desyncs |
| peer drops 20 s (well past the resync threshold) | in sync afterwards |
| 4-player match, one peer drops 15 s | in sync afterwards |
| match keeps advancing while a peer is away | relay ran past the rejoin point rather than freezing |

The recovery path is proven separately at the state level: `tests/sim/snapshot.test.ts` asserts a restored
snapshot hashes identically to the original **and continues identically for 200 further ticks**. That
continuation case is what makes snapshot resync safe — matching at the moment of restore is not enough, because a
snapshot could round-trip every hashed field and still drop a capability payload or an order queue.

Run: `npx vitest run tests/net/rejoin.test.ts` → **4 passed**; `npx vitest run tests/sim/snapshot.test.ts` → **5 passed**.

---

## 6. Stall policy

`tests/net/stall.test.ts`, 10 cases. The three situations that look identical from inside the loop are separated:

| Case | Behaviour |
|---|---|
| ticks flowing | silent |
| before the first tick | silent |
| match ended | silent |
| **document hidden (backgrounded tab)** | silent, and the hidden time is **forgiven** so returning does not flash a banner |
| single huge gap (tab freeze) | silent, forgiven |
| **genuine stall past the threshold** | **shows the stall hint** |
| gap just under the threshold | silent |
| large backlog, ticks still arriving | "Syncing…", not "stalled" |
| hidden + large backlog | hidden wins — no "syncing" flash on resume |
| freeze jump + over the stall threshold | freeze wins |

Run: `npx vitest run tests/net/stall.test.ts` → **10 passed**.

---

## 7. Lobby, and compatibility with the unchanged relay

`tests/net/lobby.test.ts` (17 cases) covers create, join, claim, ready, start validation, AI fill-in and corner
assignment. `tests/net/wire-compat.test.ts` (48 cases) is the compatibility proof:

- every v2 client message is fed through the **relay's own validator**;
- **one representative of all 23 v2 command variants** is sent inside a `commands` frame, because the relay drops
  the WHOLE frame if any command fails its schema — an unknown command would silently swallow every order that
  tick;
- every relay server message is parsed by v2's own guard;
- every v2 protocol constant is compared against `protocol-constants.json`.

Because the relay's validator lives outside `v2/` and cannot resolve `zod` from there, it is reached through
`tests/net/fixtures/relay-protocol-schema.ts`, a copy of `src/net/protocol-schema.ts`. A **drift guard** compares
that copy against the original source on every run, so it cannot silently become a test of an old rule set.

Run: `npx vitest run tests/net/lobby.test.ts tests/net/wire-compat.test.ts` → **65 passed**.

---

## 8. Two real browsers, playing a match

`tests/net/browser-match.spec.ts` — the end-to-end proof. It uses **two independent Chromium contexts** (separate
storage, separate WebSocket, no shared JS), the real `app.html` bundle, the real renderer and HUD, and the
**unmodified v1 relay** (`relay/server.mjs`) running locally.

Flow: host creates a room → guest joins by invite URL → guest presses **Ready** → host presses **Start** → both
land in a networked match → the host issues a real canvas click → the match runs (60 s of wall time).

**Result: 38 common ticks compared across both peers, 0 mismatched.** `browser-match.json` records the state at the
end of sampling, and `browser-match.log` is the full run log including the per-tick comparison. The comparison uses
`hashState` — the same function the desync detector uses — so each of those 38 ticks is a full-board comparison of
both worlds.

Note the tick samples in the log: the two peers are read sequentially, so they are always a few ticks apart (e.g.
host 1967, guest 1985). That is the sampler's latency, not drift — the two are within one second of each other
throughout, and the authoritative comparison is the common-tick hash history, which matched on every tick both peers
recorded.

Artifacts in this directory:

| File | What it shows |
|---|---|
| `lobby-host-created.png` | host's room created, code shown |
| `lobby-guest-joined.png` | guest seated |
| `lobby-host-ready.png` | host's Start button enabled after the guest readied |
| `match-host-start.png`, `match-guest-start.png` | both peers in the match at kickoff (1366×768 and 667×375) |
| `match-host-late.png`, `match-guest-late.png` | the same match later, both peers |
| `video/two-browser-lockstep-match.webm` | the host's screen for the whole run (18 MB) |
| `browser-match.json` | final tick, entity count, per-player counts, sample count |
| `browser-match.log` | the run log, including the common-tick hash comparison |

Run: `npx playwright test tests/net/browser-match.spec.ts` → **1 passed** (1.9 min).

### What it took to make it pass

Three product bugs only a real browser could find, all fixed:

1. **The Start button went disabled as soon as the second player joined.** The condition was
   `!check.ok && every(slot => slot.claimedBy)`, which is `false && true` for a healthy two-human lobby that had
   just become startable. The proof caught it as a five-minute hang on a click that could never fire.
2. **A joining guest was never told to ready up**, so the lobby correctly waited forever. The UI now offers the
   button and the spec presses it like a player.
3. **Two live peers cannot be compared by polling** — the relay advances 20 ticks a second between the two reads,
   so 40 attempts never observed a common tick. `LockstepSession` now records `tick -> hash` history and the
   comparison runs over the ticks both peers recorded.

---

## 9. Chromebook and phone

The browser proof runs its two contexts at **1366×768 (Chromebook) and 667×375 (phone)**, which is the same pair
the Phase 4 UI gates use. Both peers reach and play the match, and their screenshots are above.

What this does **not** prove is behaviour on real Chromebook or phone hardware: this VM has no GPU, so rendering
there is SwiftShader. The honest statement is that the layout, the touch-sized viewport and the networking hold at
both viewport classes, not that they were tested on the devices.

---

## 10. Not met, stated plainly

- **Step 0(d), "both bases with expansions", is not obtainable.** The AI never expands: every refinery and
  construction-yard position across a whole match stays inside the starting cluster. The evidence for that, and the
  honest alternative capture (`docs/proof/phase-5/ai/footprint-*.png`), are in
  `docs/proof/phase-5/ai/phase6-fairness.md` §2 and the capture's own header.
- **The deployed-branch-preview match was not run.** The brief allowed either the deployed preview
  (`https://cursor-rebuild-v2-5642.wizz-aw8.pages.dev/v2/`) or a local build; this proof is the **local build**
  against a **local relay**. Deploying the relay needs Railway account access that this run does not have, and
  deploying the Pages project is a separate step. No credentials were invented.
- **The relay is the local `relay/server.mjs`, not the production Railway instance.** It is the same unmodified
  file, and `wire-compat` proves the protocol against the relay's own validator, but "the deployed relay served
  these peers" is not claimed here.
- **3- and 4-peer matches were proven headless, not in browsers.** The browser proof is 2 peers. Adding a third and
  fourth context is mechanically the same flow and would take ~3 minutes of wall time per run; it was not done, so
  the 3- and 4-peer evidence is `tests/net/lockstep-relay.test.ts` and `tests/net/rejoin.test.ts` only.
- **Real Chromebook and phone hardware was not available.** The two contexts run at those viewport classes
  (1366×768 and 667×375) with touch emulation on the phone one, and the networking holds at both — but this VM has
  no GPU, so neither rendering performance nor real touch input on those devices is claimed.
- **The browser proof needs a relay, so it is not in CI.** `playwright.config.ts` exists and
  `npm run test:browser` is wired; CI does not start a relay on 8787. Making it a CI gate means installing `ws` and
  `zod` for the relay process in the workflow (see `HANDOFF.md` §8 for the exact steps), which was judged a Phase 7
  task rather than something to bolt on here.
