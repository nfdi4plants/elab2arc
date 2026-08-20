# ISA-JSON Validation Report

**File:** `Genomics_elab2ARC_isa.json`
**Size:** 63.1 KB
**Date:** Generated on demand
**Validator:** ISA-API (isatools.isajson.validate)

---

## Validation Result

| Metric | Value |
|--------|-------|
| Status | **PASSED** |
| Errors | 0 |
| Warnings | 4 |

### Warnings by Code

**Code 1017** (1 warnings)

- Material declared but not used: ['dataset/growth_measurements.csv', 'dataset/2025-07-02_DNAExtractionpicture_45.elab2arc.png', 'dataset/*.fastq'] not used in any inputs/outputs in ['#Source_Sample_1', '#Source_Sample_2', '#Source_Sa...

**Code 1020** (1 warnings)

- Protocol parameter declared in a protocol but never used: protocol declared ['#parameter/Array_Design_REF'] are not used

**Code 3007** (1 warnings)

- Ontology Source Reference != used: Ontology sources not used ['NCBI']

**Code 4004** (1 warnings)

- Process sequence is not valid against configuration: Config protocol sequence ['nucleic acid extraction', 'library construction', 'nucleic acid sequencing', 'sequence analysis data transformation'] does not in assay protocol sequence []

---

## Structural Analysis

| Property | Value |
|----------|-------|
| Studies | 1 |
| Ontology Sources | 2 |
| People | 1 |
| Publications | 0 |

### Study 1: `Genomics_elab2ARC`

| Property | Value |
|----------|-------|
| Assays | 5 |
| Protocols | 4 |
| Study-level processes | 0 |
| Assay-level processes | 10 |
| Total processes | 10 |
| Processes using `_default` | 0 |
| Sources | 20 |
| Samples | 20 |
| Other Materials | 0 |
| All assays have `dataFiles` | Yes |
| All assays have `unitCategories` | Yes |
| All assays have `filename` | Yes |

---

## Protocol Breakdown

### Study 1: `Genomics_elab2ARC`

| Protocol @id | Name | Parameters |
|--------------|------|------------|
| `#Protocol_protocols/eLabFTW_protocol_40_Experiment_1_Bacterial_Cultiva.elab2arc.md` | eLabFTW protocol 40 Experiment 1 Bacterial Cultiva.elab2arc.md | 12 |
| `#Protocol_protocols/eLabFTW_protocol_41_Experiment_2_DNA_Extraction.elab2arc.md, eLabFTW_protocol_57_NucleoSpin_Microbial_DNA_Kit_M.elab2arc.md` | eLabFTW protocol 41 Experiment 2 DNA Extraction.elab2arc.md, eLabFTW protocol 57 NucleoSpin Microbial DNA Kit M.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_42_Experiment_3_Library_Preparati.elab2arc.md, eLabFTW_protocol_58_NEBNext_FFPE_DNA_Repair_Mix.elab2arc.md` | eLabFTW protocol 42 Experiment 3 Library Preparati.elab2arc.md, eLabFTW protocol 58 NEBNext FFPE DNA Repair Mix.elab2arc.md | 0 |
| `#Protocol_protocols/eLabFTW_protocol_43_Experiment_4_Sequencing_Run.elab2arc.md` | eLabFTW protocol 43 Experiment 4 Sequencing Run.elab2arc.md | 0 |

---

## Assay Breakdown

### Study 1: `Genomics_elab2ARC`

| Assay @id | Filename | Processes | `executesProtocol` |
|-----------|----------|-----------|--------------------|
| `assays/Experiment_1__Bacterial_Cultivation/` | assays/Experiment_1__Bacterial_Cultivation/isa.assay.xlsx | 3 | #Protocol_protocols/eLabFTW_protocol_40_Experiment_1_Bacterial_Cultiva.elab2arc.md |
| `assays/Experiment_2__DNA_Extraction/` | assays/Experiment_2__DNA_Extraction/isa.assay.xlsx | 3 | #Protocol_protocols/eLabFTW_protocol_41_Experiment_2_DNA_Extraction.elab2arc.md, eLabFTW_protocol_57_NucleoSpin_Microbial_DNA_Kit_M.elab2arc.md |
| `assays/Experiment_3__Library_Preparation_-_FFPE_Repair__A-tailing__Adapter_Ligation/` | assays/Experiment_3__Library_Preparation_-_FFPE_Repair__A-tailing__Adapter_Ligation/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_42_Experiment_3_Library_Preparati.elab2arc.md, eLabFTW_protocol_58_NEBNext_FFPE_DNA_Repair_Mix.elab2arc.md |
| `assays/Experiment_4__Sequencing_Run/` | assays/Experiment_4__Sequencing_Run/isa.assay.xlsx | 2 | #Protocol_protocols/eLabFTW_protocol_43_Experiment_4_Sequencing_Run.elab2arc.md |
| `assays/Experiment_5__Bioinformatic_Analysis/` | assays/Experiment_5__Bioinformatic_Analysis/isa.assay.xlsx | 0 |  |
