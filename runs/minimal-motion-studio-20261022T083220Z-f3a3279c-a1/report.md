# Run report: Fieldnote Studio

Studio template for Fieldnote Studio: 16 of 16 contrast pairings pass, 0 axe violations at 3 widths, export builds identically.

- Template: studio. Origin: fixture. Motion preset: gentle.
- Export: `node build.mjs` in a clean folder produced exactly the page the studio previews (site.html, sha256:90946d4532decfd7976fc1827573fee38b26c3d7f5c7699c11d2691e4cb9ae83).

## Colour adjustments

No colour needed changing: every seed met its minimums as given.

## Contrast (WCAG 2.2)

| Where | Colours | Ratio | Minimum | Result |
|---|---|---|---|---|
| Body text on the page | text on canvas | 14.89:1 | 4.5:1 | pass |
| Body text on panels | text on surface | 13.26:1 | 4.5:1 | pass |
| Secondary text on the page | text_muted on canvas | 6.05:1 | 4.5:1 | pass |
| Secondary text on panels | text_muted on surface | 5.38:1 | 4.5:1 | pass |
| Accent text and links on the page | accent on canvas | 5.60:1 | 4.5:1 | pass |
| Accent text on panels | accent on surface | 4.99:1 | 4.5:1 | pass |
| Button label on a filled button | on_action on action | 5.60:1 | 4.5:1 | pass |
| Button edge against the page | action on canvas | 5.60:1 | 3:1 | pass |
| Button edge against panels | action on surface | 4.99:1 | 3:1 | pass |
| Text and buttons on the support band | on_support on support | 11.32:1 | 4.5:1 | pass |
| Focus ring on the page | focus on canvas | 5.60:1 | 3:1 | pass |
| Focus ring on panels | focus on surface | 4.99:1 | 3:1 | pass |
| Focus ring on the support band | focus on support | 4.26:1 | 3:1 | pass |
| Success text on the page | success on canvas | 5.24:1 | 4.5:1 | pass |
| Warning text on the page | warning on canvas | 5.74:1 | 4.5:1 | pass |
| Danger text on the page | danger on canvas | 6.02:1 | 4.5:1 | pass |

## Visual review (chromium 153.0.8010.12)

| Viewport | axe violations | Overflow | Console errors | Requests | Questions by keyboard | Focus visible |
|---|---|---|---|---|---|---|
| 390 x 844 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 768 x 1024 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 1440 x 900 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |

axe (WCAG 2.0, 2.1 and 2.2 A and AA rules) found no violations.

Motion: 10 animations started on load with normal motion; 0 with reduced motion requested.

Screenshots taken during the review are temporary CI artifacts and are not part of these results.
