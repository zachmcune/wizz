# UI Style Guide — Obsidian & Brass

The single visual system for Arcane Dominion's interface. Every screen is built from it, and
`tests/ui-tokens.test.ts` fails the build when a component breaks it.

**Live reference:** `styleguide.html` (deployed with the game) renders this whole document from the
same tokens and components the game uses, so it cannot drift.

---

## 1. What this replaces, and why

The previous chrome was violet-on-violet: `#171426` panels, a `#9b8cff` accent, 8–12px rounded pills,
a system font stack, and a soft translucent panel with a drop shadow. That is the generic
"AI-generated app" look, and it had a second problem — **the UI used the same violet as the game's own
Arcane faction**, so interface chrome and battlefield content read as the same material.

The brief: no purple, no glassmorphism, no neon glow, no default rounded pills, no emoji, and one
deliberate style held consistently. Reference the readability of the classic RTS HUDs, but be original.

## 2. The style in one paragraph

**Dark machined plates, warm brass fittings, bone type.** Surfaces are flat achromatic steel in five
elevation steps. Panels are chamfered rectangles — a hard 45° corner cut, not a rounded corner — with a
1px inset ring and a bevel (light top edge, dark bottom edge). The only ornament is that bevel. Copper
appears exclusively where the player can act: focus, primary buttons, the active tab, the active gauge.
Type is one superfamily in three cuts, set tight and mostly uppercase. Nothing glows, nothing blurs, and
nothing floats.

This is the UI equivalent of the game's own 3D art: flat planes, real bevels, hard edges, warm accent.

---

## 3. Palette

### 3.1 Ink — surfaces (achromatic, cool)

| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0e1013` | the void behind everything |
| `--ink-900` | `#14171b` | full-bleed screens, sunken tracks |
| `--ink-850` | `#191d22` | panel body |
| `--ink-800` | `#1e2228` | raised panel, toolbar, control face |
| `--ink-700` | `#262b32` | control face |
| `--ink-600` | `#313741` | control hover, strong divider |
| `--ink-500` | `#3e4650` | control border, panel outline |
| `--ink-400` | `#525c68` | border on dark, disabled text |
| `--ink-300` | `#6b7784` | muted icon stroke |

Deliberately **cool** grey (a slight blue bias) rather than warm neutral: on a warm bone type colour a
warm grey reads muddy, and cool steel is what makes the copper accent sit forward.

### 3.2 Bone — type

| Token | Hex | Use |
|---|---|---|
| `--bone-100` | `#f4efe4` | primary text |
| `--bone-200` | `#ded7c7` | primary text on raised surfaces |
| `--bone-400` | `#a9a294` | secondary text, labels |
| `--bone-600` | `#7d786d` | captions, disabled text |

Warm off-white, not pure `#fff`. Pure white on a dark plate is harsh at 11px and is the single most
common "generated UI" tell after the purple gradient.

### 3.3 Copper — interaction only

| Token | Hex | Use |
|---|---|---|
| `--copper-700` | `#6f4520` | pressed primary |
| `--copper-600` | `#8c5a2b` | primary border |
| `--copper-500` | `#b87333` | focus ring, primary fill, active tab |
| `--copper-400` | `#d18f4a` | primary hover |
| `--copper-300` | `#e3ab72` | active text on dark |
| `--copper-100` | `#f6e2c8` | text on a copper fill |

**Never decoration.** If copper is on screen, the player can act on it or it is telling them where they
are. It is never used as a large filled area — only thin strokes, small caps and text — so it can never
be mistaken for a team ownership marker.

### 3.4 Signals — status (deliberately desaturated)

| Token | Hex | Use |
|---|---|---|
| `--signal-good` | `#6f9e6a` | healthy, ready, success |
| `--signal-warn` | `#c08d3e` | low resource, caution |
| `--signal-bad` | `#b05a4a` | damage, defeat, destructive action |
| `--signal-info` | `#7a8fa6` | neutral information |

These are **40+ points less saturated** than any team colour, so they read as status and never as
ownership.

### 3.5 Team colours — content, never chrome

| Token | Hex | Hue |
|---|---|---|
| `--team-blue` | `#4f9dff` | 212° |
| `--team-red` | `#ff5d5d` | 0° |
| `--team-green` | `#5cff8a` | 143° |
| `--team-gold` | `#ffd166` | 43° |

These mirror the simulation and are read-only to the UI. **They are never used as chrome.** The one
place team colour and UI meet is a player row, where the colour appears as a 4px bar on the row edge
and every piece of text around it stays achromatic.

### 3.6 Why copper does not collide with team gold

Team gold is `#ffd166`: hue 43°, high lightness. Copper is `#b87333`: hue 28°, roughly half the
lightness. They are 15° apart in hue but far apart in **value**, and copper is only ever a thin stroke
or small text. A copper focus ring cannot be mistaken for a gold team bar at a glance — which would not
be true of a gold UI accent.

### 3.7 The hue rule, enforced

UI chrome lives in exactly two hue regions:

- **Achromatic** (saturation < 12%) — all surfaces, borders, text, dividers.
- **Copper** (hue 20–35°) — interaction affordance only.

