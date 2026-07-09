# Storm Conductor Redesign — "Unleash the Storm"

Design brief for elevating the Storm Conductor from a generic lightning tower into one
of the faction's signature defensive structures. Gameplay values and mechanics (chain
lightning, up to 6 targets, per-jump damage falloff, range-limited chaining) are
unchanged — this document covers presentation only: attack sequence, chain visuals,
idle/cooldown feedback, structure appearance, and audio.

## Core Concept

The Conductor stops feeling like a machine that fires six separate lightning bolts. It
becomes a catalyst that **unleashes a storm**: the tower fires one enormous bolt, the
first enemy struck becomes a temporary lightning conductor, and electricity violently
erupts outward from that enemy through anything nearby. The tower starts the storm —
nature finishes it.

## Viewing Angle: Designed for the 2.5D Oblique View

This redesign targets the game's oblique, dimetric "2.5D" camera (the angled view), not
the flat top-down mode. Every beat below is meant to exploit that verticality:
- The tower's crystal and rods sit visibly above the base plane; the primary bolt should
  read as striking down at an angle from that elevated point onto the ground-level
  target, giving it real weight and scale instead of feeling like a flat line drawn
  between two dots.
- The eruption and cascade bolts, by contrast, stay low and hug the ground plane as they
  hop unit-to-unit — this contrast (one dramatic downward strike, then a scrappy
  ground-level storm) is only legible because the camera shows height.
