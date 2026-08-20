# ISA-JSON Validation Summary

Cross-file comparison of the three validation reports in this directory, generated with
`isa_validate_lib.py` / `validate_genomics.py` / `validate_review_test.py` /
`validate_elabftw_demo_test.py` against `isatools.isajson.validate(fp, log_level=None)`.

All three files are **structurally valid ISA-JSON — 0 errors** in every case. The differences
below are all warnings, and they track one thing precisely: **how much of each ARC's content is
actually a sequencing-pipeline step**, not any remaining code defect.

## Results

| File | Assays | Errors | Warnings | `[4004]` (process-sequence-vs-config) |
|------|--------|--------|----------|----------------------------------------|
| `Genomics_elab2ARC_isa.json` | 5 | 0 | 4 | **1** |
| `review_test_isa.json` | 9 | 0 | 6 | **5** |
| `elabftw_demo_test_isa.json` | 15 | 0 | 9 | **8** |

## Why the counts scale this way

elab2arc currently defaults **every** assay's `measurementType`/`technologyType` to "metagenome
sequencing" / "nucleotide sequencing" (`isa-enrichment-20260504.js`), regardless of what the
underlying eLabFTW protocol actually is. That pulls in ISA-API's default config for that specific
technique, which expects a protocol sequence of `nucleic acid extraction → library construction →
nucleic acid sequencing → sequence analysis data transformation`. An assay only avoids a `[4004]`
warning if its protocol type matches one of those four exact labels (or has no processes at all,
in which case the check never runs for it).

So `[4004]` count is really a measure of **assay-content homogeneity relative to that one
sequencing config** — and the three files sit at three different points on that spectrum:

- **`Genomics_elab2ARC_isa.json` — most curated, least warnings (1/5 assays).** This ARC was
  built around one coherent metagenome-sequencing workflow: Bacterial Cultivation → DNA Extraction
  → Library Preparation → Sequencing Run → Bioinformatic Analysis. 3 of its 5 assays now match the
  config's protocol-type vocabulary exactly (extraction, library construction, sequencing); the
  Bioinformatic Analysis assay has no LLM-extracted process rows so the check never runs for it;
  only Bacterial Cultivation (`material processing`) is a genuine, expected mismatch — it's a
  cultivation/growth step, not one of the four sequencing-pipeline stages, and there is no correct
  label for it in this config (see below).

- **`review_test_isa.json` — mixed, middling warnings (5/9 assays).** Contains the same Genomics
  pipeline (2 of its assays correctly match) plus several unrelated demo experiments folded in —
  an example experiment, aspirin synthesis, a transfection protocol — none of which are sequencing
  steps. Every one of those non-sequencing assays contributes exactly one `[4004]` warning now.

- **`elabftw_demo_test_isa.json` — broadest and most heterogeneous, most warnings (8/15 assays,
  0 matching).** This is effectively the full random spread of the demo eLabFTW instance —
  antibody protocols (Anti-CD4, Anti-GAPDH), cell-line work (HEK293T, NIH3T3), an enzyme-kinetics
  experiment, generic test protocols. None of them are DNA extraction, library prep, or
  sequencing, so **zero** assays match the forced sequencing config — every assay with any process
  content warns once.

## What's *not* the cause anymore

Earlier revisions of these files showed far higher counts (8 / 20 / 17) because unlinked
`processSequence` rows caused ISA-API to re-run its check once **per row** instead of once per
assay (Fix #27, `isa-enrichment-20260504.js`) — a single genuine mismatch could show up 3-5x over.
That's now fixed uniformly across all three files: every assay's process rows are correctly
chained via `previousProcess`/`nextProcess`, confirmed 1:1 (mismatching-assay-count now equals
`[4004]`-warning-count in every file above). The counts remaining today are not a linking artifact
— they are one warning per assay whose real content genuinely isn't a sequencing step, which is
expected and, for a forced-default measurement type with no generic fallback in ISA-API's config
set, currently unfixable without either (a) not defaulting non-sequencing assays into a sequencing
config at all, which risks a harder validation **error** instead of a warning (see prior
discussion — no generic/catch-all config exists in ISA-API's default set), or (b) manually
curating each assay's true measurement/technology type per experiment.

## Bottom line

Lower `[4004]` counts correlate directly with how purpose-built an ARC is for the one workflow
elab2arc's default config assumes (sequencing). `Genomics_elab2ARC_isa.json` is the cleanest
because it *is* that workflow. `elabftw_demo_test_isa.json` is the noisiest because it's
deliberately the opposite — a stress test pulling in whatever the demo instance happens to
contain. None of the three fail validation; the warning counts are a content-diversity signal,
not a code-correctness one.
