# SafeDeck Design Language — "GRAPHITE / VOLT"

One sentence: **Uber's stark monochrome confidence × Tesla's technical
precision × Cybertruck's chamfered geometry — annotated with cartoonish
scribbles, like an engineer's marker on a blueprint.**

This document is the contract. Every screen, component, and future feature
follows it. If a change can't be expressed in these tokens, the change is
wrong (or this document gets amended first — never silently).

---

## 1. Principles

1. **Ink on paper.** The interface is monochrome: near-black ink on paper
   white. Color is information, never decoration. The single brand accent —
   VOLT — marks *the* primary action or the current state, nothing else.
2. **Sharp, not soft.** Zero border-radius. Corners are square or chamfered
   (Cybertruck facets). No blur, no frosted glass, no soft drop shadows —
   elevation is expressed with borders and motion, not haze.
3. **The scribble is the humanity.** One hand-drawn accent per screen — a
   marker underline, a handwritten aside — placed deliberately, like an
   annotation. Never more than one focal scribble per view.
4. **Fast is a feature.** No backdrop-filter, no infinite background
   animations, no webfonts. System fonts, flat fills, sub-200ms motion.
5. **Information is set in mono.** Fingerprints, links, timestamps, counts —
   anything a machine produced — renders in the mono stack, uppercase labels
   in tracked caps.

## 2. Tokens

| token | value | use |
|---|---|---|
| `--ink` | `#0e0e10` | text, borders, primary surfaces |
| `--paper` | `#f6f6f3` | app background (warm paper, not clinical white) |
| `--surface` | `#ffffff` | cards, panels |
| `--volt` | `#d8ff3e` | THE accent: primary hover, active states, marks |
| `--muted` | `#66666e` | secondary text |
| `--line` | `#0e0e10` at 2px | structural borders (cards, inputs, tables) |
| `--hairline` | `rgba(14,14,16,.14)` | dividers, table rules |
| `--danger` / `--ok` / `--warn` | `#e8252a` / `#0f8a3d` / `#c77700` | semantic only |
| `--chamfer` | `polygon(...)` 12px cut, top-right + bottom-left | cards, buttons, badges |
| `--ease-sharp` | `cubic-bezier(0.2, 0, 0, 1)` | all transitions, 140–200ms |
| fonts | system sans (`-apple-system … Segoe UI`), weight 800 tight for display; mono for data; `Segoe Print / Bradley Hand / cursive` for scribble notes | no downloads |

Background texture: a static 22px dot grid at 6% ink — graph paper, drawn
once, never animated.

## 3. Geometry

- **Chamfer** = the brand shape. Cards, primary buttons, the brand mark, and
  thumbnails cut the top-right and bottom-left corners at 12px
  (`clip-path`). Small elements (badges, chips) cut 6px or stay square.
- Borders are **2px solid ink** on interactive/structural elements, 1px
  hairline for internal rules. Nothing floats — everything is drawn.
- The top nav is an **ink bar** (Uber): black, white text, volt on hover.

## 4. Motion

- Hover: `translate(-2px, -2px)` + volt fill or volt edge — the element
  *snaps toward you*. Active: `translate(0,0)` — it clicks back. 140ms.
- Entrance: single 6px rise + fade, 240ms, once per page. No stagger.
- The one indulgence: scribble strokes **draw themselves in** (SVG
  stroke-dashoffset, ~500ms) on first paint.
- `prefers-reduced-motion` kills everything.

## 5. Scribble layer

- `.grad` — marker-highlighted word: volt scribble underline (inline SVG
  data-URI, wobbly path), used in the hero headline.
- `.scribble-note` — handwritten aside in the cursive stack, used for hints
  ("click anything to edit it"), one per screen max.
- Empty states get a hand-drawn arrow or circle, not an emoji.

## 6. Components (canonical looks)

- **Button primary**: ink fill, white text, uppercase 700 tracked, chamfered;
  hover = volt fill + ink text + snap. **Secondary**: paper fill, 2px ink
  border. **Danger**: white fill, red border/text.
- **Card**: white, 2px ink border, chamfered, flat. Hover (when clickable):
  snap + volt top edge.
- **Segmented control**: ink-bordered track, square cells, active cell = ink
  fill white text (not volt — volt is for hover/interaction sparks).
- **Window bar** (viewer/canvas chrome): ink bar with three square status
  notches (ink outline / muted / volt) + mono uppercase title. The Mac
  traffic lights are retired.
- **Badges**: square, 1.5px border, uppercase mono 10px. Label badges keep
  their semantic label color (data, not decoration).
- **Inputs**: white, 2px ink border, square; focus = volt 3px outline offset.
- **Tables**: mono tracked-caps headers, hairline rules, volt row-hover tint.
- **Watermark overlay**: unchanged mechanics; type set in the display stack.

## 7. What was deleted in this pass (and why)

- `/artifacts/new` page — the front page *is* the add flow, signed-in or
  not. One way to add, everywhere. Dashboard's "+ Add" now points home.
- Liquid-glass system: backdrop-filter blur, animated aurora backdrop,
  gradient buttons, Mac traffic lights, rounded radii — replaced wholesale.
- Dead CSS from prior iterations (old hero, round-2 page editor classes).

## 8. Do / Don't

- ✅ One volt element per view. ✅ One scribble per view. ✅ Ink borders.
- ❌ Gradients. ❌ Blur. ❌ Rounded corners. ❌ Colored buttons that aren't
  volt-on-interaction. ❌ Decorative animation loops. ❌ New fonts.
