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
│   ├── elab2arc-core1209.js     # Core conversion functionality
│   ├── git.js                   # Git operations wrapper
│   ├── http.js                  # HTTP utilities (ES6 module)
│   ├── MEMfsGUI1006.js          # File system GUI manager
│   ├── turndown.js              # HTML to Markdown converter
│   ├── exceljs.min.js           # Excel file handling
│   ├── bootstrap.bundle.min.js  # Bootstrap components
│   └── bs5-intro-tour.js        # User tour functionality
├── js/modules/
│   ├── conversion-metadata.js   # Conversion tracking/metadata
│   ├── isa-generation.js        # ISA-Tab generation logic
│   ├── llm-service.js           # LLM/AI integration
│   ├── extra-fields-handler.js  # Custom field processing
│   └── git-lfs-service.js       # Git LFS for large files (>10MB)
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

**Key Functions:** `js/modules/isa-generation.js`
- `readOrCreateInvestigation()` - Initialize investigation at start
- `saveInvestigation()` - Save investigation to file
- `registerStudyToInvestigation()` - Register study during conversion
- `registerAssayToInvestigation()` - Register assay during conversion

**Flow:** Initialize → Process (register) → Save → Commit → Push (see `js/elab2arc-core1209.js` lines 2011-2173)

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

**Testing:** See `TESTING.md` for detailed test cases and verification steps.

### LLM Annotation Tables (Studies & Assays)
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

**Key Functions:** `js/modules/isa-generation.js`
- `createSampleTable(samples)` - Create sample table from LLM-extracted data
- `createProcessTable(protocol, processNr, protocolInfo)` - Create process table
- `createDefaultProcessTable(protocolInfo)` - Fallback when no LLM data

### CORS Proxy System
Due to browser security restrictions, the app uses proxy fallback:
- Primary: `corsproxy.cplantbox.com`
- Backup: `corsproxy2.cplantbox.com`
- Git proxy: `gitcors.cplantbox.com`
- **LFS proxy:** `lfsproxy.cplantbox.com` (supports PUT requests for file uploads)

### Git LFS (Large File Storage)
Files larger than 10MB in `dataset/` directories are automatically uploaded to Git LFS to improve repository performance and avoid hitting Git size limits.

**How it works:**
1. Files >10MB in `dataset/` directories are detected during the conversion process
2. File content is uploaded to GitLab LFS storage via the LFS Batch API
3. A small pointer file (SHA-256 reference) is committed to the git repository instead
4. The LFS proxy handles PUT requests with proper CORS headers

**LFS Pattern:**
```
**/dataset/** filter=lfs diff=lfs merge=lfs -text
```
All files in any `dataset/` directory are tracked by LFS, regardless of extension.

**LFS Configuration:**
- Threshold: 10MB (`LFS_SIZE_THRESHOLD = 10 * 1024 * 1024`)
- Config file: `.gitattributes` (auto-generated with dataset pattern)
- Upload timeout: 5 minutes
- LFS Batch API: `/info/lfs/objects/batch` (GitLab endpoint)

**Testing LFS:**
A test page is available at `test-lfs-upload.html` to verify LFS upload functionality.

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

**Key file:** `js/modules/isa-generation.js` - `readOrCreateInvestigation()`, `saveInvestigation()`, `registerStudyToInvestigation()`, `registerAssayToInvestigation()` functions

### Filesystem Instance Consistency (CRITICAL - March 2026)

**The Problem:**
The application uses multiple filesystem references that must all point to the same `window.FS.fs` instance. When different `fs` instances are used, directories created in one filesystem are not visible to another, causing ENOENT errors.

**Fix Location:**
- `js/elab2arc-core1209.js` line 10: `var fs = window.FS.fs;` (NOT `var fs = FS.fs;`)
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

### ARCtrl 3.0.1 Migration Notes (March 2027)

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
- `js/modules/isa-generation.js` - Added `|| ''` fallbacks for all Person.create calls
- `js/modules/isa-generation.js` - Added directory creation in saveInvestigation()
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
| Main UI flow | `js/arctrl.bundle.js` |
| Core conversion logic | `js/elab2arc-core1209.js` |
| ISA-Tab generation | `js/modules/isa-generation.js` |
| LLM integration | `js/modules/llm-service.js` |
| Git operations | `js/git.js` |
| Git LFS (large files) | `js/modules/git-lfs-service.js` |
| UI styling | `css/custom0929.css`, `css/elabGUI1305.css` |
| HTML structure | `index.html` |

## Configuration

### API Endpoints
- eLabFTW instances configured in `index.html` (lines 212-227)
- CORS proxies defined in JavaScript files

### LLM Models
Configured in Token tab (index.html lines 295-329):
- Primary: Qwen/Qwen3-235B-A22B-Instruct-2507-tput
- Fallbacks: meta-llama, gpt-oss, deepseek-ai models

### localStorage Keys
- Selected eLabFTW URL
- API tokens (eLabFTW, DataHUB, Together.AI)
- LLM model preferences
- User prompts

## Common Tasks

### Adding a New eLabFTW Instance
Edit `index.html` lines 212-227, add new dropdown item:
```html
<li><button class="dropdown-item" onclick="setelabURL('YOUR_URL/api/v2/')"
    type="button">eLabFTW Instance: NAME</button></li>
```

### Modifying ISA-Tab Templates
Templates stored in `/templates/` directory. ExcelJS processes these.

### Customizing LLM Prompts
Use the Prompt Editor modal (UI-based) or modify `js/modules/llm-service.js`

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
