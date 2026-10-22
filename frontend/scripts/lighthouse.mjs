// Runs the pinned Lighthouse CLI (devDependency) against a URL with Playwright's Chromium and writes the
// {passed, failed} summary the Outcome Verification Loop reads. Thresholds are fixed here and recorded.
// Gating runs use Lighthouse's default method (simulated throttling; mobile profile, and the desktop
// preset). Single runs vary, so each form factor runs three times and the gate reads the median, as
// Lighthouse's variability guidance recommends; every individual value is kept in the summary. One phone
// run with applied (devtools) throttling is recorded as information only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const bin = join("node_modules", ".bin", "lighthouse");
const RUNS = 3;
const CATEGORIES = { accessibility: 0.95, "best-practices": 0.9, seo: 0.9, performance: 0.9 };
const METRIC_LIMITS = { "largest-contentful-paint": 2500, "cumulative-layout-shift": 0.1 };

function lighthouse(form, out) {
  const args = [url, `--chrome-path=${chromium.executablePath()}`, "--chrome-flags=--headless=new --no-sandbox", "--output=json",
    `--output-path=${out}`, "--only-categories=performance,accessibility,best-practices,seo", "--quiet"];
  if (form === "desktop") args.push("--preset=desktop");
  if (form === "mobile-applied") args.push("--throttling-method=devtools");
  execFileSync(bin, args, { stdio: "inherit", timeout: 240_000 });
  return JSON.parse(readFileSync(out, "utf8"));
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const checks = [];
const info = [];
for (const form of ["mobile", "desktop"]) {
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    try {
      runs.push(lighthouse(form, join(outDir, `${form}-${i}.json`)));
    } catch (err) {
      checks.push({ title: `${form} run ${i}`, value: null, status: "failed", error: String(err).slice(0, 300) });
    }
  }
  for (const [cat, min] of Object.entries(CATEGORIES)) {
    const values = runs.map((r) => r.categories[cat]?.score ?? null);
    const value = median(values);
    checks.push({ title: `${form} ${cat} >= ${min} (median of ${runs.length})`, value, runs: values, status: value !== null && value >= min ? "passed" : "failed" });
  }
  for (const [id, max] of Object.entries(METRIC_LIMITS)) {
    const values = runs.map((r) => r.audits[id]?.numericValue ?? null);
    const value = median(values);
    checks.push({ title: `${form} ${id} <= ${max} (median of ${runs.length})`, value, runs: values, status: value !== null && value <= max ? "passed" : "failed" });
  }
}
try {
  const lhr = lighthouse("mobile-applied", join(outDir, "mobile-applied.json"));
  info.push({ title: "mobile (applied throttling) performance", value: lhr.categories.performance?.score ?? null });
  info.push({ title: "mobile (applied throttling) largest-contentful-paint", value: lhr.audits["largest-contentful-paint"]?.numericValue ?? null });
} catch (err) {
  info.push({ title: "mobile (applied throttling) run", value: null, error: String(err).slice(0, 300) });
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
for (const c of checks) console.log(`${c.status.padEnd(6)} ${c.title}: ${c.value}${c.runs ? ` [${c.runs.join(", ")}]` : ""}`);
for (const i of info) console.log(`info   ${i.title}: ${i.value}`);
