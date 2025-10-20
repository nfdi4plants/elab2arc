// =============================================================================
// CONVERSION METADATA MODULE
// Tracks and saves LLM conversion process data for troubleshooting
// =============================================================================

(function(window) {
  'use strict';

  /**
   * Generate a simple UUID v4
   * @returns {string} - UUID string
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Create comprehensive conversion metadata
   * @param {Object} options - All conversion data
   * @returns {Object} - Structured metadata object
   */
  function createConversionMetadata(options) {
    const {
      // Source information
      elabftw = {},

      // LLM information
      llmEnabled = false,
      llmModel = null,
      llmModelUsed = null,
      promptSections = null,
      fullPrompt = null,
      apiParams = {},
      chunkInfo = {},
      tokenInfo = {},

      // Results
      results = {},

      // File paths
      files = {},

      // Timing
      startTime = null,
      endTime = null
    } = options;

    const conversionId = generateUUID();
    const timestamp = new Date().toISOString();

    const metadata = {
      conversionId: conversionId,
      timestamp: {
        start: startTime ? new Date(startTime).toISOString() : timestamp,
        end: endTime ? new Date(endTime).toISOString() : timestamp,
        duration: endTime && startTime ? endTime - startTime : 0
      },

      source: {
        elabftw: {
          experimentId: elabftw.experimentId || '',
          title: elabftw.title || '',
          author: elabftw.author || '',
          team: elabftw.team || '',
          instance: elabftw.instance || '',
          type: elabftw.type || 'experiment' // experiment or resource
        }
      },

      llm: llmEnabled ? {
        enabled: true,
        model: llmModel || 'unknown',
        modelUsed: llmModelUsed || llmModel || 'unknown',
        prompt: {
          systemRole: promptSections?.systemRole || '',
          jsonSchema: promptSections?.jsonSchema || '',
          extractionRules: promptSections?.extractionRules || '',
          examples: promptSections?.examples || '',
          full: fullPrompt || ''
        },
        apiParams: {
          temperature: apiParams.temperature || 0.1,
          max_tokens: apiParams.max_tokens || 8192,
          stream: apiParams.stream !== undefined ? apiParams.stream : true
        },
        chunking: {
          required: chunkInfo.required || false,
          chunkCount: chunkInfo.chunkCount || 1,
          chunkSizes: chunkInfo.chunkSizes || []
        },
        tokens: {
          estimated: tokenInfo.estimated || 0,
          actual: tokenInfo.actual || 0
        }
      } : {
        enabled: false,
        reason: 'LLM datamap generation was disabled for this conversion'
      },

      results: {
        status: results.status || 'unknown',
        samplesExtracted: results.samplesExtracted || 0,
        protocolsExtracted: results.protocolsExtracted || 0,
        errors: results.errors || [],
        warnings: results.warnings || []
      },

      files: {
        protocolPath: files.protocolPath || '',
        isaPath: files.isaPath || '',
        dataFiles: files.dataFiles || []
      },

      tool: {
        name: 'elab2arc',
        version: '1.0.0',
        coreFile: 'elab2arc-core1006b.js',
        modules: [
          'llm-service1007.js',
          'conversion-metadata1000.js',
          'isa-generation.js'
        ]
      }
    };

    return metadata;
  }

  /**
   * Save metadata to ARC filesystem
   * Creates .elab2arc folder and saves metadata JSON
   * @param {Object} metadata - Metadata object
   * @param {string} assayPath - Path to assay folder
   * @returns {Promise<string>} - Path to saved metadata file
   */
  async function saveMetadataToARC(metadata, assayPath) {
    try {
      if (!window.FS || !window.FS.fs) {
        console.warn('[Metadata] memfs not available, cannot save metadata');
        return null;
      }

      const fs = window.FS.fs;

      // Create .elab2arc directory if it doesn't exist
      const metadataDir = `${assayPath}/.elab2arc`;
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
        console.log(`[Metadata] Created directory: ${metadataDir}`);
      }

      // Save primary metadata file with conversion ID
      const metadataFilename = `conversion-${metadata.conversionId}.json`;
      const metadataPath = `${metadataDir}/${metadataFilename}`;
      const metadataJSON = JSON.stringify(metadata, null, 2);

      fs.writeFileSync(metadataPath, metadataJSON);
      console.log(`[Metadata] Saved metadata to: ${metadataPath}`);

      // Also save as latest.json for easy access
      const latestPath = `${metadataDir}/latest.json`;
      fs.writeFileSync(latestPath, metadataJSON);
      console.log(`[Metadata] Saved latest metadata to: ${latestPath}`);

      // Create backup in dataset folder for visibility
      const datasetDir = `${assayPath}/dataset`;
      if (fs.existsSync(datasetDir)) {
        const backupPath = `${datasetDir}/.elab2arc-metadata.json`;
        fs.writeFileSync(backupPath, metadataJSON);
        console.log(`[Metadata] Saved backup metadata to: ${backupPath}`);
      }

      return metadataPath;

    } catch (error) {
      console.error('[Metadata] Error saving metadata:', error);
      return null;
    }
  }

  /**
   * Load conversion history for an assay
   * @param {string} assayPath - Path to assay folder
   * @returns {Array<Object>} - Array of metadata objects
   */
  function loadConversionHistory(assayPath) {
    try {
      if (!window.FS || !window.FS.fs) {
        console.warn('[Metadata] memfs not available');
        return [];
      }

      const fs = window.FS.fs;
      const metadataDir = `${assayPath}/.elab2arc`;

      if (!fs.existsSync(metadataDir)) {
        return [];
      }

      const files = fs.readdirSync(metadataDir);
      const metadataFiles = files.filter(f => f.startsWith('conversion-') && f.endsWith('.json'));

      const history = metadataFiles.map(filename => {
        try {
          const filePath = `${metadataDir}/${filename}`;
          const content = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(content);
        } catch (error) {
          console.error(`[Metadata] Error loading ${filename}:`, error);
          return null;
        }
      }).filter(m => m !== null);

      // Sort by timestamp (newest first)
      history.sort((a, b) => new Date(b.timestamp.start) - new Date(a.timestamp.start));

      return history;

    } catch (error) {
      console.error('[Metadata] Error loading conversion history:', error);
      return [];
    }
  }

  /**
   * Load the latest conversion metadata
   * @param {string} assayPath - Path to assay folder
   * @returns {Object|null} - Latest metadata object or null
   */
  function loadLatestMetadata(assayPath) {
    try {
      if (!window.FS || !window.FS.fs) {
        return null;
      }

      const fs = window.FS.fs;
      const latestPath = `${assayPath}/.elab2arc/latest.json`;

      if (!fs.existsSync(latestPath)) {
        return null;
      }

      const content = fs.readFileSync(latestPath, 'utf8');
      return JSON.parse(content);

    } catch (error) {
      console.error('[Metadata] Error loading latest metadata:', error);
      return null;
    }
  }

  /**
   * Export metadata as downloadable JSON
   * @param {Object} metadata - Metadata object
   * @returns {string} - Data URL for download
   */
  function exportMetadataAsJSON(metadata) {
    try {
      const json = JSON.stringify(metadata, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('[Metadata] Error exporting metadata:', error);
      return null;
    }
  }

  /**
   * Find conversion metadata by experiment ID
   * Searches all assays in the ARC
   * @param {string} elabId - eLabFTW experiment ID
   * @param {string} arcRoot - Root path of ARC
   * @returns {Array<Object>} - Array of matching metadata objects
   */
  function findConversionByExperimentId(elabId, arcRoot) {
    try {
      if (!window.FS || !window.FS.fs) {
        return [];
      }

      const fs = window.FS.fs;
      const results = [];

      // Recursively search for .elab2arc folders
      function searchDirectory(dirPath) {
        try {
          if (!fs.existsSync(dirPath)) return;

          const entries = fs.readdirSync(dirPath);

          for (const entry of entries) {
            const fullPath = `${dirPath}/${entry}`;
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              if (entry === '.elab2arc') {
                // Found metadata directory, check files
                const metadataFiles = fs.readdirSync(fullPath);
                for (const file of metadataFiles) {
                  if (file.startsWith('conversion-') && file.endsWith('.json')) {
                    try {
                      const content = fs.readFileSync(`${fullPath}/${file}`, 'utf8');
                      const metadata = JSON.parse(content);
                      if (metadata.source?.elabftw?.experimentId === elabId) {
                        results.push(metadata);
                      }
                    } catch (e) {
                      console.error(`[Metadata] Error reading ${file}:`, e);
                    }
                  }
                }
              } else if (!entry.startsWith('.')) {
                // Recurse into subdirectories (skip hidden folders except .elab2arc)
                searchDirectory(fullPath);
              }
            }
          }
        } catch (error) {
          console.error(`[Metadata] Error searching ${dirPath}:`, error);
        }
      }

      searchDirectory(arcRoot);
      return results;

    } catch (error) {
      console.error('[Metadata] Error finding conversion:', error);
      return [];
    }
  }

  /**
   * Validate metadata structure
   * @param {Object} metadata - Metadata object to validate
   * @returns {Object} - Validation result with issues array
   */
  function validateMetadata(metadata) {
    const issues = [];

    if (!metadata) {
      issues.push({ severity: 'error', message: 'Metadata is null or undefined' });
      return { valid: false, issues };
    }

    // Check required fields
    if (!metadata.conversionId) {
      issues.push({ severity: 'error', message: 'Missing conversionId' });
    }
    if (!metadata.timestamp?.start) {
      issues.push({ severity: 'error', message: 'Missing start timestamp' });
    }
    if (!metadata.source?.elabftw?.experimentId) {
      issues.push({ severity: 'warning', message: 'Missing eLabFTW experiment ID' });
    }

    // Check LLM data if enabled
    if (metadata.llm?.enabled) {
      if (!metadata.llm.model) {
        issues.push({ severity: 'warning', message: 'Missing LLM model name' });
      }
      if (!metadata.llm.prompt?.full) {
        issues.push({ severity: 'error', message: 'Missing full prompt text' });
      }
      if (metadata.llm.tokens?.estimated === 0) {
        issues.push({ severity: 'info', message: 'Token count not estimated' });
      }
    }

    // Check results
    if (metadata.llm?.enabled && metadata.results?.samplesExtracted === 0 && metadata.results?.protocolsExtracted === 0) {
      issues.push({ severity: 'warning', message: 'No samples or protocols extracted by LLM' });
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues: issues
    };
  }

  /**
   * Generate a troubleshooting report
   * @param {Object} metadata - Metadata object
   * @returns {string} - Formatted report text
   */
  function generateTroubleshootingReport(metadata) {
    const validation = validateMetadata(metadata);

    let report = `# elab2ARC Conversion Troubleshooting Report\n\n`;
    report += `## Conversion ID: ${metadata.conversionId}\n`;
    report += `## Date: ${new Date(metadata.timestamp?.start).toLocaleString()}\n`;
    report += `## Duration: ${(metadata.timestamp?.duration / 1000).toFixed(2)}s\n\n`;

    report += `## Source\n`;
    report += `- **Experiment ID**: ${metadata.source?.elabftw?.experimentId}\n`;
    report += `- **Title**: ${metadata.source?.elabftw?.title}\n`;
    report += `- **Author**: ${metadata.source?.elabftw?.author}\n`;
    report += `- **Instance**: ${metadata.source?.elabftw?.instance}\n\n`;

    if (metadata.llm?.enabled) {
      report += `## LLM Configuration\n`;
      report += `- **Model**: ${metadata.llm.model}\n`;
      report += `- **Model Used**: ${metadata.llm.modelUsed}\n`;
      report += `- **Temperature**: ${metadata.llm.apiParams?.temperature}\n`;
      report += `- **Max Tokens**: ${metadata.llm.apiParams?.max_tokens}\n`;
      report += `- **Chunking**: ${metadata.llm.chunking?.required ? 'Yes' : 'No'}\n`;
      if (metadata.llm.chunking?.required) {
        report += `- **Chunk Count**: ${metadata.llm.chunking.chunkCount}\n`;
      }
      report += `- **Tokens Estimated**: ${metadata.llm.tokens?.estimated}\n\n`;
    }

    report += `## Results\n`;
    report += `- **Status**: ${metadata.results?.status}\n`;
    report += `- **Samples Extracted**: ${metadata.results?.samplesExtracted}\n`;
    report += `- **Protocols Extracted**: ${metadata.results?.protocolsExtracted}\n`;

    if (metadata.results?.errors?.length > 0) {
      report += `\n### Errors\n`;
      metadata.results.errors.forEach((err, i) => {
        report += `${i + 1}. ${err}\n`;
      });
    }

    if (metadata.results?.warnings?.length > 0) {
      report += `\n### Warnings\n`;
      metadata.results.warnings.forEach((warn, i) => {
        report += `${i + 1}. ${warn}\n`;
      });
    }

    report += `\n## Validation\n`;
    report += `- **Valid**: ${validation.valid ? 'Yes' : 'No'}\n`;
    if (validation.issues.length > 0) {
      report += `\n### Issues\n`;
      validation.issues.forEach((issue, i) => {
        report += `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.message}\n`;
      });
    }

    report += `\n## Files Generated\n`;
    report += `- **Protocol**: ${metadata.files?.protocolPath}\n`;
    report += `- **ISA File**: ${metadata.files?.isaPath}\n`;
    if (metadata.files?.dataFiles?.length > 0) {
      report += `- **Data Files**: ${metadata.files.dataFiles.length} file(s)\n`;
    }

    report += `\n## Tool Version\n`;
    report += `- **Name**: ${metadata.tool?.name}\n`;
    report += `- **Version**: ${metadata.tool?.version}\n`;
    report += `- **Core File**: ${metadata.tool?.coreFile}\n`;

    report += `\n---\n*Generated by elab2ARC Metadata Module*\n`;

    return report;
  }

  // Export public API
  window.Elab2ArcMetadata = {
    createConversionMetadata: createConversionMetadata,
    saveMetadataToARC: saveMetadataToARC,
    loadConversionHistory: loadConversionHistory,
    loadLatestMetadata: loadLatestMetadata,
    exportMetadataAsJSON: exportMetadataAsJSON,
    findConversionByExperimentId: findConversionByExperimentId,
    validateMetadata: validateMetadata,
    generateTroubleshootingReport: generateTroubleshootingReport,
    generateUUID: generateUUID
  };

})(window);
