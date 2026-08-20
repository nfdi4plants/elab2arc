# ISA-JSON Validation Report

**File:** `elabftw_demo_test_isa.json`
**Size:** 57.5 KB
**Date:** Generated on demand
**Validator:** ISA-API (isatools.isajson.validate)

---

## Validation Result

| Metric | Value |
|--------|-------|
| Status | **PASSED** |
| Errors | 0 |
| Warnings | 9 |

### Warnings by Code

**Code 1020** (1 warnings)

- Protocol parameter declared in a protocol but never used: protocol declared ['#parameter/Array_Design_REF'] are not used

**Code 4004** (8 warnings)

- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- ... and 5 more

---

## Structural Analysis

| Property | Value |
|----------|-------|
| Studies | 1 |
| Ontology Sources | 1 |
| People | 1 |
| Publications | 0 |

### Study 1: `elabftw_demo_test`

| Property | Value |
|----------|-------|
| Assays | 15 |
| Protocols | 8 |
| Study-level processes | 0 |
| Assay-level processes | 17 |
| Total processes | 17 |
| Processes using `_default` | 0 |
| Sources | 2 |
| Samples | 3 |
| Other Materials | 0 |
| All assays have `dataFiles` | Yes |
| All assays have `unitCategories` | Yes |
| All assays have `filename` | Yes |

---

## Protocol Breakdown

### Study 1: `elabftw_demo_test`

| Protocol @id | Name | Parameters |
|--------------|------|------------|
| `#Protocol_protocols/eLabFTW_protocol_2_An_example_experiment.elab2arc.md` | eLabFTW protocol 2 An example experiment.elab2arc.md | 3 |
| `#Protocol_protocols/eLabFTW_protocol_59_Anti-CD4.elab2arc.md` | eLabFTW protocol 59 Anti-CD4.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_61_Anti-GAPDH.elab2arc.md` | eLabFTW protocol 61 Anti-GAPDH.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_7_Effect_of_temperature_on_enzym.elab2arc.md` | eLabFTW protocol 7 Effect of temperature on enzym.elab2arc.md | 1 |
| `#Protocol_protocols/eLabFTW_protocol_44_HEK293T.elab2arc.md` | eLabFTW protocol 44 HEK293T.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_25_NIH3T3.elab2arc.md` | eLabFTW protocol 25 NIH3T3.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_1_Test_the_grouped_extra_fields.elab2arc.md` | eLabFTW protocol 1 Test the grouped extra fields.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_8_Testing_relationship_between_a.elab2arc.md` | eLabFTW protocol 8 Testing relationship between a.elab2arc.md | 0 |

---

## Assay Breakdown

### Study 1: `elabftw_demo_test`

| Assay @id | Filename | Processes | `executesProtocol` |
|-----------|----------|-----------|--------------------|
| `assays/An_example_experiment/` | assays/An_example_experiment/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_2_An_example_experiment.elab2arc.md |
| `assays/Anti-CD4/` | assays/Anti-CD4/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_59_Anti-CD4.elab2arc.md |
| `assays/Anti-GAPDH/` | assays/Anti-GAPDH/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_61_Anti-GAPDH.elab2arc.md |
| `assays/Anti-Ki-67/` | assays/Anti-Ki-67/isa.assay.xlsx | 0 |  |
| `assays/Anti-Myc/` | assays/Anti-Myc/isa.assay.xlsx | 0 |  |
| `assays/Anti-Phospho-ERK1_2__Thr202_Tyr204_/` | assays/Anti-Phospho-ERK1_2__Thr202_Tyr204_/isa.assay.xlsx | 0 |  |
| `assays/Effect_of_temperature_on_enzyme_activity/` | assays/Effect_of_temperature_on_enzyme_activity/isa.assay.xlsx | 3 | #Protocol_protocols/eLabFTW_protocol_7_Effect_of_temperature_on_enzym.elab2arc.md |
| `assays/HEK293T/` | assays/HEK293T/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_44_HEK293T.elab2arc.md |
| `assays/NIH_3T3/` | assays/NIH_3T3/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_25_NIH3T3.elab2arc.md |
| `assays/Scanning_Electron_Microscope/` | assays/Scanning_Electron_Microscope/isa.assay.xlsx | 0 |  |
| `assays/TIRF_microscope/` | assays/TIRF_microscope/isa.assay.xlsx | 0 |  |
| `assays/Test_the_grouped_extra_fields/` | assays/Test_the_grouped_extra_fields/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_1_Test_the_grouped_extra_fields.elab2arc.md |
| `assays/Testing_relationship_between_acceleration_and_gravity/` | assays/Testing_relationship_between_acceleration_and_gravity/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_8_Testing_relationship_between_a.elab2arc.md |
| `assays/Water_sample_collection/` | assays/Water_sample_collection/isa.assay.xlsx | 0 |  |
| `assays/pBR322/` | assays/pBR322/isa.assay.xlsx | 0 |  |
