"""Real hooks against real engine output (the fake-hook tests cannot catch contract drift).

Needs Node and Playwright's Chromium. Skipped when they are missing, except where
MMS_REQUIRE_ENGINE=1 (CI's frontend job) turns a missing engine into a failure.
"""

import json
import os
import re
import shutil
from pathlib import Path

import project_hooks
import pytest
from harness.memory import screen

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "fixtures" / "requests" / "sample.json").read_text())


def engine_available() -> bool:
    return shutil.which("node") is not None and (project_hooks.FRONTEND / "node_modules" / "@playwright").is_dir()


@pytest.fixture(scope="module")
def outputs(tmp_path_factory: pytest.TempPathFactory) -> Path:
    if not engine_available():
        if os.environ.get("MMS_REQUIRE_ENGINE") == "1":
            pytest.fail("Node or the frontend dependencies are missing")
        pytest.skip("Node engine not installed")
    out = tmp_path_factory.mktemp("run") / "out"
    project_hooks.compute(SAMPLE, out)
    return out


def test_hooks_on_real_outputs(outputs: Path, tmp_path: Path):
    assert project_hooks.validate_outputs(outputs) == []
    assert sorted(p.name for p in outputs.iterdir()) == sorted(project_hooks.PUBLIC_FILES)
    # The harness copies this into the run record, whose schema requires the sha256: prefix.
    manifest = json.loads((outputs / "manifest.json").read_text())
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", manifest["input_manifest_hash"])
    summary = json.loads((outputs / "summary.json").read_text())
    assert project_hooks.headline(outputs) == summary["headline"] and summary["headline"]

    state = tmp_path / "state"
    runs = []
    for i in range(3):
        rid = f"minimal-motion-studio-2026102{i}T000000Z-abcdef12-a1"
        shutil.copytree(outputs, state / "runs" / rid)
        runs.append({"run_id": rid, "status": "completed", "created_at": f"2026-10-2{i}T00:00:00Z"})
    (state / "index.json").write_text(json.dumps({"runs": runs}))
    for c in project_hooks.memory_candidates(state):
        entry = {**c, "id": "mem-0123456789", "status": "active", "date": "2026-10-21", "supersedes": []}
        assert screen(entry) == [], (c["topic"], screen(entry))


def test_tampered_outputs_are_rejected(outputs: Path, tmp_path: Path):
    copy = tmp_path / "copy"
    shutil.copytree(outputs, copy)
    html = (copy / "site.html").read_text()
    (copy / "site.html").write_text(html.replace("</body>", "<script>alert(1)</script></body>"))
    problems = project_hooks.validate_outputs(copy)
    assert any("script" in p for p in problems) and any("sha256" in p for p in problems)


def test_request_problems_provenance():
    assert project_hooks.request_problems(SAMPLE) == []
    assert project_hooks.request_problems({**SAMPLE, "origin": "ai-candidate"})
    assert project_hooks.request_problems({**SAMPLE, "candidate_sha256": "sha256:" + "0" * 64})
