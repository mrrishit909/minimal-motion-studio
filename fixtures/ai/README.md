# AI candidate fixtures

These files are hand-written test fixtures, not AI output. They stand in for what the owner-only AI
step might propose, so `node src/engine/cli.ts verify-candidate` can be tested without any model.

- `clean-candidate.json`: a valid brief for a fictional business. It must be accepted.
- `hostile-candidate.json`: must be rejected. It carries an extra key, a `javascript:` link, a control
  character, an oversized summary, a markup payload and an invalid colour.
- `hostile-secret-candidate.json`: a brief that passes the schema but contains strings shaped like
  credentials. It must be rejected by the secret check. The values are obviously fake and are kept
  short enough that `scripts/secret_scan.py` does not flag them.
