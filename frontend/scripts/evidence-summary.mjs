// Turns a vitest JSON report into the {passed, failed} summary the Outcome Verification Loop's gates read.
// A missing or unreadable report counts as a failure, never as a pass.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [input, output] = process.argv.slice(2);
let summary;
try {
  const report = JSON.parse(readFileSync(input, "utf8"));
  const tests = report.testResults.flatMap((file) => file.assertionResults.map((t) => ({ file: file.name.split("/frontend/").pop(), title: t.fullName, status: t.status })));
  summary = {
    target: "frontend unit and engine tests (vitest)",
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length + (report.numFailedTestSuites ?? 0),
    skipped: tests.filter((t) => t.status !== "passed" && t.status !== "failed").length,
    tests,
  };
} catch (err) {
  summary = { target: "frontend unit and engine tests (vitest)", passed: 0, failed: 1, error: String(err).slice(0, 300), tests: [] };
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(`${summary.passed} passed, ${summary.failed} failed`);
