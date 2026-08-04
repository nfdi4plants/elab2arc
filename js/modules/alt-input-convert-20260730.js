// =============================================================================
// ALTERNATIVE INPUT CONVERSION + UI
// Plugin module: wires the hidden #extensionTab UI, consumes
// Elab2ArcAltInputParser output, and drives the same lower-level ISA/git
// primitives the live eLabFTW pipeline uses. Only reachable via the
// #extension URL hash — see the single additive case in softRoute().
// Never calls into, and is never called by, the live conversion pipeline.
// =============================================================================

(function (window) {
  'use strict';

  const state = {
    arrayBuffer: null,
    fileName: null,
    parseResult: null
  };

  function log(message) {
    const panel = document.getElementById('extLogPanel');
    if (!panel) { console.log('[AltInput]', message); return; }
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    panel.textContent += `[${time}] ${message}\n`;
    panel.scrollTop = panel.scrollHeight;
  }

  function notify(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    }
    log(message);
  }

  // ---------------------------------------------------------------------
  // Local, self-contained helpers (deliberately NOT shared with core.js —
  // core's equivalents live inside its DOMContentLoaded closure and are not
  // reachable from an externally-loaded script; see plan's isolation note).
  // ---------------------------------------------------------------------

  function sanitizeSegment(str, maxLen) {
    return (str || 'untitled')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, maxLen || 40) || 'untitled';
  }

  function memfsJoin(...segments) {
    return segments
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\//, '');
  }

  function ensureDir(fs, dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  }

  function mergeLlmData(results) {
    const merged = { samples: [], protocols: [] };
    results.filter(Boolean).forEach(r => {
      if (r.samples) merged.samples.push(...r.samples);
      if (r.protocols) merged.protocols.push(...r.protocols);
    });
    return (merged.samples.length || merged.protocols.length) ? merged : null;
  }

  // ---------------------------------------------------------------------
  // File selection / parsing preview
  // ---------------------------------------------------------------------

  async function handleFileSelected(file) {
    const summary = document.getElementById('extFormatSummary');
    const groupingRow = document.getElementById('extGroupingRow');
    const convertBtn = document.getElementById('extConvertBtn');
    convertBtn.disabled = true;
    groupingRow.classList.add('d-none');
    summary.innerHTML = '<span class="text-muted">Reading zip…</span>';

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      summary.innerHTML = '<span class="text-danger">Please select a .zip file.</span>';
      return;
    }

    state.fileName = file.name;
    state.arrayBuffer = await file.arrayBuffer();

    await reparse();
  }

  async function reparse() {
    if (!state.arrayBuffer) return;
    const summary = document.getElementById('extFormatSummary');
    const groupingRow = document.getElementById('extGroupingRow');
    const groupingSelect = document.getElementById('extGroupingSelect');
    const convertBtn = document.getElementById('extConvertBtn');

    const opts = { groupingMode: groupingSelect.value };
    const result = await window.Elab2ArcAltInputParser.detectAndParse(state.arrayBuffer, opts);
    state.parseResult = result;

    if (!result.format) {
      summary.innerHTML = `<span class="text-danger">${result.error || 'Unrecognized zip content.'}</span>`;
      convertBtn.disabled = true;
      groupingRow.classList.add('d-none');
      return;
    }

    const formatLabel = {
      eln: 'eLabFTW native .eln export (RO-Crate)',
      'elabftw-zip': 'eLabFTW native export zip',
      vault: 'Generic note vault (Obsidian-style)'
    }[result.format];

    groupingRow.classList.toggle('d-none', result.format !== 'vault');

    const warningsHtml = result.warnings.length
      ? `<ul class="text-warning mb-0">${result.warnings.map(w => `<li>${w}</li>`).join('')}</ul>`
      : '';
    summary.innerHTML = `<strong>${formatLabel}</strong> — ${result.experiments.length} experiment(s) detected.${warningsHtml}`;
    convertBtn.disabled = result.experiments.length === 0;
  }

  // ---------------------------------------------------------------------
  // Conversion
  // ---------------------------------------------------------------------

  async function writeProtocolEntry(fs, protocolsPath, entry, index) {
    let markdown = entry.markdownOrHtml || '';
    if (entry.isHtml) {
      markdown = window.turndownService.turndown(markdown);
    }
    const baseName = sanitizeSegment(entry.title, 60) + `_${index + 1}`;
    const filename = `${baseName}.altinput.md`;
    ensureDir(fs, protocolsPath);
    await fs.promises.writeFile(memfsJoin(protocolsPath, filename), markdown);
    return { filename, markdown, baseName };
  }

  async function writeAttachments(fs, datasetPath, attachments, seenNames) {
    ensureDir(fs, datasetPath);
    for (const att of attachments) {
      let name = att.name;
      let suffix = 1;
      while (seenNames.has(name)) {
        const dot = att.name.lastIndexOf('.');
        name = dot === -1 ? `${att.name}_${suffix}` : `${att.name.substring(0, dot)}_${suffix}${att.name.substring(dot)}`;
        suffix++;
      }
      seenNames.add(name);
      const data = await att.getData();
      await fs.promises.writeFile(memfsJoin(datasetPath, name), Buffer.from(data));
    }
  }

  async function convertExperiment(exp, index, ctx) {
    const fs = window.FS.fs;
    const assayName = sanitizeSegment(`${exp.elabid}-${exp.title}`, 60) || `experiment-${index + 1}`;
    const baseAssayPath = memfsJoin(ctx.gitRoot, 'assays', assayName);
    const protocolsPath = memfsJoin(baseAssayPath, 'protocols');
    const datasetPath = memfsJoin(baseAssayPath, 'dataset');

    log(`Converting "${exp.title}" → assays/${assayName}`);

    const seenNames = new Set();
    let protocolFilename = null;
    const llmResults = [];

    for (let i = 0; i < exp.protocolEntries.length; i++) {
      const entry = exp.protocolEntries[i];
      const written = await writeProtocolEntry(fs, protocolsPath, entry, i);
      if (i === 0) protocolFilename = written.filename;
      if (entry.attachments.length) {
        await writeAttachments(fs, datasetPath, entry.attachments, seenNames);
      }

      if (ctx.llmEnabled) {
        try {
          const llmData = await window.Elab2ArcLLM.callTogetherAI(written.markdown, false, {
            protocolFilename: written.filename,
            protocolPath: `assays/${assayName}/protocols/${written.filename}`,
            assayId: assayName
          });
          llmResults.push(llmData);
        } catch (llmError) {
          log(`LLM annotation failed for "${entry.title}": ${llmError.message}`);
        }
      }
    }
    if (exp.datasetFiles.length) {
      await writeAttachments(fs, datasetPath, exp.datasetFiles, seenNames);
    }

    const protocolInfo = window.Elab2ArcISA.extractProtocolInfo(protocolsPath);
    const datasetInfo = window.Elab2ArcISA.extractDatasetInfo(datasetPath);
    const llmData = mergeLlmData(llmResults);

    const metadata = {
      firstName: exp.firstname || '',
      familyName: exp.lastname || '',
      email: '',
      affiliation: exp.teamName || ''
    };

    await window.Elab2ArcISA.generateIsaAssayElab2arcWithDatamap(
      baseAssayPath, assayName, metadata, protocolInfo, datasetInfo, llmData
    );
    await window.Elab2ArcISA.registerAssayToInvestigation(ctx.investigation, baseAssayPath, assayName, null);

    await window.commitPush(
      ctx.datahubtoken,
      ctx.gitlabURL,
      exp.fullname || '',
      '',
      ctx.gitRoot,
      ctx.gitRoot,
      exp.elabid,
      exp.title,
      assayName,
      false,
      seenNames.size,
      baseAssayPath.replace(ctx.gitRoot, ''),
      protocolFilename,
      exp.teamName || '',
      `alt-input:${state.fileName}`,
      index,
      ctx.total,
      'experiment',
      null
    );

    log(`Done: "${exp.title}"`);
  }

  async function runConversion() {
    const convertBtn = document.getElementById('extConvertBtn');
    const result = state.parseResult;
    if (!result || !result.experiments.length) return;

    const gitlabURL = (document.getElementById('gitlabInfo').innerHTML || '').trim();
    if (!gitlabURL || gitlabURL.includes('Please select') || gitlabURL === 'GitLab URL') {
      notify('Please select a target ARC in the ARC tab first.', 'warning');
      return;
    }
    const datahubtoken = document.getElementById('datahubToken').value;
    if (!datahubtoken) {
      notify('Please set your DataHUB token in the Token tab first.', 'warning');
      return;
    }
    const llmEnabled = !!(document.getElementById('enableDatamapSwitch') || {}).checked;

    const pathParts = gitlabURL.replace(/\.git$/, '').split('/').filter(Boolean);
    const arcName = pathParts.length ? pathParts[pathParts.length - 1] : 'arc';
    const gitRoot = arcName;

    convertBtn.disabled = true;
    try {
      const fs = window.FS.fs;
      if (!fs.existsSync(gitRoot)) {
        log(`Cloning ${gitlabURL} → ${gitRoot}`);
        await window.datahubClone(gitlabURL.endsWith('.git') ? gitlabURL : gitlabURL + '.git', gitRoot, datahubtoken);
      } else {
        log(`Using already-cloned ${gitRoot}`);
      }

      const investigation = await window.Elab2ArcISA.readOrCreateInvestigation(gitRoot, arcName, {
        title: arcName,
        description: `Alternative-input import from ${state.fileName}`
      });

      const ctx = { gitlabURL, datahubtoken, gitRoot, llmEnabled, investigation, total: result.experiments.length };

      for (let i = 0; i < result.experiments.length; i++) {
        await convertExperiment(result.experiments[i], i, ctx);
      }

      await window.Elab2ArcISA.saveInvestigation(gitRoot, investigation);
      log('Saved investigation. Conversion complete.');
      notify(`Converted ${result.experiments.length} experiment(s) into ${arcName}.`, 'success');
    } catch (error) {
      console.error('[AltInput] Conversion failed:', error);
      notify('Conversion failed: ' + error.message, 'danger');
    } finally {
      convertBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // Wiring (self-contained — does not touch core.js's DOMContentLoaded)
  // ---------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('extFileInput');
    const groupingSelect = document.getElementById('extGroupingSelect');
    const convertBtn = document.getElementById('extConvertBtn');
    if (!fileInput || !convertBtn) return; // extensionTab markup not present

    fileInput.addEventListener('change', (e) => handleFileSelected(e.target.files[0]));
    groupingSelect.addEventListener('change', reparse);
    convertBtn.addEventListener('click', runConversion);
  });

  window.Elab2ArcAltInputConvert = { runConversion };

})(window);
