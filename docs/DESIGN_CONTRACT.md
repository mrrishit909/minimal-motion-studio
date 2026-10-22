# Design contract

A sanitized, project-specific contract derived from the owner's design workflow (website playbook,
Frontend Design, UI UX Pro Max). It is the reference the subjective review grades against.

## Character: a spacious interactive design atelier

The studio is a bright room with one object on a plinth: the site being made. Controls stay quiet
and to one side; the stage is large, oat-coloured and generous, and the device frame on it changes
width with a measured ruler above it. Colour roles appear as tall paint-chip tiles, each carrying
its hex value and the contrast it achieves on its real background. Nothing is boxed for decoration:
panels sit on the canvas separated by space and hairlines.

How it differs from the sibling projects:

| Project | Character | This studio instead |
|---|---|---|
| Quant Foundry | ivory editorial research note, serif, red-pen strikes | sans and mono from one variable family, no editorial devices |
| Data Refinery | gridded workbench, wide grotesk, dark housing band | no grid texture, no dark band; a light plinth |
| Policy Forge | oat desk, ivory paper sheets, folder tabs | no paper metaphors or tabs; the oat is a stage, not a desk |
| Incident Loom | dark warm charcoal, threads | light by default, one object in focus |

## Tokens (studio chrome)

Contrast was computed on the actual pairings (WCAG 2.x relative luminance).

| Role | Light | Dark | Used for | Checked pairing |
|---|---|---|---|---|
| canvas | #F7F1E8 | #1E1916 | page | |
| raised | #FFFCF7 | #29221D | control column, dialogs | |
| plinth | #E8D7BF | #3A3029 | the stage behind the device frame | |
| ink | #29201B | #FFF6E8 | text | 14.2 / 16.3 on canvas, 11.3 / 12.0 on plinth |
| ink-2 | #5E5047 | #CFC0AD | secondary text | 6.9 / 9.8 on canvas, 5.5 / 7.2 on plinth |
| line | #D8C8B3 | #4A3E35 | decorative hairlines only | none required |
| control | #84725F | #8F7E6E | input and toggle boundaries | at least 3.0 on canvas, raised and plinth |
| action | #4E4F37 | #D6D3AE | primary action fill | label 7.9 / 10.5 on it; 7.5 / 11.4 against canvas |
| on-action | #FFF6E8 | #29201B | primary action label | |
| selected | #5A171B | #E8D7BF | current step, pressed segment | 11.9 / 12.4 on canvas |
| focus | #A6422A | #EE9E85 | focus ring (2 px, 2 px offset) | 5.5 / 8.2 on canvas, 4.3 / 6.0 on plinth |
| ok / warn / danger | #4A5E2A / #835410 / #9B2C1F | #B4C38A / #E3B867 / #F09A86 | pass, adjusted, fail | all at least 4.6 on canvas, raised and plinth |
| series | olive #646548, terracotta #A6422A, burgundy #5A171B, ochre #9A6B1F | lightened equivalents | curves and ratio bars | always paired with text values |

Meaning never depends on colour alone: pass, adjusted and fail carry a glyph and words; ratio bars
carry the number and the minimum.

## Type

One family, Recursive (variable, OFL), loaded only by the standalone site with `font-display: optional` (a first visit on a slow connection keeps the system fallback rather than shifting the layout). Its MONO axis gives two
clearly distinct voices from one file: Sans Linear (MONO 0) for interface text and headings, Mono
Linear (MONO 1) only for values that are code (hex, ratios, pixel sizes, file names). Scale (px):
13 meta, 15 interface, 17 lead, 22 section, 30 view heading, 46 wordmark on wide screens. Sentence
case everywhere; no all-caps labels, no eyebrow labels above headings. Measure at most about 70
characters for prose.

The generated sites use system font stacks (Modern Font Stacks, CC0) so an exported package makes
no third-party requests and carries no font licence.

## Layout

- 1440: wordmark and navigation across the top; a 400 px control column (step list, then the active
  step's controls, then the export actions) beside a wide, sticky stage that always fits the viewport.
  Paint chips and the contrast pairings live in the Palette step, next to the seeds that produce them
  (an earlier version put them under the stage, where a sticky column taller than the screen hid them).
- 768: the stage first at full width (first in focus order too), then the six steps in one row and the
  controls below.
- 390: the stage first (the phone preview fits the width; larger devices scale down and say so), steps
  in a 3 x 2 grid, controls stacked, export actions full width, every control at least 44 px tall.
  Nothing important is hidden.

## Motion (explains change, never decoration)

| Moment | Motion | Reduced motion |
|---|---|---|
| First load | paint chips deal in once, staggered 40 ms; the device frame settles | static |
| Device change | the frame scales from its old width to the new one (transform only) and the ruler label counts | instant |
| Step change | the selected marker slides to the new step; the panel cross-fades | instant |
| Palette change | ratio bars grow or shrink to the new value; chips cross-fade colour | instant |
| Motion preset change | the curve redraws; Play replays the preview's own entry choreography | the preview renders as a reduced-motion visitor sees it |
| Export | the button confirms with the package size and file count | same text, no movement |
| Disclosure | height and opacity, interruptible | instant |

No perpetual animation, no scroll hijacking, no hover-only controls. Every control works by
keyboard and touch (targets at least 44 px on touch layouts).

## Language

Plain verbs, sentence case. Buttons say what happens ("Download source package", "Copy brief",
"Request a generation run"). AI is mentioned only where it is true: the owner-only workflow. Anonymous
visitors are never offered or promised AI generation.

## Rejected candidates

The UI UX Pro Max design-system search proposed a pure black-and-white "motion-driven" style with
scroll-triggered storytelling and Archivo with Space Grotesk. Rejected: the brief requires the warm
palette family, scroll-driven chapters would hijack a working tool, and Archivo is Data Refinery's
face. Kept from it: the accessibility checklist (visible focus, reduced motion, 150 to 300 ms
feedback, 4.5:1 text).
