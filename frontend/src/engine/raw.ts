// The verbatim text of the package's static files. In Node (the CLI, and vitest, which empties CSS
// imports) they are read from disk; in the browser bundle Vite inlines them with ?raw. Both give the
// files' exact bytes: one test composes through the CLI and compares, another builds a Vite bundle
// and checks the inlined strings.

export type RawFiles = { buildCore: string; siteCss: string; motionJs: string };

async function load(): Promise<RawFiles> {
  if (typeof process !== "undefined" && process.versions?.node) {
    // Both kept out of Vite's sight: a literal module name would pull a browser stub into the bundle,
    // and a literal new URL(..., import.meta.url) would make Vite emit the file as an asset.
    const fsName = ["node", "fs"].join(":");
    const fs = (await import(/* @vite-ignore */ fsName)) as typeof import("node:fs");
    const base = import.meta.url;
    const read = (p: string) => fs.readFileSync(new URL(p, base), "utf8");
    return { buildCore: read("./build-core.js"), siteCss: read("./assets/site.css"), motionJs: read("./assets/motion.js") };
  }
  const [b, c, m] = await Promise.all([
    import("./build-core.js?raw"),
    import("./assets/site.css?raw"),
    import("./assets/motion.js?raw"),
  ]);
  return { buildCore: b.default, siteCss: c.default, motionJs: m.default };
}

export const RAW: RawFiles = await load();