**Hue 250–330 (violet / indigo / purple) is banned outright.** The test parses every colour in the
token file and every component, converts it to HSL, and fails on any saturated colour in that band.

---

## 4. Typefaces

One superfamily, three cuts, **self-hosted**, Latin subset, woff2, **148 KB total**. No CDN.

| Token | Family | Use |
|---|---|---|
| `--font-display` | Plex Condensed 500/600 | headlines, uppercase labels, tabs |
| `--font-ui` | Plex Sans 400/500/600 | everything else |
| `--font-numeric` | Plex Mono 400/500 | resource counters, timers, stats |

**Why:** IBM Plex is a squarish humanist family that stays legible at 11–13px on a low-DPI Chromebook
panel — the tightest real target. The Condensed cut gives RTS-style condensed headlines without a
fantasy display face, which would fight the 3D art. Mono gives **tabular numerals**, so a mana counter
does not jitter horizontally as it ticks. All three are the same family, so the UI reads as one system
rather than three borrowed parts.

`font-display: swap` is deliberate: the canvas is the content, and text arriving 60ms late beats a blank
screen on a slow Chromebook.

### Type scale

A 1.2 modular scale anchored at 13px:

| Token | px | Use |
|---|---|---|
| `--text-2xs` | 10 | uppercase labels, eyebrows |
| `--text-xs` | 11 | small print |
| `--text-sm` | 12 | UI labels, buttons |
| `--text-md` | 13 | body |
| `--text-lg` | 15 | body large, panel titles |
| `--text-xl` | 18 | section headings |
| `--text-2xl` | 23 | subheadings |
| `--text-3xl` | 29 | page headings |
| `--text-4xl` | 36 | the title block only |

Uppercase labels carry `letter-spacing: 0.08em`. Large headlines carry `-0.01em`. Nothing else adjusts
tracking.

---

## 5. Panel construction

A panel is **one shape**: a rectangle with a 45° chamfer at each corner, drawn with `clip-path`, so it
is real geometry rather than a border radius.

```
+------------------------------+
|  PANEL HEAD (uppercase, 10px)|   <- ink-800, hairline rule below
+------------------------------+
|                              |
|  panel body                  |   <- ink-850
|                              |
+------------------------------+
|  footer (actions)            |   <- ink-900
+------------------------------+
```

Three details make it read as a machined plate rather than a card:

1. **Chamfer, not radius.** `--chamfer-md: 10px` cut at 45°. Panels use `md`, controls use `sm` (6px).
2. **The inset ring is the border.** `clip-path` would slice a real `border` off at the corners, so the
   1px outline is drawn as `inset 0 0 0 1px var(--ink-500)`.
3. **The bevel.** `inset 0 1px 0 var(--bevel-light), inset 0 -1px 0 var(--bevel-dark)` — a faint light
   line on the top edge and a dark one on the bottom. This is the entire "metal" read, and it is exactly
   the same lighting logic as the 3D units' bevelled edges.

**Panels are opaque.** No `backdrop-filter` anywhere in the product: a HUD that blurs the battlefield
makes the battlefield harder to read, which is the opposite of the job.

### Elevation

| State | Background | Shadow |
|---|---|---|
| Sunken | `--ink-900` | inner recess |
| Base | `--ink-850` | bevel only |
| Raised | `--ink-800` | bevel + 2px contact shadow |
| Active | base | copper top rule, 2px |

Shadows are tight and dark (max 24px blur). No large ambient blur — that is the floating-card tell.

---

## 6. Buttons

One shape, four variants. Chamfered, 1px inset ring, bevel.

| Variant | Face | Edge | Text | When |
|---|---|---|---|---|
| Primary | `--copper-600` | `--copper-400` | `--copper-100` | the one action that advances the screen |
| Default | `--ink-700` | `--ink-500` | `--bone-100` | everything else |
| Quiet | transparent | none | `--bone-400` | tertiary: cancel, back, toolbar toggles |
| Danger | `--ink-700` | `--signal-bad` | `--bone-100` | destructive, irreversible |

### States

| State | Treatment |
|---|---|
| Default | base face |
| Hover | face steps one value lighter (`--btn-face-hover`) |
| Pressed | face steps darker, `translateY(1px)`, inner shadow — the control physically depresses |
| Focused | **2px copper outline at 2px offset** — never a glow, and never colour alone |
| Disabled | `--ink-800` face, `--bone-600` text, no interaction |

Focus is the one state that must work for keyboard users and colour-blind players, so it changes
**geometry** (an outline) as well as colour. It is always visible via `:focus-visible`.

Only one primary button per screen. If two look primary, neither is.

### Sizes

| Token | Height | Use |
|---|---|---|
| `--control-sm` | 26px | toolbar, dense rows |
| `--control-md` | 32px | default |
| `--control-lg` | 40px | main menu, primary screen action |

Icon-only controls are square and sized to `--touch-target` for the current density.

---

## 7. Icons

**30 glyphs, code-drawn SVG, one rule.** No icon font, no image, no emoji.

