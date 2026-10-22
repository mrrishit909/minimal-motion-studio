# Security

## Trust boundaries

| Input | Trust | Handling |
|---|---|---|
| Brief typed or imported in the studio | untrusted | validated with Ajv against `schemas/request.schema.json#/$defs/spec`; imports above 64 KB or failing the schema are refused without changing anything; every string is escaped as text by `compose()`; no brief string reaches CSS or JavaScript |
| The composed page in the preview | untrusted | rendered only in an `<iframe sandbox="allow-scripts">` without `allow-same-origin`: an opaque origin that cannot read the studio's DOM, storage or cookies, open popups or navigate the top window; the page's own CSP (`default-src 'none'`, hashed inline style and script only) blocks every network request and any script other than the motion script |
| Issue title and body | untrusted | read from the event JSON file by Python; the brief textarea is parsed as JSON data (`harness/issueform.py`, NaN and Infinity refused) and validated against the request schema; error messages name the path and rule, never quote the input; never interpolated into shell |
| Workflow dispatch inputs | untrusted | passed through `env:` only; re-validated by the admit step |
| Labels | untrusted | authorization never depends on labels; it checks `issue.user.login` / `sender.login` against the repository owner |
| Issue requests' provenance | constant | issue requests always carry `origin: "studio"` (a project constant); only owner-dispatched workflows can submit `ai-candidate` |
| Repository code on `main` | trusted after review | the only code executed by workflows |
| AI proposal (owner-only workflow) | untrusted | treated as data from an untrusted source; see below |
| Grader output | untrusted | schema-validated; adds subjective scores only; cannot change hard-gate results |
| Memory proposals | untrusted until accepted | schema + guard (no security, cost, threshold, publication or requirement subjects); accepted only by the owner's `memory:accept` label |

## Owner-only AI generation (`generate.yml`)

- **Who can start it:** `workflow_dispatch` only, which requires write access to the repository.
  Nothing on the public site or in public issues can start it, and the site never offers it.
- **What the model may produce:** a brand brief as JSON (structured output against the spec schema).
  It is never asked for, and never allowed to return, HTML, CSS, JavaScript or files.
- **Model tools:** none (`--tools ""`). The current brief and the owner's words travel inside the
  prompt as data, so a hostile brief from an earlier run cannot make the model read files or
  environment variables. Budget cap `--max-budget-usd 0.50`; job timeout 10 minutes; the pinned
  CLI is `@anthropic-ai/claude-code@2.1.292`, whose `--tools`, `--bare`, `--json-schema` and
  `--max-budget-usd` flags were checked in its `--help`.
- **Verification without secrets:** a separate job with `contents: read` only and no secrets runs
  `verify-candidate`: 64 KB limit, strict schema, rejection of credential-like strings anywhere in the
  candidate, then compose and an independent build. Only a verified request is handed to the ordinary
  run (`run.yml`), which builds the package again, reviews it in the browser and publishes it with
  `origin: "ai-candidate"` and the candidate's sha256. The secret-bearing job never runs repository
  or generated code; the jobs that run code never hold the secret.
- **Fixtures, not AI output:** CI proves the verifier with committed, hand-written fixtures
  (`fixtures/ai/`): the clean one must pass and the hostile ones must be rejected.
- **Without a credential:** the proposal job records "AI generation skipped: no inference secret" in
  its summary and every later job is skipped. As of this release no inference secret is configured,
  so the AI path has been verified only up to the skip and through the fixture verifier; no
  AI-proposed generation has run.

## Workflow rules

- Top-level `permissions: {}`; each job requests only what it needs:
  intake `issues: write, actions: write`; compute `contents: read`; publish and admit
  `contents: write, issues: write`; AI propose and verify `contents: read`; AI dispatch
  `contents: read, actions: write`; Pages deploy `pages: write, id-token: write`.
- Compute (which runs project code over requests, including Playwright) has no write token and no secrets.
- No `pull_request_target`. Pull requests run CI with read-only permissions and no secrets.
- Third-party actions are pinned to full commit SHAs (tag noted in a comment).
- Dependencies install from lockfiles (`uv.lock` with `uv sync --frozen`, `package-lock.json`
  with `npm ci`). The exported package has no dependencies at all.
- Every job has `timeout-minutes`; state writers serialize through `state-writer`.

## Credentials

- No credential is stored in this repository or shipped to the browser. CI and the Outcome
  Verification Loop run `scripts/secret_scan.py` over tracked files and the live site's HTML,
  JS and CSS.
- Secret-bearing jobs: the optional grader in `outcome.yml` (Read and Glob over screenshots and the
  rubric) and the proposal job in `generate.yml` (no tools). Both are skipped without the secret.
- Visitors are never asked for tokens. The site has no write path; durable requests go through
  GitHub Issues, which require a GitHub sign-in, and only the owner's requests run unattended.

## Publication

- Only allow-listed result files of completed runs are copied into the Pages snapshot
  (`project_hooks.PUBLIC_FILES`): the brief, tokens, adjustments, the built page, the source package,
  the review, the summary and a short report. Screenshots stay in temporary Actions artifacts.
- The example brands are fictional and labelled as such. Generated pages use system fonts and
  original SVG; no third-party asset is published.
- Run records name the GitHub account that requested the run (a public login).

## Reporting

Open an issue without sensitive details, or use GitHub's private vulnerability reporting.
