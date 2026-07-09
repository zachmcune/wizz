# Celestial Cannon Redesign — "Voice of the Heavens"

Design brief for elevating the Celestial Cannon from a generic artillery structure into
the faction's signature late-game superweapon. Gameplay values (range, minimum firing
distance / dead zone, charge time, cooldown, damage, area radius) are unchanged — this
document covers presentation only: attack sequence, dead-zone readability, cooldown
feedback, structure appearance, and audio.

## Core Concept

The Cannon stops being a machine that shoots a rock. It becomes a **living
altar-obelisk** that opens a tear to the sky and drops a piece of it on the enemy. Every
phase of its attack is a visible promise: *something huge is about to happen here.*
Nothing about damage, range, dead zone, charge time, or cooldown changes — only how it
looks and feels.

## The Attack Sequence

**Phase 1 — Awakening (rotation + charge, ~3s, unchanged timing)**
- The obelisk's head pivots toward the target — slow and deliberate, like a telescope,
  not a gun turret.
- As it settles on target, runes carved into the base ignite in sequence (bottom to
  top), like a fuse lighting upward.
- The central crystal shifts from a dim resting glow to a rising pulse, brightening in
  sync with the charge — players can gauge "how close is it to firing" just from
  crystal brightness.
- Two or three thin stone/crystal rings orbiting the obelisk spin up from idle drift to
  a fast, humming rotation. Small fragments orbiting between the rings pick up speed
  too.

**Phase 2 — The Reaching (sky connection)**
- A narrow beam of light lances straight up from the crystal into the sky — thin at
  first, then thickening as charge peaks. This is the clearest "it's about to fire"
  signal, visible from anywhere on the battlefield.
- The sky itself reacts locally: a soft swirling aurora/vortex forms in the clouds
  above the cannon, distinct from ambient weather, so players glance up and
  immediately know which tower is about to fire.

**Phase 3 — The Mark (targeting telegraph)**
- At the target location, a glowing rune circle burns itself into the ground — this is
  the fire warning and should read instantly as "get out of this circle."
- The rune circle pulses faster as the strike approaches, giving a clear, escalating
  countdown independent of any UI.

**Phase 4 — Impact**
- A column of celestial light crashes down onto the rune, brighter and thicker than
  the outgoing beam — the "payoff" beam should feel bigger than the "windup" beam so
  the whole thing feels like it's building to something.
- Impact triggers a bright, brief flash-bloom, then the explosion proper — a burst of
  light and debris scaled to the impact radius, so the visual danger zone matches the
  real one.
- A visible shockwave ring expands outward from the impact point to the edge of the
  explosion, giving trailing/fleeing units a clear "am I still in danger" cue.

**Phase 5 — Ebb**
- Scorched-glow cracks or a faint smoking rune remain on the ground for a couple of
  seconds, then fade — a small "aftermath" beat that makes the strike feel
  consequential rather than instant and forgotten.

## Dead Zone as a Feature, Not a Flaw

Reframe the minimum range as the cannon's **blind spot beneath its own power**, not a
targeting bug. Concretely:
- A faint ring etched into the ground (or a subtle circular sheen) around the base
  marks the inner boundary — always visible, not just on hover, so opponents can learn
  to exploit it and defenders learn to cover it.
- Idle rune-light along the base only fully brightens outside that ring; inside it, the
  runes stay dim, visually reinforcing "the cannon cannot reach here."
- Optionally, enemies standing inside the ring cause the crystal to flicker/stutter
  rather than charge normally — a small tell that says "this thing can see me but can't
  hit me," which is more satisfying than silence.

## Cooldown Told Through the Tower

No cooldown bars needed. After firing:
- Crystal snaps from peak brightness down to a low, dim ember glow.
- Orbiting rings and fragments slow sharply, drifting rather than spinning.
- Base runes dim to embers, relighting one at a time (bottom-up, mirroring the
  charge-up) as cooldown nears completion.
- In the final moment before ready, add one small anticipatory beat — a brief
  brightness flicker — so attentive players get a "it's about to wake up" cue,
  rewarding tower-watching without requiring it.

This turns the tower into a readable status display at a glance, which matters a lot on
mobile where UI space is scarce.

## Visual Design of the Structure

Silhouette should telegraph "biggest, oldest, most important defense" instantly, even
at small mobile scale:
- A tiered stone/crystal obelisk, wider at the base and narrowing upward, taller than
  any other defensive structure in the faction.
- A large floating crystal shard suspended above the peak (not touching it), rotating
  slowly even at idle — floating detachment reads as "ancient magic," not "machine."
- Two concentric rings orbiting at different heights/speeds around the crystal, with a
  handful of small angular fragments drifting between them.
- Base decorated with glowing rune-lines that double as the charge/cooldown indicator.
- Palette: cool blues/whites/violets at idle, shifting toward hot white-gold at peak
  charge and impact, so color temperature alone signals "this is dangerous right now."
  This can be built first from primitive shapes (cone/cylinder base, sphere crystal,
  torus rings) and reskinned later without changing any of the above beats.

## Audio

- **Charge:** a low, rising harmonic drone/hum that climbs in pitch and volume as the
  crystal brightens — should be audible faction-wide as a warning, distinct from any
  other tower.
- **Sky connection:** an airy, resonant "opening" whoosh/shimmer as the beam reaches
  upward — this is the "something is coming" sting.
- **Warning rune:** a soft rhythmic pulse/chime that speeds up as impact approaches,
  giving audio players the same countdown visual players get.
- **Impact:** a single huge, low-frequency boom layered with a bright crystalline
  shatter/ring — should feel distinctly "magical" rather than "explosive," with a long,
  decaying reverb tail.
- **Cooldown:** a quiet descending tone as the tower powers down, then silence until the
  pre-ready flicker gives one soft rising chime.

## Mobile Considerations

- Limit simultaneous particle-heavy elements (rings, fragments, beam) to a handful of
  cheap, repeating effects rather than lots of one-off particles.
- Reserve the biggest bloom/flash/screen-shake for the actual impact moment only — the
  buildup phases should be readable but restrained, so the payoff has somewhere to
  escalate to.
- Keep the sky-reaction effect local and small (a vortex patch, not a full sky tint) so
  it doesn't fight for attention with fog-of-war, minimap pings, or other towers firing
  simultaneously.

## Challenging the Brief

A few places worth pushing further than the original outline:
- **Escalating threat, not flat threat:** make each phase visibly bigger than the last
  (thin beam → thick beam → warning rune → huge strike) rather than uniform intensity
  throughout, so the sequence feels like it's building rather than just "playing an
  animation."
- **Make the warning rune the star of counterplay:** since minimum range and long
  charge already give skilled players time to react, the ground rune should be
  unmistakable (strong color, pulsing rhythm) so dodging or losing to the Cannon always
  feels earned, never surprising.
- **One tower, one unmistakable silhouette:** since this is meant to be the single
  signature structure, resist adding more towers with similar "channel the sky" beats
  later — keep this exact fantasy exclusive to the Cannon so its presence on the field
  is always instantly recognizable.
