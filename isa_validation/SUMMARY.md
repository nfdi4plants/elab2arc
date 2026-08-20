# ISA-JSON Validation Summary

Cross-file comparison of the three validation reports in this directory, generated against
`isatools.isajson.validate(fp, log_level=None)`.

## Results

| File | Assays | Errors | Warnings | `[4004]` (process-sequence-vs-config) |
|------|--------|--------|----------|----------------------------------------|
| `Genomics_elab2ARC_isa.json` | 5 | 0 | 4 | 1 |
| `review_test_isa.json` | 9 | 0 | 6 | 5 |
| `elabftw_demo_test_isa.json` | 15 | 0 | 9 | 8 |

All three files are **structurally valid ISA-JSON — 0 errors** in every case.

## Why the warning counts differ

Every assay's `measurementType`/`technologyType` is assigned by matching its protocols against
ISA-API's registered config list (`isatools/resources/config/json/default/*.json`) — a keyword
match picks a specific technique (e.g. flow cytometry, real-time PCR, mass spectrometry, NMR,
DNA microarray) when the protocol content signals one; otherwise it falls back to nucleic-acid
sequencing, this app's primary domain. Each registered config also specifies the exact protocol
sequence expected for that technique (e.g. sequencing expects `nucleic acid extraction → library
construction → nucleic acid sequencing → sequence analysis data transformation`). An assay
triggers `[4004]` only when its own protocol type doesn't match any step in its assigned config's
expected sequence.

`[4004]` count is therefore a direct measure of **how much of an ARC's content is a technique
ISA-API's default config set actually covers**, not a code defect:

- **`Genomics_elab2ARC_isa.json` (1/5 assays).** A coherent metagenome-sequencing workflow:
  Bacterial Cultivation → DNA Extraction → Library Preparation → Sequencing Run → Bioinformatic
  Analysis. Three assays match the sequencing config's protocol-type vocabulary exactly
  (extraction, library construction, sequencing); the Bioinformatic Analysis assay has no process
  rows to check. Only Bacterial Cultivation (a cultivation/growth step, not one of the four
  sequencing-pipeline stages) has no matching step in any registered config.

- **`review_test_isa.json` (5/9 assays).** Contains the same sequencing pipeline (2 assays match)
  plus several unrelated demo experiments — an example experiment, aspirin synthesis, a
  transfection protocol — none of which are covered by any registered ISA-API config.

- **`elabftw_demo_test_isa.json` (8/15 assays, 0 matching).** The broadest, most heterogeneous
  set: antibody staining (Anti-CD4, Anti-GAPDH, Anti-Ki-67, Anti-Myc, Anti-Phospho-ERK), electron
  and TIRF microscopy, cell-line work (HEK293T, NIH3T3), enzyme kinetics, and a physics experiment.
  None of ISA-API's ~15 registered config types cover these techniques, so every assay with
  process content triggers exactly one `[4004]` warning.

Each assay's `processSequence` is correctly chained (`previousProcess`/`nextProcess`), so the
check runs exactly once per assay — the counts above are one warning per genuinely-uncovered
assay, not inflated by row count.

## Other warnings

- `[1017]` (Genomics only) — 3 dataset files referenced in comments but not wired into any
  process input/output.
- `[1020]` (all three) — a leftover `#parameter/Array_Design_REF` protocol parameter declared but
  never used.
- `[3007]` (Genomics only) — the `NCBI` ontology source is declared but ISA-API's own usage check
  doesn't look inside `processSequence` inputs, where it's actually used.

None of these are blocking; all three files pass validation with 0 errors.

## Why the remaining `[4004]` warnings are left as-is

Two ways exist to clear them, and neither is worth taking:

1. **Author a custom ISA-API config directory** with new `(measurementType, technologyType)`
   entries that genuinely describe this content (e.g. "immunostaining" / "fluorescence
   microscopy"), each with an accurate expected protocol sequence, and validate with
   `config_dir=` pointing at it instead of ISA-API's shipped default. This is the only way to
   *actually* remove the warnings without misrepresenting the data — but it only holds for
   whoever validates with that same custom config. A reviewer, journal, or any downstream tool
   that runs plain `isatools.isajson.validate()` checks against the *official* default config set
   regardless, and would see the identical mismatches again. It narrows who sees a clean result
   without changing what the wider ecosystem actually checks against.
2. **Force a match against the default config anyway** — e.g. relabel an antibody-staining
   protocol as `nucleic acid extraction` just to satisfy the sequence check. This is worse than
   the warning itself: it's incorrect data, not a fix.

Neither is worth the tradeoff. These `[4004]` warnings are true positives — the assay genuinely
isn't one of ISA-API's ~15 registered measurement techniques — and a warning is the correct,
honest signal for that. Suppressing it would mean the metadata claims something about the assay
that isn't true. The right response is what elab2arc already does: pick the best real match when
one exists (Fix #28), and leave a warning when none does, rather than inventing one.

## Bottom line

Warning counts track content coverage against ISA-API's fixed, narrow set of registered
measurement techniques, not conversion correctness. `Genomics_elab2ARC_isa.json` is cleanest
because its content is itself a sequencing workflow. `elabftw_demo_test_isa.json` is noisiest
because it deliberately spans techniques ISA-API's default config set doesn't include at all —
there is no registered type to assign those assays that would clear the warning without either
mislabeling them (semantically wrong) or picking something unregistered (which fails validation
outright with a hard error, worse than a warning). This is treated as expected, correct behavior,
not an open issue.
