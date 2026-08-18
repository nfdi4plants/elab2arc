# elab2arc - AI Assistant Guide

## Project Overview

**elab2arc** is a client-side Single Page Application (SPA) that bridges eLabFTW (electronic lab notebook) with ARC (Annotated Research Context) repositories on GitLab. It automates the transformation of eLabFTW experiments into FAIR-compliant ARCs with minimal user input.

**Repository:** https://github.com/nfdi4plants/elab2arc
**License:** GPL v3.0
**Organization:** NFDI4Plants / DataPLANT

## Key Architecture Points

### Client-Side Only
- No backend server required
- All processing happens in the browser
- Data never leaves the user's session except for:
  - API calls to eLabFTW (via CORS proxy)
  - Git operations to DataHUB (via CORS proxy)
  - LLM API calls to Together.AI (optional)

### Core Technologies
- **Frontend:** Vanilla JavaScript, HTML5, CSS3, Bootstrap 5
- **Git Operations:** isomorphic-git (client-side Git)
- **File System:** memfs (in-memory filesystem)
- **ISA-Tab Generation:** ARCtrl library
- **Markdown Conversion:** turndown
- **Excel Processing:** ExcelJS

## Project Structure

```
elab2arc/
├── index.html              # Main entry point, SPA navigation
├── css/
│   ├── bootstrap.min.css
│   ├── custom0929.css      # Custom styling
│   ├── bs5-intro-tour.css  # Tour/guide styling
│   ├── MEMfsGUI0929.css    # File system GUI
│   └── elabGUI1305.css     # eLabFTW UI styling
├── js/
│   ├── arctrl.bundle.js        # ARCtrl bundle (webpack, ~2.5MB)
│   ├── package.json             # Bundle dependencies
│   ├── webpack.config.cjs       # Webpack configuration
│   ├── src/index.js             # Bundle entry point
│   ├── src/Xlsx.js              # Xlsx wrapper module
│   ├── elab2arc-core20260504.js    # Core conversion functionality
│   ├── git.js                   # Git operations wrapper
│   ├── http.js                  # HTTP utilities (ES6 module)
│   ├── MEMfsGUI1006.js          # File system GUI manager
│   ├── turndown.js              # HTML to Markdown converter
│   ├── exceljs.min.js           # Excel file handling
│   ├── bootstrap.bundle.min.js  # Bootstrap components
│   └── bs5-intro-tour.js        # User tour functionality
├── js/modules/
│   ├── conversion-metadata.js   # Conversion tracking/metadata
│   ├── isa-generation-20260422-1145.js  # ISA-Tab generation logic
│   ├── llm-service20260504.js           # LLM/AI integration (multi-provider)
│   ├── extra-fields-handler.js  # Custom field processing
│   ├── git-lfs-service.js       # Git LFS for large files (>10MB)
│   └── readme-generator20260504.js      # ARC README generation via LLM
├── templates/              # Excel templates for ISA metadata
├── images/               # Static assets (logo, help images)
└── LICENSE               # GPL v3.0
```

## Application Flow

### User Journey
1. **Home Tab:** Introduction and video tutorial
2. **Token Tab:** Configure API keys
   - eLabFTW API key
   - DataHUB (GitLab) personal access token
   - Optional: Together.AI API key for LLM features
3. **eLabFTW Tab:** Browse and select experiments/resources
4. **ARC Tab:** Choose target ARC repository and start conversion

### Conversion Process
```
eLabFTW Experiment → Fetch → Process → Generate ISA-Tab → Git Commit → Push to DataHUB
```

## Key Concepts

### ARC (Annotated Research Context)
A standardized research data structure with:
- `isa.assay.xlsx` - Assay metadata
- `isa.investigation.xlsx` - Investigation metadata
- `isa.study.xlsx` - Study metadata
- `assays/` - Assay directories with data
- `studies/` - Study directories
- `resources/` - Additional resources

### LLM Annotation Output
When LLM annotation is enabled, the extracted structured data is saved with a descriptive filename matching the protocol markdown. Both MD and JSON files are stored in the `protocols/` folder:
- **Studies:** `studies/[study-name]/protocols/eLabFTW_protocol_[ID]_[Title].elab2arc.json`
- **Assays:** `assays/[assay-name]/protocols/eLabFTW_protocol_[ID]_[Title].elab2arc.json`

Example: `eLabFTW_protocol_40_Experiment_1_Bacterial_Cultiva.elab2arc.json`

This file contains the LLM-extracted protocol information including samples, inputs, parameters, and outputs.

### ISA-Tab Format
Standard metadata format for multi-omics studies. Generated using ARCtrl library.

**Investigation Flow (Fixed March 2026):**
The investigation is now created BEFORE processing experiments to ensure proper linkages:

1. **Before experiments:** `Elab2ArcISA.readOrCreateInvestigation()` - Load existing or create new investigation
2. **During processing:** Each study/assay registers itself to the investigation:
   - `Elab2ArcISA.registerStudyToInvestigation()` - Register study
   - `Elab2ArcISA.registerAssayToInvestigation()` - Register assay (with optional parent study)
3. **After all experiments:** `Elab2ArcISA.saveInvestigation()` - Save and commit/push

**ARCtrl Linkages Used:**
- `arcInvestigation.AddStudy(arcStudy)` - Add study object to investigation
- `arcInvestigation.RegisterStudy(studyName)` - Register study reference
- `arcInvestigation.AddAssay(arcAssay)` - Add assay object to investigation
- `arcInvestigation.RegisterAssay(studyName, assayName)` - Register assay under study

**Key Functions:** `js/modules/isa-generation-20260422-1145.js`
- `readOrCreateInvestigation()` - Initialize investigation at start
- `saveInvestigation()` - Save investigation to file
- `registerStudyToInvestigation()` - Register study during conversion
- `registerAssayToInvestigation()` - Register assay during conversion

