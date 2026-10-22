# Run report: Rotaleaf

Launch template for Rotaleaf: 16 of 16 contrast pairings pass (2 colours adjusted), 0 axe violations at 3 widths, export builds identically.

- Template: launch. Origin: studio. Motion preset: lively.
- Export: `node build.mjs` in a clean folder produced exactly the page the studio previews (site.html, sha256:709987673765b0563d0b290c60f8aa786795a75500f3162cce2be6fdf282e0bb).

## Colour adjustments

| Role | From | To | Why |
|---|---|---|---|
| accent | #a6422a | #e0775d | Lightened to raise contrast from 2.22:1 to 4.50:1 against the page and panels, so links and accent text are readable. |
| action | #a6422a | #be583f | Lightened to raise contrast from 2.22:1 to 3.01:1 against the page and panels, so button edges are visible (3:1 for interface parts). |

## Contrast (WCAG 2.2)

| Where | Colours | Ratio | Minimum | Result |
|---|---|---|---|---|
| Body text on the page | text on canvas | 14.89:1 | 4.5:1 | pass |
| Body text on panels | text on surface | 12.67:1 | 4.5:1 | pass |
| Secondary text on the page | text_muted on canvas | 7.01:1 | 4.5:1 | pass |
| Secondary text on panels | text_muted on surface | 5.97:1 | 4.5:1 | pass |
| Accent text and links on the page | accent on canvas | 5.29:1 | 4.5:1 | pass |
| Accent text on panels | accent on surface | 4.50:1 | 4.5:1 | pass |
| Button label on a filled button | on_action on action | 4.51:1 | 4.5:1 | pass |
| Button edge against the page | action on canvas | 3.54:1 | 3:1 | pass |
| Button edge against panels | action on surface | 3.01:1 | 3:1 | pass |
| Text and buttons on the support band | on_support on support | 12.46:1 | 4.5:1 | pass |
| Focus ring on the page | focus on canvas | 3.60:1 | 3:1 | pass |
| Focus ring on panels | focus on surface | 3.07:1 | 3:1 | pass |
| Focus ring on the support band | focus on support | 3.02:1 | 3:1 | pass |
| Success text on the page | success on canvas | 9.01:1 | 4.5:1 | pass |
| Warning text on the page | warning on canvas | 8.33:1 | 4.5:1 | pass |
| Danger text on the page | danger on canvas | 8.19:1 | 4.5:1 | pass |

## Visual review (chromium 153.0.8010.12)

| Viewport | axe violations | Overflow | Console errors | Requests | Questions by keyboard | Focus visible |
|---|---|---|---|---|---|---|
| 390 x 844 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 768 x 1024 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 1440 x 900 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |

axe (WCAG 2.0, 2.1 and 2.2 A and AA rules) found no violations.

Motion: 13 animations started on load with normal motion; 0 with reduced motion requested.

Screenshots taken during the review are temporary CI artifacts and are not part of these results.
