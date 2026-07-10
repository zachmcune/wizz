# Sanctuary Spire Redesign — "The Living Ward"

Design brief for elevating the Sanctuary Spire from a generic healing tower into one of the
faction's signature support structures. Gameplay values and mechanics (continuous healing,
continuous attack-speed buff to nearby allies) are unchanged — this document covers
presentation only: the pulse sequence, buff readability, first-entry blessing, ambient field,
idle/cooldown feedback, structure appearance, and audio.

## Core Concept

The Spire stops feeling like a passive aura emitter and becomes a **heartbeat** — a standing
ward-crystal that inhales magic from the earth and exhales it as a wave of protection roughly
every 3–4 seconds. Nothing about the heal-over-time or attack-speed buff changes; instead the
existing continuous effect is visually staged as a rhythmic pulse, so players *feel* the tower
working rather than just seeing a static radius. Where the Storm Conductor is a jagged, violent
machine that erupts, the Spire is a smooth, breathing sanctuary that blooms. Its silhouette,
color, and motion should never share a single visual verb with the Conductor: no jagged edges,
no snapping motion, no cold light — only rounded forms, slow easing, and warm glow.

## The Healing Pulse Sequence

**Phase 1 — Anticipation (~1s before the pulse).** The crystal core's brightness ramps up on a
slow ease-in. The two floating rings around it (currently idle-drifting) accelerate and rotate
into alignment, like an iris closing to focus. Ambient particles around the base thicken and
drift upward toward the crystal, visually "feeding" it.

**Phase 2 — Bloom (the instant of the pulse).** The crystal flares to its brightest point for a
single beat, and the aligned rings flash outward as a soft ring-shaped shockwave. Unlike the
Conductor's one-frame white flash, this should hold for 2–3 frames and fade on an ease-out — a
bloom, not a strobe.

**Phase 3 — Wave.** A single translucent ring of warm light expands from the tower to the edge
of its radius over about 0.6–0.8s, gently fading as it travels. Every allied unit the ring
touches gets a brief personal flash (a soft outward glow around their silhouette, ~0.3s) timed
to the ring's arrival — this is the moment players should associate with "I just got healed and
re-buffed."

**Phase 4 — Afterglow.** The crystal and rings ease back down to resting brightness over roughly
1s, never snapping. The Spire should feel like it's exhaling.

This cycle **is** the cooldown-feedback system: anticipation building visibly means no UI
countdown is ever needed — players learn to read the tower directly.

## Attack Speed Tell

Buffed units need an always-on, silhouette-safe tell distinct from the pulse flash: a thin ring
of warm gold light orbiting each buffed unit's feet, plus their melee swings/projectiles gaining
a short-lived light trail in the same gold. This stays on continuously while buffed (not just at
pulse time), so players scanning the field instantly know who's empowered, while the pulse-wave
flash (teal/white) remains the distinct "just got refreshed" beat.

## First Blessing

The first time a unit enters the radius (or returns after being away long enough to have fully
lost the buff), a single ribbon of light arcs from the crystal to that unit over ~0.4s, resolves
into a small circular rune that blooms and dissolves above their head, and plays a soft two-note
chime. This is a one-time "welcome" cue, separate from the recurring pulse — it should never
repeat for units already inside, only for genuinely new arrivals, so it stays meaningful instead
of becoming noise in a large battle.

## Sanctuary Field (Always-On)

Independent of the pulse, the ground inside the radius should always read as "safe": a large,
soft rune-circle laid flat on the terrain at the radius edge, slowly rotating (~60s per
revolution), with a light warm mist drifting inward and a scatter of small floating light motes.
This is the constant, ambient layer; the pulse is the dramatic layer on top of it.

## Dynamic Scaling With Army Size

The field should visibly reward gathering, stepped through exactly three discrete tiers rather
than a smooth continuous ramp — three clearly different looks are memorable and readable at a
glance; a continuous scale is nearly invisible to a player scanning a battle:

- **Tier 1 — Watch (1–3 units).** Baseline presentation: rune circle and motes stay subtle, the
  crystal sits at normal resting brightness, and only the single main pulse wave-ring plays.
