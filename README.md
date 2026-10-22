# Minimal Motion Studio

A brand-to-website studio. A structured brief becomes semantic design tokens, a palette whose every
pairing is contrast-checked on the background it actually sits on, type and spacing scales, component
variants and a motion preset, composed into a small website you can preview at phone, tablet and
desktop widths and download as a standalone source package. The studio runs entirely in your browser
and is deterministic: the same brief always gives the same files. Published generation runs build the
same package on GitHub Actions, review it in a real browser and keep the result on the state branch.

- **Live studio:** https://mrrishit909.github.io/minimal-motion-studio/
- **Current release record:** [`releases/current.json` on the state branch](https://github.com/mrrishit909/minimal-motion-studio/blob/state/releases/current.json)
- **Run records and results:** the [`state` branch](https://github.com/mrrishit909/minimal-motion-studio/tree/state)

## Who can do what

| Capability | Who | Where |
|---|---|---|
| Shape a brief, preview it at three widths, reduced-motion preview, download the package, import and export briefs | anyone, anonymously | the studio, in browser memory; nothing is uploaded |
| Publish a generation run (compose, independent build, browser review) | the owner; others after the owner approves | a GitHub issue with the *Generation run request* form |
| AI-proposed briefs | the owner only | the `generate.yml` workflow; needs an inference secret the owner configures; never offered on the site |

As of this release no inference secret is configured, so no AI-proposed generation has run. The
workflow's skip path and its secret-free verifier (with committed hand-written fixtures) are tested.

## What it does

| Part | Where |
|---|---|
| One brief contract (JSON Schema 2020-12), validated by Ajv in the browser and jsonschema in the harness | `schemas/request.schema.json` |
| Tokens: OKLCH palette derivation with lightness-only contrast adjustments (culori), type and spacing scales, radii, motion timing | `frontend/src/engine/tokens.ts`, `color.ts`, `presets.ts`, `voices.ts` |
| Composition into a source package with one text escaper; three templates; original SVG motif | `frontend/src/engine/compose.ts`, `assets/` |
| Zero-dependency build shared by the studio and the exported `build.mjs` (tokens CSS from tokens.json, contrast re-check, hash-based CSP) | `frontend/src/engine/build-core.js` |
| Deterministic zip, CLI for Actions (`run`, `verify-candidate`, `compose`) | `frontend/src/engine/zip.ts`, `cli.ts` |
| Studio and history site | `frontend/src` |
| GitHub-native harness: intake, admission, publication, reconciler, outcome loop, memory | `harness/` |

## Results

The committed sample brief (a fictional garden design studio): 16 of 16 contrast pairings pass, 0 axe
violations at 390, 768 and 1440 px, and the exported package builds to a page byte-identical to the
studio's preview. The dark launch example needed two colour adjustments (accent and button fill
lightened), both listed in the studio and in `adjustments.json`. Lighthouse on the live site (default
simulated throttling, medians of three runs): accessibility 1.0, best practices 1.0, SEO 1.0;
performance 0.96 on the phone profile and 1.0 on desktop; LCP 1.8 s (phone) and 0.48 s (desktop); CLS 0.
An independent review confirmed 16 defects (5 major, 11 minor); all are fixed and kept as regression
tests (see [verification](docs/VERIFICATION.md)).

## Use the exported package

```sh
unzip fieldnote-studio-site.zip -d site && cd site
npm run build          # Node 18+, no install: writes dist/index.html
```

Change a colour in `tokens.json` and build again: every use changes, and the build refuses a value that
breaks a contrast pairing. `dist/` can be served by any static host.

## Documents

[Architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md),
[state model](docs/STATE_MODEL.md), [security](docs/SECURITY.md),
[cost limits](docs/COST_LIMITS.md), [verification](docs/VERIFICATION.md),
[portfolio integration](docs/PORTFOLIO_INTEGRATION.md), [design contract](docs/DESIGN_CONTRACT.md),
[portfolio manifest](portfolio-manifest.json).

## Assets and licences

| Font | Package | Licence |
|---|---|---|
| Recursive (Latin, MONO-axis file) | `@fontsource-variable/recursive` 5.3.0 | SIL Open Font License 1.1, (c) The Recursive Project Authors |

The fonts are installed from npm (Fontsource packages, which carry the OFL text) and bundled into the
site's build; nothing loads from a third-party font service. Icons and illustrations are original inline
SVG and CSS; there are no photographs or third-party images. Example brands are fictional; generated pages use system font stacks (Modern Font Stacks, CC0) and carry no third-party asset. The code is published
in this public repository.

## Limitations

Three templates, seven system font voices, four motion presets, at most six items and five questions.
Exports use system font stacks, so typography varies by device. No image uploads. The success, warning
and danger roles are derived and checked but not used by the current templates. Some hostile palettes
end with near-black accents or a focus colour far from the brand: they always pass and every change is
listed. The collapse animation keeps the answer painted while folding only where `::details-content` is
supported; elsewhere the state still changes at once. The studio's own web font uses
`font-display: optional`, so a first visit on a slow connection shows the system fallback.
