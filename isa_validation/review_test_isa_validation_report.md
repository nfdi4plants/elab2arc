# ISA-JSON Validation Report

**File:** `review_test_isa.json`
**Size:** 78.4 KB
**Date:** Generated on demand
**Validator:** ISA-API (isatools.isajson.validate)

---

## Validation Result

| Metric | Value |
|--------|-------|
| Status | **PASSED** |
| Errors | 0 |
| Warnings | 6 |

### Warnings by Code

**Code 1020** (1 warnings)

- Protocol parameter declared in a protocol but never used: protocol declared ['#parameter/Array_Design_REF'] are not used

**Code 4004** (5 warnings)

- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []
- ... and 2 more

---

## Structural Analysis

| Property | Value |
|----------|-------|
| Studies | 1 |
| Ontology Sources | 2 |
| People | 1 |
| Publications | 0 |

### Study 1: `review_test`

| Property | Value |
|----------|-------|
| Assays | 9 |
| Protocols | 7 |
| Study-level processes | 0 |
| Assay-level processes | 20 |
| Total processes | 20 |
| Processes using `_default` | 0 |
| Sources | 13 |
| Samples | 15 |
| Other Materials | 0 |
| All assays have `dataFiles` | Yes |
| All assays have `unitCategories` | Yes |
| All assays have `filename` | Yes |

---

## Protocol Breakdown

### Study 1: `review_test`

| Protocol @id | Name | Parameters |
|--------------|------|------------|
| `#Protocol_protocols/eLabFTW_protocol_2_An_example_experiment.elab2arc.md` | eLabFTW protocol 2 An example experiment.elab2arc.md | 3 |
| `#Protocol_protocols/eLabFTW_protocol_40_Experiment_1_Bacterial_Cultiva.elab2arc.md` | eLabFTW protocol 40 Experiment 1 Bacterial Cultiva.elab2arc.md | 11 |
| `#Protocol_protocols/eLabFTW_protocol_41_Experiment_2_DNA_Extraction.elab2arc.md` | eLabFTW protocol 41 Experiment 2 DNA Extraction.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_42_Experiment_3_Library_Preparati.elab2arc.md` | eLabFTW protocol 42 Experiment 3 Library Preparati.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_44_Experiment_5_Bioinformatic_Ana.elab2arc.md` | eLabFTW protocol 44 Experiment 5 Bioinformatic Ana.elab2arc.md | 9 |
| `#Protocol_protocols/eLabFTW_protocol_9_Synthesis_of_Aspirin.elab2arc.md` | eLabFTW protocol 9 Synthesis of Aspirin.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_3_Transfection_of_p10312-22_into.elab2arc.md` | eLabFTW protocol 3 Transfection of p10312-22 into.elab2arc.md | 0 |

---

## Assay Breakdown

### Study 1: `review_test`

| Assay @id | Filename | Processes | `executesProtocol` |
|-----------|----------|-----------|--------------------|
| `assays/20250617-67288e9e29c0e3d251a214fd67479d7e91bdd6fb-Experiment/` | assays/20250617-67288e9e29c0e3d251a214fd67479d7e91bdd6fb-Experiment/isa.assay.xlsx | 0 |  |
| `assays/An_example_experiment/` | assays/An_example_experiment/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_2_An_example_experiment.elab2arc.md |
| `assays/Experiment_1__Bacterial_Cultivation/` | assays/Experiment_1__Bacterial_Cultivation/isa.assay.xlsx | 3 | #Protocol_protocols/eLabFTW_protocol_40_Experiment_1_Bacterial_Cultiva.elab2arc.md |
| `assays/Experiment_2__DNA_Extraction/` | assays/Experiment_2__DNA_Extraction/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_41_Experiment_2_DNA_Extraction.elab2arc.md |
| `assays/Experiment_3__Library_Preparation_-_FFPE_Repair__A-tailing__Adapter_Ligation/` | assays/Experiment_3__Library_Preparation_-_FFPE_Repair__A-tailing__Adapter_Ligation/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_42_Experiment_3_Library_Preparati.elab2arc.md |
| `assays/Experiment_4__Sequencing_Run/` | assays/Experiment_4__Sequencing_Run/isa.assay.xlsx | 0 |  |
| `assays/Experiment_5__Bioinformatic_Analysis/` | assays/Experiment_5__Bioinformatic_Analysis/isa.assay.xlsx | 5 | #Protocol_protocols/eLabFTW_protocol_44_Experiment_5_Bioinformatic_Ana.elab2arc.md |
| `assays/Synthesis_of_Aspirin/` | assays/Synthesis_of_Aspirin/isa.assay.xlsx | 4 | #Protocol_protocols/eLabFTW_protocol_9_Synthesis_of_Aspirin.elab2arc.md |
| `assays/Transfection_of_p103_12-22_into_RPE-1_Actin-RFP/` | assays/Transfection_of_p103_12-22_into_RPE-1_Actin-RFP/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_3_Transfection_of_p10312-22_into.elab2arc.md |