- **Tier 2 — Garrison (roughly 4–9 units).** Brighten the crystal's resting glow one full notch,
  thicken the mist, and add a second, larger outer wave-ring that lags just behind the main
  pulse wave on every Bloom.
- **Tier 3 — Host (roughly 10+ units).** Push the crystal to near its Bloom brightness even at
  rest, fill the mist with visibly drifting light, and let the pulse wave leave a faint, slowly
  fading afterimage ring behind it.

Each tier should snap on with a brief (~0.5s) crossfade the moment the unit count crosses its
threshold — no per-unit incremental scaling in between — so the transition itself reads as a
reward beat ("we just filled the sanctuary") rather than a gradual, easy-to-miss creep. The
tower should look genuinely different defended by an army versus standing empty.

## Idle Animation

At rest: crystal floats with a slow bob, rings drift lazily (not the tight alignment-spin
reserved for Anticipation), a few motes rise and fade, and a faint warm glow breathes in and out
on a slow multi-second cycle even between pulses — never fully "off."

## Visual Design of the Structure

Rounded, tiered silhouette: a soft stone base, a mid-ring of two lazily orbiting halos, and a
floating faceted crystal on top — all curved forms, no spikes or angular machinery, to guarantee
zero silhouette overlap with the Storm Conductor or Celestial Cannon at a glance. Buildable first
from primitive shapes (blocks, spheres, cylinders) and replaceable later with detailed art
without changing any of the beats above.

## Color Palette

Warm gold and white for the crystal core and blessing effects, emerald/soft teal (matching the
tower's existing accent color) for the field mist and pulse wave, kept desaturated and soft
rather than saturated/neon. This palette should contrast strongly with the Storm Conductor's
cold blue-violet and the Celestial Cannon's palette on sight.

## Audio

- **Idle:** a very quiet, sustained warm drone/pad with a faint choir-like shimmer — peaceful,
  not silent.
- **Heartbeat/Anticipation:** a soft rising tone (like a bowed crystal glass) building over the
  ~1s ramp.
- **Pulse:** one warm, resonant chime-swell, closer to a struck singing bowl than a bell.
- **Blessing:** a light two-note harp/chime flourish.
- **Buff tell:** a very subtle continuous shimmer layered under empowered units' attack sounds,
  not a repeating cue.

## Mobile Considerations

One expanding ring, one mist layer, and modest mote counts are enough — favor a single
high-quality pulse-wave over many small particle systems, and scale mote/mist density down (not
off) at the largest army tier rather than adding new effect types.

## Future Upgrades

Avoid simple percentage increases; each upgrade should create a strategic decision:

- **Ward Anchor:** allies who die inside the radius leave a temporary glowing waypoint; the next
  pulse revives one fallen unit at reduced strength if it reaches that spot in time — turns the
  Spire into a rally point worth holding through a losing fight, not just before one.
- **Twin Beacon:** the Spire can project a temporary secondary, weaker pulse-point at a target
  location for a short duration — lets defenders extend protection toward a push without moving
  the whole army back to base.
- **Cleansing Wave:** every third pulse also strips one negative status effect from each ally
  hit — creates a timing question (retreat into the field now, or wait one more pulse for the
  cleanse?).
- **Cohort Blessing:** the First Blessing ribbon, once per fight, can instead target a whole
  incoming squad simultaneously if they arrive together — rewards moving as a group.

## Challenging the Brief

- Splitting cooldown feedback from a separate "buff glow" was necessary: if the pulse flash and
  the continuous buff tell used the same visual, players couldn't tell "just refreshed" from
  "buffed a while ago," undermining the anticipation beat the brief asked for.
- The Blessing chime should be a genuinely unique two-note motif (not reused for level-ups or
  other buildings) so, paired with the Conductor's boom, players can identify both signature
  towers by ear alone — this is the single highest-leverage audio choice for making the Spire
  iconic.
- Adopted: Dynamic Scaling is defined above as exactly three discrete, named tiers (Watch /
  Garrison / Host) that snap on at fixed unit-count thresholds, rather than a smooth continuous
  scale — continuous scaling is nearly invisible to players glancing at a battle, while three
  discrete, clearly different looks are memorable and screenshot-worthy.
