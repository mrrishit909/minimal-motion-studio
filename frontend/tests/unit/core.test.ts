import { describe, expect, it } from "vitest";
import { isStale } from "../../src/data/site";
import { parseRoute, routeHref } from "../../src/routing";
import { slug } from "../../src/studio/Export";
import { withReducedMotion } from "../../src/studio/Stage";
import { fieldErrors } from "../../src/studio/useStudio";

describe("routing", () => {
  it("round-trips every route and falls back to the brief step", () => {
    for (const hash of ["#/", "#/studio/palette", "#/studio/motion", "#/history", "#/history/run-1", "#/request", "#/about"]) {
      expect(routeHref(parseRoute(hash))).toBe(hash);
    }
    expect(parseRoute("#/studio/nope")).toEqual({ view: "studio", step: "brief" });
    expect(parseRoute("#/whatever")).toEqual({ view: "studio", step: "brief" });
  });
});

describe("studio helpers", () => {
  it("slug keeps only safe ascii", () => {
    expect(slug("Café Ünder & Co.")).toBe("cafe-under-co");
    expect(slug("<script>")).toBe("script");
    expect(slug("***")).toBe("brand");
  });

  it("reduced-motion preview only adds the flag to the html element", () => {
    const html = '<!doctype html><html lang="en"><head></head><body><p>&lt;html&gt;</p></body></html>';
    const out = withReducedMotion(html);
    expect(out).toBe('<!doctype html><html data-motion="reduce" lang="en"><head></head><body><p>&lt;html&gt;</p></body></html>');
  });

  it("matches field errors by slash or dotted path only", () => {
    const errors = ["/brand/name: must be at most 40 characters", "brand.cta_href: must be an https, mailto or tel link", "/brand/tagline: required"];
    expect(fieldErrors(errors, ["brand", "name"])).toHaveLength(1);
    expect(fieldErrors(errors, ["brand", "cta_href"])).toHaveLength(1);
    expect(fieldErrors(errors, ["brand", "na"])).toHaveLength(0);
  });

  it("stale after the snapshot's window", () => {
    const s = { generated_at: "2026-10-01T00:00:00Z", stale_after_hours: 24 } as never;
    expect(isStale(s, Date.parse("2026-10-01T12:00:00Z"))).toBe(false);
    expect(isStale(s, Date.parse("2026-10-03T00:00:00Z"))).toBe(true);
  });
});
