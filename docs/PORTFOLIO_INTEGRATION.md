# Portfolio integration

Three ways to show Minimal Motion Studio inside another site. All read the same public snapshot; none
needs a token.

## 1. Link (simplest)

Use `portfolio-manifest.json` for the card: name, description, live URL, preview image, tags,
capabilities and limitations. Deep links work: `#/studio/<step>` (brief, palette, type, space, components, motion),
`#/history`, `#/history/<run_id>`, `#/request`, `#/about`.

## 2. Iframe

```html
<iframe src="https://mrrishit909.github.io/minimal-motion-studio/#/" title="Minimal Motion Studio"
        style="width:100%;height:80vh;border:0" loading="lazy"></iframe>
```

The app is fully self-contained; it follows the visitor's system theme, and a choice of Light, Dark or System is remembered in their browser. The studio works without the snapshot; only the history view reads it.

## 3. Embedded component

The Pages site also serves an ES module build with React kept external:

- `https://mrrishit909.github.io/minimal-motion-studio/lib/minimal-motion-studio.js`
- `https://mrrishit909.github.io/minimal-motion-studio/lib/minimal-motion-studio.css`

```tsx
import "https://mrrishit909.github.io/minimal-motion-studio/lib/minimal-motion-studio.css";
import { MinimalMotionStudioApp } from "minimal-motion-studio"; // or the URL above, with react/react-dom provided by the host

<MinimalMotionStudioApp
  dataUrl="https://mrrishit909.github.io/minimal-motion-studio/data/"
  showShell={false}       // host supplies header and footer
  routing="memory"        // never reads or writes the host's URL
  theme="auto"            // "auto" (default) | "light" | "dark"
/>;
```

Or without React in the host page's own code: `mount(element, config)` returns an unmount
function.

| Config | Default | Meaning |
|---|---|---|
| `basePath` | build base | where the standalone site lives |
| `dataUrl` | `<basePath>data/` | snapshot directory (must allow CORS; GitHub Pages does) |
| `theme` | `auto` | colour theme (an embedded copy never reads or writes the visitor's stored choice) |
| `showShell` | `true` | render the app's own masthead and footer |
| `routing` | `hash` | `memory` for embedding |

Isolation: every CSS rule is scoped under `.mm-root` and tokens are defined on that element, not
`:root`. Listeners (hashchange in hash mode, media queries, resize observers, window resize) are
registered in React effects and removed on unmount. Fonts are loaded only by the standalone site;
an embedded copy uses the host's fonts or the stylesheet's system sans and monospace fallbacks.