**Flow:** Initialize → Process (register) → Save → Commit → Push (see `js/elab2arc-core20260504.js` ~lines 3006+)

**ARCtrl Serialization Issue (Fixed March 2026):**
When reading full study objects from xlsx files and adding them to the investigation, ARCtrl's `toFsWorkbook()` had serialization issues (error: "Could not write investigation to spreadsheet: source").

**Solution:** Create minimal study/assay objects for registration instead of reading full objects from xlsx:
```javascript
// Create minimal study for registration (avoids serialization issues)
const arcStudy = window.arctrl.ArcStudy.create(studyName);
arcStudy.Identifier = studyName;
arcStudy.Name = studyName;
arcStudy.Title = studyName;
investigation.AddStudy(arcStudy);
investigation.RegisterStudy(studyName);
```

**ISA-JSON Export (Fixed May 2026):**
During conversion, `registerStudyToInvestigation()` and `registerAssayToInvestigation()` are no-ops (registration code commented out) to avoid ARCtrl serialization issues. The investigation xlsx is saved without study/assay linkages.

At export time (`handleExportIsaJson()` → `downloadIsaJson()`), the `buildIsaJsonDirectly()` function creates the linkages temporarily in memory:
1. Reads the investigation xlsx
2. Creates an overarching study (identifier = ARC name)
3. Reads all assay xlsx files from `assays/` and adds them to the overarching study
4. Registers the study and assays in the investigation
5. Serializes to ISA-JSON string (never writes back to xlsx)

This ensures the exported ISA-JSON has proper study/assay nesting without modifying the investigation file.

After serialization, `Elab2ArcEnrich.enrichIsaJson()` (from `js/modules/isa-enrichment-20260504.js`) post-processes the JSON to fix structural issues. It enriches investigation, study, and assay levels:

**Investigation level:**
- Adds `publications: []` if missing
- Ensures `ontologySourceReferences` includes SCORO, OBI, EFO, UO

**Study level:**
- Adds `title`, `description`, `materials`, `protocols`, `processSequence`, `publications`, `characteristicCategories`, `factors`, `unitCategories` if missing
- Enriches protocols: adds `parameters`, infers `protocolType`, extracts `parameterName`
- Enriches processes: adds `inputs`, `outputs`, `parameterValues`, infers `executesProtocol`
- Removes undeclared data file references from process outputs
- Aggregates materials and protocols from assays to study level

**Assay level:**
- Sets `measurementType` and `technologyType` defaults (metagenome sequencing / nucleotide sequencing)
- Ensures `materials`, `processSequence`, `characteristicCategories` arrays exist
- Enriches processes: adds `inputs`, `outputs`, `parameterValues`, infers `executesProtocol`
- Aggregates undeclared protocol references from assay processes into study
- Declares undeclared material IDs and protocol parameters

**Testing:** See `TESTING.md` for detailed test cases and verification steps.

**Sample/process table preservation on LLM-disabled re-conversion (added August 2026):**
`generateIsaAssayElab2arcWithDatamap()` / `generateIsaStudy()` build a fresh in-memory
`ArcAssay`/`ArcStudy` and write the whole `isa.assay.xlsx`/`isa.study.xlsx` workbook every
conversion - this is ARCtrl's own xlsx serialization model (same as ARCitect on every save, not
an elab2arc shortcut; see "Independent audit" above and `TODOs.md`'s E11 discussion for the full
history of this). Previously, `Tables` (the sample table + per-protocol process tables, which
carry any parameter-character and ontology-annotation columns) were set to `[]` whenever
`llmData` was empty for that run - meaning **re-converting the same entry with the LLM toggle
off after a prior LLM-enabled run silently wiped those tables**, even though nothing else about
that conversion asked for it. Reproduced and confirmed real, not theoretical.

Fixed: when `llmData` is empty, the function now checks whether `isa.assay.xlsx` /
`isa.study.xlsx` already exists at that path and, if so, reads it back
(`Xlsx.fromXlsxFile` → `XlsxController.Assay.fromFsWorkbook()` /
`XlsxController.Study.fromFsWorkbook()[0]` - **note the `[0]`**: unlike the Assay reader, which
returns the `ArcAssay` directly, the Study reader returns a 2-tuple `[ArcStudy, assaysList]`,
confirmed by inspection, not assumed from the Assay pattern - a genuinely different shape that a
naive symmetric implementation would get wrong) and reuses its `Tables` as-is. Everything else
(Title/Description/Contacts/Comments) is still recomputed fresh from the current eLabFTW data
every run, exactly as before - so the net effect is a merge: **the LLM-generated table content
is preserved verbatim, while the surrounding metadata reflects whatever eLabFTW currently says.**
If no LLM data is available AND no existing file is there yet (first-ever conversion with LLM
off), the behavior is unchanged: an empty `Tables` array, same as before this fix.

When LLM *is* enabled, behavior is unchanged: the tables are always rebuilt fresh from that run's
`llmData`, intentionally - this preservation logic only applies to the LLM-disabled branch.

**Verified** (not just code-reviewed) via a full write→read→reassign→rewrite→read round trip for
both functions: an initial LLM-enabled run's ontology-annotated characteristic (`Term` cell with
`_termSourceREF`/`_termAccessionNumber` intact) and unit-annotated parameter (`Unitized` cell)
both survived byte-for-byte into a second, LLM-disabled run with deliberately different
`protocolInfo`, while that run's `Title` correctly picked up the new value - confirming both the
preservation and the merge. Also verified the cold-start case (LLM off, no prior file) still
correctly produces zero tables without erroring, for both functions.
Both studies and assays support multi-sheet annotation tables when LLM data is available:

