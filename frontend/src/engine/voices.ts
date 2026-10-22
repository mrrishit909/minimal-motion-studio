import type { Voice } from "./types.ts";

// Font stacks from "Modern Font Stacks" (https://github.com/system-fonts/modern-font-stacks, CC0 1.0),
// copied verbatim from its README (checked 2026-10-22). Exported sites use installed system fonts only,
// so a package makes no third-party requests and carries no font licences.
export const VOICES: Record<Voice, { label: string; stack: string }> = {
  humanist: { label: "Humanist sans", stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
  transitional: { label: "Transitional serif", stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
  "old-style": { label: "Old-style serif", stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
  geometric: { label: "Geometric sans", stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
  industrial: { label: "Industrial sans", stack: "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif" },
  rounded: { label: "Rounded sans", stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif" },
  mono: { label: "Monospace", stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
};

/** The stack used for code and tabular detail, whatever the brief's voices. */
export const MONO_STACK = VOICES.mono.stack;
