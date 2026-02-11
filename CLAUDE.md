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
│   ├── main-25-07-15.js         # Main application logic (~1.4MB)
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

### ISA-Tab Format
Standard metadata format for multi-omics studies. Generated using ARCtrl library.

### CORS Proxy System
Due to browser security restrictions, the app uses proxy fallback:
- Primary: `corsproxy.cplantbox.com`
- Backup: `corsproxy2.cplantbox.com`
- Git proxy: `gitcors.cplantbox.com`
- **LFS proxy:** `lfsproxy.cplantbox.com` (supports PUT requests for file uploads)

### Git LFS (Large File Storage)
Files larger than 10MB are automatically uploaded to Git LFS to improve repository performance and avoid hitting Git size limits.

**How it works:**
1. Files >10MB are detected during the conversion process
2. File content is uploaded to GitLab LFS storage via the LFS Batch API
3. A small pointer file (SHA-256 reference) is committed to the git repository instead
4. The LFS proxy handles PUT requests with proper CORS headers

**Supported file extensions (70 total):**

| Category | Extensions |
|----------|------------|
| **Archives** | `*.zip`, `*.tar.gz`, `*.tar`, `*.rar`, `*.7z`, `*.gz`, `*.bz2`, `*.xz` |
| **Office Documents** | `*.xlsx`, `*.xls`, `*.docx`, `*.doc`, `*.pptx`, `*.ppt`, `*.odt`, `*.ods`, `*.odp` |
| **Images** | `*.psd`, `*.tif`, `*.tiff`, `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.svg`, `*.webp`, `*.ico`, `*.heic`, `*.heif`, `*.raw`, `*.cr2`, `*.nef`, `*.arw` |
| **Videos** | `*.mp4`, `*.avi`, `*.mov`, `*.mkv`, `*.webm`, `*.flv`, `*.wmv` |
| **Audio** | `*.mp3`, `*.wav`, `*.flac`, `*.aac`, `*.ogg`, `*.wma`, `*.m4a` |
| **Scientific Data** | `*.fasta`, `*.fastq`, `*.bam`, `*.sam`, `*.vcf`, `*.npy`, `*.h5`, `*.hdf5` |
| **Data/Text** | `*.csv`, `*.tsv`, `*.json`, `*.xml` |
| **3D Models** | `*.vtp`, `*.vtk`, `*.obj`, `*.ply`, `*.stl`, `*.fbx` |
| **Databases** | `*.sqlite`, `*.db`, `*.parquet` |
| **Documents** | `*.pdf` |

**LFS Configuration:**
- Threshold: 10MB (`LFS_SIZE_THRESHOLD = 10 * 1024 * 1024`)
- Config file: `.gitattributes` (auto-generated with extension patterns)
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

### File Versioning
Files use cache-busting query parameters: `?v=YYYYMMDDHHMMSS` (e.g., `20260210120101`)

### Code Style
- Functional JavaScript patterns
- Bootstrap 5 for UI components
- Modular organization in `/js/modules/`
- No build process or bundler

## Key Files for Modification

| Task | File |
|------|------|
| Main UI flow | `js/main-25-07-15.js` |
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

No formal test suite. Manual testing via:
1. Demo API key available in Token tab
2. Test mode checkbox for LLM features
3. Console logging throughout

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

Main branch: `main`
