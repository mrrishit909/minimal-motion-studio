import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Writes evidence/e2e/summary.json, the file the Outcome Verification Loop's browser gate reads.
 * Counts each test's final outcome across retries: "unexpected" is a failure; "expected" (including a
 * declared expected failure) and "flaky" (passed on retry) are passes; "skipped" is neither.
 */
export default class SummaryReporter implements Reporter {
  private tests = new Map<string, { test: TestCase; project: string; status: string; duration: number }>();

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? "unknown";
    this.tests.set(test.id, { test, project, status: result.status, duration: result.duration });
  }

  onEnd(result: FullResult) {
    const dir = process.env.E2E_EVIDENCE_DIR ?? "../evidence/e2e";
    mkdirSync(dir, { recursive: true });
    const rows = [...this.tests.values()].map(({ test, project, status, duration }) => ({
      title: test.title, project, status, outcome: test.outcome(), expected: test.expectedStatus, duration,
    }));
    const count = (o: string) => rows.filter((r) => r.outcome === o).length;
    const summary = {
      target: process.env.E2E_BASE_URL ?? "local production preview",
      status: result.status,
      passed: count("expected") + count("flaky"),
      failed: count("unexpected"),
      skipped: count("skipped"),
      flaky: count("flaky"),
      tests: rows,
    };
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  }
}
