// =============================================================================
// ISA GENERATION MODULE
// Handles ISA-Tab file generation using ARCtrl library
// =============================================================================

(function(window) {
  'use strict';

  // Note: This module loads before elab2arc-core1006c.js, so we need a local implementation
  // Helper function for path joining (copied from core)
  function memfsPathJoin(...segments) {
    // Filter out empty/null segments and join with '/'
    const joined = segments.filter(s => s != null && s !== '').join('/');

    // Split into components and normalize
    const stack = [];
    joined.split('/').forEach(segment => {
      if (segment === '.' || segment === '') return; // Skip no-ops
      if (segment === '..') {
        // Handle parent directory (if not at root)
        if (stack.length > 0 && stack[stack.length - 1] !== '') stack.pop();
      } else {
        stack.push(segment);
      }
    });

    // Rebuild path and remove trailing slash (except for root)
    let normalized = stack.join('/');
    if (normalized.endsWith('/') && normalized !== '') {
      normalized = normalized.slice(0, -1);
    }

    // Handle absolute paths
    const isAbsolute = joined.startsWith('/');
    return isAbsolute ? `/${normalized}` : normalized || '.';
  }

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
   * Analyze ARC directory structure
   * @param {string} gitRoot - Root directory of ARC
   * @returns {Object} - Structure with studies and assays arrays
   */
  function analyzeArcStructure(gitRoot) {
    try {
      const structure = { studies: [], assays: [] };
      const fs = window.FS.fs;

      // Check for studies folder
      const studiesPath = memfsPathJoin(gitRoot, 'studies');
      if (fs.existsSync(studiesPath)) {
        const studyDirs = fs.readdirSync(studiesPath);
        studyDirs.forEach(studyName => {
          const studyPath = memfsPathJoin(studiesPath, studyName);
          const stats = fs.statSync(studyPath);
          if (stats.isDirectory() && !studyName.startsWith('.')) {
            structure.studies.push({ name: studyName, path: studyPath });
          }
        });
      }

      // Check for assays folder
      const assaysPath = memfsPathJoin(gitRoot, 'assays');
      if (fs.existsSync(assaysPath)) {
        const assayDirs = fs.readdirSync(assaysPath);
        assayDirs.forEach(assayName => {
          const assayPath = memfsPathJoin(assaysPath, assayName);
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
      const readmePath = memfsPathJoin(datasetPath, 'README.md');
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
      files.forEach(file => {
        if (file.endsWith('.md')) {
          info.files.push(file);
          // Read first protocol file for title/description
          if (!info.title) {
            const filePath = memfsPathJoin(protocolPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            info.title = file.replace('.md', '');
            info.description = lines.slice(0, 3).join(' ').substring(0, 200);
          }
        }
      });

      return info;
    } catch (error) {
      console.error('Error extracting protocol info:', error);
      return { title: '', description: '', files: [] };
    }
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
      const datasetPath = memfsPathJoin(assayPath, 'dataset');
      const protocolPath = memfsPathJoin(assayPath, 'protocols');
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
      const isaPath = memfsPathJoin(assayPath, 'isa.assay.xlsx');
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

      return sampleTable;
    } catch (error) {
      console.error('[ISA Elab2Arc] Error creating sample table:', error);
      // Return minimal fallback table
      const fallbackTable = window.arctrl.ArcTable.init("samples");
      fallbackTable.AddColumn(
        window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
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
   * Helper: Create a process table from LLM-extracted protocol data
   * @param {Object} protocol - Protocol object with inputs, parameters, outputs
   * @param {number} processNr - Process number for naming
   * @param {Object} protocolInfo - Protocol file information (optional)
   * @returns {ArcTable} - Process table
   */
  function createProcessTable(protocol, processNr, protocolInfo = null) {
    try {
      const tableName = `process nr. ${processNr}`;
      const processTable = window.arctrl.ArcTable.init(tableName);

      console.log(`[ISA Elab2Arc] Creating process table "${tableName}" for: ${protocol.name}`);

      // Add Input column(s)
      if (protocol.inputs && protocol.inputs.length > 0) {
        const inputHeader = window.arctrl.CompositeHeader.input(window.arctrl.IOType.source());
        const inputCells = protocol.inputs.map(inp =>
          window.arctrl.CompositeCell.createFreeText(safeString(inp))
        );
        processTable.AddColumn(inputHeader, inputCells);
        console.log(`  - Added ${protocol.inputs.length} input(s)`);
      } else {
        // Default input if none specified
        processTable.AddColumn(
          window.arctrl.CompositeHeader.input(window.arctrl.IOType.source()),
          [window.arctrl.CompositeCell.createFreeText("Sample")]
        );
      }

      // Determine number of rows based on inputs (needed for all columns)
      const rowCount = Math.max(1, protocol.inputs?.length || 1);

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

        for (const param of protocol.parameters) {
          try {
            // Create parameter header
            const paramOA = new window.arctrl.OntologyAnnotation(param.name, "", "");
            const paramHeader = window.arctrl.CompositeHeader.parameter(paramOA);

            // Create cells for each row with value if provided
            // Use safeString to handle objects/arrays from LLM
            const paramValue = safeString(param.value);
            const paramUnit = safeString(param.unit);

            // Parameters are term columns - use OntologyAnnotation for values
            const paramCells = Array(rowCount).fill(null).map(() => {
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
            const valueInfo = paramValue ? ` = ${paramValue}` : '';
            const unitInfo = paramUnit ? ` ${paramUnit}` : '';
            console.log(`  - Added parameter: ${param.name}${valueInfo}${unitInfo} (${rowCount} row(s))`);
          } catch (paramError) {
            console.error(`[ISA Elab2Arc] Error adding parameter "${param.name}":`, paramError);
            // Skip this parameter and continue with others
          }
        }
      }

      // Determine output type: Data if dataFiles exist, otherwise Sample
      // ARCtrl only allows ONE output column per table
      const hasDataFiles = protocol.dataFiles && protocol.dataFiles.length > 0 && protocol.dataFiles.some(f => safeString(f).trim() !== '');

      if (hasDataFiles) {
        // Output as Data (with file references)
        const dataHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.data());

        const dataCells = protocol.dataFiles.map(file => {
          // Handle empty strings or null/undefined
          const fileStr = safeString(file);
          if (fileStr.trim() === '') {
            return window.arctrl.CompositeCell.createFreeText('');
          }

          // Add dataset/ prefix if not already prefixed and not a wildcard pattern
          let filePath = fileStr;
          if (!fileStr.startsWith('dataset/') && !fileStr.startsWith('*/')) {
            filePath = `dataset/${fileStr}`;
          }

          return window.arctrl.CompositeCell.createFreeText(filePath);
        });

        processTable.AddColumn(dataHeader, dataCells);
        const nonEmptyCount = protocol.dataFiles.filter(f => safeString(f).trim() !== '').length;
        console.log(`  - Added Output [Data] column with ${nonEmptyCount} file(s) (${protocol.dataFiles.length} row(s) total)`);;

      } else {
        // Output as Sample (named outputs or default)
        const outputHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample());

        let outputCells;
        if (protocol.outputs && protocol.outputs.length > 0) {
          outputCells = protocol.outputs.map(out =>
            window.arctrl.CompositeCell.createFreeText(safeString(out))
          );
          console.log(`  - Added Output [Sample] column with ${protocol.outputs.length} output(s)`);
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
   * - Sheet 2+: Process tables named "process nr. 1", "process nr. 2", etc.
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

      // ========== SHEET 1: Sample Table ==========
      const sampleTable = createSampleTable(llmData?.samples || []);

      // Create person with roles and comments
      const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
      let comments_p = window.arctrl.Comment$.create("generation log", "generated by elab2arc");
      const person = window.arctrl.Person.create(
        void 0,
        metadata.firstName,
        metadata.familyName,
        void 0,
        metadata.email,
        void 0, void 0, void 0,
        metadata.affiliation,
        [roles],
        [comments_p]
      );

      // Add protocol/dataset info as comments
      let comments = [];
      if (protocolInfo) {
        comments.push(window.arctrl.Comment$.create("protocol_name", protocolInfo.title || assayName));
        comments.push(window.arctrl.Comment$.create("protocol_files", protocolInfo.files.join(', ')));
        comments.push(window.arctrl.Comment$.create("protocol_description", protocolInfo.description || ''));
      }
      if (datasetInfo) {
        comments.push(window.arctrl.Comment$.create("dataset_files", datasetInfo.files.join(', ')));
        comments.push(window.arctrl.Comment$.create("number_of_samples", datasetInfo.samples.length.toString()));
      }

      // ========== SHEETS 2+: Process Tables (one per protocol) ==========
      const allTables = [sampleTable];  // Start with sample table

      if (llmData && llmData.protocols && llmData.protocols.length > 0) {
        // Link processes: ensure outputs of one process match inputs of the next
        for (let i = 0; i < llmData.protocols.length; i++) {
          const protocol = llmData.protocols[i];
          const processNr = i + 1;

          // If this is not the first process, link inputs to previous outputs
          if (i > 0) {
            const prevProtocol = llmData.protocols[i - 1];
            // Use previous outputs as current inputs if they don't match
            if (prevProtocol.outputs && prevProtocol.outputs.length > 0) {
              protocol.inputs = prevProtocol.outputs;
              console.log(`[ISA Elab2Arc] Linked process ${processNr} inputs to process ${processNr - 1} outputs: ${protocol.inputs.join(', ')}`);
            }
          }

          const processTable = createProcessTable(protocol, processNr, protocolInfo);
          allTables.push(processTable);

          // Add protocol info as comments
          comments.push(window.arctrl.Comment$.create(
            `process_${processNr}_name`,
            protocol.name || `Process ${processNr}`
          ));
          comments.push(window.arctrl.Comment$.create(
            `process_${processNr}_description`,
            protocol.description || ''
          ));
        }

        console.log(`[ISA Elab2Arc] Created ${llmData.protocols.length} process table(s)`);
      } else {
        // No LLM data - create single minimal process table
        const defaultProcessTable = createDefaultProcessTable(protocolInfo);
        allTables.push(defaultProcessTable);
        console.log(`[ISA Elab2Arc] Created default process table (no LLM data)`);
      }

      // ========== Create ArcAssay with all tables ==========
      const myAssay = window.arctrl.ArcAssay.create(
        assayName,
        void 0,  // measurementType
        void 0,  // technologyType
        void 0,  // technologyPlatform
        allTables,  // ALL TABLES: samples + process 1 + process 2 + ...
        void 0,
        [person],
        comments
      );

      // ========== Export to Excel ==========
      let spreadsheet = window.arctrl.XlsxController.Assay.toFsWorkbook(myAssay);
      const isaPath = memfsPathJoin(assayPath, 'isa.assay.xlsx');
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
      console.log(`[ISA Gen] Generating ISA study for: ${studyName}`);
      if (llmData) {
        console.log(`[ISA Gen] LLM annotation data provided for study - creating annotation tables`);
      }

      // ========== SHEET 1: Sample Table ==========
      const sampleTable = createSampleTable(llmData?.samples || []);
      console.log(`[ISA Gen] Created sample table for study`);

      // ========== SHEETS 2+: Process Tables (one per protocol) ==========
      const allTables = [sampleTable];  // Start with sample table

      if (llmData && llmData.protocols && llmData.protocols.length > 0) {
        // Link processes: ensure outputs of one process match inputs of the next
        for (let i = 0; i < llmData.protocols.length; i++) {
          const protocol = llmData.protocols[i];
          const processNr = i + 1;

          // If this is not the first process, link inputs to previous outputs
          if (i > 0) {
            const prevProtocol = llmData.protocols[i - 1];
            // Use previous outputs as current inputs if they don't match
            if (prevProtocol.outputs && prevProtocol.outputs.length > 0) {
              protocol.inputs = prevProtocol.outputs;
              console.log(`[ISA Gen] Linked process ${processNr} inputs to process ${processNr - 1} outputs: ${protocol.inputs.join(', ')}`);
            }
          }

          const processTable = createProcessTable(protocol, processNr, protocolInfo);
          allTables.push(processTable);
        }

        console.log(`[ISA Gen] Created ${llmData.protocols.length} process table(s) for study`);
      } else {
        // No LLM data - create single minimal process table
        const defaultProcessTable = createDefaultProcessTable(protocolInfo);
        allTables.push(defaultProcessTable);
        console.log(`[ISA Gen] Created default process table for study (no LLM data)`);
      }

      // Prepare table names and comments
      const tableNames = allTables.map(t => t.Name);
      console.log(`[ISA Gen] Prepared ${allTables.length} table(s) for study: ${tableNames.join(', ')}`);

      // Prepare comments for the study
      const comments = [];
      comments.push(window.arctrl.Comment$.create("generation log", "generated by elab2arc with LLM annotation"));

      // Create person for contacts
      let person = null;
      if (metadata.firstName || metadata.lastName || metadata.email) {
        const roles = new window.arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
        const comments_p = window.arctrl.Comment$.create("generation log", "generated by elab2arc");

        person = window.arctrl.Person.create(
          void 0,  // ORCID
          metadata.firstName || '',
          metadata.lastName || '',
          void 0,  // MidInitials
          metadata.email || '',
          void 0,  // Phone
          void 0,  // Fax
          void 0,  // Address
          metadata.affiliation || '',
          [roles],
          [comments_p]
        );
      }

      // Create ArcStudy with all tables (pass tables during creation)
      // ArcStudy.create signature: (identifier, title, description, submissionDate, publicReleaseDate, publications, contacts, studyDesignDescriptors, tables, datamap, registeredAssayIdentifiers, comments)
      const arcStudy = window.arctrl.ArcStudy.create(
        studyName,                                    // identifier
        metadata.title || studyName,                  // title
        metadata.description || '',                   // description
        new Date().toISOString().split('T')[0],       // submissionDate
        '',                                           // publicReleaseDate
        [],                                           // publications
        person ? [person] : [],                       // contacts
        [],                                           // studyDesignDescriptors
        allTables,                                    // tables
        void 0,                                       // datamap
        [],                                           // registeredAssayIdentifiers
        comments                                      // comments
      );

      // Convert ArcStudy to FsWorkbook using ARCtrl XlsxController
      // Note: Second parameter is assays list (empty for now), third is datamapSheet option
      const spreadsheet = window.arctrl.XlsxController.Study.toFsWorkbook(arcStudy, [], true);

      // Write file using window.Xlsx.toFile (same as assay generation)
      const isaPath = memfsPathJoin(studyPath, 'isa.study.xlsx');
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Gen] Created: ${isaPath} with ${allTables.length} sheet(s)`);
      return isaPath;

    } catch (error) {
      console.error(`[ISA Gen] Error generating ISA study for ${studyName}:`, error);
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
        const comments_p = window.arctrl.Comment$.create("generation log", "generated by elab2arc");

        const person = window.arctrl.Person.create(
          void 0,  // ORCID
          metadata.firstName || '',
          metadata.lastName || '',
          void 0,  // MidInitials
          metadata.email || '',
          void 0,  // Phone
          void 0,  // Fax
          void 0,  // Address
          metadata.affiliation || '',
          [roles],
          [comments_p]
        );

        arcInvestigation.Contacts = [person];
      }

      // Add comments with tool version and structure info
      const version = window.version || '2025-06-03';
      const comments = [
        window.arctrl.Comment$.create("tool", `elab2ARC v${version}`),
        window.arctrl.Comment$.create("generated_date", new Date().toISOString()),
        window.arctrl.Comment$.create("number_of_studies", structure.studies.length.toString()),
        window.arctrl.Comment$.create("number_of_assays", structure.assays.length.toString())
      ];

      if (structure.studies.length > 0) {
        comments.push(window.arctrl.Comment$.create("study_identifiers", structure.studies.map(s => s.name).join(', ')));
      }

      if (structure.assays.length > 0) {
        comments.push(window.arctrl.Comment$.create("assay_identifiers", structure.assays.map(a => a.name).join(', ')));
      }

      arcInvestigation.Comments = comments;

      // Convert ArcInvestigation to FsWorkbook using ARCtrl XlsxController
      const spreadsheet = window.arctrl.XlsxController.Investigation.toFsWorkbook(arcInvestigation);

      // Write file using window.Xlsx.toFile (same as assay and study generation)
      const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.xlsx');
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
    const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

    try {
      // Try to read existing investigation
      const workbook = await window.Xlsx.fromXlsxFile(isaPath);
      const investigation = window.arctrl.XlsxController.Investigation.fromFsWorkbook(workbook);
      console.log(`[ISA Gen] Read existing investigation from: ${isaPath}`);
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
        const person = window.arctrl.Person.create(
          void 0,
          metadata.firstName || '',
          metadata.lastName || '',
          void 0,
          metadata.email || '',
          void 0, void 0, void 0,
          metadata.affiliation || '',
          [roles],
          [window.arctrl.Comment$.create("generation log", "generated by elab2arc")]
        );
        investigation.Contacts = [person];
      }

      return investigation;
    }
  }

  /**
   * Save investigation to file
   * @param {string} gitRoot - Root path
   * @param {ArcInvestigation} investigation - Investigation object
   * @returns {Promise<string>} - Path to saved file
   */
  async function saveInvestigation(gitRoot, investigation) {
    const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.xlsx');
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
      const arcStudy = window.arctrl.ArcStudy.create(studyName);
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
      const arcAssay = window.arctrl.ArcAssay.create(assayName);
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

      const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.xlsx');

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
        const studyPath = memfsPathJoin(study.path, 'isa.study.xlsx');

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
          const studyAssaysPath = memfsPathJoin(study.path, 'assays');
          if (fs.existsSync(studyAssaysPath)) {
            const assayDirs = fs.readdirSync(studyAssaysPath);
            for (const assayName of assayDirs) {
              const assayPath = memfsPathJoin(studyAssaysPath, assayName);
              const assayStats = fs.statSync(assayPath);
              if (assayStats.isDirectory() && !assayName.startsWith('.')) {
                const assayIsaPath = memfsPathJoin(assayPath, 'isa.assay.xlsx');

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
        const assayIsaPath = memfsPathJoin(assay.path, 'isa.assay.xlsx');

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
    generateIsaAssay: generateIsaAssay,
    createSampleTable: createSampleTable,
    createDefaultProcessTable: createDefaultProcessTable,
    createProcessTable: createProcessTable,
    generateIsaAssayElab2arcWithDatamap: generateIsaAssayElab2arcWithDatamap,
    generateIsaStudy: generateIsaStudy,
    generateIsaInvestigation: generateIsaInvestigation,
    updateIsaInvestigation: updateIsaInvestigation,
    readOrCreateInvestigation: readOrCreateInvestigation,
    saveInvestigation: saveInvestigation,
    registerStudyToInvestigation: registerStudyToInvestigation,
    registerAssayToInvestigation: registerAssayToInvestigation
  };

})(window);