| Feature | Assays (`isa.assay.xlsx`) | Studies (`isa.study.xlsx`) |
|---------|---------------------------|----------------------------|
| Sample table from LLM | ✅ Yes | ✅ Yes |
| Process tables from LLM protocols | ✅ Yes (multi-sheet) | ✅ Yes (multi-sheet) |
| Basic metadata (title, description) | ✅ Yes | ✅ Yes |
| Contact/person info | ✅ Yes | ✅ Yes |

**Generated Excel Structure:**
| Sheet | Name | Columns |
|-------|------|---------|
| 1 | "samples" | Input [Source Name], Characteristics... |
| 2 | "process nr. 1" | Input, Protocol REF, Parameters, Output |
| 3+ | "process nr. N" | Input, Protocol REF, Parameters, Output |

**Process Linking:** Outputs from process N-1 automatically become inputs for process N.

**Key Functions:** `js/modules/isa-generation-20260422-1145.js`
- `createSampleTable(samples)` - Create sample table from LLM-extracted data
- `createProcessTable(protocol, processNr, protocolInfo)` - Create process table
- `createDefaultProcessTable(protocolInfo)` - Fallback when no LLM data

### Assay Title and Description (Fixed April 2026)
Previously, assays only stored metadata in Comment fields, leaving Title and Description empty. This has been fixed to set proper Title and Description properties on ArcAssay objects.

**Title Fallback Chain:**
| Scenario | Title Source |
|----------|-------------|
| LLM enabled, single protocol | `llmData.protocols[0].name` |
| LLM enabled, multiple protocols | `assayName` (experiment identifier) |
| LLM disabled, protocol file exists | `protocolInfo.title` (filename) |
| LLM disabled, no protocol file | `assayName` |

**Description Fallback Chain:**
| Scenario | Description Source |
|----------|-------------------|
| LLM enabled | Combined protocol descriptions (` | ` separator) |
| LLM disabled, protocol file exists | `protocolInfo.description` (markdown excerpt) |
| LLM disabled, no protocol file | Dataset file list description |
| No data | Empty string |

**Key Functions:** `js/modules/isa-generation-20260422-1145.js`
- `generateIsaAssayElab2arcWithDatamap()` - Sets Title and Description with fallback logic (lines 681-722)

### README Generator (Added April 2026)
`js/modules/readme-generator20260504.js` (v`20260504`) generates README.md files for the entire ARC using LLM.

**Public API:** `window.Elab2ArcReadmeGen`
- `generateARCReadmes(gitRoot, options)` - Main entry point; options: `{ stageGit: true, onProgress: fn }`
- `collectRepoData(gitRoot)` - Collect repo structure/file contents
- `buildPrompt(repoData)` - Build LLM prompt from repo data
- `buildRootReadme(arcName, abstract, dataOverview, childReadmes, allImages)` - Build root README deterministically

**Two-phase generation:**
1. **Phase 1:** LLM generates JSON with `{ studies: {...}, assays: {...} }` — each value is the README.md markdown for that study/assay
2. **Phase 2:** Reads back written child READMEs, calls LLM again for a 2-3 sentence abstract, then builds root `README.md` deterministically

**Triggered from UI:** "📝 Generate READMEs" button in ARC tab (`generateARCReadmesFromModal()` in core); also `generateARCReadmesUI()` for post-conversion flow.

**Dependencies:** Requires `window.Elab2ArcLLM.callTogetherAI` (from `llm-service20260504.js`) and `window.FS.fs` (memfs).

**Console prefix:** `[ReadmeGen]`

### CORS Proxy System
Due to browser security restrictions, the app uses proxy fallback:
- Primary: `corsproxy.cplantbox.com`
- Backup: `corsproxy2.cplantbox.com`
- Git proxy: `gitcors.cplantbox.com` (backup: `gitcors2.cplantbox.com`)
- **LFS proxy:** `lfsproxy.cplantbox.com` (supports PUT requests for file uploads)

The CORS proxy tries direct access first (`tryDirectFirst: true`) before falling back to the proxy.

#### Local Python CORS Proxy (cors-proxy-py)
A Python port of the Node.js CORS proxy is available at `/Users/xr/git/elab2arc/cors-proxy-py/` for local development:

```bash
# Install and run locally
cd cors-proxy-py
pip install -e .
cors-proxy start -p 8333

# Configure in browser console
localStorage.setItem('gitProxyURL', 'http://localhost:8333')
```

**Git Protocol Support:** Handles OPTIONS preflight, GET info/refs, POST git-upload-pack (fetch), and POST git-receive-pack (push) with proper CORS headers and request filtering. Pass GitLab PAT via `onAuth` in isomorphic-git — the proxy forwards the `Authorization` header as-is without modification.

### Git LFS (Large File Storage)
**All** files in `dataset/` directories are uploaded to Git LFS, regardless of size — this matches the blanket `.gitattributes` pattern elab2arc writes (see below), so every file `.gitattributes` promises is LFS-tracked actually is, **except** when the LFS upload itself fails for a specific attachment (see "LFS upload failure fallback" below) — that's a known, surfaced-to-the-user exception to this guarantee, not a silent one.

**Why unconditional (fixed August 2026):** LFS conversion used to be gated on a 10MB threshold (`shouldUseLFS()` in `git-lfs-service.js`), so small `dataset/` files (e.g. auto-generated `README.elab2arc.md`) were committed as plain blobs while `.gitattributes` still claimed them as LFS. Downstream tools that assume the promise holds — notably DataPLANT's `arc-export` in `-lfs` mode, used by the ARC RO-Crate CI job — crash reading a non-pointer file where an LFS pointer was expected (`Internal Error: Value cannot be null. (Parameter 'array')`), failing the pipeline on any push, not just ones that add new large files.

