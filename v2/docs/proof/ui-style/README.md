# UI style — proof pack

**Style: Obsidian & Brass.** Dark machined steel plates, warm brass for affordance only, bone type.

Full specification: [`../../UI_STYLE_GUIDE.md`](../../UI_STYLE_GUIDE.md)
Live reference: `/styleguide.html` (built as a Vite entry, so it deploys with the game)

---

## What was wrong before

The old chrome was the exact thing Zachary called "lame purple AI slop":

| Old | New |
|---|---|
| `#171426` violet panels | achromatic steel `#191d22` |
| `#9b8cff` violet accent | copper `#b87333`, interaction only |
| 8–12px rounded pills | 45° chamfered corners, 0px radius |
| `backdrop-filter` translucent panel | fully opaque plates |
| system font stack | self-hosted IBM Plex, 148 KB |
| no icon system | 30 code-drawn SVG glyphs, one stroke rule |
| UI violet = Arcane faction violet | chrome is achromatic, so it never competes with content |

The violet had a second problem beyond looking generated: the game's own Arcane faction is violet, so
interface chrome and battlefield content read as the same material. Moving chrome to warm neutral metal
separates them.

---

## The system

**Palette.** Two hue regions for chrome: achromatic (saturation < 12%) for all surfaces and type, and
copper (hue 20–35°) for interaction only. **Hue 250–330 is banned outright.** Team colours mirror the
simulation and are never used as chrome — only as a 4px edge bar on a player row.

**Why copper does not collide with team gold.** Team gold is hue 43° / high lightness. Copper is hue
28° / roughly half the lightness, and only ever appears as a thin stroke or small text. They cannot be
confused at a glance.

**Type.** One superfamily, three cuts: Plex Condensed (headlines, uppercase labels), Plex Sans (body),
Plex Mono (tabular numerals so counters do not jitter). Self-hosted, Latin subset, **148 KB total**,
`font-display: swap`. No CDN.

**Panels.** One shape — rectangle with a 45° chamfer drawn via `clip-path`, a 1px inset ring (because
`clip-path` would slice a real border off), and a bevel (light top edge, dark bottom edge). The bevel is
the same lighting logic as the 3D units' bevelled edges. Opaque, always.

**Buttons.** One shape, four variants, five states. Focus is a 2px copper **outline** — geometry, not
colour alone — so it works for keyboard users and colour-blind players.

**Icons.** 30 glyphs on a 24×24 grid, 2px stroke, round caps/joins, no fill except a 22% accent on
marked glyphs. Defined as a typed path table, so the rule is testable.

**Motion.** Three durations, one curve, one entrance animation. Everything disabled under
`prefers-reduced-motion`.

**Density.** Three tiers driven by one `data-density` attribute: `compact` (667×375, text 0.92, 28px
touch targets), `regular` (1366×768), `roomy` (1920×1080, text 1.08, 36px targets). Components read
variables rather than branching on width.

**Tokens.** `src/ui/tokens.css` is the only file allowed to contain a colour, size, font or timing.
Every component consumes `var(--token)`.

---

## Proof

| Artifact | What it shows |
|---|---|
| [`styleguide-1920x1080.png`](styleguide-1920x1080.png) | the full style guide page at desktop |
| [`styleguide-667x375.png`](styleguide-667x375.png) | the same page on a phone |
| [`screens/`](screens/) | HUD, lobby and main menu as **live DOM** at 4 viewports = 12 captures |
| [`ui-proof.json`](ui-proof.json) | per-shot drawn fraction, purple fraction, md5 |

The mockups are not pictures — `src/ui-mockups.ts` composes real DOM from `src/ui/kit.ts`, mounted by
`ui-proof.html` at the real viewport and density.

### Measured results

- **12 mockup captures + 2 style guide captures**, all unique.
- **Purple: 0.000%–0.001%** of opaque pixels across every capture (threshold is 0.5%).
- **Zero page errors** in any capture.
- Every icon inside a visible subtree has a real box.

---

## How it is enforced

`tests/ui-tokens.test.ts` — 14 assertions on **source**:

- no colour literal outside `tokens.css`
- no purple-range hue (parsed to HSL, saturated colours only)
- no `backdrop-filter`
- no `border-radius` above 2px
- no soft ambient shadow (blur > 24px)
- no emoji, no webfont CDN, no icon font
- one icon stroke rule across all 30 glyphs
- every `var(--token)` declared

`tests/ui-style-proof.test.ts` — 17 assertions on **deliverables and rendered pixels**:

- a shot exists for every screen × viewport, and none is blank or single-colour
- **no purple in the rendered PNGs**, re-scanned independently of the harness's own report
- the style guide document covers every required section
- every referenced woff2 exists and no remote font host is used
- the style guide and proof harness are real build entries

**Both suites were verified by deliberately breaking things.** The decisive test: I reverted the tokens
to the old violet palette and re-ran the capture. The harness reported **1.0%–9.6% purple** and four
assertions failed (the HSL source check plus all three pixel checks). Restoring the palette returned 0
violations and 31/31 passing.

The icon-size check in the proof harness also caught a real bug during development: a `span { display:
none }` rule intended to hide button labels in the compact command bar was hiding the SVG wrappers too,
leaving **six blank buttons on the 667×375 HUD**. Fixed by giving the label its own class.

---

## Not done here

- **Phase 4 is not started.** These are mockups; no real lobby, HUD data binding beyond the resource
  bar, or menu wiring exists yet.
- **Tooltips, context menus, the research tree and sandbox panels** have no information architecture
  yet. They will be composed from these primitives.
- **No audio or haptic language** is specified.
- **Touch ergonomics are reasoned, not measured.** Touch targets are sized to 28/32/36px by tier, but I
  have not tested them on physical hardware.
