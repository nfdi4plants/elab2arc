#!/usr/bin/env python3
"""Post-conversion validation for the e2e-conversion CI workflow.

1. Confirms the expected ISA files actually landed in the new commit on
   elab/elab2arc_test - the app's own success toast only proves the UI
   *thinks* it finished, not that the right files are actually in the repo.
2. Runs isatools' isajson.validate() against the ISA-JSON the app itself
   exported during the test run (output/isa.json), the same validation
   contract this project's own CLAUDE.md documents for isa-api.

Exits non-zero (failing the CI job) on any check failure.
"""
import json
import os
import sys
import urllib.request

GITLAB_API = "https://git.nfdi4plants.org/api/v4"


def gitlab_get(path, token):
    req = urllib.request.Request(f"{GITLAB_API}{path}", headers={"PRIVATE-TOKEN": token})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def check_pushed_files(project_id, token, commit_sha):
    tree = gitlab_get(
        f"/projects/{project_id}/repository/tree"
        f"?recursive=true&ref={commit_sha}&per_page=100",
        token,
    )
    paths = {item["path"] for item in tree}
    if "isa.investigation.xlsx" not in paths:
        sys.exit(f"FAIL: isa.investigation.xlsx missing from commit {commit_sha}")
    if not any(p.startswith("assays/") and p.endswith("isa.assay.xlsx") for p in paths):
        sys.exit(f"FAIL: no assays/.../isa.assay.xlsx found in commit {commit_sha}")
    print(f"OK: commit {commit_sha} contains isa.investigation.xlsx and an assay xlsx")


def validate_isa_json(isa_json_path):
    from isatools import isajson

    with open(isa_json_path) as fp:
        report = isajson.validate(fp)
    errors = report.get("errors", [])
    warnings = report.get("warnings", [])
    print(f"isatools validation: {len(errors)} errors, {len(warnings)} warnings")
    for w in warnings:
        print(f"  WARNING: {w}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit("FAIL: ISA-JSON validation reported errors")


if __name__ == "__main__":
    token = os.environ["E2E_DATAHUB_TOKEN"]
    project_id = os.environ["E2E_DATAHUB_PROJECT_ID"]
    commit_sha = os.environ["NEW_COMMIT_SHA"]
    isa_json_path = os.environ.get("ISA_JSON_PATH", "output/isa.json")

    check_pushed_files(project_id, token, commit_sha)
    validate_isa_json(isa_json_path)
    print("All post-conversion checks passed.")
