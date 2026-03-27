# ARCtrl Bundle Build Documentation

This directory contains the webpack bundle for ARCtrl 3.0.1 and related dependencies.

## Quick Start

```bash
# Install dependencies
npm install

# Build the bundle
npm run build
```

## Output

The build produces `arctrl.bundle.js` (~2.5MB) which exposes:

| Export | Description |
|--------|-------------|
| `window.arctrl` | ARCtrl library (ARC, ArcAssay, ArcTable, Comment, etc.) |
| `window.Xlsx` | Excel file handling (`fromXlsxFile`, `toFile`) |
| `window.FS` | memfs in-memory filesystem (`{ fs }`) |
| `window.ARC2JSON` | ARC to JSON conversion helper |
| `window.newAssay` | Create new assay helper |
| `window.fullAssay` | Create assay with metadata helper |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@nfdi4plants/arctrl` | 3.0.1 | ARC data model and ISA-Tab handling |
| `memfs` | 3.6.0 | In-memory filesystem for browser |
| `path-browserify` | ^1.0.1 | Path utilities polyfill |
| `process` | ^0.11.10 | Node.js process polyfill |
| `buffer` | ^6.0.3 | Buffer polyfill |
| `stream-browserify` | ^3.0.0 | Stream polyfill |
| `events` | ^3.3.0 | Events polyfill |
| `webpack` | ^5.89.0 | Module bundler |
| `webpack-cli` | ^5.1.4 | Webpack CLI |

## Project Structure

```
js/
├── arctrl.bundle.js           # Output bundle (generated)
├── package.json              # npm dependencies and scripts
├── webpack.config.cjs        # Webpack configuration
├── src/
│   ├── index.js              # Entry point - exports to window
│   └── Xlsx.js               # Wrapper for FsSpreadsheet Xlsx module
└── node_modules/             # Dependencies (after npm install)
```

## Build Configuration Notes

### Why memfs 3.6.0 (not 4.x)?

memfs 4.x uses `node:` prefixed imports (e.g., `node:buffer`, `node:events`) which webpack 5 cannot resolve in browser environments. Version 3.6.0 uses standard imports that work with webpack's fallback system.

### Why NormalModuleReplacementPlugin?

ARCtrl's `package.json` exports field intercepts deep imports to `FsSpreadsheet.Js`. The plugin rewrites the import path to bypass this and access the internal Xlsx module directly.

### Polyfills Required

The bundle includes these Node.js polyfills for browser compatibility:
- `process` - Required by ARCtrl internals
- `buffer` - Required by ExcelJS (bundled with ARCtrl)
- `stream` - Required by filesystem operations
- `events` - Required by memfs
- `path` - Provided by `path-browserify`

## Troubleshooting

### Error: "Can't resolve 'node:buffer'"

This means memfs 4.x is installed. Downgrade to 3.6.0:
```bash
npm install memfs@3.6.0
```

### Error: "Module not found: process/browser"

The process package needs full path resolution. The webpack config uses:
```javascript
require.resolve("process/browser.js")
```

### Error: "export 'Comment$' was not found"

ARCtrl 3.0.1 renamed `Comment$` to `Comment`. Update your code:
```javascript
// Old (pre-3.0.1)
arctrl.Comment$.create("name", "value")

// New (3.0.1+)
arctrl.Comment.create("name", "value")
```

## ARCtrl API Reference

Key exports from `window.arctrl`:

```javascript
// ARC operations
const arc = new window.arctrl.ARC();
window.arctrl.ARC.fromFilePaths(paths)

// Assay/Study/Investigation
window.arctrl.ArcAssay.init(name)
window.arctrl.ArcStudy.init(name)
window.arctrl.ArcInvestigation.init(name)

// Tables
window.arctrl.ArcTable.init(name)
window.arctrl.CompositeHeader.input(ioType)
window.arctrl.CompositeHeader.characteristic(ontologyAnnotation)
window.arctrl.CompositeCell.createFreeText(text)
window.arctrl.CompositeCell.createTerm(ontologyAnnotation)

// Metadata
new window.arctrl.OntologyAnnotation(name, termSource, termAccession)
window.arctrl.Comment.create(name, value)  // Note: was Comment$ before 3.0.1
window.arctrl.Person.create(...)

// Controllers
window.arctrl.XlsxController.Assay.toFsWorkbook(assay)
window.arctrl.XlsxController.Study.toFsWorkbook(study)
window.arctrl.JsonController.Investigation.toISAJsonString(investigation)
```

## Rebuilding After Updates

1. Update version in `package.json` if needed
2. Run `npm install` to update dependencies
3. Run `npm run build` to regenerate the bundle
4. Test in browser console:
   ```javascript
   console.log(window.arctrl);  // Should show ARCtrl object
   console.log(window.Xlsx);     // Should show Xlsx object
   console.log(window.FS);       // Should show { fs: {...} }
   ```

## Related Files

- `../CLAUDE.md` - Project-level documentation
- `../index.html` - Loads this bundle via script tag
- `../js/elab2arc-core1209.js` - Uses exports from this bundle
- `../js/modules/isa-generation.js` - ISA-Tab generation using ARCtrl