**How it works:**
1. Any file being staged under a `dataset/` directory is detected during the conversion process (both the live eLabFTW pipeline and the `#extension` alt-input plugin funnel through the same `commitPush` → `gitAddAll` staging sweep, which is LFS-aware — see `gitAddAll`'s `lfsCtx` param in `elab2arc-core20260504.js`)
2. File content is uploaded to GitLab LFS storage via the LFS Batch API
3. A small pointer file (SHA-256 reference) is committed to the git repository instead
4. The LFS proxy handles PUT requests with proper CORS headers

**LFS Pattern:**
```
**/dataset/** filter=lfs diff=lfs merge=lfs -text
```
All files in any `dataset/` directory are tracked by LFS, regardless of extension or size.

**LFS Configuration:**
- Config file: `.gitattributes` (auto-generated with dataset pattern)
- Upload timeout: 5 minutes
- LFS Batch API: `/info/lfs/objects/batch` (GitLab endpoint)

**Testing LFS:**
A test page is available at `test-lfs-upload.html` to verify LFS upload functionality.

**LFS upload failure fallback (added August 2026):** if a single attachment's LFS upload
throws (`processUploadsAndReplaceUrls` → `GitLFSService.addFileWithLFS`, e.g. GitHub rejecting
a fine-grained PAT for LFS - see "GitHub Support" above), it no longer aborts the whole
experiment. It falls back to a plain `git.add` for that one file and continues, and surfaces a
warning toast (`showWarningToast`) naming the file, since this is exactly the
`.gitattributes`-promises-LFS-but-file-is-a-plain-blob mismatch the unconditional-LFS fix above
was written to prevent — the toast exists so this doesn't happen silently. This fallback applies
to any host, not just GitHub: a genuine transient LFS failure against PLANTdataHUB/GitLab would
hit the same fallback and toast rather than aborting the experiment. `gitAddAll`'s blanket
`dataset/` staging sweep (used by every `commitPush`) already had an equivalent try/catch before
this fix; this brings the per-attachment upload path in `processUploadsAndReplaceUrls` in line
with it.

### Error Handling & Robustness Fixes (August 2026)

**Per-entry conversion isolation:** `processElabEntries`'s experiment/resource loops now wrap
each `processExperiment()` call in its own try/catch (`elab2arc-core20260504.js`). Previously
one bad entry threw uncaught, aborted the *entire* batch (all remaining experiments skipped),
and surfaced only a generic "An unexpected error occurred" toast. Now a failing entry logs +
toasts its specific ID (`Skipped eLabFTW experiment <id>: <reason>`) and the batch continues.

**Empty eLabFTW body handling:** eLabFTW returns `body: null` (not `""`) for an experiment with
no content. `processExperiment` used to do `res.body.replace(...)` directly, which threw a
TypeError on that null - previously this was exactly the kind of error the per-entry isolation
above now catches, but it's fixed at the source too: `res.body || ''`, so an empty-content entry
produces an empty protocol instead of erroring at all.

**LLM extraction failure reason:** `callTogetherAI()` (`llm-service20260504.js`) used to swallow
every failure reason internally and return bare `null`, so the caller's toast was a fixed string
regardless of cause. It now tracks the reason (`lastLLMError`, exposed via
`Elab2ArcLLM.getLastLLMError()`) - missing API key, empty protocol content (now checked
explicitly, before ever calling the API), no parseable model output, or the caught
exception/API-error message - and the toast reads
`LLM extraction failed (<reason>), using default structure for: <assayId>` instead of a fixed
string with no indication of why.

**`commitPush()` proxy-fallback scoping bug:** the retry-via-proxy logic in `commitPush()`'s
push failure handler referenced `pushProxy`/`pushProxyStrategy`, which were `const`-declared
inside the sibling `try` block - out of scope in `catch`, so *any* push failure (for *any* host,
not just GitHub) threw `ReferenceError: pushProxy is not defined` instead of running the
intended direct→proxy fallback, masking the real error. Fixed by declaring them with `let`
above the `try`.

## Development Guidelines

### Running Locally
```bash
# Serve static files (any HTTP server)
python -m http.server 8000
# or
npx serve
```
Then open http://localhost:8000

### Building the ARCtrl Bundle

The `js/arctrl.bundle.js` file is a webpack bundle containing ARCtrl 3.0.1, memfs, and helper functions. To rebuild:

```bash
cd js
npm install
npm run build
```

**Key files in `js/`:**
- `package.json` - Dependencies (arctrl 3.0.1, memfs 3.6.0)
- `src/index.js` - Entry point with helper functions
- `src/Xlsx.js` - Wrapper for FsSpreadsheet Xlsx module
- `webpack.config.cjs` - Build configuration with polyfills

**Bundle exposes:**
- `window.arctrl` - ARCtrl library (ARC, ArcAssay, Comment, etc.)
- `window.Xlsx` - Excel file handling (fromXlsxFile, toFile)
- `window.FS` - memfs filesystem ({ fs })
- `window.ARC2JSON`, `window.newAssay`, `window.fullAssay` - Helper functions

**Note:** memfs 3.6.0 is used (not 4.x) because v4 uses `node:` imports that webpack doesn't support.

### File Versioning
Files use cache-busting query parameters: `?v=YYYYMMDDHHMMSS` (e.g., `20260210120101`)

### Code Style
- Functional JavaScript patterns
- Bootstrap 5 for UI components
- Modular organization in `/js/modules/`
- ARCtrl bundle requires webpack build (`js/arctrl.bundle.js`)

### Filesystem Consistency (CRITICAL)
The project uses multiple filesystem-like systems:
- `window.FS.fs` - memfs in-memory filesystem (for directories, git operations)
- `window.Xlsx.toFile()` / `window.Xlsx.fromXlsxFile()` - ARCtrl's Excel file handling

**Important:** Always use ARCtrl methods for Excel files. Do NOT mix `fs.existsSync()` with `Xlsx.fromXlsxFile()` - they may use different internal filesystems.

**Correct pattern for Excel files:**
```javascript
// Read: Use Xlsx.fromXlsxFile with try-catch
try {
  const workbook = await window.Xlsx.fromXlsxFile(path);
  // Process workbook...
} catch (readError) {
  console.warn('File not found or unreadable:', readError.message);
}

// Write: Use Xlsx.toFile
await window.Xlsx.toFile(path, spreadsheet);
```

**Only use `fs` for:**
- Directory operations: `fs.readdirSync()`, `fs.statSync()`, `fs.existsSync(dirPath)`
- Git operations

**Key file:** `js/modules/isa-generation-20260422-1145.js` - `readOrCreateInvestigation()`, `saveInvestigation()`, `registerStudyToInvestigation()`, `registerAssayToInvestigation()` functions

### Filesystem Instance Consistency (CRITICAL - March 2026)

**The Problem:**
The application uses multiple filesystem references that must all point to the same `window.FS.fs` instance. When different `fs` instances are used, directories created in one filesystem are not visible to another, causing ENOENT errors.

**Fix Location:**
- `js/elab2arc-core20260504.js` line 10: `var fs = window.FS.fs;` (NOT `var fs = FS.fs;`)
- `js/src/Xlsx.js` line 29-35: `getFs()` function that returns `window.FS.fs`
- `js/src/Xlsx.js` line 60-67: Added directory creation before file write

**Verification:**
```javascript
// In console, verify filesystems are unified:
fs === window.FS.fs  // Should return: true
```

**If ISA files fail to create:**
1. Check console for "[Xlsx.js] Creating directory:" messages
2. Verify `fs === window.FS.fs` in browser console
3. Rebuild arctrl.bundle.js if source files were modified: `cd js && npm run build`

### ARCtrl 3.0.1 Migration Notes (March 2026)

**GetHashCode TypeError Fix:**
ARCtrl 3.0.1's internal F# hashing fails when `undefined` values are passed to constructors. Always provide empty string fallbacks for optional metadata fields:

```javascript
// CORRECT - with fallbacks
const person = window.arctrl.Person.create(
  void 0,
  metadata.firstName || '',      // Fallback required
  metadata.familyName || '',     // Fallback required
  void 0,
  metadata.email || '',          // Fallback required
  void 0, void 0, void 0,
  metadata.affiliation || '',    // Fallback required
  [roles],
  [comments_p]
);

// INCORRECT - causes GetHashCode error
const person = window.arctrl.Person.create(
  void 0,
  metadata.firstName,   // undefined causes error
  metadata.familyName,  // undefined causes error
  // ...
);
```

**Directory Creation Before Write:**
When saving ISA files, ensure parent directories exist before writing:

```javascript
async function saveInvestigation(gitRoot, investigation) {
  const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

  // Ensure directory exists before writing
  const fs = window.FS.fs;
  if (!fs.existsSync(gitRoot)) {
    fs.mkdirSync(gitRoot, { recursive: true });
  }

  const spreadsheet = window.arctrl.XlsxController.Investigation.toFsWorkbook(investigation);
  await window.Xlsx.toFile(isaPath, spreadsheet);
}
```

**Files modified for 3.0.1 compatibility:**
- `js/modules/isa-generation-20260422-1145.js` - Added `|| ''` fallbacks for all Person.create calls
- `js/modules/isa-generation-20260422-1145.js` - Added directory creation in saveInvestigation()
- `js/src/index.js` - Uses `Comment.create` (not `Comment$`) for ARCtrl 3.0.1

## Core Function Parameters

### `params` Object
The `params` object is returned by `getParameters()` and contains all authentication and configuration data. **Always use `params.datahubtoken` instead of `window.localStorage.getItem('datahubtoken')`** for consistency.

**Structure:**
```javascript
{
  elabidList: {
    elabExperimentid: [...],  // Array of experiment IDs
    elabResourceid: [...]     // Array of resource IDs
  },
  elabtoken: string,          // eLabFTW API token
  datahubtoken: string,       // DataHUB/GitLab token (use this, not localStorage)
  instance: string            // eLabFTW instance URL (e.g., "https://elabftw.hhu.de/api/v2/")
}
```

**Key Functions Using `params`:**
- `processElabEntries(params, users, gitlabURL, arcName)` - Main conversion orchestrator
- `processExperiment(...)` - Per-experiment processing
- `commitPush(params.datahubtoken, ...)` - Git commit and push

**Token Retrieval:**
- Use `params.datahubtoken` within conversion functions
- Use `getDatahubToken()` or `extractCookie('datahubtoken')` in other contexts
- Avoid direct `window.localStorage.getItem('datahubtoken')` calls

## Key Files for Modification

| Task | File |
|------|------|
| Main UI flow | `index.html` |
| Core conversion logic | `js/elab2arc-core20260504.js` |
| ISA-Tab generation | `js/modules/isa-generation-20260422-1145.js` |
| LLM integration | `js/modules/llm-service20260504.js` |
| README generation | `js/modules/readme-generator20260504.js` |
| Git operations | `js/git.js` |
| Git LFS (large files) | `js/modules/git-lfs-service.js` |
| ARCtrl bundle | `js/arctrl.bundle.js` |
| UI styling | `css/custom0929.css`, `css/elabGUI1305.css` |

## Configuration

### API Endpoints
- eLabFTW instances configured in `index.html` (lines 212-227)
- CORS proxies defined in JavaScript files

### LLM Providers
Configured in Token tab (index.html ~line 345). Multi-provider support:

| Provider ID | Name | Requires Key | Endpoint |
|-------------|------|-------------|---------|
| `dataplan` | Community Server (default) | No | `https://h.dataplan.top/v1/chat/completions` |
| `dataplan-gemma` | Community Server gemma | No | `https://h.dataplan.top/v1/chat/completions` |
| `lmstudio` | LM Studio (Local) | No | `http://localhost:1234/v1/chat/completions` |
| `together` | Together.AI | Yes | `https://api.together.xyz/v1/chat/completions` |
| `ollama` | Ollama (Local) | No | `http://localhost:11434/v1/chat/completions` |
| `custom` | Custom API | No | User-configured |

Default provider: `dataplan`. The `dataplan` and `dataplan-gemma` providers hard-wire their model in `getSelectedModel()` (`js/modules/llm-service20260504.js`) regardless of `togetherAIModel`:
- `dataplan` → `openai/gpt-oss-20b` (switched from `Qwen/Qwen3-235B-A22B-Instruct-2507-tput` in July 2026, matching the same change in `dmp-eva`)
- `dataplan-gemma` → `google/gemma-4-31B-it`

Valid Together.AI models (from `VALID_MODELS`, used only for the `together` provider's model dropdown):
- `Qwen/Qwen3-235B-A22B-Instruct-2507-tput` (default)
- `openai/gpt-oss-120b`

### localStorage Keys
- Selected eLabFTW URL
- API tokens (eLabFTW, DataHUB, Together.AI)
- LLM model preferences
- User prompts

## Common Tasks

### Adding a New eLabFTW Instance
Edit `index.html` ~line 216, add new dropdown item:
```html
<li><button class="dropdown-item" onclick="setelabURL('YOUR_URL/api/v2/')"
    type="button">eLabFTW Instance: NAME</button></li>
```

Current instances: DataPLANT (`elab.dataplan.top`), HHU (`elabftw.hhu.de`), Custom input field.

### Custom DataHub/GitLab Instance
Users can configure a custom DataHub/GitLab instance via the Token tab UI (checkbox "Use custom DataHub/GitLab instance"):
- **GitLab URL** - Base URL (e.g. `https://gitlab.com`), no API suffix
- **API Suffix** - Default `/api/v4`
- **SSO/Token URL** - URL to obtain a personal access token

### GitHub Support (added August 2026)
The DataHub connector also supports GitHub, detected via `isGitHubHost()`
(`getDatahubURL()` containing `github.com`) in `elab2arc-core20260504.js`. Set
**GitLab URL** to `https://api.github.com` and leave **API Suffix** empty - GitHub's
API is unversioned at the host root, and `getDatahubAPIURL()` skips the suffix
entirely for GitHub hosts (an empty custom suffix would otherwise fall back to the
GitLab default `/api/v4` via `setDatahubAPISuffix()`).

`checkGitLabConnection()`, `fetchUserProjects()`, `createGitLabRepo()`, and
`fetchUser()` all branch on `isGitHubHost()` to use GitHub's `/user` and
`/user/repos` endpoints instead of GitLab's `/user`/`/projects`, and
`mapGitHubRepoToProject()` maps GitHub's repo/user field names (`clone_url`,
`full_name`, `private`, `login`) onto the GitLab-shaped fields
(`http_url_to_repo`, `path_with_namespace`, `visibility`, `username`) the rest of
the app consumes.

**Verified fully working end-to-end, including a real push of real converted
content** (live, real GitHub PAT, real eLabFTW data): connection check, user
info, repo listing, `cloneARC()`/`datahubClone()`, and a full
`processElabEntries()` run converting 5 real eLabFTW demo experiments
(`elab.dataplan.top` IDs 40-44) into ARC assays and pushing them - all through
the actual production functions, not a synthetic test. Result:
`github.com/xiaoranzhou/elab2arc-github-test` now has real assay content
(`isa.assay.xlsx`, protocol markdown, dataset attachments, `isa.investigation.xlsx`)
across 5 real commits plus the investigation-linkage commit.

GitHub's git-over-HTTPS endpoints send no CORS headers (confirmed via direct
header inspection), so a browser can't reach them directly - the existing git
proxy (`getGitProxy()` → `gitproxy.wb-e.com`, config on host `zap`/[redacted-ip],
`/etc/nginx/sites-available/cors-proxy.nginx.conf`) handles this with no
target-domain allowlist at all. Its `{"error": "Forbidden: Origin not allowed"}`
response is a **client-Origin** allowlist check (`https://nfdi4plants.org`,
`localhost:3000`/`5173`/`8080`) unrelated to the target host - production
traffic from `https://nfdi4plants.org/elab2arc/` (per `readme.md`, the actual
hosting URL) satisfies it. Testing from a different local dev port will hit
that same 403 and can look like a GitHub-specific block - it isn't one.

