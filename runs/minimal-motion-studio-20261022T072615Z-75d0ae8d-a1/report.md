# Run report: Marrow Lane Bakehouse

Shopfront template for Marrow Lane Bakehouse: 16 of 16 contrast pairings pass, 0 axe violations at 3 widths, export builds identically.

- Template: shopfront. Origin: studio. Motion preset: crisp.
- Export: `node build.mjs` in a clean folder produced exactly the page the studio previews (site.html, sha256:927c5caddd638ea84b26436381c15ca1db71103fa1c0d71a440a8b67ccd702c7).

## Colour adjustments

No colour needed changing: every seed met its minimums as given.

## Contrast (WCAG 2.2)

| Where | Colours | Ratio | Minimum | Result |
|---|---|---|---|---|
| Body text on the page | text on canvas | 11.32:1 | 4.5:1 | pass |
| Body text on panels | text on surface | 12.59:1 | 4.5:1 | pass |
| Secondary text on the page | text_muted on canvas | 5.20:1 | 4.5:1 | pass |
| Secondary text on panels | text_muted on surface | 5.78:1 | 4.5:1 | pass |
| Accent text and links on the page | accent on canvas | 9.47:1 | 4.5:1 | pass |
| Accent text on panels | accent on surface | 10.54:1 | 4.5:1 | pass |
| Button label on a filled button | on_action on action | 9.47:1 | 4.5:1 | pass |
| Button edge against the page | action on canvas | 9.47:1 | 3:1 | pass |
| Button edge against panels | action on surface | 10.54:1 | 3:1 | pass |
| Text and buttons on the support band | on_support on support | 4.51:1 | 4.5:1 | pass |
| Focus ring on the page | focus on canvas | 13.04:1 | 3:1 | pass |
| Focus ring on panels | focus on surface | 14.50:1 | 3:1 | pass |
| Focus ring on the support band | focus on support | 3.00:1 | 3:1 | pass |
| Success text on the page | success on canvas | 4.55:1 | 4.5:1 | pass |
| Warning text on the page | warning on canvas | 4.52:1 | 4.5:1 | pass |
| Danger text on the page | danger on canvas | 4.58:1 | 4.5:1 | pass |

## Visual review (chromium 153.0.8010.12)

| Viewport | axe violations | Overflow | Console errors | Requests | Questions by keyboard | Focus visible |
|---|---|---|---|---|---|---|
| 390 x 844 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 768 x 1024 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |
| 1440 x 900 | 0 | 0 px | 0 | 0 | 3 of 3 | yes |

axe (WCAG 2.0, 2.1 and 2.2 A and AA rules) found no violations.

Motion: 14 animations started on load with normal motion; 0 with reduced motion requested.

Screenshots taken during the review are temporary CI artifacts and are not part of these results.
