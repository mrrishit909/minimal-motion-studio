// Runs the pinned Lighthouse CLI (devDependency) against a URL with Playwright's Chromium and writes the
// {passed, failed} summary the Outcome Verification Loop reads. Thresholds are fixed here and recorded.
// Gating runs use Lighthouse's default method: simulated throttling with the mobile profile, and the
// desktop preset. A phone run with applied (devtools) throttling is recorded as information only: on a
// CI runner it adds the runner's real network path to the throttled one, so it varies run to run.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const bin = join("node_modules", ".bin", "lighthouse");
const THRESHOLDS = {
  mobile: { accessibility: 0.95, "best-practices": 0.9, seo: 0.9, performance: 0.9 },
  desktop: { accessibility: 0.95, "best-practices": 0.9, seo: 0.9, performance: 0.9 },
};
const METRIC_LIMITS = { "largest-contentful-paint": 2500, "cumulative-layout-shift": 0.1 };
const checks = [];
const info = [];
for (const form of ["mobile", "desktop", "mobile-applied"]) {
  const out = join(outDir, `${form}.json`);
  const args = [url, `--chrome-path=${chromium.executablePath()}`, "--chrome-flags=--headless=new --no-sandbox", "--output=json",
    `--output-path=${out}`, "--only-categories=performance,accessibility,best-practices,seo", "--quiet"];
  if (form === "desktop") args.push("--preset=desktop");
  if (form === "mobile-applied") {
    args.push("--throttling-method=devtools");
    try {
      execFileSync(bin, args, { stdio: "inherit", timeout: 240_000 });
      const lhr = JSON.parse(readFileSync(out, "utf8"));
      info.push({ title: "mobile (applied throttling) performance", value: lhr.categories.performance?.score ?? null });
      info.push({ title: "mobile (applied throttling) largest-contentful-paint", value: lhr.audits["largest-contentful-paint"]?.numericValue ?? null });
    } catch (err) {
      info.push({ title: "mobile (applied throttling) run", value: null, error: String(err).slice(0, 300) });
    }
    continue;
  }
  try {
    execFileSync(bin, args, { stdio: "inherit", timeout: 240_000 });
    const lhr = JSON.parse(readFileSync(out, "utf8"));
    for (const [cat, min] of Object.entries(THRESHOLDS[form])) {
      const score = lhr.categories[cat]?.score ?? null;
      checks.push({ title: `${form} ${cat} >= ${min}`, value: score, status: score !== null && score >= min ? "passed" : "failed" });
    }
    for (const [id, max] of Object.entries(METRIC_LIMITS)) {
      const value = lhr.audits[id]?.numericValue ?? null;
      checks.push({ title: `${form} ${id} <= ${max}`, value, status: value !== null && value <= max ? "passed" : "failed" });
    }
  } catch (err) {
    checks.push({ title: `${form} run`, value: null, status: "failed", error: String(err).slice(0, 300) });
  }
}
const summary = {
  target: url,
  tool: "lighthouse CLI 13.5.0 with Playwright Chromium",
  passed: checks.filter((c) => c.status === "passed").length,
  failed: checks.filter((c) => c.status === "failed").length,
  checks,
  info,
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks) console.log(`${c.status.padEnd(6)} ${c.title}: ${c.value}`);
for (const i of info) console.log(`info   ${i.title}: ${i.value}`);
