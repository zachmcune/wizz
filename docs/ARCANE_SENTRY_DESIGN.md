# Arcane Sentry Redesign — "The Steady Hand"

Design brief for elevating the Arcane Sentry from a generic starter turret into the
faction's signature sustained-fire tower. This document covers presentation only: attack
sequence, fire rate and target tracking feel, projectile and impact design, structure
appearance, idle animation, and audio. Underlying stats (range, total sustained DPS) are
unchanged — only *how that DPS is delivered* changes, from infrequent heavier hits to many
rapid, low-damage bolts.

## Core Concept

The Sentry is the faction's heartbeat weapon: it never stops, never dramatizes, and never
lets the player doubt it's working. Where every other defensive tower punctuates combat
with an event — the Frost Spire's control, the Storm Conductor's burst, the Sanctuary
Spire's pulse, the Celestial Cannon's rare strike — the Sentry *is* the sustained baseline
running underneath all of them. It should feel less like "a gun that shoots" and more like
"a machine that is always producing damage," the way a Gatling gun's roar communicates
output through rhythm and sound alone, not through spectacle. Think of the *feeling* of a
sustained machine-gun defense (à la Red Alert 2: Yuri's Revenge's Yuri gun turrets), rebuilt
entirely in magical-technology terms: crystals, energy filaments, and arcane bolts instead
of barrels, brass, and tracers.

## The Attack Sequence

1. **Acquire.** An enemy enters range. The central crystal's glow instantly brightens — one
 frame, no ramp. This is the player's first cue that the tower has "woken up."
2. **Swivel.** The tower's base rotates toward the target on a fast ease-out curve (a full
 180° turn completes in roughly 0.35s). Rotation always eases; it never snaps to face the
 target instantly.
3. **Fire while still turning.** The tower does not wait for a perfect facing lock before
 shooting. As soon as the target is anywhere within a wide forward arc (roughly ±60° of the
 barrel), firing begins immediately and continues uninterrupted while the last few degrees
 of rotation ease into place. Firing must never pause to let rotation "catch up" — this is
 the single most important feel rule for the whole tower.
4. **First bolt fires within one frame of acquire.** No charge-up, no telegraph, no
 dramatic wind-up of any kind.
5. **Round-robin crystal handoff.** Three smaller focusing crystals orbit the central
 crystal continuously, at a constant, unbroken speed at all times — combat or idle, the
 orbit speed never changes. Each shot is produced by whichever focusing crystal is next in
 a fixed rotation order: it flashes bright white for about 0.05s, a thin energy filament
 snaps from it into the central crystal, and the central crystal instantly discharges one
 Arcane Bolt toward the target. The next shot always uses the next crystal in sequence
 (1 → 2 → 3 → 1 → …). This reads as a magical revolver cylinder cycling through its
 chambers, not as random sparkle.
6. **Continuous tracking.** On every tick, the barrel/central crystal re-aims toward the
 target's current position using the same eased rotation from step 2 — smooth and
 continuous, never resetting or snapping between individual shots.
7. **Impact.** The bolt lands, a small impact effect plays (see below), and the enemy takes
 a sliver of damage. The sequence returns to step 5 and repeats at full cadence for as long
 as a target remains in range.
8. **No cooldown state.** The tower has no idle-between-shots pose or wind-down; step 5
 simply repeats back-to-back. There is nothing to visually communicate a "wait," because
 there isn't one — this is what makes the Sentry the only uninterrupted-fire tower in the
 faction.

## Fire Rate & Damage

Target cadence: **10 bolts per second** (one bolt every 0.1s), with a small randomized
timing jitter of about ±5ms per shot so the rhythm feels organic rather than perfectly
metronomic. This is the fastest attack cadence of any tower in the faction and should be
identifiable by ear alone, at a glance, or from off-screen. Redistribute the tower's
current single-hit damage across this new cadence so total sustained DPS stays the same as
today — each individual bolt should deal roughly one-eighth of the current per-hit damage.
Cadence is the fixed variable; per-hit damage is what flexes to preserve balance. Do not
soften the fire rate to make room for more damage per hit — sustained pressure from many
small hits is the entire point of this tower.

## Target Tracking

- Rotation is continuous and eased (ease-out on turn speed), recalculated every tick from
 the target's live position — never a discrete step recalculated only between shots.
- Turn velocity blends smoothly when the target changes direction; it never fully resets or
 snaps to a new heading.
- If the target dies or leaves range mid-cycle, the tower's rotation coasts to a stop with
 the same easing (no snap), and the orbiting focusing crystals simply continue their
 unbroken idle orbit as if nothing happened.

## Projectile Design: Arcane Bolt

- Very small — just a few pixels at typical play zoom — so a stream of them never clutters
 the screen even with several Sentries firing at once.
- Bright white core with a thin cyan-to-blue outer glow, rendered as an additive glow
 rather than a solid-filled shape.
- Short trail, roughly 3–4x the bolt's own length, fading out over about 0.05s — long
 enough to sell speed, short enough to never read as a laser line.
- Travel speed should feel near-hitscan: a bolt should cross the tower's maximum range in
 well under 0.15s. This is a large increase over a "visible slow magic ball" and is
 essential to selling "fast and accurate" rather than "projectile you can watch travel."
