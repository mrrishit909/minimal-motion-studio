import json
import re
from pathlib import Path

from harness.intake import decide
from harness.issueform import sections

SAMPLE = json.loads((Path(__file__).resolve().parents[2] / "fixtures" / "requests" / "sample.json").read_text())
SPEC = SAMPLE["spec"]


def body_for(spec_text: str) -> str:
    return f"### Brief (JSON)\n\n```json\n{spec_text}\n```\n"


BODY = body_for(json.dumps(SPEC, indent=2))


def event(action="opened", author="mrrishit909", sender=None, body=BODY, labels=("type:run",), label=None):
    ev = {
        "action": action,
        "repository": {"owner": {"login": "mrrishit909"}},
        "sender": {"login": sender or author},
        "issue": {"number": 7, "state": "open", "user": {"login": author}, "body": body,
                  "labels": [{"name": n} for n in labels]},
    }
    if label:
        ev["label"] = {"name": label}
    return ev


def test_sections_handles_no_response():
    assert sections("### A\n\n_No response_\n") == {"A": None}


def test_owner_request_dispatches_exact_params():
    d = decide(event())
    assert d["action"] == "dispatch"
    assert d["params"] == {"spec": SPEC, "origin": "studio"}


def test_issue_cannot_claim_ai_origin():
    smuggled = BODY + "\n### Origin\n\nai-candidate\n"
    d = decide(event(body=smuggled))
    assert d["action"] == "dispatch" and d["params"]["origin"] == "studio"


def test_non_owner_blocked_regardless_of_labels():
    assert decide(event(author="someone", labels=("type:run", "job:approved")))["action"] == "blocked"


def test_approval_only_from_owner():
    assert decide(event(action="labeled", author="x", sender="x", label="job:approved"))["action"] == "blocked"
    assert decide(event(action="labeled", author="x", sender="mrrishit909", label="job:approved"))["action"] == "dispatch"


def test_payload_strings_stay_data_and_are_never_echoed():
    hostile = {**SPEC, "brand": {**SPEC["brand"], "name": "x; rm -rf / $(id)"}}
    d = decide(event(body=body_for(json.dumps(hostile))))
    assert d["action"] == "dispatch" and d["params"]["spec"]["brand"]["name"] == "x; rm -rf / $(id)"
    bad = {**SPEC, "brand": {**SPEC["brand"], "cta_href": "javascript:alert(1)"}}
    d = decide(event(body=body_for(json.dumps(bad))))
    assert d["action"] == "invalid" and all("javascript" not in e for e in d["errors"])


def test_malformed_json_and_constants_are_invalid():
    assert decide(event(body=body_for("{not json")))["action"] == "invalid"
    assert decide(event(body=body_for("[1, 2]")))["action"] == "invalid"
    nan = re.sub(r'"base_px": \d+', '"base_px": NaN', json.dumps(SPEC), count=1)
    assert "NaN" in nan
    assert decide(event(body=body_for(nan)))["action"] == "invalid"


def test_extra_keys_rejected_by_schema():
    d = decide(event(body=body_for(json.dumps({**SPEC, "script": "<script>"}))))
    assert d["action"] == "invalid"


def test_ignores_issues_without_run_label():
    assert decide(event(labels=()))["action"] == "ignore"
