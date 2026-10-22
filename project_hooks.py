"""Minimal Motion Studio hooks for the generic harness (compute, feasibility, validation, headline, memory).

The engine is TypeScript run by Node (frontend/src/engine/cli.ts); the harness stays Python.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from collections import Counter
from datetime import date, timedelta
from functools import cache
from pathlib import Path
from typing import Any

from harness.core import ROOT, config
from harness.state import read_json
from jsonschema import Draft202012Validator

FRONTEND = ROOT / "frontend"
PUBLIC_FILES = ["manifest.json", "spec.json", "tokens.json", "adjustments.json", "site.html", "package.zip",
                "review.json", "summary.json", "report.md"]


def compute(params: dict[str, Any], out_dir: Path) -> None:
    """Compose, build independently and review one site (called on the read-only compute job).
    Screenshots go to MMS_SCREENS_DIR (a temporary artifact), never into the published results."""
    out_dir = out_dir.resolve()
    screens = Path(os.environ.get("MMS_SCREENS_DIR") or out_dir.parent / f"{out_dir.name}-screens").resolve()
    with tempfile.TemporaryDirectory() as tmp:
        request = Path(tmp) / "request.json"
        request.write_text(json.dumps(params))
        subprocess.run(["node", "src/engine/cli.ts", "run", "--request", str(request), "--out", str(out_dir),
                        "--screens", str(screens)], cwd=FRONTEND, check=True, timeout=900)


def request_problems(params: dict[str, Any]) -> list[str]:
    """The schema validates the brief; this checks the provenance fields agree with each other."""
    ai = params.get("origin") == "ai-candidate"
    if ai and not params.get("candidate_sha256"):
        return ["an ai-candidate request must carry the verified candidate's sha256"]
    if not ai and "candidate_sha256" in params:
        return ["candidate_sha256 is only allowed on ai-candidate requests"]
    return []


@cache
def _outputs_validator(name: str) -> Draft202012Validator:
    schema = json.loads((ROOT / "schemas" / "outputs.schema.json").read_text())
    return Draft202012Validator({**schema, "$ref": f"#/$defs/{name}"})


def validate_outputs(out_dir: Path) -> list[str]:
    problems = [f"{name} missing" for name in PUBLIC_FILES if not (out_dir / name).is_file()]
    if problems:
        return problems
    for name in ("manifest", "summary", "review"):
        doc = json.loads((out_dir / f"{name}.json").read_text())
        problems += [f"{name}.json: {e.message[:160]}" for e in _outputs_validator(name).iter_errors(doc)]
    html = (out_dir / "site.html").read_text()
    if "Content-Security-Policy" not in html or html.count("<script") != 1:
        problems.append("site.html must carry its CSP and exactly one (hashed) script")
    if not (out_dir / "package.zip").read_bytes().startswith(b"PK\x03\x04"):
        problems.append("package.zip is not a zip archive")
    summary = json.loads((out_dir / "summary.json").read_text())
    for entry in summary.get("files", []):
        path = out_dir / entry["name"]
        if path.is_file() and "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            problems.append(f"summary.json lists a different sha256 for {entry['name']}")
    return problems


def headline(out_dir: Path) -> str | None:
    return json.loads((out_dir / "summary.json").read_text())["headline"]


def on_publish(root: Path, record: dict[str, Any], out_dir: Path) -> list[str]:
    return []


def memory_candidates(root: Path) -> list[dict[str, Any]]:
    """Lessons backed by at least three completed runs: colour roles the engine keeps having to adjust,
    and accessibility rules generated sites keep failing."""
    cfg = config()
    index = read_json(root, "index.json", {"runs": []})
    tallies: dict[str, Counter[str]] = {"role": Counter(), "axe": Counter()}
    support: dict[tuple[str, str], list[str]] = {}
    for entry in index["runs"]:
        if entry["status"] != "completed":
            continue
        rid = entry["run_id"]
        adjustments = read_json(root, f"runs/{rid}/adjustments.json")
        review = read_json(root, f"runs/{rid}/review.json")
        if adjustments is None or review is None:
            continue
        roles = {a["role"] for a in (adjustments if isinstance(adjustments, list) else adjustments["adjustments"])}
        rules = {v["id"] for width in review["widths"] for v in width["axe_violations"]}
        for kind, keys in (("role", roles), ("axe", rules)):
            for key in sorted(keys):
                tallies[kind][key] += 1
                support.setdefault((kind, key), []).append(rid)
    base = f"https://github.com/{cfg['owner']}/{cfg['repo']}/blob/{cfg['state_branch']}"
    expires = (date.today() + timedelta(days=90)).isoformat()
    out = []
    for kind, counter in tallies.items():
        for key, count in sorted(counter.items()):
            if count < 3:
                continue
            runs = sorted(set(support[(kind, key)]))[:20]
            if kind == "role":
                topic, file = f"Colour role {key} is often adjusted", "adjustments.json"
                finding = (f"The engine changed the {key} colour to meet a contrast minimum in {count} completed "
                           "runs; seeds for this role are often too close to their background.")
            else:
                topic, file = f"Generated sites fail axe rule {key}", "review.json"
                finding = f"The axe rule {key} reported violations on generated sites in {count} completed runs."
            out.append({
                "topic": topic,
                "finding": finding,
                "supporting_run_ids": runs,
                "evidence_links": [f"{base}/runs/{r}/{file}" for r in runs[:5]],
                "scope": "data-quality",
                "confidence": "medium" if count >= 6 else "low",
                "revalidate_when": "after a palette derivation, template or engine change",
                "expires_on": expires,
            })
    return out
