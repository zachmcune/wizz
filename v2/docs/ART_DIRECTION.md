# Art direction — pilot redo

## The critique this answers

1. Units read as stacks of boxes and spheres, not designed characters.
2. Several buildings look broken — flat panels jutting at odd angles (Arcane Nexus, Scrying
   Obelisk, Sentry, Frost Spire, Sanctum).
3. At default zoom on a 667×375 phone, units are unreadable specks on flat purple terrain.
4. The proof images were wrong: five were byte-identical mis-crops.

Points 1–3 are all one root cause, and point 4 is a harness bug.

## Root cause

The old pipeline had three structural faults:

- **Boxes, not forms.** Every part was an axis-aligned box, cylinder, cone or sphere with *sharp,
  unbevelled* edges. Real objects have chamfered edges that catch a highlight; without them every
  surface reads as a flat card. That is exactly why panels looked like they were "jutting out at odd
  angles" — they were flat quads with nothing telling the eye where the object ended.
- **No occlusion.** Every part was lit identically, so a stack of three boxes had no contact shadow
  between the boxes and read as one blob. Ambient occlusion is what makes separate parts read as
  separate parts.
- **No silhouette discipline.** Parts were placed ad hoc, so units had no designed outline.

## Decision: 3D meshes, properly built

This is **still code-authored geometry** — primitives generated procedurally from parameters, no
image generation anywhere in the pipeline. The same "no AI images" rule holds: every vertex is
produced by a function in `v2/art/`.

Chosen over hand-authored 2D vector shapes because:

| | 3D meshes (chosen) | 2D vector paths |
|---|---|---|
| 8 facings | falls out of the geometry, always consistent | **8 drawings per unit**, ~112 hand-drawn assets, and they drift from each other |
| Team colour masks | per-material flag | per-path flag (fine, equal) |
| Authoring cost per asset | one model | eight drawings |
| Consistency across the roster | automatic (shared light rig) | depends on the artist's hand each time |

With 14 units × 8 facings, 2D vector means 112 bespoke drawings that must stay consistent. That is
not achievable reliably in this loop; 3D geometry gives correct, consistent facings for free and
lets me spend the effort on *form* instead.

## What changes in the renderer

Four upgrades, each addressing a specific fault above:

**1. Bevelled primitives.** `bevelBox` chamfers every edge into a narrow 45° face. That face picks
up a specular highlight from the key light, which is what draws the edge of an object. Also adds
`tube` (a swept, per-section-radius limb — tapered, and able to bend at joints), `capsule` (muscle
masses and rounded heads), and `plate` (tapered slabs for blades, wings and banners).

**2. Real ambient occlusion.** The assembly is voxelised into a 56³ grid, then every triangle
centroid fires 14 cosine-weighted rays through it. The hit fraction darkens that triangle (at 34 %
strength — full strength crushed the mid-tones to mud). This is what puts a shadow in the crease
between an arm and a torso, under a ridge on a helmet, and where a building's roof meets its wall.
It is the single biggest "this looks modelled" change.

**3. Rim light.** Pixels on the silhouette whose surface turns away from the camera get a coloured
lift, so units separate from dark terrain.

**4. Designed silhouettes.** Each unit gets a silhouette *plan* before any part is placed: the read
at ~22 px is the outline, so the plan names the one shape that must survive at that size.

## Readability at 667×375

Measured problem: at the default zoom the view spans ~25 tiles, so a unit drawn at its collision
radius (16 world units for an Imp) is about **13 screen pixels** — unreadable regardless of detail.

Fix, and it is the standard RTS trick: **visual size is decoupled from collision size**. Units are
drawn at **2.6× their collision diameter** (`renderer.ts` `spriteScale`); a Stone Golem goes from a
31-unit mesh footprint to ~34 world units on screen ≈ **28 px** at default zoom. Hit boxes do not
change, so gameplay is identical; only the sprite gets bigger. Combined with bold silhouettes and
the rim light, that is enough to identify a unit at phone size.

## Terrain

The flat purple grid is replaced with layered ground:

- **Grass** — per-tile value variation from deterministic hash noise, in warm greens, with a few
  hundred scattered tuft sprites.
- **Dirt paths** — a second ground material in warm brown, used for the lanes between bases.
- **Rock** — cliff faces get three-tone strata plus vertical crack lines; ramp surfaces get a lit
  gradient and tread marks.
- **Decorative props** — rocks, mushrooms, small ruin stones and grass tufts as cheap sprites that
  break up the tiling.

Warm saturated greens and browns against the existing violet architecture is the "polished stylized
fantasy RTS" read: the board stops being a purple void and the violet buildings pop against it.