- The shockwave pulse around the overloaded target should be a flattened ground-hugging
  ring (matching the dimetric ground plane's ellipse, not a perfect circle) so it sits
  correctly on the terrain instead of looking pasted on top of it.
- Sparks and debris get a touch of arc/gravity so they visibly pop up off the ground and
  fall back — a freebie in 2.5D that would be wasted in flat 2D.
- Screen flash and camera micro-shake are camera-space effects and are unaffected by the
  projection choice, so they carry over untouched.

If a match is ever viewed in the classic flat 2D mode instead, the same beats still work
with bolts simply flattened onto the ground plane — but the oblique view above is the
primary target and where every visual choice should be judged.

## The Attack Sequence

**Phase 1 — Lock-on**
- The tower swivels toward the target; lightning rods tilt to track it.
- A faint blue rim-light outlines the target so players can see who is about to be hit
  before the storm lands.

**Phase 2 — Charge (~0.5s, short and punchy)**
- The crystal flares from a dim resting violet to a blinding white-cyan.
- The two floating conductor rings spin up and drift slightly closer together.
- Small arcs leap between the tower's rods and floating pieces, selling a "winding up"
  feeling without dragging on in RTS time.

**Phase 3 — Release (the primary strike)**
- A single jagged, branching bolt (not a laser line) blasts down at an angle from the
  elevated crystal to the ground-level target in one frame, its height clearly visible
  in the oblique camera.
- The bolt has a bright white core, cyan/blue outer glow, and thin purple crackling edge
  threads — noticeably thicker than anything that follows.
- Screen does a one-frame white flash plus a very short camera micro-shake (mobile-safe,
  no prolonged screen-shake).
- The primary target is briefly overwhelmed — almost hidden inside the bolt.

**Phase 4 — Overload**
- The struck target flashes solid white and is briefly haloed in a crackling white-hot
  cocoon.
- A shockwave-ring pulse expands outward from it, hugging the ground plane.

**Phase 5 — Eruption**
- 2–4 secondary bolts fork outward from the overloaded target simultaneously (not
  sequentially), giving a burst rather than a stutter.
- Only this first jump out of the primary target is allowed to fork; every jump after
  that is a single strand. This keeps the biggest visual beat right at peak drama and
  caps the number of bolts ever on screen at once (roughly 3), which keeps rendering
  cheap while still reading as chaotic.
- If only one valid nearby target exists after the primary strike, skip the fork and use
  a single strong strand instead — never force a fork that would look weak.

**Phase 6 — Cascade**
- From each struck secondary target, the chain continues to the next nearest enemy in
  range, up to 6 targets total, honoring the existing falloff and range rules.
- Each jump loses roughly 15–20% thickness and brightness versus the previous one,
  shifting from white-cyan toward pure blue — the eye reads this as "the storm running
  out of charge" as it spreads.
- Bolts are drawn as 2–3 jagged segments with slight per-strike randomness so no two
  strikes look identical.
- If enemies are too spread out, the chain simply stops — no special "end" effect is
  needed; the absence of a next bolt communicates it.

**Phase 7 — Dissipation**
- Remaining arcs fizzle as thin, fading tendrils that arc harmlessly into the ground for
  roughly 0.2s, selling "the storm losing energy" rather than a hard cutoff.

This turns "six lightning bolts" into "one huge bolt, one violent eruption, and a fading
cascade" — the same underlying chain mechanics, far more spectacle.

## Enemy Reactions

Every struck enemy reacts, but intensity scales down the chain so a six-target hit
doesn't turn into visual noise:
- **Primary target:** full-body white flash, a radial spark burst, a brief stagger/flinch
  pose, and crackling residual arcs across its silhouette for about 0.3s. This should be
  the strongest reaction of the whole sequence.
- **Secondary/chain targets:** a shorter white flash and a smaller spark puff, with a
  tiny recoil but no stagger pose — enough to register as "hit" without cluttering the
  screen when several units react at once.

## Idle Animation

Even at rest, the tower should look dangerous and instantly identify what it is:
- Small electrical arcs occasionally jump between the floating conductor rings.
- The crystal slowly pulses/breathes.
- Occasional small magical sparks and a few slow-drifting particles around the floating
  pieces.
- A low, almost subliminal electrical crackle in the ambience.

## Cooldown Told Through the Tower

No cooldown bar is required to know when the Conductor is ready:
- Immediately after firing, the crystal dims, the floating rings slow, and the
  electrical arcs almost disappear.
- As cooldown nears completion, the crystal brightens, the rings accelerate, and small
  lightning arcs return — brightness, ring speed, and arc frequency all ramp back up
  together, so a player scanning the battlefield can eyeball readiness at a glance.

## Visual Design of the Structure

Silhouette should say "this controls storms" instantly, even at small mobile scale:
- A three-tier vertical read: a heavy stone base, a mid-section with two
  counter-rotating conductor rings orbiting a floating crystal core, and two asymmetric
  arcane lightning rods jutting upward at different heights. The asymmetry breaks up the
  silhouette and helps distinguish it at a glance from the Frost Spire and Celestial
  Cannon.
- Because the oblique camera shows elevation, these tiers should be spaced with clearly
  distinct heights — the crystal core in particular should float noticeably above the
  rings so the eye can track exactly where the primary bolt originates before it fires.
- Rings and crystal float with a slight bob so the tower never looks fully "off" even at
  rest.
- Constant, low-level electrical activity between the floating pieces reinforces the
  "storm magic," not "machine," reading.
- Buildable first from primitive shapes (blocks, spheres, cylinders) and replaceable
  later with detailed art without changing any of the beats above.

## Audio

- **Idle:** a very low electrical crackling ambience, with an occasional soft "tick" of
  a small arc — almost subliminal, but present enough to identify the tower by ear.
- **Charge:** a rising electrical whine/hum that pitches up over the roughly 0.5s charge,
  like a capacitor filling.
- **Primary strike:** one huge, bassy crack-boom with a sharp treble snap layered on top
  — this should be the heaviest sound the tower makes, immediately communicating that
  something powerful just happened.
- **Chain lightning:** quick, layered crackle-zaps that decrease in volume and pitch with
  each jump, overlapping slightly rather than firing back-to-back, so six targets don't
  sound like six discrete gunshots.
- **Cooldown:** the hum drops to near-silence right after firing, then gradually swells
  back up as the tower recharges, mirroring the visual recharge.

## Mobile Considerations

- Favor a small number of high-quality effects over many noisy ones: cap the number of
  bolt segments visible at once (roughly 3), and cap forking to a single split at the
  first jump only.
- Use short-lived particle bursts for sparks/impacts rather than persistent trails.
- Keep the screen flash literally one frame so it stays dramatic without becoming eye
  strain over a long match.
- Keep the shockwave ring and dissipation tendrils cheap, short-lived effects rather than
  simulated physics.

## Challenging the Brief

A few places worth pushing further than the original outline:
- **Fork placement:** limiting forking to only the first jump out of the primary target
  (rather than "occasionally, anywhere" in the chain) guarantees the most exciting
  visual beat happens at peak drama and prevents unpredictable mid-chain bolt-count
  spikes.
- **Simultaneous eruption, not sequential:** firing the first 2–4 chain bolts at once
  right after the overload, rather than one-by-one, sells "violent eruption" far better
  than a strictly sequential chain, while damage still resolves in the same falloff
  order under the hood.
- **Add a camera micro-shake:** not in the original outline, but a single-frame shake
  alongside the flash on the primary strike would meaningfully boost impact without
  hurting readability.
- **Protect the sound signature:** since this is meant to become one of the most iconic
  towers in the game, its charge-whine-into-boom should be kept unique enough that
  players recognize a Storm Conductor firing off-screen by sound alone — worth resisting
  reusing this exact signature elsewhere.
