# Verification

**The single current release record is `releases/current.json` on the `state` branch.** It is
written only by the Outcome Verification Loop and only when every hard gate passed. Every attempt,
including blocked ones, is in `releases/history.json`, with findings and small evidence files in
`outcomes/<release_id>/`. This document explains the checks; it does not restate their status.

## Hard gates (objective; rubric locked by `rubric/rubric.lock`)

| Gate | What it proves | How |
|---|---|---|
| export-gates | all 91 unit and engine tests pass: the exported package builds with Node alone in a temporary directory and its `dist/index.html` is byte-identical to the studio's build, for every example and template x mode; editing `tokens.json` changes every use and a contrast-breaking edit fails the build; every pairing passes for examples and hostile palettes, with adjustments reported; hostile text in every brief field stays escaped text (one script element, no handler attributes, only https, mailto, tel or `#` links); the CSP hashes match the inlined content; the zip reads back; output is deterministic; the schema rejects bad input without quoting it; the AI-candidate verifier accepts the clean fixture and rejects the hostile and credential-bearing ones | vitest (all unit and engine tests), summarised to `export-gates/summary.json` |
| harness | state machine, idempotency, duplicate detection, compare-and-swap concurrency, immutability, intake authorization by identity, JSON brief parsing (NaN refused), issues cannot claim AI provenance, schema errors never quote input, ceilings, repair-round bounds, memory guard, real hooks on real engine output (CI) | `pytest tests/harness` |
| secret-scan | no credential patterns in tracked files or in the live site's HTML, JS and CSS | `scripts/secret_scan.py --live` |
| live-site | the Pages URL serves the app and its snapshot points at the state branch's latest run | HTTP checks |
| published-matches-state | every published result file of the latest run is byte-identical to the state branch | `python -m harness verify-published` |
| browser | 16 checks x 3 widths (390, 768, 1440) plus 15 single-width checks from the independent review, all 63 must pass, against the live site: the stage frame is sandboxed (`allow-scripts` only) and shows the composed page; editing updates it and a bad link is explained at its field; a low-contrast seed is adjusted, listed, and every pairing passes; type, space and component controls change the stylesheet; device widths and ruler; motion presets, replay and a reduced-motion preview with no animations; the downloaded zip built independently equals the preview byte for byte and computes the same styles; token propagation on rebuild; hostile brief text stays text in preview and export; hostile imports refused; keyboard and focus; dark theme (axe plus a primary-action contrast check); the studio itself does not animate under reduced motion; history with origin, review and pairings; loading / empty / error-retry / stale states; no AI control for visitors and AI described as owner-only; the preview image; axe (WCAG 2.2 AA serious and critical), horizontal overflow, console errors and failed same-origin requests | Playwright, `frontend/tests/e2e/site.spec.ts` |
| lighthouse | accessibility >= 0.95, best practices >= 0.9, SEO >= 0.9, performance >= 0.9, LCP <= 2.5 s, CLS <= 0.1 on the live site, phone and desktop, each the median of three runs | Lighthouse CLI 13.5.0, `frontend/scripts/lighthouse.mjs` |

Lighthouse runs use its default method (simulated throttling; the mobile profile for the phone, the
desktop preset for desktop). Single runs vary near the LCP limit (1.8 to 2.6 s on the live site across
runs), so each form factor runs three times and the gate reads the median, as Lighthouse's variability
guidance recommends; every individual value is kept in `lighthouse/summary.json`. One phone run with
applied (devtools) throttling is recorded alongside as information.

The first live checks also exposed an intermittent layout shift (CLS 0.23 in about two runs of three)
that only Lighthouse caught: a trace showed it inside the preview frame (`about:srcdoc`), whose first
layout was counted before the generated page settled. A new preview frame now stays hidden until its
document has loaded and laid out, then fades in; CLS was 0 in seven of seven runs afterwards.

Every published run also carries its own review (`review.json`): axe at three widths, overflow, keyboard
operation of every question, visible focus, reduced motion and normal motion, and the byte comparison of
the independent build. Screenshots stay in the run's temporary artifact.

## Independent review

A separate reviewer (an agent that did not build the engine or the studio) attacked the export, token,
contrast, keyboard, reduced-motion, mobile, injection, AI-path, honesty and determinism guarantees and
recorded each confirmed defect as a strict expected failure (`frontend/tests/unit/engine-adversarial.test.ts`
and `frontend/tests/e2e/adversarial.spec.ts`). It confirmed 16 defects (5 major, 11 minor, no blocker).
The majors: one long unbroken word (a 42-character German compound) made generated pages scroll sideways
at 390 px; the history table said "not recorded" for review fields the run did record; "Next: <step>"
moved focus to a heading thousands of pixels off screen; the announcement line rendered on every template
but could be edited only on Launch; and an exported package's README said no AI was involved even for an
AI-proposed brief. Minors included tab order that did not follow the stacked layout, controls under 44 px
on the phone layout, segmented groups without visible labels, a malformed deep link blanking the site,
the Still preset still moving buttons on press, verifier gaps (three credential prefixes, invalid UTF-8
silently replaced), a Unicode whitespace disagreement and quadratic backtracking in one schema pattern,
the CLI installed with the secret in its environment, and a clipped focus ring. All 16 are fixed and run
as plain regression tests next to the checks that held (contrast across 1,500 hostile palettes, export
equal to preview across the full variant grid, determinism across processes, time zones and locales,
sandboxed frames, reduced motion, generated-page target sizes). The reviewer also flagged, unconfirmed,
that the optional grader's Read tool had no path scope; it is now limited to the evidence, rubric and
design contract in all five projects.

## Subjective review (separate from gates)

The rubric's subjective criteria (hierarchy, typography, spacing, palette, motion, responsive
adaptation, distinctiveness, honesty about AI, fidelity to `docs/DESIGN_CONTRACT.md`) are scored by an
independent grader only when the repository has an inference secret; otherwise the release record
says the grader did not run. Scores never change a gate result.

## Repairs

A failing gate opens or updates one `type:repair` issue per gate. The same failing set on a new
commit counts as another repair round; after three rounds the release is marked blocked for human
review and its evidence is kept.

## Reproduce locally (optional)

```sh
uv sync --frozen && uv run pytest
cd frontend && npm ci && npx vitest run && npm run build && npx playwright install chromium && npm run e2e
node src/engine/cli.ts run --request ../fixtures/requests/sample.json --out /tmp/mms-out --screens /tmp/mms-screens
```
