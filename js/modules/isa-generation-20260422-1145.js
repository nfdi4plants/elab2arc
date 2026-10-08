// =============================================================================
// ISA GENERATION MODULE
// Handles ISA-Tab file generation using ARCtrl library
// =============================================================================

(function(window) {
  'use strict';

  // Use global memfsPathJoin from elab2arc-core1209.js
  // This function is available after core module loads
  // Path joining strips leading slashes for memfs compatibility

  /**
   * Helper: Safely convert any value to a string for ISA tables
   * Handles objects, arrays, null, undefined, and primitives
   * @param {any} value - Value to convert
   * @returns {string} - String representation
   */
  function safeString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === 'object') {
      // For arrays, join with comma; for objects, JSON stringify
      if (Array.isArray(value)) {
        return value.map(v => safeString(v)).join(', ');
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Recursively list files under a directory, as paths relative to it.
   * Used to validate LLM-extracted "data file" references against what
   * actually exists on disk before writing them into an ISA table.
   *
   * @param {object} fs - Filesystem object (memfs)
   * @param {string} dirPath - Directory to scan
   * @returns {string[]} - Relative file paths (forward-slash separated)
   */
  function listFilesRecursive(fs, dirPath) {
    const results = [];
    function walk(currentPath, relPrefix) {
      let entries;
      try {
        entries = fs.readdirSync(currentPath);
      } catch (e) {
        return;
      }
      entries.forEach(name => {
        const full = window.memfsPathJoin(currentPath, name);
        const rel = relPrefix ? `${relPrefix}/${name}` : name;
        let stats;
        try {
          stats = fs.statSync(full);
        } catch (e) {
          return;
        }
        if (stats.isDirectory()) {
          walk(full, rel);
        } else {
          results.push(rel);
        }
      });
    }
    walk(dirPath, '');
    return results;
  }

  /**
   * Reject values that can never be a real committed file: URLs/URIs (e.g.
   * eLabFTW notes describing an external "smb://..." data location) and
   * glob patterns (e.g. LLM-extracted "*.fastq") - both have been observed
   * in LLM-extracted dataFiles output and, written verbatim into an ISA
   * "Output [Data]" cell, make downstream tools (arc-export) fail trying to
   * resolve them as literal files.
   *
   * @param {string} value
   * @returns {boolean}
   */
  function isPlausibleDataFileName(value) {
    const v = (value || '').trim();
    if (!v) return false;
    if (v.includes('://')) return false;
    if (v.includes('*') || v.includes('?')) return false;
    return true;
  }

  /**
   * Resolve an LLM-extracted "data file" value against the real files
   * present in the assay/study's data folder, returning a path relative to
   * that folder (never prefixed with "dataset/"/"resources/" - the ISA
   * consumer, e.g. arc-export, already resolves Output [Data] values
   * relative to that folder itself; prefixing here double-prefixes).
   *
   * @param {string} value - Raw LLM-extracted value
   * @param {Set<string>|null} realFiles - Real relative file paths under the
   *   data folder, or null if no manifest is available (falls back to a
   *   plausibility-only check)
   * @returns {string|null} - Resolved relative path, or null if the value
   *   doesn't correspond to any real file / isn't plausibly a filename
   */
  function resolveDataFileReference(value, realFiles) {
    const v = (value || '').trim();
    if (!isPlausibleDataFileName(v)) return null;
    const stripped = v.replace(/^\.*\/+/, '').replace(/^(dataset|resources)\//, '');
    if (!realFiles) {
      return stripped;
    }
    if (realFiles.has(stripped)) return stripped;
    const base = stripped.split('/').pop();
    const match = Array.from(realFiles).find(f => f.split('/').pop() === base);
    return match || null;
  }

  /**
   * Analyze ARC directory structure
   * @param {string} gitRoot - Root directory of ARC
   * @returns {Object} - Structure with studies and assays arrays
   */
  function analyzeArcStructure(gitRoot) {
    try {
      const structure = { studies: [], assays: [] };
      const fs = window.FS.fs;

      // Check for studies folder
      const studiesPath = window.memfsPathJoin(gitRoot, 'studies');
      if (fs.existsSync(studiesPath)) {
        const studyDirs = fs.readdirSync(studiesPath);
        studyDirs.forEach(studyName => {
          const studyPath = window.memfsPathJoin(studiesPath, studyName);
          const stats = fs.statSync(studyPath);
          if (stats.isDirectory() && !studyName.startsWith('.')) {
            structure.studies.push({ name: studyName, path: studyPath });
          }
        });
      }

      // Check for assays folder
      const assaysPath = window.memfsPathJoin(gitRoot, 'assays');
      if (fs.existsSync(assaysPath)) {
        const assayDirs = fs.readdirSync(assaysPath);
        assayDirs.forEach(assayName => {
          const assayPath = window.memfsPathJoin(assaysPath, assayName);
          const stats = fs.statSync(assayPath);
          if (stats.isDirectory() && !assayName.startsWith('.')) {
            structure.assays.push({ name: assayName, path: assayPath });
          }
        });
      }

      return structure;
    } catch (error) {
      console.error('Error analyzing ARC structure:', error);
      return { studies: [], assays: [] };
    }
  }

  /**
   * Extract sample names and dataset info from assay dataset folder
   * @param {string} datasetPath - Path to dataset directory
   * @returns {Object} - Dataset info with samples and files arrays
   */
  function extractDatasetInfo(datasetPath) {
    try {
      const info = { samples: [], files: [] };
      const fs = window.FS.fs;

      if (!fs.existsSync(datasetPath)) {
        return info;
      }

      const files = fs.readdirSync(datasetPath);
      files.forEach(file => {
        if (file.endsWith('.csv') || file.endsWith('.tsv') || file.endsWith('.txt')) {
          info.files.push(file);
        }
      });

      // Try to read README.md for sample information
      const readmePath = window.memfsPathJoin(datasetPath, 'README.md');
      if (fs.existsSync(readmePath)) {
        const readmeContent = fs.readFileSync(readmePath, 'utf8');
        // Extract sample names from README (simple pattern matching)
        const sampleMatches = readmeContent.match(/sample[:\s]+([^\n]+)/gi);
        if (sampleMatches) {
          info.samples = sampleMatches.map(m => m.replace(/sample[:\s]+/i, '').trim());
        }
      }

      return info;
    } catch (error) {
      console.error('Error extracting dataset info:', error);
      return { samples: [], files: [] };
    }
  }

  /**
   * Extract protocol information from protocol markdown files
   * @param {string} protocolPath - Path to protocols directory
   * @returns {Object} - Protocol info with title, description, and files
   */
  function extractProtocolInfo(protocolPath) {
    try {
      const info = { title: '', description: '', files: [] };
      const fs = window.FS.fs;

      if (!fs.existsSync(protocolPath)) {
        return info;
      }

      const files = fs.readdirSync(protocolPath);
      const mdFiles = files.filter(file => file.endsWith('.md'));

      if (mdFiles.length > 0) {
        info.files = mdFiles;
        // Use first file name as title (without .md extension)
        info.title = mdFiles[0].replace('.md', '');
        // Create description referencing all protocol files
        if (mdFiles.length === 1) {
          info.description = `See details in: ${mdFiles[0]}`;
        } else {
          info.description = `See details in: ${mdFiles.join(', ')}`;
        }
      }

      return info;
    } catch (error) {
      console.error('Error extracting protocol info:', error);
      return { title: '', description: '', files: [] };
    }
  }

  /**
   * Create an ARCtrl Person from named fields.
   *
   * ARCtrl 3's positional signature is
   *   Person.create(orcid, lastName, firstName, midInitials, email, phone, fax,
   *                 address, affiliation, roles, comments)
   * (ARCtrl src/Core/Person.fs and its own JS test). Every elab2arc call used to pass
   * firstName before lastName, which swapped the two names in every generated ISA file.
   * All Person creation goes through this helper so the order can't be mixed up at a
   * call site again. Empty-string fallbacks avoid ARCtrl 3's GetHashCode TypeError on
   * undefined values (see CLAUDE.md, "ARCtrl 3.0.1 Migration Notes").
   *
   * @param {Object} fields - { orcid, firstName, lastName, midInitials, email, phone, fax,
   *   address, affiliation, roles, comments }
   * @returns {Person}
   */
  function createPerson({ orcid, firstName, lastName, midInitials, email, phone, fax, address,
                          affiliation, roles = [], comments = [] } = {}) {
    return window.arctrl.Person.create(
      orcid,
      lastName || '',
      firstName || '',
      midInitials,
      email || '',
      phone, fax, address,
      affiliation || '',
      roles,
      comments
    );
  }

  /**
   * Repair contacts written by elab2arc before the name-order fix: a contact that is
   * exactly the swapped form of the given person (FirstName === lastName and
   * LastName === firstName) gets its names swapped back, in place. Only exact swapped
   * pairs of the given person are touched; every other contact is left unchanged.
   * Assay and study files heal by themselves because they are fully rewritten on every
   * conversion; the investigation is read and saved back, so it needs this repair.
   *
   * @param {Person[]} contacts - ARCtrl Person list (e.g. investigation.Contacts)
   * @param {string} firstName
   * @param {string} lastName
   * @returns {number} number of repaired contacts
   */
  function repairSwappedContacts(contacts, firstName, lastName) {
    if (!contacts || !firstName || !lastName || firstName === lastName) return 0;
    let repaired = 0;
    for (const contact of contacts) {
      if (contact.FirstName === lastName && contact.LastName === firstName) {
        contact.FirstName = firstName;
        contact.LastName = lastName;
        repaired++;
      }
    }
    return repaired;
  }

  /**
   * Merge and deduplicate contacts list
   * @param {Array} contactsList - Array of contact objects
   * @returns {Array} - Deduplicated contacts
   */
  function mergeContactsUnique(contactsList) {
    const seen = new Set();
    return contactsList.filter(contact => {
      const key = JSON.stringify({ firstName: contact.firstName, lastName: contact.lastName, email: contact.email });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate isa.assay.xlsx for an assay (simple version with ExcelJS)
   * Uses ExcelJS to create a simple ISA assay file
   * @param {string} assayPath - Path to assay directory
   * @param {string} assayName - Assay identifier
   * @param {Object} metadata - Metadata object with user info
   * @returns {Promise<string>} - Path to generated file
   */
  async function generateIsaAssay(assayPath, assayName, metadata = {}) {
    try {
      console.log(`[ISA Gen] Generating ISA assay for: ${assayName}`);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('isa_assay');

      // Extract dataset and protocol information
      const datasetPath = window.memfsPathJoin(assayPath, 'dataset');
      const protocolPath = window.memfsPathJoin(assayPath, 'protocols');
      const datasetInfo = extractDatasetInfo(datasetPath);
      const protocolInfo = extractProtocolInfo(protocolPath);

      // Build basic assay metadata table
      const metadataRows = [
        ['ASSAY'],
        ['Assay Measurement Type', metadata.measurementType || ''],
        ['Assay Measurement Type Term Accession Number', ''],
        ['Assay Measurement Type Term Source REF', ''],
        ['Assay Technology Type', metadata.technologyType || ''],
        ['Assay Technology Type Term Accession Number', ''],
        ['Assay Technology Type Term Source REF', ''],
        ['Assay Technology Platform', metadata.platform || ''],
        ['Assay File Name', `isa.assay.xlsx`],
        [],
        ['ASSAY PERFORMERS'],
        ['Assay Performer Last Name', metadata.lastName || ''],
        ['Assay Performer First Name', metadata.firstName || ''],
        ['Assay Performer Email', metadata.email || ''],
        ['Assay Performer Affiliation', metadata.affiliation || ''],
        [],
        ['ASSAY PROTOCOL'],
        ['Protocol Name', protocolInfo.title || assayName],
        ['Protocol Description', protocolInfo.description || ''],
        ['Protocol Files', protocolInfo.files.join(', ')],
        [],
        ['ASSAY DATA'],
        ['Dataset Files', datasetInfo.files.join(', ')],
        ['Number of Samples', datasetInfo.samples.length.toString()],
      ];

      metadataRows.forEach(row => worksheet.addRow(row));

      // Write the file
      const buffer = await workbook.xlsx.writeBuffer();
      const uint8Array = new Uint8Array(buffer);
      const isaPath = window.memfsPathJoin(assayPath, 'isa.assay.xlsx');
      window.FS.fs.writeFileSync(isaPath, uint8Array);

      console.log(`[ISA Gen] Created: ${isaPath}`);
      return isaPath;

    } catch (error) {
      console.error(`[ISA Gen] Error generating ISA assay for ${assayName}:`, error);
      return null;
    }
  }

  /**
   * Helper: Create sample table from LLM-extracted sample data
   * @param {Array} samples - Array of sample objects from LLM
   * @returns {ArcTable} - Sample table
   */
  function createSampleTable(samples) {
    try {
      const sampleTable = window.arctrl.ArcTable.init("samples");

      console.log(`[ISA Elab2Arc] Creating sample table with ${samples?.length || 0} sample(s)`);

      if (!samples || samples.length === 0) {
        // Create minimal sample table
        sampleTable.AddColumn(
          window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
          [window.arctrl.CompositeCell.createFreeText("Sample_1")]
        );
        sampleTable.AddColumn(
          window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample()),
          [window.arctrl.CompositeCell.createFreeText("Sample_1")]
        );
        console.log(`  - Created default sample table with 1 sample`);
        return sampleTable;
      }

      // Add Source Name column (sample names)
      const sourceHeader = window.arctrl.CompositeHeader.input(window.arctrl.IOType.source());
      const sourceCells = samples.map(s => window.arctrl.CompositeCell.createFreeText(s.name || "Sample"));
      sampleTable.AddColumn(sourceHeader, sourceCells);
      console.log(`  - Added ${samples.length} source names`);

      // Add Organism column if any sample has organism info
      const hasOrganism = samples.some(s => s.organism && safeString(s.organism).trim() !== '');
      if (hasOrganism) {
        const organismOA = new window.arctrl.OntologyAnnotation("Organism", "", "");
        const organismHeader = window.arctrl.CompositeHeader.characteristic(organismOA);
        const organismCells = samples.map(s => {
          // Characteristic columns require Term cells (OntologyAnnotation), not FreeText
          const organismValue = safeString(s.organism);
          if (organismValue.trim() === '') {
            return window.arctrl.CompositeCell.createTerm(new window.arctrl.OntologyAnnotation("", "", ""));
          }
          return window.arctrl.CompositeCell.createTerm(new window.arctrl.OntologyAnnotation(organismValue, "", ""));
        });
        sampleTable.AddColumn(organismHeader, organismCells);
        console.log(`  - Added organism column`);
      }

      // Collect all unique characteristic categories across all samples
      const charCategories = new Set();
      samples.forEach(sample => {
        if (sample.characteristics) {
          sample.characteristics.forEach(char => {
            if (char.category) {
              charCategories.add(char.category);
            }
          });
        }
      });

      // Add a column for each characteristic category
      charCategories.forEach(category => {
        // Get the first characteristic with this category to extract term source info for header
        const firstChar = samples.find(s => s.characteristics?.some(c => c.category === category))
          ?.characteristics?.find(c => c.category === category);

        const termSource = firstChar?.termSource || "";
        const termAccession = firstChar?.termAccession || "";
        const charOA = new window.arctrl.OntologyAnnotation(category, termSource, termAccession);
        const charHeader = window.arctrl.CompositeHeader.characteristic(charOA);

        const charCells = samples.map(sample => {
          // Find the characteristic value for this category in this sample
          const char = sample.characteristics?.find(c => c.category === category);

          const charValueStr = safeString(char?.value);
          if (!char || charValueStr.trim() === '') {
            return window.arctrl.CompositeCell.createTerm(new window.arctrl.OntologyAnnotation("", "", ""));
          }

          // Characteristic columns are term columns - values must be OntologyAnnotations
          // If LLM provided term source/accession, use them; otherwise leave empty
          const valueTermSource = safeString(char.termSource);
          const valueTermAccession = safeString(char.termAccession);

          // Check if unit is provided
          const unitStr = safeString(char.unit);
          if (unitStr.trim() !== '') {
            // Create unitized cell with OntologyAnnotation for unit
            const unitOA = new window.arctrl.OntologyAnnotation(unitStr, "", "");
            return window.arctrl.CompositeCell.createUnitized(charValueStr, unitOA);
          }

          // Create term cell with OntologyAnnotation (free text converted to OA with empty terms)
          const valueOA = new window.arctrl.OntologyAnnotation(charValueStr, valueTermSource, valueTermAccession);
          return window.arctrl.CompositeCell.createTerm(valueOA);
        });
        sampleTable.AddColumn(charHeader, charCells);
        console.log(`  - Added characteristic: ${category} (${termSource || 'no term source'})`);
      });

      // Every table ends with an output: the samples themselves, chaining into
      // the first process table's Input [Source Name]
      const outputHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample());
      const outputCells = samples.map(s => window.arctrl.CompositeCell.createFreeText(s.name || "Sample"));
      sampleTable.AddColumn(outputHeader, outputCells);

      return sampleTable;
    } catch (error) {
      console.error('[ISA Elab2Arc] Error creating sample table:', error);
      // Return minimal fallback table
      const fallbackTable = window.arctrl.ArcTable.init("samples");
      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
        [window.arctrl.CompositeCell.createFreeText("Sample_1")]
      );
      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample()),
        [window.arctrl.CompositeCell.createFreeText("Sample_1")]
      );
      return fallbackTable;
    }
  }

  /**
   * Helper: Create default process table when no LLM data available
   * @param {Object} protocolInfo - Protocol file information (optional)
   * @returns {ArcTable} - Default process table
   */
  function createDefaultProcessTable(protocolInfo = null) {
    const processTable = window.arctrl.ArcTable.init("process nr. 1");

    // Minimal structure: Input -> Protocol -> Output
    processTable.AddColumn(
      window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
      [window.arctrl.CompositeCell.createFreeText("Sample")]
    );

    // Use protocol file path if available, otherwise use generic name
    let protocolRefValue = "Main Protocol";
    if (protocolInfo && protocolInfo.files && protocolInfo.files.length > 0) {
      const protocolFileName = protocolInfo.files[0];
      protocolRefValue = `protocols/${protocolFileName}`;
      console.log(`[ISA Elab2Arc] Using protocol file: ${protocolRefValue}`);
    }

    processTable.AddColumn(
      window.arctrl.CompositeHeader.protocolREF(),
      [window.arctrl.CompositeCell.createFreeText(protocolRefValue)]
    );

    processTable.AddColumn(
      window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample()),
      [window.arctrl.CompositeCell.createFreeText("Result")]
    );

    console.log(`[ISA Elab2Arc] Created default process table`);
    return processTable;
  }

  /**
   * Reconcile a protocol's inputs/outputs/dataFiles arrays to one common row
   * count, padding any shorter array by repeating its last entry.
   *
   * Rule 6 in the LLM prompt (one-to-many/many-to-one transformations) tells
   * the model to repeat whichever side is shorter so inputs.length always
   * equals outputs.length - but that's guidance to a stochastic model, not a
   * hard constraint, and llmData cached from before rule 6 existed can still
   * be replayed (e.g. "Using pre-captured graph PNG from cache" in
   * elab2arc-core20260504.js reuses old data without re-running the LLM).
   * Without this reconciliation, createProcessTable() below fed mismatched
   * arrays straight into ArcTable.AddColumn(), which either throws (caught
   * by this function's own outer try/catch, silently discarding the ENTIRE
   * process table - not just the one bad column) or hands ARCtrl columns of
   * different lengths, producing an xlsx row that has an input cell but no
   * matching output cell - the "not all output has input" symptom seen on a
   * real converted assay.
   *
   * Exposed on window.Elab2ArcISA so elab2arc-core20260504.js's graph
   * renderers can reconcile the exact same way before drawing input/output
   * edges - the xlsx table and the graph must never disagree about which
   * input produced which output.
   *
   * Parameter values are per row too: `parameters[k].value` is either one
   * value for every row, or an array with one entry per row (e.g. the OD
   * measured for each culture). paramValues[k] is that column, rowCount
   * strings long. A 1-entry array is broadcast; an array of any other length
   * is not a per-row column (e.g. an LLM listing several values for a single
   * row) and is written joined, on every row, as before per-row values.
   * @param {Object} protocol - Protocol object with inputs/outputs/dataFiles/parameters
   * @returns {{rowCount:number, inputs:string[], outputs:string[], dataFiles:string[]|null, paramValues:string[][], mismatched:boolean}}
   */
  function reconcileProtocolIO(protocol) {
    const inputs = (protocol.inputs || []).slice();
    const outputs = (protocol.outputs || []).slice();
    const hasDataFilesField = Array.isArray(protocol.dataFiles);
    const dataFiles = hasDataFilesField ? protocol.dataFiles.slice() : null;

    const rowCount = Math.max(
      inputs.length,
      outputs.length,
      dataFiles ? dataFiles.length : 0,
      1
    );

    const padToLength = (arr, label) => {
      if (arr.length === 0 || arr.length === rowCount) return arr;
      const padded = arr.slice(0, rowCount);
      const lastValue = arr[arr.length - 1];
      while (padded.length < rowCount) padded.push(lastValue);
      console.warn(
        `[IO Reconcile] Protocol "${protocol.name || 'unnamed'}": ${label} had ${arr.length} entr${arr.length === 1 ? 'y' : 'ies'}, ` +
        `expected ${rowCount} - padded by repeating the last entry ("${lastValue}").`
      );
      return padded;
    };

    const paramValues = (protocol.parameters || []).map(param => {
      const value = param ? param.value : undefined;
      if (Array.isArray(value) && (value.length === rowCount || value.length === 1)) {
        return value.length === rowCount ? value.map(safeString) : Array(rowCount).fill(safeString(value[0]));
      }
      if (Array.isArray(value) && value.length > 1) {
        console.warn(
          `[IO Reconcile] Protocol "${protocol.name || 'unnamed'}": parameter "${safeString(param.name)}" has ${value.length} values ` +
          `for ${rowCount} row(s) - not per-row, written joined on every row.`
        );
      }
      return Array(rowCount).fill(safeString(value));
    });

    return {
      rowCount,
      inputs: padToLength(inputs, 'inputs'),
      outputs: padToLength(outputs, 'outputs'),
      dataFiles: dataFiles ? padToLength(dataFiles, 'dataFiles') : null,
      paramValues,
      mismatched: (inputs.length > 0 && inputs.length !== rowCount) ||
                  (outputs.length > 0 && outputs.length !== rowCount) ||
                  (dataFiles !== null && dataFiles.length > 0 && dataFiles.length !== rowCount)
    };
  }

  /**
   * Resolve every protocol's inputs against the materials that exist
   * upstream of it, WITHOUT assuming the protocols form one linear chain.
   *
   * The previous rule ("if protocol i's input set differs from protocol
   * i-1's outputs, replace the inputs with those outputs") silently
   * corrupted any entry with more than one chain - e.g. a reagent
   * preparation or a sequencing side-protocol listed after a culture chain
   * got the culture outputs as its inputs, and a step that consumes only
   * part of the previous outputs (only Library 1 of 2 is sequenced) gained
   * fabricated rows. Verified against real golden-standard data
   * (eLabFTW 63609: 58 overwritten cells; 85318: one invented row).
   *
   * Per input value (row r of protocol i), in order:
   *   1. kept if it is a known material: a sample name, an output of any
   *      earlier protocol, or an output of an earlier row of protocol i
   *      itself (serial dilutions inside one table);
   *   2. otherwise, if exactly one known material matches it after
   *      normalisation (case, whitespace/punctuation, plural "s") it is
   *      replaced by that material - this repairs the LLM phrasing
   *      differences the old rule was written for ("Trimmed read" vs
   *      "Trimmed reads"), preferring the previous protocol's outputs;
   *   3. otherwise kept unchanged: a new starting material (e.g. "Glucose").
   * A protocol with NO inputs still inherits the previous protocol's
   * outputs, repeated to match its own output count when that count is a
   * whole multiple (the rule-6 one-to-many convention).
   *
   * Non-mutating. Used by both the xlsx generation and the graph renderers
   * in elab2arc-core, so the table and the graph always agree.
   *
   * @param {{samples?: Object[], protocols?: Object[]}} llmData
   * @returns {string[][]} resolved inputs, one array per protocol
   */
  function resolveProtocolInputs(llmData) {
    const protocols = (llmData && llmData.protocols) || [];
    const normalise = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
    const known = new Set(((llmData && llmData.samples) || []).map(s => s && s.name).filter(Boolean));

    const uniqueNormalisedMatch = (value, candidates) => {
      const key = normalise(value);
      const hits = [...new Set(candidates)].filter(c => normalise(c) === key);
      return hits.length === 1 ? hits[0] : null;
    };

    return protocols.map((protocol, i) => {
      const inputs = (protocol.inputs || []).slice();
      const outputs = protocol.outputs || [];
      const prevOutputs = i > 0 ? (protocols[i - 1].outputs || []) : [];
      let resolved;

      if (inputs.length === 0 && prevOutputs.length > 0) {
        resolved = (outputs.length > 0 && outputs.length % prevOutputs.length === 0)
          ? prevOutputs.flatMap(name => Array(outputs.length / prevOutputs.length).fill(name))
          : prevOutputs.slice();
      } else {
        resolved = inputs.map((value, row) => {
          if (known.has(value) || outputs.slice(0, row).includes(value)) return value;
          return uniqueNormalisedMatch(value, prevOutputs)
            || uniqueNormalisedMatch(value, [...known])
            || value;
        });
      }
      outputs.forEach(o => known.add(o));
      return resolved;
    });
  }

  /**
   * Helper: Excel-safe, unique table name from the protocol name (sheet names are
   * limited to 31 chars and may not contain : \ / ? * [ ]). Falls back to
   * "process nr. N" when the protocol has no usable name.
   * @param {string} protocolName
   * @param {number} processNr
   * @param {Set<string>} used - lower-cased names already taken (seeded with "samples")
   * @returns {string}
   */
  function uniqueTableName(protocolName, processNr, used) {
    let base = safeString(protocolName).trim()
      .replace(/[\\/?*[\]:]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!base) base = `process nr. ${processNr}`;
    if (base.length > 31) base = base.slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = `_${n}`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  }

  /**
   * Helper: Create a process table from LLM-extracted protocol data
   * @param {Object} protocol - Protocol object with inputs, parameters, outputs
   * @param {number} processNr - Process number for naming
   * @param {Object} protocolInfo - Protocol file information (optional)
   * @param {Set<string>|null} datasetFiles - Real relative file paths under the
   *   assay/study's data folder (dataset/ or resources/), used to validate
   *   LLM-extracted "data file" output values before writing them into the
   *   ISA table. Pass null if no manifest is available.
   * @param {Set<string>|null} upstreamOutputs - Names of every output of the
   *   protocols that come before this one in llmData.protocols. When every
   *   input of this protocol is such an output, the input column is
   *   Input [Sample Name] (a chained step); otherwise Input [Source Name]
   *   (starting materials). Pass null to always get Source.
   * @param {string|null} tableName - Table/sheet name; defaults to "process nr. N".
   * @returns {ArcTable} - Process table
   */
  function createProcessTable(protocol, processNr, protocolInfo = null, datasetFiles = null, upstreamOutputs = null, tableName = null) {
    try {
      tableName = tableName || `process nr. ${processNr}`;
      const processTable = window.arctrl.ArcTable.init(tableName);

      console.log(`[ISA Elab2Arc] Creating process table "${tableName}" for: ${protocol?.name || 'unnamed protocol'}`);

      // Reconcile inputs/outputs/dataFiles to one common row count BEFORE
      // building any column - see reconcileProtocolIO() above. rowCount must
      // be known first: even the "no inputs specified" fallback below needs
      // to be sized off it, so every column in this table ends up the same
      // length no matter which array (if any) was short.
      const io = reconcileProtocolIO(protocol);
      const rowCount = io.rowCount;

      // Chained step? The output sample names of one protocol are the input of
      // the next (prompt linking rule) - such inputs are Samples, not Sources.
      const chained = upstreamOutputs && protocol.inputs && protocol.inputs.length > 0
        && io.inputs.every(inp => upstreamOutputs.has(safeString(inp).trim()));

      // Add Input column(s)
      if (protocol.inputs && protocol.inputs.length > 0) {
        const inputHeader = window.arctrl.CompositeHeader.input(
          chained ? window.arctrl.IOType.sample() : window.arctrl.IOType.source());
        const inputCells = io.inputs.map(inp =>
          window.arctrl.CompositeCell.createFreeText(safeString(inp))
        );
        processTable.AddColumn(inputHeader, inputCells);
        console.log(`  - Added ${inputCells.length} input(s) [${chained ? 'Sample' : 'Source'}]`);
      } else {
        // Default input if none specified - sized to rowCount (which may
        // have been driven by outputs/dataFiles even though inputs is empty)
        processTable.AddColumn(
          window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
          Array(rowCount).fill(null).map(() => window.arctrl.CompositeCell.createFreeText("Sample"))
        );
      }

      // Add Protocol REF column with file path if available
      const protocolRefHeader = window.arctrl.CompositeHeader.protocolREF();
      let protocolRefValue = protocol.name || `Process ${processNr}`;

      // If protocolInfo is available and has files, use the first protocol file path
      if (protocolInfo && protocolInfo.files && protocolInfo.files.length > 0) {
        // Use relative path: protocols/filename.md
        const protocolFileName = protocolInfo.files[0];
        protocolRefValue = `protocols/${protocolFileName}`;
        console.log(`  - Using protocol file: ${protocolRefValue}`);
      }

      // Create Protocol REF cells for each row
      const protocolRefCells = Array(rowCount).fill(null).map(() =>
        window.arctrl.CompositeCell.createFreeText(protocolRefValue)
      );
      processTable.AddColumn(protocolRefHeader, protocolRefCells);
      console.log(`  - Added Protocol REF: ${protocolRefValue} (${rowCount} row(s))`);

      // Add Parameter columns (with units and values)
      // Parameters ARE term columns in ARCtrl (IsTermColumn = true)
      // They accept Term or Unitized cells with OntologyAnnotation
      if (protocol.parameters && protocol.parameters.length > 0) {

        protocol.parameters.forEach((param, paramIndex) => {
          try {
            // Create parameter header - use safeString to ensure name is valid
            const paramName = safeString(param.name) || `Parameter`;
            const paramOA = new window.arctrl.OntologyAnnotation(paramName, "", "");
            const paramHeader = window.arctrl.CompositeHeader.parameter(paramOA);

            // One value per row (reconcileProtocolIO: a single value is repeated,
            // a per-row array gives each row its own value)
            const rowValues = io.paramValues[paramIndex];
            const paramUnit = safeString(param.unit);

            // Parameters are term columns - use OntologyAnnotation for values
            const paramCells = rowValues.map(paramValue => {
              if (!paramValue || paramValue.trim() === '') {
                // No value provided - empty term cell
                return window.arctrl.CompositeCell.createTerm(new window.arctrl.OntologyAnnotation("", "", ""));
              }

              if (paramUnit && paramUnit.trim() !== '') {
                // Value with unit - use unitized cell
                const unitOA = new window.arctrl.OntologyAnnotation(paramUnit, "", "");
                return window.arctrl.CompositeCell.createUnitized(paramValue, unitOA);
              } else {
                // Value without unit - use term cell with OntologyAnnotation
                const valueOA = new window.arctrl.OntologyAnnotation(paramValue, "", "");
                return window.arctrl.CompositeCell.createTerm(valueOA);
              }
            });

            processTable.AddColumn(paramHeader, paramCells);
            const distinct = [...new Set(rowValues)];
            const valueInfo = distinct.length > 1 ? ` = ${distinct.length} per-row values` : (distinct[0] ? ` = ${distinct[0]}` : '');
            const unitInfo = paramUnit ? ` ${paramUnit}` : '';
            console.log(`  - Added parameter: ${paramName}${valueInfo}${unitInfo} (${rowCount} row(s))`);
          } catch (paramError) {
            console.error(`[ISA Elab2Arc] Error adding parameter "${safeString(param?.name)}":`, paramError);
            // Skip this parameter and continue with others
          }
        });
      }

      // Determine output type: Data if any dataFiles value resolves to a real
      // (or at least plausible) file, otherwise Sample.
      // ARCtrl only allows ONE output column per table.
      // Note: resolved values are NEVER prefixed with "dataset/"/"resources/"
      // here - the ISA consumer (e.g. arc-export) already resolves Output
      // [Data] values relative to that folder itself; prefixing here on top
      // of that produced doubled paths like "dataset/dataset/...".
      const rawDataFiles = io.dataFiles || [];
      const resolvedDataFiles = rawDataFiles.map(f => {
        const fileStr = safeString(f);
        if (fileStr.trim() === '') return { raw: fileStr, resolved: '' };
        const resolved = resolveDataFileReference(fileStr, datasetFiles);
        if (resolved === null) {
          console.warn(`[ISA Elab2Arc] Discarding data file reference "${fileStr}": not found under the dataset folder, or not a plausible filename (URL/glob pattern).`);
        }
        return { raw: fileStr, resolved: resolved || '' };
      });
      const hasDataFiles = resolvedDataFiles.some(f => f.resolved !== '');

      if (hasDataFiles) {
        // Output as Data (with file references)
        const dataHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.data());

        const dataCells = resolvedDataFiles.map(f =>
          window.arctrl.CompositeCell.createFreeText(f.resolved)
        );

        processTable.AddColumn(dataHeader, dataCells);
        const resolvedCount = resolvedDataFiles.filter(f => f.resolved !== '').length;
        const discardedCount = resolvedDataFiles.filter(f => f.raw.trim() !== '' && f.resolved === '').length;
        console.log(`  - Added Output [Data] column with ${resolvedCount} file(s) (${discardedCount} discarded, ${resolvedDataFiles.length} row(s) total)`);

      } else {
        // Output as Sample (named outputs or default)
        const outputHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample());

        let outputCells;
        if (protocol.outputs && protocol.outputs.length > 0) {
          outputCells = io.outputs.map(out =>
            window.arctrl.CompositeCell.createFreeText(safeString(out))
          );
          console.log(`  - Added Output [Sample] column with ${outputCells.length} output(s)`);
        } else {
          // Default output if none specified
          outputCells = Array(rowCount).fill(null).map(() =>
            window.arctrl.CompositeCell.createFreeText("Result")
          );
          console.log(`  - Added Output [Sample] column with default values (${rowCount} row(s))`);
        }

        processTable.AddColumn(outputHeader, outputCells);
      }

      return processTable;
    } catch (error) {
      console.error(`[ISA Elab2Arc] Error creating process table ${processNr}:`, error);
      // Return minimal fallback process table
      const fallbackTable = window.arctrl.ArcTable.init(`process nr. ${processNr}`);
      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
        [window.arctrl.CompositeCell.createFreeText("Sample")]
      );

      let protocolRefValue = "Main Protocol";
      if (protocolInfo && protocolInfo.files && protocolInfo.files.length > 0) {
        protocolRefValue = `protocols/${protocolInfo.files[0]}`;
      }
      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.protocolREF(),
        [window.arctrl.CompositeCell.createFreeText(protocolRefValue)]
      );

      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample()),
        [window.arctrl.CompositeCell.createFreeText("Result")]
      );
      return fallbackTable;
    }
  }

  /**
   * Generate isa.assay.xlsx using ARCtrl with metadata + multi-protocol datamap
   * Creates a multi-sheet workbook:
   * - Sheet 1: Sample table
   * - Sheet 2+: Process tables named after the protocol (Excel-safe, unique;
   *   "process nr. 1", "process nr. 2", etc. when the protocol has no name).
   * @param {string} assayPath - Path to assay directory
   * @param {string} assayName - Assay identifier
   * @param {Object} metadata - Metadata object with user info
   * @param {Object} protocolInfo - Protocol information
   * @param {Object} datasetInfo - Dataset information
   * @param {Object} llmData - LLM-extracted data
   * @returns {Promise<string>} - Path to generated file
   */
  async function generateIsaAssayElab2arcWithDatamap(
    assayPath,
    assayName,
    metadata = {},
    protocolInfo = null,
    datasetInfo = null,
    llmData = null
  ) {
    try {
      console.log(`[ISA Elab2Arc] Generating multi-sheet ISA assay for: ${assayName}`);

      // Strip leading slash from assayPath to avoid ENOENT errors
      if (assayPath.startsWith('/')) {
        assayPath = assayPath.substring(1);
        console.log(`[ISA Elab2Arc] Stripped leading slash from assayPath: ${assayPath}`);
      }

      // Ensure metadata is an object and all fields have fallback values
      const safeMetadata = metadata || {};
      const firstName = (safeMetadata.firstName || '').toString();
      const familyName = (safeMetadata.familyName || '').toString();
      const email = (safeMetadata.email || '').toString();
      const affiliation = (safeMetadata.affiliation || '').toString();

      console.log(`[ISA Elab2Arc] Metadata values: firstName="${firstName}", familyName="${familyName}", email="${email}", affiliation="${affiliation}"`);

      // Create person with roles and comments - add defensive checks
      let person = null;
      try {
        const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
        console.log(`[ISA Elab2Arc] Created roles:`, roles);
        const comments_p = window.arctrl.Comment.create("generation log", "generated by elab2arc");
        console.log(`[ISA Elab2Arc] Created comments_p:`, comments_p);

        person = createPerson({
          firstName,
          lastName: familyName,
          email,
          affiliation,
          roles: [roles],
          comments: [comments_p]
        });
        console.log(`[ISA Elab2Arc] Created person successfully:`, person);
      } catch (personError) {
        console.error(`[ISA Elab2Arc] Error creating person:`, personError);
        // Continue without person if creation fails
        person = null;
      }

      // Add protocol/dataset info as comments
      let comments = [];
      if (protocolInfo) {
        comments.push(window.arctrl.Comment.create("protocol_name", protocolInfo.title || assayName));
        comments.push(window.arctrl.Comment.create("protocol_files", protocolInfo.files.join(', ')));
        comments.push(window.arctrl.Comment.create("protocol_description", protocolInfo.description || ''));
      }
      if (datasetInfo) {
        comments.push(window.arctrl.Comment.create("dataset_files", datasetInfo.files.join(', ')));
        if (datasetInfo.samples.length > 0) {
          comments.push(window.arctrl.Comment.create("number_of_samples", datasetInfo.samples.length.toString()));
        }
      }

      // Only create sample/process tables when LLM data is available
      let allTables = [];

      if (llmData && (llmData.samples?.length > 0 || llmData.protocols?.length > 0)) {
        // ========== SHEET 1: Sample Table ==========
        const sampleTable = createSampleTable(llmData.samples || []);
        allTables = [sampleTable];

        // Real manifest of files under dataset/, used to validate LLM-extracted
        // "data file" output values (see createProcessTable / resolveDataFileReference)
        const assayDatasetPath = window.memfsPathJoin(assayPath, 'dataset');
        const realDatasetFiles = new Set(listFilesRecursive(window.FS.fs, assayDatasetPath));

        // ========== SHEETS 2+: Process Tables (one per protocol) ==========
        if (llmData.protocols && llmData.protocols.length > 0) {
          // Resolve inputs against upstream materials without assuming one
          // linear chain - see resolveProtocolInputs(). The graph renderers
          // in elab2arc-core call the same function, so table and graph agree.
          const resolvedInputs = resolveProtocolInputs(llmData);
          const usedTableNames = new Set(['samples']);
          const upstreamOutputs = new Set();
          for (let i = 0; i < llmData.protocols.length; i++) {
            const protocol = llmData.protocols[i];
            const processNr = i + 1;

            const before = protocol.inputs || [];
            if (resolvedInputs[i].length !== before.length || resolvedInputs[i].some((v, r) => v !== before[r])) {
              protocol.inputs = resolvedInputs[i];
              console.log(`[ISA Elab2Arc] Resolved process ${processNr} inputs against upstream materials: ${protocol.inputs.join(', ')}`);
            }

            const tableName = uniqueTableName(protocol.name, processNr, usedTableNames);
            const processTable = createProcessTable(protocol, processNr, protocolInfo, realDatasetFiles, upstreamOutputs, tableName);
            allTables.push(processTable);
            (protocol.outputs || []).forEach(o => { const s = safeString(o).trim(); if (s) upstreamOutputs.add(s); });

            comments.push(window.arctrl.Comment.create(
              `process_${processNr}_name`,
              protocol.name || `Process ${processNr}`
            ));
            comments.push(window.arctrl.Comment.create(
              `process_${processNr}_description`,
              protocol.description || ''
            ));
          }

          console.log(`[ISA Elab2Arc] Created ${llmData.protocols.length} process table(s)`);
        }
      } else {
        // No LLM data this run - every conversion otherwise fully regenerates
        // isa.assay.xlsx from scratch (ARCtrl's own xlsx serialization model:
        // build a fresh in-memory ArcAssay, write the whole workbook - not a
        // targeted read-modify-write), so without this an LLM-disabled run
        // would silently wipe the sample/process tables (and their parameter/
        // ontology-annotation columns) a prior LLM-enabled run produced.
        // Preserve them by reading the existing file back, if one exists; all
        // the surrounding metadata (Title/Description/Contacts/Comments below)
        // is still refreshed from the current eLabFTW data either way.
        const existingIsaPath = window.memfsPathJoin(assayPath, 'isa.assay.xlsx');
        if (window.FS.fs.existsSync(existingIsaPath)) {
          try {
            const existingWorkbook = await window.Xlsx.fromXlsxFile(existingIsaPath);
            const existingAssay = window.arctrl.XlsxController.Assay.fromFsWorkbook(existingWorkbook);
            if (existingAssay.Tables && existingAssay.Tables.length > 0) {
              allTables = existingAssay.Tables;
              console.log(`[ISA Elab2Arc] No LLM data this run - preserving ${allTables.length} existing table(s) from ${existingIsaPath}`);
            } else {
              console.log(`[ISA Elab2Arc] No LLM data this run - existing file has no tables to preserve`);
            }
          } catch (readError) {
            console.warn(`[ISA Elab2Arc] Could not read existing ${existingIsaPath} to preserve its tables - will write empty tables instead:`, readError.message || readError);
          }
        } else {
          console.log(`[ISA Elab2Arc] No LLM data - skipping sample/process tables (no existing file to preserve)`);
        }
      }

      // ========== Create ArcAssay with all tables ==========
      // ARCtrl 3.0.1: Use .init() instead of .create() for ArcAssay
      const safeAssayName = (assayName || 'unnamed_assay').toString();
      const safeComments = comments || [];
      const contacts = person ? [person] : [];
      console.log(`[ISA Elab2Arc] Creating ArcAssay: name="${safeAssayName}", contacts=${contacts.length}, tables=${allTables.length}`);

      // Use .init() to create ArcAssay, then set properties
      const myAssay = window.arctrl.ArcAssay.init(safeAssayName);

      // Set Title with fallback chain for both LLM and non-LLM cases
      let assayTitle = '';
      if (llmData && llmData.protocols && llmData.protocols.length > 0) {
        // LLM case: Use first protocol name or assayName for multiple protocols
        if (llmData.protocols.length === 1) {
          assayTitle = llmData.protocols[0].name || safeAssayName;
        } else {
          // Multiple protocols: use assayName as primary title
          assayTitle = safeAssayName;
        }
      } else if (protocolInfo && protocolInfo.title) {
        // Non-LLM case: Use protocol filename as title
        assayTitle = protocolInfo.title;
      } else {
        // Fallback: Use assay name
        assayTitle = safeAssayName;
      }
      myAssay.Title = assayTitle;

      // Set Description with fallback chain for both LLM and non-LLM cases
      let assayDescription = '';
      if (llmData && llmData.protocols && llmData.protocols.length > 0) {
        // LLM case: Combine protocol descriptions
        const protocolDescriptions = llmData.protocols
          .map(p => p.description || '')
          .filter(d => d.length > 0)
          .join(' | ');
        assayDescription = protocolDescriptions || '';
      } else if (protocolInfo && protocolInfo.description) {
        // Non-LLM case: Use protocol markdown excerpt
        assayDescription = protocolInfo.description;
      } else if (datasetInfo && datasetInfo.files && datasetInfo.files.length > 0) {
        // Fallback: Describe dataset files
        assayDescription = `Dataset contains: ${datasetInfo.files.join(', ')}`;
      }
      myAssay.Description = assayDescription;

      myAssay.Tables = allTables;
      // ArcAssay stores people in Performers (ArcStudy/ArcInvestigation use Contacts);
      // assigning myAssay.Contacts was silently ignored, leaving ASSAY PERFORMERS empty.
      myAssay.Performers = contacts;
      myAssay.Comments = safeComments;

      console.log(`[ISA Elab2Arc] ArcAssay created with Title="${assayTitle}", Description="${assayDescription.substring(0, 50)}...", ${allTables.length} tables`);

      // ========== Export to Excel ==========
      let spreadsheet = window.arctrl.XlsxController.Assay.toFsWorkbook(myAssay);
      const isaPath = window.memfsPathJoin(assayPath, 'isa.assay.xlsx');

      // Write using window.Xlsx.toFile() which handles the correct fs instance
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Elab2Arc] Created: ${isaPath} with ${allTables.length} sheet(s)`);
      return isaPath;

    } catch (error) {
      console.error(`[ISA Elab2Arc] Error generating ISA assay for ${assayName}:`, error);
      return null;
    }
  }

  /**
   * Generate isa.study.xlsx for a study using ARCtrl
   * @param {string} studyPath - Path to study directory
   * @param {string} studyName - Study identifier
   * @param {Object} metadata - Metadata object with user info
   * @param {Object} protocolInfo - Protocol information (optional) - Issue #42 fix
   * @param {Object} datasetInfo - Dataset information (optional) - Issue #42 fix
   * @param {Object} llmData - LLM annotation data (optional) - Issue #42 fix
   * @returns {Promise<string>} - Path to generated file
   */
  async function generateIsaStudy(
    studyPath,
    studyName,
    metadata = {},
    protocolInfo = null,
    datasetInfo = null,
    llmData = null
  ) {
    try {
      // Ensure studyName and metadata are valid
      const safeStudyName = studyName || 'unnamed_study';
      const safeMetadata = metadata || {};

      console.log(`[ISA Gen] Generating ISA study for: ${safeStudyName}`);

      // Only create sample/process tables when LLM data is available
      let allTables = [];

      if (llmData && (llmData.samples?.length > 0 || llmData.protocols?.length > 0)) {
        // ========== SHEET 1: Sample Table ==========
        const sampleTable = createSampleTable(llmData.samples || []);
        allTables = [sampleTable];
        console.log(`[ISA Gen] Created sample table for study`);

        // Real manifest of files under resources/, used to validate LLM-extracted
        // "data file" output values (see createProcessTable / resolveDataFileReference)
        const studyResourcesPath = window.memfsPathJoin(studyPath, 'resources');
        const realResourceFiles = new Set(listFilesRecursive(window.FS.fs, studyResourcesPath));

        // ========== SHEETS 2+: Process Tables (one per protocol) ==========
        if (llmData.protocols && llmData.protocols.length > 0) {
          const resolvedInputs = resolveProtocolInputs(llmData);
          const usedTableNames = new Set(['samples']);
          const upstreamOutputs = new Set();
          for (let i = 0; i < llmData.protocols.length; i++) {
            const protocol = llmData.protocols[i];
            const processNr = i + 1;

            // Same upstream resolution as the assay path (resolveProtocolInputs);
            // the old unconditional "inputs = previous outputs" overwrite
            // discarded rule-6 repetition and corrupted multi-chain entries.
            const before = protocol.inputs || [];
            if (resolvedInputs[i].length !== before.length || resolvedInputs[i].some((v, r) => v !== before[r])) {
              protocol.inputs = resolvedInputs[i];
              console.log(`[ISA Gen] Resolved process ${processNr} inputs against upstream materials: ${protocol.inputs.join(', ')}`);
            }

            const tableName = uniqueTableName(protocol.name, processNr, usedTableNames);
            const processTable = createProcessTable(protocol, processNr, protocolInfo, realResourceFiles, upstreamOutputs, tableName);
            allTables.push(processTable);
            (protocol.outputs || []).forEach(o => { const s = safeString(o).trim(); if (s) upstreamOutputs.add(s); });
          }

          console.log(`[ISA Gen] Created ${llmData.protocols.length} process table(s) for study`);
        }
      } else {
        // No LLM data this run - same reasoning as the assay path above: without
        // this, an LLM-disabled run would silently wipe the sample/process
        // tables (and their parameter/ontology-annotation columns) a prior
        // LLM-enabled run produced, since every conversion otherwise fully
        // regenerates isa.study.xlsx from scratch. Preserve them by reading the
        // existing file back, if one exists.
        const existingIsaPath = window.memfsPathJoin(studyPath, 'isa.study.xlsx');
        if (window.FS.fs.existsSync(existingIsaPath)) {
          try {
            const existingWorkbook = await window.Xlsx.fromXlsxFile(existingIsaPath);
            // Unlike Assay.fromFsWorkbook (returns the ArcAssay directly),
            // Study.fromFsWorkbook returns a 2-tuple [ArcStudy, assaysList] -
            // confirmed by inspection, not assumed from the Assay pattern.
            const [existingStudy] = window.arctrl.XlsxController.Study.fromFsWorkbook(existingWorkbook, []);
            if (existingStudy.Tables && existingStudy.Tables.length > 0) {
              allTables = existingStudy.Tables;
              console.log(`[ISA Gen] No LLM data this run - preserving ${allTables.length} existing table(s) from ${existingIsaPath}`);
            } else {
              console.log(`[ISA Gen] No LLM data this run - existing file has no tables to preserve`);
            }
          } catch (readError) {
            console.warn(`[ISA Gen] Could not read existing ${existingIsaPath} to preserve its tables - will write empty tables instead:`, readError.message || readError);
          }
        } else {
          console.log(`[ISA Gen] No LLM data - skipping sample/process tables for study (no existing file to preserve)`);
        }
      }

      // Prepare table names and comments
      const tableNames = allTables.map(t => t.Name);
      console.log(`[ISA Gen] Prepared ${allTables.length} table(s) for study: ${tableNames.join(', ')}`);

      // Prepare comments for the study
      const comments = [];
      comments.push(window.arctrl.Comment.create("generation log", "generated by elab2arc with LLM annotation"));

      // Create person for contacts
      let person = null;
      if (safeMetadata.firstName || safeMetadata.lastName || safeMetadata.email) {
        const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
        const comments_p = window.arctrl.Comment.create("generation log", "generated by elab2arc");

        person = createPerson({
          firstName: safeMetadata.firstName,
          lastName: safeMetadata.lastName,
          email: safeMetadata.email,
          affiliation: safeMetadata.affiliation,
          roles: [roles],
          comments: [comments_p]
        });
      }

      // Create ArcStudy with all tables (pass tables during creation)
      // ARCtrl 3.0.1: Use .init() instead of .create()
      const arcStudy = window.arctrl.ArcStudy.init(safeStudyName);
      arcStudy.Title = safeMetadata.title || safeStudyName;
      arcStudy.Description = safeMetadata.description || '';
      arcStudy.SubmissionDate = new Date().toISOString().split('T')[0];
      arcStudy.PublicReleaseDate = '';
      arcStudy.Contacts = person ? [person] : [];
      arcStudy.Tables = allTables;
      arcStudy.Comments = comments;

      // Convert ArcStudy to FsWorkbook using ARCtrl XlsxController
      // Note: Second parameter is assays list (empty for now), third is datamapSheet option
      const spreadsheet = window.arctrl.XlsxController.Study.toFsWorkbook(arcStudy, [], true);

      // Write using window.Xlsx.toFile() which handles the correct fs instance
      const isaPath = window.memfsPathJoin(studyPath, 'isa.study.xlsx');
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Gen] Created: ${isaPath} with ${allTables.length} sheet(s)`);
      return isaPath;

    } catch (error) {
      console.error(`[ISA Gen] Error generating ISA study for ${safeStudyName}:`, error);
      return null;
    }
  }

  /**
   * Generate isa.investigation.xlsx for the investigation (root) using ARCtrl
   * @param {string} gitRoot - Root directory of ARC
   * @param {string} arcName - ARC identifier
   * @param {Object} metadata - Metadata object with user info
   * @returns {Promise<string>} - Path to generated file
   */
  async function generateIsaInvestigation(gitRoot, arcName, metadata = {}) {
    try {
      console.log(`[ISA Gen] Generating ISA investigation for: ${arcName}`);

      // Analyze directory structure to get studies and assays
      const structure = analyzeArcStructure(gitRoot);

      // Create ArcInvestigation using ARCtrl
      const arcInvestigation = window.arctrl.ArcInvestigation.init(arcName);

      // Set investigation metadata
      arcInvestigation.Identifier = arcName;
      arcInvestigation.Title = metadata.title || arcName;
      arcInvestigation.Description = metadata.description || `elab2arc generated investigation for ${arcName}`;
      arcInvestigation.SubmissionDate = new Date().toISOString().split('T')[0];
      arcInvestigation.PublicReleaseDate = '';

      // Add contact/person information
      if (metadata.firstName || metadata.lastName || metadata.email) {
        const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
        const comments_p = window.arctrl.Comment.create("generation log", "generated by elab2arc");

        const person = createPerson({
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          email: metadata.email,
          affiliation: metadata.affiliation,
          roles: [roles],
          comments: [comments_p]
        });

        arcInvestigation.Contacts = [person];
      }

      // Add comments with tool version and structure info
      const version = window.version || '2025-06-03';
      const comments = [
        window.arctrl.Comment.create("tool", `elab2ARC v${version}`),
        window.arctrl.Comment.create("generated_date", new Date().toISOString()),
        window.arctrl.Comment.create("number_of_studies", structure.studies.length.toString()),
        window.arctrl.Comment.create("number_of_assays", structure.assays.length.toString())
      ];

      if (structure.studies.length > 0) {
        comments.push(window.arctrl.Comment.create("study_identifiers", structure.studies.map(s => s.name).join(', ')));
      }

      if (structure.assays.length > 0) {
        comments.push(window.arctrl.Comment.create("assay_identifiers", structure.assays.map(a => a.name).join(', ')));
      }

      arcInvestigation.Comments = comments;

      // Convert ArcInvestigation to FsWorkbook using ARCtrl XlsxController
      const spreadsheet = window.arctrl.XlsxController.Investigation.toFsWorkbook(arcInvestigation);

      // Write file using window.Xlsx.toFile (same as assay and study generation)
      const isaPath = window.memfsPathJoin(gitRoot, 'isa.investigation.xlsx');
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Gen] Created: ${isaPath}`);
      return isaPath;

    } catch (error) {
      console.error(`[ISA Gen] Error generating ISA investigation:`, error);
      return null;
    }
  }

  /**
   * Read existing investigation or create new one
   * @param {string} gitRoot - Root path of the ARC
   * @param {string} arcName - ARC identifier
   * @param {Object} metadata - Metadata for new investigation
   * @returns {Promise<ArcInvestigation>} - Investigation object
   */
  async function readOrCreateInvestigation(gitRoot, arcName, metadata = {}) {
    const isaPath = window.memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

    try {
      // Try to read existing investigation
      const workbook = await window.Xlsx.fromXlsxFile(isaPath);
      const investigation = window.arctrl.XlsxController.Investigation.fromFsWorkbook(workbook);
      console.log(`[ISA Gen] Read existing investigation from: ${isaPath}`);
      // Contacts written before the name-order fix have first/last name swapped;
      // repair the converting user's entry (persisted by saveInvestigation()).
      const repaired = repairSwappedContacts(investigation.Contacts, metadata.firstName, metadata.lastName);
      if (repaired > 0) {
        console.log(`[ISA Gen] Repaired ${repaired} investigation contact(s) with swapped first/last name`);
      }
      return investigation;
    } catch (readError) {
      // No existing investigation - create new one
      console.log(`[ISA Gen] Creating new investigation: ${arcName}`);
      const investigation = window.arctrl.ArcInvestigation.init(arcName);

      // Set metadata
      investigation.Identifier = arcName;
      investigation.Title = metadata.title || arcName;
      investigation.Description = metadata.description || '';
      investigation.SubmissionDate = new Date().toISOString().split('T')[0];

      // Add contact info
      if (metadata.firstName || metadata.lastName || metadata.email) {
        const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
        const person = createPerson({
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          email: metadata.email,
          affiliation: metadata.affiliation,
          roles: [roles],
          comments: [window.arctrl.Comment.create("generation log", "generated by elab2arc")]
        });
        investigation.Contacts = [person];
      }

      return investigation;
    }
  }

  /**
   * Fill the investigation fields that the invenio validation package requires but that are still empty
   * (an investigation created earlier, e.g. by "create new ARC", has an empty description).
   * Existing, non-empty values are never overwritten.
   */
  function completeInvestigationMetadata(investigation, metadata = {}) {
    if (!(investigation.Description || '').trim() && metadata.description) {
      investigation.Description = metadata.description;
    }
  }

  /**
   * Make sure the eLabFTW owner of an entry is a contact of the investigation, with the e-mail, ORCID and
   * affiliation eLabFTW knows (invenio needs at least one contact that has all three). A contact with the same
   * name is completed field by field (empty fields only), otherwise a new contact is added. Values that
   * eLabFTW does not provide stay empty: nothing is invented.
   */
  function addInvestigationContact(investigation, { firstName, lastName, email, orcid, affiliation } = {}) {
    if (!firstName && !lastName) return;
    const existing = Array.from(investigation.Contacts).find(c => c.FirstName === (firstName || '') && c.LastName === (lastName || ''));
    if (existing) {
      if (!existing.EMail && email) existing.EMail = email;
      if (!existing.ORCID && orcid) existing.ORCID = orcid;
      if (!existing.Affiliation && affiliation) existing.Affiliation = affiliation;
      return;
    }
    const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
    investigation.Contacts = [...Array.from(investigation.Contacts), createPerson({
      orcid, firstName, lastName, email, affiliation, roles: [roles],
      comments: [window.arctrl.Comment.create("generation log", "generated by elab2arc")]
    })];
  }

  /**
   * Save investigation to file
   * @param {string} gitRoot - Root path
   * @param {ArcInvestigation} investigation - Investigation object
   * @returns {Promise<string>} - Path to saved file
   */
  async function saveInvestigation(gitRoot, investigation) {
    const isaPath = window.memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

    // Ensure directory exists before writing
    const fs = window.FS.fs;
    const dir = window.memfsPathJoin(gitRoot);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write using window.Xlsx.toFile() which handles the correct fs instance
    const spreadsheet = window.arctrl.XlsxController.Investigation.toFsWorkbook(investigation);
    await window.Xlsx.toFile(isaPath, spreadsheet);
    console.log(`[ISA Gen] Saved investigation to: ${isaPath}`);
    return isaPath;
  }

  /**
   * Register a study to the investigation
   * @param {ArcInvestigation} investigation - Investigation object
   * @param {string} studyPath - Path to study directory
   * @param {string} studyName - Study identifier
   * @returns {Promise<boolean>} - True if registered successfully
   */
  async function registerStudyToInvestigation(investigation, studyPath, studyName) {
    try {
      // Create a minimal study object for registration
      // This avoids serialization issues with full study objects read from xlsx
      const arcStudy = window.arctrl.ArcStudy.init(studyName);
      arcStudy.Identifier = studyName;
      arcStudy.Name = studyName;
      arcStudy.Title = studyName;
      arcStudy.Description = '';
      arcStudy.SubmissionDate = new Date().toISOString().split('T')[0];

      // Comment out: Add study to investigation first
      // investigation.AddStudy(arcStudy);

      // Comment out: Then register the study (creates the reference in investigation metadata)
      // investigation.RegisterStudy(studyName);

      // console.log(`[ISA Gen] Registered study to investigation: ${studyName}`);
      console.log(`[ISA Gen] Study registration skipped (commented out): ${studyName}`);
      return true;
    } catch (error) {
      console.warn(`[ISA Gen] Could not register study ${studyName}:`, error.message || error);
      return false;
    }
  }

  /**
   * Register an assay to the investigation
   * @param {ArcInvestigation} investigation - Investigation object
   * @param {string} assayPath - Path to assay directory
   * @param {string} assayName - Assay identifier
   * @param {string} parentStudyName - Parent study name (null for standalone assays)
   * @returns {Promise<boolean>} - True if registered successfully
   */
  async function registerAssayToInvestigation(investigation, assayPath, assayName, parentStudyName = null) {
    try {
      // Create a minimal assay object for registration
      // This avoids serialization issues with full assay objects read from xlsx
      const arcAssay = window.arctrl.ArcAssay.init(assayName);
      arcAssay.Identifier = assayName;
      arcAssay.Name = assayName;

      // Comment out: Add assay to investigation
      // investigation.AddAssay(arcAssay);

      // Comment out: Register assay under parent study
      // if (parentStudyName) {
      //   investigation.RegisterAssay(parentStudyName, assayName);
      //   console.log(`[ISA Gen] Registered assay to investigation: ${assayName} under study: ${parentStudyName}`);
      // } else {
      //   console.log(`[ISA Gen] Added standalone assay to investigation: ${assayName}`);
      // }
      console.log(`[ISA Gen] Assay registration skipped (commented out): ${assayName}`);
      return true;
    } catch (error) {
      console.warn(`[ISA Gen] Could not register assay ${assayName}:`, error.message || error);
      return false;
    }
  }

  /**
   * Update isa.investigation.xlsx with study and assay linkages using ARCtrl methods
   * Reads existing investigation, adds studies/assays with proper linkages, and writes back
   * Reference: BreedingValue.js pattern using AddAssay, RegisterAssay, RegisterStudy
   * @param {string} gitRoot - Root path of the ARC
   * @param {string} arcName - ARC identifier
   * @returns {Promise<string>} - Path to updated file
   */
  async function updateIsaInvestigation(gitRoot, arcName) {
    try {
      console.log(`[ISA Gen] Updating investigation with study/assay linkages...`);
      const fs = window.FS.fs;

      const isaPath = window.memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

      // Read investigation using ARCtrl (same filesystem as toFile)
      let invWorkbook;
      try {
        invWorkbook = await window.Xlsx.fromXlsxFile(isaPath);
        console.log(`[ISA Gen] Found investigation file: ${isaPath}`);
      } catch (readError) {
        console.warn('[ISA Gen] No investigation file found to update');
        console.warn(`[ISA Gen] Path: ${isaPath}`);
        console.warn(`[ISA Gen] Error:`, readError.message || readError);
        return null;
      }

      // Parse investigation
      const arcInvestigation = window.arctrl.XlsxController.Investigation.fromFsWorkbook(invWorkbook);

      // Analyze structure to get studies and assays
      const structure = analyzeArcStructure(gitRoot);
      console.log(`[ISA Gen] Found ${structure.studies.length} studies, ${structure.assays.length} standalone assays`);

      let studiesRegistered = 0;
      let assaysRegistered = 0;

      // Process each study
      for (const study of structure.studies) {
        const studyPath = window.memfsPathJoin(study.path, 'isa.study.xlsx');

        // Read study file using ARCtrl directly
        try {
          const studyWorkbook = await window.Xlsx.fromXlsxFile(studyPath);
          const arcStudy = window.arctrl.XlsxController.Study.fromFsWorkbook(studyWorkbook, []);

          // Comment out: Add study to investigation and register it
          // arcInvestigation.AddStudy(arcStudy);
          // arcInvestigation.RegisterStudy(study.name);
          // studiesRegistered++;
          // console.log(`[ISA Gen] Registered study: ${study.name}`);
          console.log(`[ISA Gen] Study registration skipped (commented out): ${study.name}`);

          // Process assays within this study's assays folder
          const studyAssaysPath = window.memfsPathJoin(study.path, 'assays');
          if (fs.existsSync(studyAssaysPath)) {
            const assayDirs = fs.readdirSync(studyAssaysPath);
            for (const assayName of assayDirs) {
              const assayPath = window.memfsPathJoin(studyAssaysPath, assayName);
              const assayStats = fs.statSync(assayPath);
              if (assayStats.isDirectory() && !assayName.startsWith('.')) {
                const assayIsaPath = window.memfsPathJoin(assayPath, 'isa.assay.xlsx');

                // Read assay file using ARCtrl directly
                try {
                  const assayWorkbook = await window.Xlsx.fromXlsxFile(assayIsaPath);
                  const arcAssay = window.arctrl.XlsxController.Assay.fromFsWorkbook(assayWorkbook);

                  // Comment out: Add assay to investigation and register under study
                  // arcInvestigation.AddAssay(arcAssay);
                  // arcInvestigation.RegisterAssay(study.name, assayName);
                  // assaysRegistered++;
                  // console.log(`[ISA Gen] Registered assay: ${assayName} under study: ${study.name}`);
                  console.log(`[ISA Gen] Assay registration skipped (commented out): ${assayName} under study: ${study.name}`);
                } catch (assayError) {
                  console.warn(`[ISA Gen] Could not read assay ${assayName}:`, assayError.message || assayError);
                }
              }
            }
          }
        } catch (studyError) {
          console.warn(`[ISA Gen] Could not read study ${study.name}:`, studyError.message || studyError);
        }
      }

      // Process standalone assays (in root /assays folder, not under a study)
      for (const assay of structure.assays) {
        const assayIsaPath = window.memfsPathJoin(assay.path, 'isa.assay.xlsx');

        // Read assay file using ARCtrl directly
        try {
          const assayWorkbook = await window.Xlsx.fromXlsxFile(assayIsaPath);
          const arcAssay = window.arctrl.XlsxController.Assay.fromFsWorkbook(assayWorkbook);

          // Comment out: Add assay to investigation (standalone)
          // arcInvestigation.AddAssay(arcAssay);
          // assaysRegistered++;
          // console.log(`[ISA Gen] Added standalone assay: ${assay.name}`);
          console.log(`[ISA Gen] Standalone assay registration skipped (commented out): ${assay.name}`);
        } catch (assayError) {
          console.warn(`[ISA Gen] Could not read assay ${assay.name}:`, assayError.message || assayError);
        }
      }

      // Write updated investigation using ARCtrl
      const spreadsheet = window.arctrl.XlsxController.Investigation.toFsWorkbook(arcInvestigation);
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Gen] Updated investigation with ${studiesRegistered} studies, ${assaysRegistered} assays`);
      return isaPath;

    } catch (error) {
      console.error('[ISA Gen] Error updating investigation:', error);
      return null;
    }
  }

  // Export public API
  window.Elab2ArcISA = {
    analyzeArcStructure: analyzeArcStructure,
    extractDatasetInfo: extractDatasetInfo,
    extractProtocolInfo: extractProtocolInfo,
    mergeContactsUnique: mergeContactsUnique,
    createPerson: createPerson,
    repairSwappedContacts: repairSwappedContacts,
    generateIsaAssay: generateIsaAssay,
    createSampleTable: createSampleTable,
    createDefaultProcessTable: createDefaultProcessTable,
    createProcessTable: createProcessTable,
    uniqueTableName: uniqueTableName,
    reconcileProtocolIO: reconcileProtocolIO,
    resolveProtocolInputs: resolveProtocolInputs,
    generateIsaAssayElab2arcWithDatamap: generateIsaAssayElab2arcWithDatamap,
    generateIsaStudy: generateIsaStudy,
    generateIsaInvestigation: generateIsaInvestigation,
    updateIsaInvestigation: updateIsaInvestigation,
    readOrCreateInvestigation: readOrCreateInvestigation,
    completeInvestigationMetadata: completeInvestigationMetadata,
    addInvestigationContact: addInvestigationContact,
    saveInvestigation: saveInvestigation,
    registerStudyToInvestigation: registerStudyToInvestigation,
    registerAssayToInvestigation: registerAssayToInvestigation
  };

})(window);
