# ISA-JSON Validation

Scripts and reports for validating elab2arc-generated ISA-JSON against the real ISA-API
(`isatools.isajson.validate`). See `SUMMARY.md` for a cross-file analysis of the current results.

## 1. Export a fresh ISA-JSON from the app

1. In the ARC tab, select a specific ARC folder (the "Select a specific ARC folder" step).
2. Click **📤 Export ISA-JSON** (`#exportIsaJsonBtn`, calls `window.handleExportIsaJson()` in
   `js/elab2arc-core20260504.js`).
3. This runs the export through `arctrl.JsonController.Investigation.toISAJsonString()` (falling
   back to `buildIsaJsonDirectly()` if that serialization fails), then post-processes the result
   through `Elab2ArcEnrich.enrichIsaJson()` (`js/modules/isa-enrichment-20260504.js`) before
   triggering the browser download as `<arcName>_isa.json`.

The downloaded file is the real, current output of the live conversion + enrichment pipeline —
not a simulation — so it's the right thing to validate against when checking whether a code change
actually took effect.

## 2. Validate it

Move/rename the downloaded file into this directory, then either:

- **Overwrite one of the three canonical files** (`Genomics_elab2ARC_isa.json`,
  `review_test_isa.json`, `elabftw_demo_test_isa.json`) and re-run its driver script:
  ```bash
  /Users/xr/git/elab2arc/isa-api/.venv/bin/python3 validate_genomics.py
  /Users/xr/git/elab2arc/isa-api/.venv/bin/python3 validate_review_test.py
  /Users/xr/git/elab2arc/isa-api/.venv/bin/python3 validate_elabftw_demo_test.py
  ```
  Each writes/refreshes its matching `*_validation_report.md`.

- **Validate a new/one-off file directly** using the shared library:
  ```python
  from isa_validate_lib import validate_and_report
  validate_and_report("/path/to/downloaded_isa.json", "/path/to/report.md")
  ```

## Important: always pass `log_level=None`

If validating ad hoc (not through `isa_validate_lib.py`, which already does this correctly), call:

```python
from isatools import isajson
with open(path) as fp:
    report = isajson.validate(fp, log_level=None)
```

**Do not omit `log_level`.** ISA-API's `validate()` decides whether to run its process-sequence
check (Rule 4004) by grepping its own *log text* for the substring `"(E)"` — not by checking the
actual returned `errors` list (`isa-api/isatools/isajson/validate.py:1112-1120`). With the default
log level, logging is active, and some checks (e.g. `check_unit_category_ids_usage`) log an
`(E)`-prefixed message for a condition that never actually gets added to the returned `errors`
list — but its mere presence in the log silently skips Rule 4004 for the *entire* file, with no
indication this happened. `log_level=None` disables logging entirely, so that string never
appears and Rule 4004 always runs. This was already the convention in this repo's earlier
`generate_report.py`/`validate_files_v2.py`, and cost real debugging time in this session when an
ad-hoc check that omitted it silently under-reported warnings — see the commit history / session
notes around `isa-enrichment-20260504.js` Fix #27 for the full story.

## Files in this directory

| File | Purpose |
|------|---------|
| `isa_validate_lib.py` | Shared validation + report-generation logic |
| `validate_genomics.py` / `validate_review_test.py` / `validate_elabftw_demo_test.py` | Thin driver scripts, one per canonical file |
| `Genomics_elab2ARC_isa.json` / `review_test_isa.json` / `elabftw_demo_test_isa.json` | Current canonical exports |
| `*_validation_report.md` | Full validation report per file (errors, warnings, structural/protocol/assay breakdown) |
| `SUMMARY.md` | Cross-file comparison and analysis of why warning counts differ |