**Token permission matters, independent of everything above:** a GitHub PAT
that can list/fetch but not push looks identical to a working setup right up
until the actual push - `git-receive-pack` and the REST Contents API both
return the same `403 Resource not accessible by personal access token` for a
read-only-scoped fine-grained PAT. Confirmed by testing a REST API write
directly (`PUT /repos/.../contents/...`) independent of git/proxy entirely,
before concluding it was a permissions issue rather than a code/infra one.
Fine-grained PATs need "Contents: Read and write" explicitly granted.

**Four real bugs found and fixed** (bugs 1-2 via the end-to-end push run; bug 3
via a follow-up review checking every field the repo-selection table reads
against what the GitHub mapping actually provides; bug 4 via an independent
audit by a second model, Kimi K3, run in a separate tmux session against the
committed diff - see "Independent audit" below):
1. `commitPush()`'s proxy-fallback retry: `pushProxy`/`pushProxyStrategy` were
   `const`-scoped inside the initial `try` block, so the `catch` block's
   fallback logic threw `ReferenceError: pushProxy is not defined` on any push
   failure, masking the real error. Now declared outside the `try`. (Applies to
   any host, not just GitHub - see "Error Handling & Robustness Fixes" below.)
2. A single attachment's LFS upload failure (`processUploadsAndReplaceUrls` →
   `addFileWithLFS`) aborted the entire experiment, unlike `gitAddAll`'s
   blanket sweep which already degrades gracefully. Now falls back to a plain
   `git.add` for that file, continues, and surfaces a warning toast (see "LFS
   upload failure fallback" below - also host-agnostic, not GitHub-only).
3. `mapGitHubRepoToProject()` didn't map `web_url` (GitHub's `html_url`) - the
   repo-selection table (`fetchUserProjects`'s rendered `<tr>`) reads
   `project.web_url` for both the repo-name link and the "View" link, so for
   every GitHub repo both rendered as `href="undefined"`. Fixed by adding
   `web_url: repo.html_url` to the mapping; verified live that the rendered
   table now shows real `github.com/...` links and that "Select assay"/"Select
   study"/"Select a specific ARC folder" all still set the correct target path
   and clone URL, matching GitLab's rendering exactly.
4. `fetchUser()`'s GitHub normalization mapped `username`/`commit_email` but
   not `name` - GitHub's `GET /user` returns `name: null` for any account with
   no display name set (a common state), and `createNewArc()` does
   `window.userId.name.split(" ")` unguarded, so "Create a new ARC" would
   throw for those users. Fixed: `userJSON.name = userJSON.name || userJSON.login`.

### Independent audit (Kimi K3, August 2026)

The commit adding GitHub support was independently audited by a second model
(Kimi K3, via `kimi-code`, run in a separate tmux session with no context from
the authoring session) against the committed diff, cross-checking every
touched function's pre-commit vs post-commit behavior. Confirmed correct: the
`pushProxy` fix, all GitLab paths unchanged, the `mapGitHubRepoToProject()`
field mapping, the LFS fallback's ordering (pointer only written after a
successful upload, so the fallback's plain `git.add` can't stage a broken
pointer), the null-body fix, and the `lastLLMError` mechanism. Found bug 4
above (fixed) plus two gaps, both since fixed and live-verified (real
GitHub account, real test repo, plus one synthetic-pagination check):

