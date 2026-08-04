// =============================================================================
// ALTERNATIVE INPUT PARSERS
// Plugin module: detects and normalizes zip-based inputs (eLabFTW .eln,
// eLabFTW-native export zips, generic markdown/HTML note vaults such as
// Obsidian) into a common PseudoExperiment shape. Pure parsing only — no DOM,
// no git, no ISA calls. Only reachable via the #extension entry point.
// =============================================================================

(function (window) {
  'use strict';

  const JUNK_PATH_SEGMENTS = ['.obsidian', '.git', '.trash', '__macosx', '.ds_store'];
  const NOTE_EXTENSIONS = ['.md', '.markdown', '.html', '.htm'];
  const SIZE_WARNING_BYTES = 200 * 1024 * 1024;

  function isJunkPath(path) {
    const segments = path.toLowerCase().split('/');
    return segments.some(seg => JUNK_PATH_SEGMENTS.includes(seg));
  }

  function extOf(path) {
    const lower = path.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot === -1 ? '' : lower.substring(dot);
  }

  function basenameNoExt(path) {
    const base = path.split('/').pop();
    const dot = base.lastIndexOf('.');
    return dot === -1 ? base : base.substring(0, dot);
  }

  function dirOf(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.substring(0, idx);
  }

  function topFolderOf(relativePath) {
    const idx = relativePath.indexOf('/');
    return idx === -1 ? '' : relativePath.substring(0, idx);
  }

  // Strips a single root folder that JSZip/GitHub archives commonly add
  // (e.g. "my-vault-main/notes/foo.md" -> "notes/foo.md"), only when every
  // entry shares that same single root.
  function stripCommonRoot(paths) {
    if (paths.length === 0) return { strip: '', paths };
    const firstRoot = topFolderOf(paths[0]);
    if (!firstRoot) return { strip: '', paths };
    const allShareRoot = paths.every(p => topFolderOf(p) === firstRoot);
    if (!allShareRoot) return { strip: '', paths };
    return { strip: firstRoot + '/', paths: paths.map(p => p.substring(firstRoot.length + 1)) };
  }

  function parseYamlFrontMatter(markdown) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { frontMatter: {}, body: markdown };
    const raw = match[1];
    const frontMatter = {};
    raw.split(/\r?\n/).forEach(line => {
      const kv = line.match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
      if (!kv) return;
      const key = kv[1].trim().toLowerCase();
      let value = kv[2].trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, '');
      }
      frontMatter[key] = value;
    });
    return { frontMatter, body: markdown.substring(match[0].length) };
  }

  // Finds attachment references inside markdown/html text: Obsidian wiki
  // embeds ![[name]], standard markdown ![](path), and <img src="...">.
  function findAttachmentRefs(text) {
    const refs = new Set();
    let m;
    const wikiRe = /!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g;
    while ((m = wikiRe.exec(text))) refs.add(m[1].trim());
    const mdRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    while ((m = mdRe.exec(text))) refs.add(decodeURIComponent(m[1].trim()));
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((m = imgRe.exec(text))) refs.add(decodeURIComponent(m[1].trim()));
    return Array.from(refs).filter(r => !/^https?:\/\//i.test(r));
  }

  function makeAttachment(zip, path) {
    const entry = zip.file(path);
    if (!entry) return null;
    return {
      name: path.split('/').pop(),
      path,
      getData: () => entry.async('uint8array')
    };
  }

  function resolveAttachmentPath(zip, allPaths, notePath, ref) {
    const cleanRef = ref.split('#')[0];
    const candidate1 = cleanRef.startsWith('/') ? cleanRef.slice(1) : (dirOf(notePath) ? dirOf(notePath) + '/' + cleanRef : cleanRef);
    if (zip.file(candidate1)) return candidate1;
    const targetBase = cleanRef.split('/').pop().toLowerCase();
    const found = allPaths.find(p => p.toLowerCase().endsWith('/' + targetBase) || p.toLowerCase() === targetBase);
    return found || null;
  }

  // -------------------------------------------------------------------------
  // Format detection
  // -------------------------------------------------------------------------

  async function detectFormat(zip) {
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    const roCratePath = allPaths.find(p => p.endsWith('ro-crate-metadata.json'));
    if (roCratePath) return { format: 'eln', roCratePath, allPaths };

    const elabftwJsonPath = allPaths.find(p => p.endsWith('export-elabftw.json'));
    if (elabftwJsonPath) return { format: 'elabftw-zip', elabftwJsonPath, allPaths };

    const notePaths = allPaths.filter(p => !isJunkPath(p) && NOTE_EXTENSIONS.includes(extOf(p)));
    if (notePaths.length > 0) return { format: 'vault', notePaths, allPaths };

    return { format: null, allPaths };
  }

  // -------------------------------------------------------------------------
  // RO-Crate (.eln) parser
  // -------------------------------------------------------------------------

  async function parseEln(zip, detection, warnings) {
    const metaEntry = zip.file(detection.roCratePath);
    const meta = JSON.parse(await metaEntry.async('string'));
    const graph = meta['@graph'] || [];
    const cratePrefix = dirOf(detection.roCratePath) ? dirOf(detection.roCratePath) + '/' : '';

    const byId = {};
    graph.forEach(node => { byId[node['@id']] = node; });

    function resolvePerson(idRef) {
      const node = idRef && byId[idRef['@id'] || idRef];
      if (!node || node['@type'] !== 'Person') return {};
      return {
        firstname: node.givenName || '',
        lastname: node.familyName || '',
        fullname: [node.givenName, node.familyName].filter(Boolean).join(' '),
        email: node.email || ''
      };
    }

    const experimentNodes = graph.filter(n => n['@type'] === 'Dataset' && n.genre === 'experiment');
    const experiments = [];

    for (const node of experimentNodes) {
      const person = resolvePerson(node.author);
      const attachments = [];
      (node.hasPart || []).forEach(part => {
        const rel = (part['@id'] || '').replace(/^\.\//, '');
        const zipPath = cratePrefix + rel;
        const fileNode = byId[part['@id']];
        const attachment = makeAttachment(zip, zipPath);
        if (attachment) {
          if (fileNode && fileNode.name) attachment.name = fileNode.name;
          attachments.push(attachment);
        } else {
          warnings.push(`[eln] Could not locate referenced file for ${node.name || node['@id']}: ${rel}`);
        }
      });

      const tags = (node.keywords || '').split(',').map(s => s.trim()).filter(Boolean);

      experiments.push({
        sourceFormat: 'eln',
        elabid: node.identifier || node['@id'],
        title: (node.name || 'Untitled experiment').trim(),
        tags,
        fullname: person.fullname || '',
        firstname: person.firstname || '',
        lastname: person.lastname || '',
        teamName: '',
        protocolEntries: [{
          title: node.name || 'Untitled experiment',
          markdownOrHtml: node.text || '',
          isHtml: true,
          attachments
        }],
        datasetFiles: []
      });
    }

    if (experiments.length === 0) {
      warnings.push('[eln] ro-crate-metadata.json found but no Dataset nodes with genre="experiment" were present.');
    }

    return experiments;
  }

  // -------------------------------------------------------------------------
  // eLabFTW-native export zip parser
  // -------------------------------------------------------------------------

  async function parseElabftwZip(zip, detection, warnings) {
    const jsonEntry = zip.file(detection.elabftwJsonPath);
    const exportJson = JSON.parse(await jsonEntry.async('string'));
    const folderPrefix = dirOf(detection.elabftwJsonPath) ? dirOf(detection.elabftwJsonPath) + '/' : '';
    const dataArr = exportJson.data || [];

    const experiments = dataArr.map(res => {
      const referencedNames = new Set((res.uploads || []).map(u => u.real_name || u.realname).filter(Boolean));
      const attachments = (res.uploads || []).map(u => {
        const fileName = u.real_name || u.realname;
        const candidatePath = folderPrefix + fileName;
        const attachment = makeAttachment(zip, candidatePath);
        if (!attachment) {
          warnings.push(`[elabftw-zip] Upload "${fileName}" referenced in export-elabftw.json but not found in zip for "${res.title}".`);
          return null;
        }
        return attachment;
      }).filter(Boolean);

      // Note any sibling files not referenced by uploads[] (e.g. eLabFTW's
      // auto-generated PDF snapshot) — informational only, not attached.
      const siblingFiles = detection.allPaths.filter(p => p.startsWith(folderPrefix) && p !== detection.elabftwJsonPath);
      siblingFiles.forEach(p => {
        const name = p.substring(folderPrefix.length);
        if (name.includes('/') || referencedNames.has(name)) return;
        warnings.push(`[elabftw-zip] File "${name}" is not referenced in uploads[] for "${res.title}" (likely an auto-generated snapshot) — skipped as attachment.`);
      });

      const tags = (res.tags_decoded || []).map(t => t.tag).filter(Boolean);

      return {
        sourceFormat: 'elabftw-zip',
        elabid: res.elabid || res.id,
        title: res.title || 'Untitled experiment',
        tags,
        fullname: res.fullname || '',
        firstname: res.firstname || '',
        lastname: res.lastname || '',
        teamName: res.team_name || '',
        protocolEntries: [{
          title: res.title || 'Untitled experiment',
          markdownOrHtml: res.body || res.body_html || '',
          isHtml: true,
          attachments
        }],
        datasetFiles: []
      };
    });

    if (experiments.length === 0) {
      warnings.push('[elabftw-zip] export-elabftw.json found but its "data" array was empty.');
    }

    return experiments;
  }

  // -------------------------------------------------------------------------
  // Generic markdown/HTML vault parser (Obsidian-style)
  // -------------------------------------------------------------------------

  async function parseVault(zip, detection, warnings, groupingMode) {
    const { strip, paths: strippedNotePaths } = stripCommonRoot(detection.notePaths);
    const noteOriginalByStripped = {};
    strippedNotePaths.forEach((sp, i) => { noteOriginalByStripped[sp] = detection.notePaths[i]; });

    const notes = [];
    for (const strippedPath of strippedNotePaths) {
      const originalPath = noteOriginalByStripped[strippedPath];
      const entry = zip.file(originalPath);
      let raw;
      try {
        raw = await entry.async('string');
      } catch (e) {
        warnings.push(`[vault] Could not read "${originalPath}" as text — skipped (${e.message}).`);
        continue;
      }

      const isHtml = extOf(originalPath) === '.html' || extOf(originalPath) === '.htm';
      let title = basenameNoExt(strippedPath);
      let tags = [];
      let content = raw;

      if (!isHtml) {
        const { frontMatter, body } = parseYamlFrontMatter(raw);
        content = body;
        if (frontMatter.title) title = frontMatter.title;
        if (frontMatter.tags) tags = Array.isArray(frontMatter.tags) ? frontMatter.tags : [frontMatter.tags];
      }

      const refs = findAttachmentRefs(content);
      const attachments = [];
      refs.forEach(ref => {
        const resolved = resolveAttachmentPath(zip, detection.allPaths, originalPath, ref);
        if (resolved) {
          const att = makeAttachment(zip, resolved);
          if (att) attachments.push(att);
        }
      });

      notes.push({ strippedPath, title, tags, isHtml, content, attachments });
    }

    if (notes.length === 0) {
      warnings.push('[vault] No readable note files remained after filtering.');
      return [];
    }

    function toProtocolEntry(note) {
      return { title: note.title, markdownOrHtml: note.content, isHtml: note.isHtml, attachments: note.attachments };
    }

    const mode = groupingMode || 'whole-vault';

    if (mode === 'per-note') {
      return notes.map((note, i) => ({
        sourceFormat: 'vault',
        elabid: `vault-${i + 1}`,
        title: note.title,
        tags: note.tags,
        fullname: '', firstname: '', lastname: '', teamName: '',
        protocolEntries: [toProtocolEntry(note)],
        datasetFiles: []
      }));
    }

    if (mode === 'top-folder') {
      const groups = {};
      const order = [];
      notes.forEach(note => {
        const folder = topFolderOf(note.strippedPath) || '(root)';
        if (!groups[folder]) { groups[folder] = []; order.push(folder); }
        groups[folder].push(note);
      });
      return order.map((folder, i) => ({
        sourceFormat: 'vault',
        elabid: `vault-folder-${i + 1}`,
        title: folder === '(root)' ? 'Vault root notes' : folder,
        tags: [],
        fullname: '', firstname: '', lastname: '', teamName: '',
        protocolEntries: groups[folder].map(toProtocolEntry),
        datasetFiles: []
      }));
    }

    // 'whole-vault': everything becomes one experiment, one protocol per note
    return [{
      sourceFormat: 'vault',
      elabid: 'vault-1',
      title: strip ? strip.replace(/\/$/, '') : 'Imported vault',
      tags: [],
      fullname: '', firstname: '', lastname: '', teamName: '',
      protocolEntries: notes.map(toProtocolEntry),
      datasetFiles: []
    }];
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  async function detectAndParse(arrayBuffer, options) {
    const opts = options || {};
    const warnings = [];

    let zip;
    try {
      zip = await window.JSZip.loadAsync(arrayBuffer);
    } catch (e) {
      return { format: null, experiments: [], warnings, error: 'Not a valid zip archive: ' + e.message };
    }

    const totalBytes = Object.values(zip.files).reduce((sum, f) => sum + (f._data && f._data.uncompressedSize || 0), 0);
    if (totalBytes > SIZE_WARNING_BYTES) {
      warnings.push(`Uncompressed content is ${(totalBytes / 1024 / 1024).toFixed(0)}MB — large vaults may be slow or hit browser memory limits.`);
    }

    const detection = await detectFormat(zip);

    if (!detection.format) {
      return { format: null, experiments: [], warnings, error: 'No ro-crate-metadata.json, export-elabftw.json, or .md/.html note files found in this zip.' };
    }

    let experiments;
    if (detection.format === 'eln') {
      experiments = await parseEln(zip, detection, warnings);
    } else if (detection.format === 'elabftw-zip') {
      experiments = await parseElabftwZip(zip, detection, warnings);
    } else {
      experiments = await parseVault(zip, detection, warnings, opts.groupingMode);
    }

    return { format: detection.format, experiments, warnings };
  }

  window.Elab2ArcAltInputParser = {
    detectAndParse,
    // exposed for targeted testing / reuse
    _internal: { isJunkPath, extOf, parseYamlFrontMatter, findAttachmentRefs, stripCommonRoot }
  };

})(window);
