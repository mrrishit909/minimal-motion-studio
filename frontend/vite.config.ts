import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// The site is served from a repository subpath on GitHub Pages; never assume "/".
const base = process.env.BASE_PATH ?? "/minimal-motion-studio/";

// Start the interface font with the HTML (font-display: optional uses it only if it is ready at first paint).
const preloadFont: Plugin = {
  name: "preload-interface-font",
  transformIndexHtml: {
    order: "post",
    handler(_html, ctx) {
      const asset = Object.keys(ctx.bundle ?? {}).find((f) => /recursive-latin-mono-normal-[^/]*\.woff2$/.test(f));
      return asset ? [{ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: "", href: `${base}${asset}` }, injectTo: "head" }] : [];
    },
  },
};

export default defineConfig({
  base,
  plugins: [react(), preloadFont],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