- **`updateGitLabProjectDescription()` now branches on `isGitHubHost()`**:
  `PATCH {base}/repos/{owner}/{repo}` with `{ description }` (GitHub's
  documented endpoint - confirmed via its own `documentation_url` in the
  error response) instead of GitLab's `PUT /projects/:id`. `projectPath` was
  already being derived by both call sites as an unencoded `"owner/repo"`
  string, which is exactly the two path segments GitHub's endpoint needs
  (GitLab instead needs the whole string as one percent-encoded ID). **Code
  verified correct independently via raw `curl` with the real PAT** (same
  403 as the app, and GitHub's error pointed at
  `docs.github.com/rest/repos/repos#update-a-repository` - the exact
  endpoint implemented) - **but blocked on token scope**: this operation
  needs "Administration: Read and write" on a fine-grained PAT, a *third*
  distinct scope dimension from "Contents" (needed for push/LFS, see
  above). The PAT used for this session's testing only has Contents scope.
  Not a code bug - noted here so a future session doesn't waste time
  re-diagnosing the same 403.
- **`fetchUserProjects()`'s GitHub branch now paginates** (loops
  `page=1,2,3...` at the API's `per_page=100` max until a short page
  confirms the end, capped at 20 pages/2,000 repos) and **filters
  client-side by the `search=` term** pulled back out of `apiParameter`
  (GitHub's `/user/repos` has no server-side name-search; its actual search
  endpoint, `GET /search/repositories`, has a different response shape, so
  filtering the already-paginated list avoids a second endpoint-shape
  special case). **Verified live against the real account**: real repo
  count went from 90 (first push-testing session) to 120 now, correctly
  spanning 2 real pages (`page=1` returning 100, `page=2` returning 20,
  confirmed via network trace) - not a synthetic test, this account
  genuinely exceeds 100 repos. Search filter verified too (`?search=elab2arc`
  correctly returned exactly the 3 real repos matching that substring).

