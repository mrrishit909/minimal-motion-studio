# Architecture

```
                         schemas/request.schema.json  ($defs/spec: the one brief contract)
                          |                         |
           Ajv (browser, studio)            jsonschema (harness intake and admit)
                          |                         |
  Studio (React, anonymous)                  GitHub issue form / owner dispatch
  brief -> compose(spec) -> build(files)            |
        |                     |               run.yml: admit -> compute -> publish -> Pages -> outcome -> memory
   stage iframe (srcdoc,      zip(files) ->          |
   sandbox=allow-scripts)     download        compute (read-only, no secrets):
                                              node src/engine/cli.ts run
                                                compose -> write package -> node build.mjs (independent)
                                                -> byte-compare with build() -> Playwright + axe review
                                              results: spec, tokens, adjustments, site.html, package.zip,
                                                       review, summary, report  ->  state branch
  generate.yml (owner only): propose brief (secret, no tools) -> verify-candidate (no secret) -> run.yml
```

## Engine (`frontend/src/engine`, TypeScript run by both Vite and Node 24)

| Module | Job |
|---|---|
| `schema.ts` | Ajv 2020, strict, compiled from the request schema; plain-words errors that never quote input |
| `tokens.ts`, `color.ts` | seed colours to roles in OKLCH (culori), lightness-only adjustment until every pairing meets its minimum, each change recorded; type scale, spacing scale, radii, motion timing |
| `presets.ts`, `voices.ts` | motion presets with easing curves; system font stacks (Modern Font Stacks, CC0) |
| `compose.ts` | spec to the source package: `index.html`, `styles/site.css`, `scripts/motion.js`, `tokens.json`, `brief.json`, `build.mjs`, `package.json`, `README.md`; one escaper for every string |
| `build-core.js` | zero-dependency build shared by the studio and the exported `build.mjs`: regenerates the tokens CSS from `tokens.json`, re-checks every pairing, checks every `var()` is defined, inlines style and script into one page with a hash-based CSP |
| `zip.ts` | deterministic store-only zip (sorted entries, fixed timestamps, CRC-32) |
| `examples.ts` | three fictional example brands, one per template |
| `cli.ts` | `run`, `verify-candidate`, `compose` for Actions and CI |

The same `build-core.js` source runs in three places: the studio (preview), the exported package
(`build.mjs` embeds it verbatim) and the CLI. That is why the preview can be byte-identical to the
exported `dist/index.html`, and the browser gate checks exactly that.

## Studio (`frontend/src`)

- `studio/useStudio.ts`: the brief in memory, validation, a debounced compose and build; the stage keeps
  the last valid page while the brief has problems.
- `studio/Stage.tsx`: template and device controls, the ruler, the sandboxed frame, replay and the
  reduced-motion preview (the built page with `data-motion="reduce"` on its root element).
- `studio/Panels.tsx`: brief, palette, type, space, components, motion.
- `studio/Swatches.tsx`: paint chips and the contrast pairings.
- `studio/Export.tsx`: package download, brief download, copy and import, and the GitHub request link.
- `views/History.tsx`: published runs from the snapshot, each page in a sandboxed frame, its review,
  pairings and files; a run's brief opens in the studio.

## Decisions

| Decision | Why |
|---|---|
| Preview equals export, byte for byte | A separate React rendering of the preview could drift from what people download |
| Zero-dependency export | `npm run build` works offline with Node alone; no supply chain to audit in the package |
| System font stacks in exports | No third-party requests and no font licence to carry; documented trade-off: rendering varies by device |
| AI proposes data, never code | Generated code would need a sandbox and review; a brief goes through the same deterministic, tested path as any other |
| Contrast checked twice | At derivation (with visible adjustments) and again at build time, so an edited `tokens.json` cannot ship unreadable pairs |
| Opaque-origin preview | Even a bug in escaping could not reach the studio's DOM, storage or the network |
| Shared harness, distinct site | Operations are identical across the five projects; the visual layer is per product |

The harness, state model and workflows are documented in [STATE_MODEL.md](STATE_MODEL.md),
[SECURITY.md](SECURITY.md) and [OPERATIONS.md](OPERATIONS.md).