- **24×24 viewBox**, geometry inside a 2px margin (usable box 20×20).
- **2px stroke**, round caps, round joins, **no fill** by default.
- A few glyphs (`crystal`, `coin`, `shield`, `armour`, `power`, `mana`, `stop`) carry a fill on their
  primary closed shape at **22% alpha**, drawn *under* the same path's stroke. That is the only fill in
  the set, so it reads as line art with occasional solid accents rather than a mix of styles.
- Corners are cut at 45° where an axis-aligned box would look soft — the same chamfer language as the
  panels.

They inherit `currentColor`, so an icon is always exactly the colour of its text. The set is defined in
`src/ui/icons.ts` as a typed path table and rendered through `icon()`, which means the stroke/fill rule
is testable rather than a convention.

---

## 8. Spacing

4px base scale. Every gap, pad and margin is one of these — there are no arbitrary values.

| Token | px | Typical use |
|---|---|---|
| `--space-1` | 2 | hairline gaps, icon-to-text in a dense row |
| `--space-2` | 4 | inline gaps |
| `--space-3` | 6 | control inner padding |
| `--space-4` | 8 | row gap, button padding |
| `--space-5` | 12 | panel body padding |
| `--space-6` | 16 | section gap |
| `--space-7` | 20 | screen gutter (roomy) |
| `--space-8` | 24 | block separation |
| `--space-9` | 32 | major section |
| `--space-10` | 40 | page top |
| `--space-11` | 56 | page bottom |

---

## 9. Motion

Three durations, one curve. Motion confirms an action or moves the eye a short distance — it never
decorates.

| Token | ms | Use |
|---|---|---|
| `--dur-instant` | 60 | state flip on a control |
| `--dur-fast` | 110 | hover, pressed |
| `--dur-base` | 160 | panel reveal, tab switch |
| `--dur-slow` | 240 | screen transition |

Curve: `cubic-bezier(0.2, 0, 0.2, 1)` — a fast-out, gentle settle. No bounce, no spring, no looping
pulse, no attention-seeking wiggle.

One entrance animation exists (`ui-rise`: 4px rise plus fade). Everything is disabled under
`prefers-reduced-motion: reduce`.

---

## 10. Density tiers and target sizes

Three fixed tiers, selected from the measured viewport by `densityFor()`. Components never branch on
width themselves — they read variables, so one `data-density` attribute rescales the whole UI
coherently.

| Tier | Viewport | Text scale | Gutter | Touch target |
|---|---|---|---|---|
| `compact` | 667×375 phone | 0.92 | 8px | 28px |
| `regular` | 1366×768 Chromebook | 1.00 | 12px | 32px |
| `roomy` | 1920×1080 desktop | 1.08 | 20px | 36px |

### What changes per tier

**HUD at 667×375.** The minimap is removed (a 190px minimap on a 375px-tall screen is unusable). The
selection panel collapses to a horizontal strip. The command bar shows **icons only** — the label
element is hidden while the icon stays at 16px. Zoom controls sit above the command bar so a thumb
reaches them.

**HUD at 1366×768.** Full three-zone layout: resource bar across the top, selection panel left,
minimap right, six command buttons along the bottom.

**HUD at 1920×1080.** The same layout with a wider minimap (240px), wider selection panel (250px) and
the command bar capped at 150px per button so it does not stretch across a 1920px screen.

**Lobby** collapses from two columns to one at `compact`, with the Start control pinned bottom-right so
it never moves as settings change — the specific mistake the v1 lobby made.

**Main menu** drops the decorative plate composition at `compact` and stacks the action buttons
full-width.

---

## 11. Enforcement

A style guide nobody can violate is a style guide that survives. `tests/ui-tokens.test.ts` fails the
build on:

| Rule | How |
|---|---|
| No colour literal outside `tokens.css` | every UI file is scanned for hex/rgb/hsl |
| No purple-range hue (250–330) | every colour is parsed to HSL and rejected in that band |
| No backdrop blur | pattern scan |
| No `border-radius` above 2px | every radius is read and rejected above the hairline |
| No soft ambient shadow (blur > 24px) | every `box-shadow` is decomposed |
| No emoji, no webfont CDN, no icon font | source scan |
| One icon stroke rule | every glyph renders viewBox 24, stroke 2, round caps; fill only where marked |
| Every `var(--token)` must be declared | undeclared-variable scan across all UI sources |

Each of these was verified by deliberately introducing the violation and watching the suite fail, then
restoring the file.

The proof harness (`audit/ui-style-proof.mjs`) additionally checks the **rendered pixels**: every mockup
capture must contain no purple above 0.5% of opaque pixels, must not be blank, and every icon inside a
visible subtree must have a real box — that last check caught a CSS rule that hid the icon wrappers and
left six blank buttons on the phone HUD.

---

## 12. What is not in this system yet

- **No audio or haptic language** is specified.
- **Tooltips and context menus** are not designed — they will need the same plate + chamfer + bevel
  treatment, and a placement rule that keeps them inside the safe area on a 375px-tall screen.
- **The research tree** and **sandbox panels** are Phase 4; they will be composed from these primitives
  but their information architecture is not decided here.
- **Charts or graphs** do not exist in this UI and are not covered.