**GitLab had the identical latent bug, fixed the same session** (not part of
the Kimi audit - found by asking "does GitLab pagination need the same fix?"
after fixing GitHub's). `fetchUserProjects()`'s GitLab branch did a single
fetch with no pagination loop either. Confirmed empirically against
gitlab.com (unauthenticated, public `/projects`) that GitLab silently caps
`per_page` at 100 regardless of what's requested - the previous default
`per_page=200` was doing nothing; the response came back with
`x-per-page: 100`, only 100 items, and a real `Link: rel="next"` header
proving more existed. Any GitLab/PLANTdataHUB user with >100 projects was
silently missing results, identically to the GitHub gap.

Fixed the same way as GitHub (page-looping, `per_page=100`) rather than
using GitLab's keyset pagination mode + the `Link` header, for two
independently-confirmed reasons: (1) `pagination=keyset` combined with an
explicit `page=N` **silently ignores the page param and re-returns page 1
every time** - confirmed empirically (`page=1` and `page=2` returned
byte-identical results with keyset mode on), which would have made the loop
fetch the same 100 projects up to 20 times instead of paginating; (2) even
in plain offset mode, this app's CORS proxy (`proxy.wb-e.com`) doesn't
forward the `Link` header via `Access-Control-Expose-Headers`
(`Content-Length, Content-Range, Content-Type` only - see
`cors-proxy.nginx.conf` on `zap`), so it wouldn't be readable from browser
JS through the proxy regardless. Dropped `pagination=keyset` from both real
`apiParameter` sources (this function's default, and
`window.updateARCList`'s search-query construction) and switched both to
explicit `per_page=100`.

**Verified**: the exact page-looping shape now used was run directly
against real, live, multi-page `gitlab.com` public project data (3 pages of
100, 300 total, all IDs confirmed unique - i.e. genuinely advancing, not
re-fetching the same page). Could not verify the *authenticated* path
end-to-end (no real GitLab/PLANTdataHUB PAT available in this session) -
but the auth mechanism itself (`Authorization: Bearer <token>` via
`fetchWithProxyFallback`) is unchanged from the pre-existing, already-working
single-fetch version; only the page-looping wrapper around it is new.

A third, lower-severity finding (a rare edge case where a failed push mid-batch
can leave a dangling assay reference registered in the investigation object,
since registration happens before push inside `processExperiment()`) was
judged an acceptable trade-off of the per-entry batch-isolation fix and not
actioned - see `TODOs.md` for the full writeup if picking it up later.

**Known trade-off from fix #2:** GitHub's Git LFS does not support
fine-grained PATs at all (a GitHub platform limitation, not fixable here) -
confirmed live, `.git/info/lfs/objects/batch` returns 403 regardless of the
token's granted permissions. Fix #2's fallback means the conversion no longer
*crashes* on this, but the files it falls back for land as plain git blobs
while `.gitattributes` still promises `filter=lfs` for anything under
`dataset/` - confirmed on the real pushed repo (a `dataset/*.png` file is a raw
PNG blob, not an LFS pointer). This is the *exact* failure mode the August 2026
"unconditional LFS" fix (see Git LFS section below) was written to prevent for
the 10MB-threshold case - it resurfaces here specifically for
GitHub-plus-fine-grained-PAT, where LFS structurally cannot succeed regardless
of file size. Not fixable from this repo's code (would need a classic PAT
(`ghp_...`) or a GitHub App installation token, which do support LFS) - the
warning toast from fix #2 is the mitigation actually shipped, not a follow-up.

**Test repo:** a disposable GitHub repo for exercising this connector,
`https://github.com/xiaoranzhou/elab2arc-github-test` - now has real pushed ARC
content per above. Use a personal GitHub PAT with "Contents: Read and write" to
test writes against it; do not commit tokens to this file or anywhere else in
the repo - set them via the Token tab UI (stored in `localStorage` only, same
as any other DataHub token) or pass them ephemerally in a test script.

### Modifying ISA-Tab Templates
Templates stored in `/templates/` directory. ExcelJS processes these.

### Customizing LLM Prompts
Use the Prompt Editor modal (UI-based) or modify `js/modules/llm-service20260504.js`

### Debugging Git Operations
Browser DevTools → Network tab shows proxied Git requests to `gitcors.cplantbox.com`

## External Dependencies (CDN)

| Library | Purpose | Source |
|---------|---------|--------|
| diff.min.js | Version comparison | jsdelivr |
| diff2html-ui.min.js | Diff visualization | jsdelivr |
| ARCtrl | ISA-Tab handling | Loaded via script tag |

## Testing

**Detailed testing guide:** See `TESTING.md` for comprehensive test cases, known issues, and debugging tips.

### Quick Test Workflow

1. **Start local server:** `python -m http.server 8000`
2. **Open application:** http://localhost:8000/elab2arc/
3. **Configure tokens:** eLabFTW API key + DataHUB token
4. **Select experiments:** Choose from eLabFTW list
5. **Select target ARC:** Click "Select study" or "Select assay"
6. **Start conversion:** Monitor console logs for progress

### Console Log Verification

All ISA-related logs are prefixed with `[ISA Gen]`. Key logs to verify:
```
[ISA Gen] Investigation initialized: loaded/created
[ISA Gen] Registered study to investigation: <study_name>
[ISA Gen] Saved investigation to: <path>
[ISA Gen] Committed investigation: <sha>
[ISA Gen] Pushed investigation to remote
```

### Chrome DevTools MCP Testing

For automated browser testing, use Chrome DevTools MCP:
```javascript
// Navigate and interact
mcp__chrome-devtools__navigate_page({ type: "url", url: "http://localhost:8000/elab2arc/" })
mcp__chrome-devtools__take_snapshot()  // Get element UIDs
mcp__chrome-devtools__click({ uid: "button_uid" })
mcp__chrome-devtools__list_console_messages({ types: ["log", "warn"] })
```

### Test Data

**Demo Experiments (elab.dataplan.top):**
- IDs 40-44: Bacterial Cultivation through Bioinformatic Analysis workflow
- Test ARC: https://git.nfdi4plants.org/elab/123123

## Important Notes

### Security
- All tokens stored in localStorage (client-side only)
- CORS proxies required for cross-origin requests
- Never commit tokens to repository

### Browser Compatibility
Modern browsers with ES6+ support required
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support

### Limitations
- Files >10MB use Git LFS (requires LFS-enabled GitLab repository)
- CORS proxy dependencies for cross-origin requests
- No offline mode (requires API access)
- Browser memory constraints for very large conversions

## Related Resources

- **DataPLANT Knowledge Base:** https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/
- **ARC Specification:** https://nfdi4plants.github.io/arc-specification/
- **ISA-Tab Format:** https://isa-specs.readthedocs.io/

## Git Workflow

Recent commits focus on:
- CORS proxy improvements
- Git LFS support for large files (>10MB)
- LFS CORS proxy deployment (lfsproxy.cplantbox.com)
- UI/UX enhancements
- ISA-Tab generation fixes
- Token authentication flow
- Investigation update with ARCtrl linkages (AddStudy, RegisterStudy, AddAssay, RegisterAssay)
- Investigation commit/push after conversion

Main branch: `main`
