// =============================================================================
// README GENERATOR MODULE
// Analyzes a cloned ARC repository and generates README.md files
// for root, studies, and assays using LLM-powered summarization.
// =============================================================================

(function(window) {
  'use strict';

  const MODULE_VERSION = '20260429-001';
  const MAX_FILE_CONTENT = 2000;
  const TEXT_EXTENSIONS = ['.md', '.txt', '.csv', '.tsv', '.json', '.xml', '.html'];
  const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'];

  // ===========================================================================
  // FILE HELPERS
  // ===========================================================================

  function getExtension(filename) {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
  }

  function isTextFile(filename) {
    return TEXT_EXTENSIONS.includes(getExtension(filename));
  }

  function isImageFile(filename) {
    return IMAGE_EXTENSIONS.includes(getExtension(filename));
  }

  function memfsPathJoin(...segments) {
    const joined = segments.filter(s => s != null && s !== '').join('/');
    const stack = [];
    joined.split('/').forEach(segment => {
      if (segment === '.' || segment === '') return;
      if (segment === '..') {
        if (stack.length > 0 && stack[stack.length - 1] !== '') stack.pop();
      } else {
        stack.push(segment);
      }
    });
    let normalized = stack.join('/');
    if (normalized.endsWith('/') && normalized !== '') {
      normalized = normalized.slice(0, -1);
    }
    const isAbsolute = joined.startsWith('/');
    return isAbsolute ? `/${normalized}` : normalized || '.';
  }

  function readTruncatedFile(filePath) {
    try {
      const fs = window.FS && window.FS.fs;
      if (!fs || !fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;

      let content = fs.readFileSync(filePath, 'utf8');
      if (content.length > MAX_FILE_CONTENT) {
        content = content.slice(0, MAX_FILE_CONTENT) + '\n\n[...truncated...]';
      }
      return content;
    } catch (e) {
      console.warn('[ReadmeGen] Could not read file:', filePath, e.message);
      return null;
    }
  }

  function listDirectory(dirPath) {
    try {
      const fs = window.FS && window.FS.fs;
      if (!fs || !fs.existsSync(dirPath)) return [];
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) return [];
      return fs.readdirSync(dirPath).filter(e => e !== '.' && e !== '..' && e !== '.git');
    } catch (e) {
      return [];
    }
  }

  /**
   * Recursively collect all image files under a directory tree.
   * Returns array of { name, path, relPath } where relPath is relative to gitRoot.
   */
  function collectImagesRecursive(dirPath, gitRoot, excludeDirs) {
    const images = [];
    const fs = window.FS && window.FS.fs;
    if (!fs || !fs.existsSync(dirPath)) return images;

    const exclusions = new Set(excludeDirs || []);

    function walk(currentPath) {
      const entries = listDirectory(currentPath);
      entries.forEach(entry => {
        if (exclusions.has(entry)) return;
        const entryPath = memfsPathJoin(currentPath, entry);
        try {
          const stat = fs.statSync(entryPath);
          if (stat.isDirectory()) {
            walk(entryPath);
          } else if (stat.isFile() && isImageFile(entry)) {
            // Compute relative path from gitRoot
            let relPath = entryPath;
            const base = gitRoot.endsWith('/') ? gitRoot.slice(0, -1) : gitRoot;
            if (entryPath.startsWith(base + '/')) {
              relPath = entryPath.slice(base.length + 1);
            }
            images.push({ name: entry, path: entryPath, relPath });
          }
        } catch (e) {
          // skip unreadable entries
        }
      });
    }

    walk(dirPath);
    return images;
  }

  function collectFolderContents(folderPath) {
    const result = {
      textFiles: [],
      images: [],
      otherFiles: []
    };
    const files = listDirectory(folderPath);
    files.forEach(file => {
      const fullPath = memfsPathJoin(folderPath, file);
      try {
        const stat = window.FS.fs.statSync(fullPath);
        if (!stat.isFile()) return;
        if (isTextFile(file)) {
          const content = readTruncatedFile(fullPath);
          result.textFiles.push({ name: file, path: fullPath, content: content || '' });
        } else if (isImageFile(file)) {
          result.images.push({ name: file, path: fullPath });
        } else {
          result.otherFiles.push({ name: file, path: fullPath, ext: getExtension(file) });
        }
      } catch (e) {
        // skip
      }
    });
    return result;
  }

  // ===========================================================================
  // REPO DATA COLLECTION
  // ===========================================================================

  async function collectRepoData(gitRoot) {
    const fs = window.FS && window.FS.fs;
    if (!fs) throw new Error('MEMfs not available');

    const data = {
      root: { path: gitRoot, files: [], textFiles: [], images: [], otherFiles: [] },
      studies: {},
      assays: {}
    };

    // Root level
    const rootItems = listDirectory(gitRoot);
    rootItems.forEach(item => {
      const itemPath = memfsPathJoin(gitRoot, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isFile()) {
          if (isTextFile(item)) {
            const content = readTruncatedFile(itemPath);
            data.root.textFiles.push({ name: item, content: content || '' });
          } else if (isImageFile(item)) {
            data.root.images.push({ name: item, relPath: itemPath.startsWith(gitRoot + '/') ? itemPath.slice(gitRoot.length + 1) : item });
          } else {
            data.root.otherFiles.push({ name: item, ext: getExtension(item) });
          }
        }
      } catch (e) { /* skip */ }
    });

    // Also recursively collect ALL images under root (including subdirectories like images/)
    // Exclude studies/ and assays/ since those are documented in their own sections
    const rootAllImages = collectImagesRecursive(gitRoot, gitRoot, ['studies', 'assays', '.git']);
    data.root.allImages = rootAllImages;

    // Studies
    const studiesPath = memfsPathJoin(gitRoot, 'studies');
    if (fs.existsSync(studiesPath)) {
      const studyNames = listDirectory(studiesPath);
      studyNames.forEach(studyName => {
        const studyPath = memfsPathJoin(studiesPath, studyName);
        try {
          const stat = fs.statSync(studyPath);
          if (!stat.isDirectory()) return;
        } catch (e) { return; }

        const studyData = {
          name: studyName,
          path: studyPath,
          protocols: collectFolderContents(memfsPathJoin(studyPath, 'protocols')),
          resources: collectFolderContents(memfsPathJoin(studyPath, 'resources')),
          isaStudy: null,
          allImages: collectImagesRecursive(studyPath, studyPath, ['.git'])
        };

        // Try to read isa.study.xlsx metadata if available
        const isaStudyPath = memfsPathJoin(studyPath, 'isa.study.xlsx');
        if (fs.existsSync(isaStudyPath)) {
          studyData.isaStudy = { present: true, path: isaStudyPath };
        }

        data.studies[studyName] = studyData;
      });
    }

    // Assays
    const assaysPath = memfsPathJoin(gitRoot, 'assays');
    if (fs.existsSync(assaysPath)) {
      const assayNames = listDirectory(assaysPath);
      assayNames.forEach(assayName => {
        const assayPath = memfsPathJoin(assaysPath, assayName);
        try {
          const stat = fs.statSync(assayPath);
          if (!stat.isDirectory()) return;
        } catch (e) { return; }

        const assayData = {
          name: assayName,
          path: assayPath,
          protocols: collectFolderContents(memfsPathJoin(assayPath, 'protocols')),
          dataset: collectFolderContents(memfsPathJoin(assayPath, 'dataset')),
          isaAssay: null,
          allImages: collectImagesRecursive(assayPath, assayPath, ['.git'])
        };

        const isaAssayPath = memfsPathJoin(assayPath, 'isa.assay.xlsx');
        if (fs.existsSync(isaAssayPath)) {
          assayData.isaAssay = { present: true, path: isaAssayPath };
        }

        data.assays[assayName] = assayData;
      });
    }

    return data;
  }

  // ===========================================================================
  // PROMPT BUILDING
  // ===========================================================================

  function formatFileList(files) {
    if (!files || files.length === 0) return '  (none)';
    return files.map(f => `  - ${f.name}`).join('\n');
  }

  function formatImageList(images) {
    if (!images || images.length === 0) return '  (none)';
    return images.map(img => `  - ${img.name}  (path: ./${img.relPath})`).join('\n');
  }

  function formatTextFiles(textFiles) {
    if (!textFiles || textFiles.length === 0) return '  (none)';
    return textFiles.map(tf => {
      return `  --- ${tf.name} ---\n${tf.content}`;
    }).join('\n\n');
  }

  function buildPrompt(repoData) {
    const studyNames = Object.keys(repoData.studies);
    const assayNames = Object.keys(repoData.assays);

    let prompt = `You are a scientific documentation assistant specialized in ARC (Annotated Research Context) repositories.

Your task is to analyze the provided repository structure and file contents, then generate comprehensive README.md files for each STUDY and each ASSAY.

## Repository Overview

- Root path: ${repoData.root.path}
- Studies: ${studyNames.length} (${studyNames.join(', ') || 'none'})
- Assays: ${assayNames.length} (${assayNames.join(', ') || 'none'})

### Root Files
Text files:
${formatTextFiles(repoData.root.textFiles)}

Images (including all subdirectories):
${formatImageList(repoData.root.allImages)}

Other files:
${formatFileList(repoData.root.otherFiles)}
`;

    // Studies section
    if (studyNames.length > 0) {
      prompt += `\n## Studies\n`;
      studyNames.forEach(name => {
        const s = repoData.studies[name];
        prompt += `\n### Study: ${name}\nPath: ${s.path}\n\n`;
        prompt += `Protocols (text files):\n${formatTextFiles(s.protocols.textFiles)}\n\n`;
        prompt += `All images in this study (including subdirectories):\n${formatImageList(s.allImages)}\n\n`;
        prompt += `Resources (other files):\n${formatFileList(s.resources.otherFiles)}\n\n`;
        prompt += `Protocols folder other files:\n${formatFileList(s.protocols.otherFiles)}\n`;
      });
    }

    // Assays section
    if (assayNames.length > 0) {
      prompt += `\n## Assays\n`;
      assayNames.forEach(name => {
        const a = repoData.assays[name];
        prompt += `\n### Assay: ${name}\nPath: ${a.path}\n\n`;
        prompt += `Protocols (text files):\n${formatTextFiles(a.protocols.textFiles)}\n\n`;
        prompt += `All images in this assay (including subdirectories):\n${formatImageList(a.allImages)}\n\n`;
        prompt += `Dataset (other files):\n${formatFileList(a.dataset.otherFiles)}\n\n`;
        prompt += `Protocols folder other files:\n${formatFileList(a.protocols.otherFiles)}\n`;
      });
    }

    prompt += `\n## Instructions\n
Generate README.md content for each STUDY and each ASSAY. Do NOT generate a root README.

Return ONLY a valid JSON object (no markdown code fences, no explanation) with this exact structure:

{
  "studies": {
    "studyName1": "# markdown string for studies/studyName1/README.md"
  },
  "assays": {
    "assayName1": "# markdown string for assays/assayName1/README.md"
  }
}

### Study README.md should include:
- Study title (use folder name if no other title found)
- Description (1-2 paragraph summary from protocol contents)
- Protocols section with file links: [protocol.md](./protocols/protocol.md)
- Resources section listing all files with links
- Images displayed inline using markdown: ![alt text](./resources/image.png)
- Navigation link: [Back to Project Root](../README.md)

### Assay README.md should include:
- Assay title (use folder name if no other title found)
- Description (1-2 paragraph summary from protocol contents)
- Measurement type and technology type (infer from protocol text if possible)
- Protocols section with file links
- Dataset section listing all files with links
- Images displayed inline using markdown: ![alt text](./dataset/image.png)
- Navigation link: [Back to Project Root](../README.md)

### Image linking rules:
- Use the EXACT relative paths provided above (e.g., ./resources/subfolder/image.png)
- For study images: use path from the list like ./resources/image.png
- For assay images: use path from the list like ./dataset/plot.png
- ALWAYS include EVERY image found using inline markdown syntax: ![description](./exact/path/from/list.png)
- NEVER invent or guess paths — only use the paths explicitly listed above

### Important:
- Use proper markdown formatting
- Keep descriptions concise but informative
- Link every file and image found in the repository
- Do NOT invent files that do not exist
`;

    return prompt;
  }

  // ===========================================================================
  // READ CHILD READMES
  // ===========================================================================

  function readChildReadmes(gitRoot, studies, assays) {
    const fs = window.FS && window.FS.fs;
    if (!fs) return { studies: {}, assays: {} };

    const result = { studies: {}, assays: {} };

    for (const name of Object.keys(studies)) {
      const path = memfsPathJoin(gitRoot, 'studies', name, 'README.md');
      try {
        if (fs.existsSync(path)) {
          result.studies[name] = fs.readFileSync(path, 'utf8');
        }
      } catch (e) {
        console.warn('[ReadmeGen] Could not read study README:', path);
      }
    }

    for (const name of Object.keys(assays)) {
      const path = memfsPathJoin(gitRoot, 'assays', name, 'README.md');
      try {
        if (fs.existsSync(path)) {
          result.assays[name] = fs.readFileSync(path, 'utf8');
        }
      } catch (e) {
        console.warn('[ReadmeGen] Could not read assay README:', path);
      }
    }

    return result;
  }

  // ===========================================================================
  // ABSTRACT PROMPT
  // ===========================================================================

  function buildAbstractPrompt(childReadmes) {
    let prompt = `You are a scientific documentation assistant.

Below are the README files for all studies and assays in an ARC repository.
Write a concise 2-3 sentence abstract that summarizes the entire project.
Also write a one-sentence data overview describing the types of data involved.

Return ONLY a valid JSON object (no markdown code fences, no explanation):

{
  "abstract": "...",
  "dataOverview": "..."
}

### Study READMEs:\n`;

    for (const [name, content] of Object.entries(childReadmes.studies)) {
      prompt += `\n--- Study: ${name} ---\n${content.slice(0, 1500)}\n`;
    }

    prompt += `\n### Assay READMEs:\n`;
    for (const [name, content] of Object.entries(childReadmes.assays)) {
      prompt += `\n--- Assay: ${name} ---\n${content.slice(0, 1500)}\n`;
    }

    prompt += `\n### Instructions:
- The abstract should capture the overall scientific goal and approach.
- The dataOverview should mention measurement types, technologies, and data formats.
- Return ONLY the JSON object. No extra text.
`;

    return prompt;
  }

  async function callLLMForAbstract(promptText) {
    if (!window.Elab2ArcLLM || !window.Elab2ArcLLM.callTogetherAI) {
      throw new Error('LLM service not available. Please ensure llm-service.js is loaded.');
    }

    console.log('[ReadmeGen] Abstract prompt length:', promptText.length, 'chars');

    const metadata = { task: 'readme_abstract_generation' };
    const options = {
      streamContainerId: 'llmStreamContent',
      rawPrompt: true,
      maxTokens: 2048,
      temperature: 0.5
    };

    const result = await window.Elab2ArcLLM.callTogetherAI(promptText, false, metadata, options);
    return result;
  }

  // ===========================================================================
  // ROOT README BUILDER
  // ===========================================================================

  function extractFirstParagraph(markdown) {
    const lines = markdown.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('![')) continue;
      if (trimmed.startsWith('[') && trimmed.includes('](')) continue;
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
      return trimmed;
    }
    return '';
  }

  function extractTitle(markdown) {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : '';
  }

  function buildRootReadmeMarkdown(arcName, abstract, dataOverview, childReadmes, allImages) {
    let md = `# ${arcName}\n\n`;

    if (abstract) {
      md += `## Abstract\n\n${abstract}\n\n`;
    }

    md += `## ARC Structure\n\n`;

    const studyNames = Object.keys(childReadmes.studies);
    const assayNames = Object.keys(childReadmes.assays);

    if (studyNames.length > 0) {
      md += `### Studies\n\n`;
      for (const name of studyNames) {
        const content = childReadmes.studies[name];
        const title = extractTitle(content) || name;
        const desc = extractFirstParagraph(content);
        md += `- **[${title}](./studies/${name}/README.md)**`;
        if (desc) md += ` — ${desc}`;
        md += `\n`;
      }
      md += `\n`;
    }

    if (assayNames.length > 0) {
      md += `### Assays\n\n`;
      for (const name of assayNames) {
        const content = childReadmes.assays[name];
        const title = extractTitle(content) || name;
        const desc = extractFirstParagraph(content);
        md += `- **[${title}](./assays/${name}/README.md)**`;
        if (desc) md += ` — ${desc}`;
        md += `\n`;
      }
      md += `\n`;
    }

    if (dataOverview) {
      md += `## Data Overview\n\n${dataOverview}\n\n`;
    }

    // Images section
    if (allImages && allImages.length > 0) {
      md += `## Figures & Images\n\n`;
      for (const img of allImages) {
        md += `![${img.name}](./${img.relPath})\n\n`;
      }
    }

    md += `## License\n\nThis project is licensed under CC BY 4.0 unless otherwise specified.\n\n`;
    md += `---\n\n*This ARC documentation was generated by [elab2ARC](https://github.com/nfdi4plants/elab2arc)*\n`;

    return md;
  }

  // ===========================================================================
  // LLM CALL
  // ===========================================================================

  async function callLLMForReadmes(promptText) {
    if (!window.Elab2ArcLLM || !window.Elab2ArcLLM.callTogetherAI) {
      throw new Error('LLM service not available. Please ensure llm-service.js is loaded.');
    }

    console.log('[ReadmeGen] Prompt length:', promptText.length, 'chars');

    const metadata = {
      task: 'readme_generation'
    };

    const options = {
      streamContainerId: 'llmStreamContent',
      rawPrompt: true,
      maxTokens: 8192,
      temperature: 0.7
    };

    const result = await window.Elab2ArcLLM.callTogetherAI(promptText, false, metadata, options);
    return result;
  }

  // ===========================================================================
  // JSON EXTRACTION
  // ===========================================================================

  function extractJSONFromResponse(text) {
    if (!text) return null;

    // Try direct parse first
    try {
      return JSON.parse(text);
    } catch (e) {
      // continue
    }

    // Try extracting from markdown code fence
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch (e) {
        // continue
      }
    }

    // Try extracting first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (e) {
        // continue
      }
    }

    return null;
  }

  // ===========================================================================
  // FILE WRITING
  // ===========================================================================

  async function writeReadmeFiles(gitRoot, readmeData) {
    const fs = window.FS && window.FS.fs;
    if (!fs) throw new Error('MEMfs not available');

    const written = [];

    // Write root README
    if (readmeData.root) {
      const rootPath = memfsPathJoin(gitRoot, 'README.md');
      await fs.promises.writeFile(rootPath, readmeData.root);
      // Verify write
      const verifyRoot = fs.readFileSync(rootPath, 'utf8');
      console.log('[ReadmeGen] Wrote root README:', rootPath, '| chars:', verifyRoot.length, '| hash:', verifyRoot.slice(0, 80).replace(/\s+/g, ' '));
      written.push(rootPath);
    }

    // Write study READMEs
    if (readmeData.studies) {
      for (const [studyName, content] of Object.entries(readmeData.studies)) {
        if (!content) continue;
        const studyReadmePath = memfsPathJoin(gitRoot, 'studies', studyName, 'README.md');
        // Ensure directory exists
        const studyDir = memfsPathJoin(gitRoot, 'studies', studyName);
        if (!fs.existsSync(studyDir)) {
          fs.mkdirSync(studyDir, { recursive: true });
        }
        await fs.promises.writeFile(studyReadmePath, content);
        const verifyStudy = fs.readFileSync(studyReadmePath, 'utf8');
        console.log('[ReadmeGen] Wrote study README:', studyReadmePath, '| chars:', verifyStudy.length);
        written.push(studyReadmePath);
      }
    }

    // Write assay READMEs
    if (readmeData.assays) {
      for (const [assayName, content] of Object.entries(readmeData.assays)) {
        if (!content) continue;
        const assayReadmePath = memfsPathJoin(gitRoot, 'assays', assayName, 'README.md');
        const assayDir = memfsPathJoin(gitRoot, 'assays', assayName);
        if (!fs.existsSync(assayDir)) {
          fs.mkdirSync(assayDir, { recursive: true });
        }
        await fs.promises.writeFile(assayReadmePath, content);
        const verifyAssay = fs.readFileSync(assayReadmePath, 'utf8');
        console.log('[ReadmeGen] Wrote assay README:', assayReadmePath, '| chars:', verifyAssay.length);
        written.push(assayReadmePath);
      }
    }

    return written;
  }

  // ===========================================================================
  // GIT STAGING
  // ===========================================================================

  async function stageReadmeFiles(gitRoot, filePaths) {
    if (!window.git || !window.git.add) {
      console.warn('[ReadmeGen] git not available, skipping staging');
      return;
    }
    for (const filePath of filePaths) {
      try {
        const relativePath = filePath.replace(gitRoot, '').replace(/^\//, '');
        await window.git.add({ fs: window.FS.fs, dir: gitRoot, filepath: relativePath });
        console.log('[ReadmeGen] Staged:', relativePath);
      } catch (e) {
        console.warn('[ReadmeGen] Could not stage file:', filePath, e.message);
      }
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  async function generateARCReadmes(gitRoot, options = {}) {
    const opts = Object.assign({
      stageGit: true,
      onProgress: null
    }, options);

    if (!gitRoot) {
      throw new Error('gitRoot is required');
    }

    console.log('[ReadmeGen] v' + MODULE_VERSION + ' starting README generation for:', gitRoot);

    // ================================================================
    // PHASE 1: Collect repo data and generate study/assay READMEs
    // ================================================================
    if (opts.onProgress) opts.onProgress('Collecting repository data...');
    const repoData = await collectRepoData(gitRoot);
    console.log('[ReadmeGen] Collected data:', {
      rootFiles: repoData.root.textFiles.length,
      rootImages: repoData.root.allImages.length,
      studies: Object.keys(repoData.studies).length,
      assays: Object.keys(repoData.assays).length
    });

    if (opts.onProgress) opts.onProgress('Building LLM prompt for studies/assays...');
    const promptText = buildPrompt(repoData);
    console.log('[ReadmeGen] Prompt built, length:', promptText.length);

    if (opts.onProgress) opts.onProgress('Generating study/assay READMEs with AI...');
    const llmResponse = await callLLMForReadmes(promptText);

    if (!llmResponse) {
      throw new Error('LLM returned no response');
    }

    if (opts.onProgress) opts.onProgress('Parsing LLM response...');
    const readmeData = extractJSONFromResponse(llmResponse);
    if (!readmeData) {
      console.error('[ReadmeGen] Could not parse LLM response. Raw:', llmResponse);
      throw new Error('Could not parse LLM response into README data');
    }

    // Write study/assay READMEs first
    if (opts.onProgress) opts.onProgress('Writing study/assay README.md files...');
    const childWritten = await writeReadmeFiles(gitRoot, readmeData);
    console.log('[ReadmeGen] Wrote child READMEs:', childWritten.length);

    // ================================================================
    // PHASE 2: Read child READMEs back and build root README
    // ================================================================
    if (opts.onProgress) opts.onProgress('Reading generated child READMEs...');
    const childReadmes = readChildReadmes(gitRoot, repoData.studies, repoData.assays);
    console.log('[ReadmeGen] Read back child READMEs:', {
      studies: Object.keys(childReadmes.studies).length,
      assays: Object.keys(childReadmes.assays).length
    });

    // Generate abstract from child READMEs via LLM
    let abstract = '';
    let dataOverview = '';
    const hasChildren = Object.keys(childReadmes.studies).length > 0 || Object.keys(childReadmes.assays).length > 0;

    if (hasChildren) {
      if (opts.onProgress) opts.onProgress('Generating project abstract from child READMEs...');
      const abstractPrompt = buildAbstractPrompt(childReadmes);
      const abstractResponse = await callLLMForAbstract(abstractPrompt);
      const abstractData = extractJSONFromResponse(abstractResponse);
      if (abstractData) {
        abstract = abstractData.abstract || '';
        dataOverview = abstractData.dataOverview || '';
        console.log('[ReadmeGen] Abstract generated:', abstract.slice(0, 100) + '...');
      } else {
        console.warn('[ReadmeGen] Could not parse abstract response, using fallback');
      }
    }

    // Build root README deterministically
    if (opts.onProgress) opts.onProgress('Building root README...');
    const arcName = gitRoot.replace(/\/$/, '').split('/').pop() || 'ARC Project';
    const rootMarkdown = buildRootReadmeMarkdown(
      arcName,
      abstract,
      dataOverview,
      childReadmes,
      repoData.root.allImages
    );

    // Write root README
    const rootPath = memfsPathJoin(gitRoot, 'README.md');
    const fs = window.FS && window.FS.fs;
    if (fs) {
      await fs.promises.writeFile(rootPath, rootMarkdown);
      const verifyRoot = fs.readFileSync(rootPath, 'utf8');
      console.log('[ReadmeGen] Wrote root README:', rootPath, '| chars:', verifyRoot.length);
    }

    const allWritten = [...childWritten, rootPath];

    // Stage in git
    if (opts.stageGit && allWritten.length > 0) {
      if (opts.onProgress) opts.onProgress('Staging files in git...');
      await stageReadmeFiles(gitRoot, allWritten);
    }

    const summary = {
      root: true,
      rootMarkdown: rootMarkdown,
      abstract: abstract,
      dataOverview: dataOverview,
      studies: Object.keys(readmeData.studies || {}),
      assays: Object.keys(readmeData.assays || {}),
      writtenPaths: allWritten
    };

    console.log('[ReadmeGen] Complete:', summary);
    return summary;
  }

  // Export public API
  window.Elab2ArcReadmeGen = {
    generateARCReadmes: generateARCReadmes,
    buildRootReadme: buildRootReadmeMarkdown,
    collectRepoData: collectRepoData,
    buildPrompt: buildPrompt
  };

})(window);