- Improvement over a straight-line tracer: give each bolt a very slight, subtle waver along
 its flight path — a gentle one-to-two-pixel sine drift, not a random walk. This small
 touch alone makes a continuous stream of bolts look alive and magical rather than like a
 straight tracer borrowed from a conventional shooter, at effectively no extra rendering
 cost.

## Projectile Impacts

Every hit gets: a small burst of light at the impact point, three to five tiny sparks that
pop outward and fade within about 0.15s, a one-frame white flash across the enemy's
silhouette, and a small ground-hugging ripple ring that expands and fades within about
0.2s. Nothing about the impact should linger — every impact must fully resolve well before
the next bolt is likely to land (0.1s later), or overlapping effects at this fire rate will
smear into visual noise. Keep the impact palette in the same white/cyan/blue family as the
bolt itself, so every hit reads as "more of the same magic" rather than a separate
explosion system. The satisfaction here comes entirely from clean repetition, not from any
single impact being dramatic — nothing should ever look explosive.

## Tower Structure

One large central firing crystal, elevated above a low, simple plinth base so the whole
crystal cluster reads clearly against the 2.5D camera. Three smaller focusing crystals
orbit it continuously — one full revolution every 6–8 seconds at rest, with orbit speed
held constant at all times (idle or combat); only the flash timing described in the attack
sequence changes when firing. The tower should read overall as a magical Gatling
mechanism — an arcane machine built for sustained output — rather than as a single-barrel
turret with a bolted-on lens.

## Idle Animation

At rest, the tower must never look static: the central crystal breathes with a slow,
subtle brightness pulse; faint motes drift upward and fade around the base; and the
orbiting focusing crystals occasionally exchange a tiny idle spark with the central crystal
even with no target acquired, signaling "always ready" rather than "waiting." A soft
magical hum plays continuously underneath all of this (see Audio).

Because 10 flashes per second is faster than the eye can parse as distinct blinks, the
central crystal's brightness during sustained firing should settle into a near-continuous
glow with a subtle shimmer riding on top, rather than visibly strobing ten times a second.
This is a natural side effect of the cadence and should be embraced as an intentional
design signature — "always lit while firing" — rather than fought.

## Audio

- **Idle:** a very quiet, soft magical resonance hum, looped continuously — present enough
 to identify the tower by ear, but easy to tune out during quiet stretches.
- **Acquire:** a brief rising tick (under 0.15s) as the crystal brightens on target
 acquisition — subtle, never a fanfare.
- **Firing (signature sound):** each bolt launch is a very short, soft "zip/fizzle," never a
 gunshot crack. The three orbiting focusing crystals are each tuned to a slightly different
 pitch, so the fixed round-robin firing order naturally produces a cycling three-note
 arpeggio rather than one sound repeated verbatim. At 10 shots per second this blends into a
 pleasant, musical shimmer-texture instead of mechanical fatigue. This is the single
 highest-leverage audio choice for the entire tower, since it will be heard more than any
 other sound in the game.
- **Impact:** a tiny, high-frequency "sparkle" tink — soft and non-metallic — kept quiet
 enough that many Sentries firing simultaneously never build into low-end mud.
- **Stop:** the hum settles back down to its idle level within about 0.3s of losing its
 target; never an abrupt cutoff.

## Visual Style

Primitive placeholder geometry (simple crystal shapes on a plinth) must already read
clearly at RTS zoom through silhouette and color alone — polish comes later, clarity comes
now. Favor strong, simple shapes and a legible white/cyan/blue palette over any fine detail
that would only read at close zoom.

## Mobile Considerations

Cap the concurrent visual cost per tower: at most a handful of in-flight bolts rendered at
once (fire rate is high, but each bolt resolves almost instantly), one pooled/reused impact
effect, and a small, fixed idle particle count that does not scale up with the number of
Sentries on screen. Favor a handful of high-quality, reused effects over many unique
particle systems, since many Sentries may be firing simultaneously on a single mobile
screen.

## Relationship to the Faction

The Sentry establishes the shared visual grammar every other defensive tower builds on: a
floating crystal core with orbiting satellite pieces, connected by thin energy filaments,
in a white/cyan-blue base palette. The Frost Spire, Storm Conductor, Sanctuary Spire, and
Celestial Cannon should each keep this crystal-and-orbit language while reinterpreting
color, orbit speed and behavior, and event frequency for their own rhythm — control, burst,
pulse, and rare cinematic strike, respectively. The Sentry is simply the fastest, calmest,
and most constant expression of that shared language.

## Challenging the Brief

- **Don't gate firing on a full rotation lock.** Requiring a perfect facing angle before
 shooting would visibly stall the "no pause, ever" feel the brief asks for; firing within a
 wide forward arc while still easing into full lock is what actually delivers "always
 active."
- **Embrace flash-blending into a glow rather than fighting it.** At 10 shots per second,
 individually legible flashes aren't realistic to render as ten separate blinks anyway —
 leaning into a shimmering, near-continuous glow reframes an inevitable side effect as an
 intentional design signature.
- **Fixed round-robin order, not random crystal selection.** A stable 1-2-3 firing order —
 visually and audibly — reads as purposeful machinery. Random selection would look and
 sound noisier for no gameplay benefit.
- **A pitch-varied three-note arpeggio is the make-or-break audio choice.** A single
 repeated sample at 10Hz is one of the fastest ways to make a sound actively grating over a
 long match; three tuned pitches cycling in a fixed order is a cheap fix that turns a
 liability into the tower's most memorable and recognizable trait.
