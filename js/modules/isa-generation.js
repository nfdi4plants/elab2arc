// =============================================================================
// ISA GENERATION MODULE
// Handles ISA-Tab file generation using ARCtrl library
// =============================================================================

(function(window) {
  'use strict';

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
      const hasOrganism = samples.some(s => s.organism && s.organism.trim() !== '');
      if (hasOrganism) {
        const organismOA = new window.arctrl.OntologyAnnotation("Organism", "", "");
        const organismHeader = window.arctrl.CompositeHeader.characteristic(organismOA);
        const organismCells = samples.map(s => {
          // Characteristic columns require Term cells (OntologyAnnotation), not FreeText
          const organismValue = s.organism || "";
          if (organismValue.trim() === '') {
            return window.arctrl.CompositeCell.emptyTerm();
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

          if (!char || !char.value || char.value.trim() === '') {
            return window.arctrl.CompositeCell.emptyTerm();
          }

          // Characteristic columns are term columns - values must be OntologyAnnotations
          // If LLM provided term source/accession, use them; otherwise leave empty
          const valueTermSource = char.termSource || "";
          const valueTermAccession = char.termAccession || "";
          const charValue = char.value;

          // Check if unit is provided
          if (char.unit && char.unit.trim() !== '') {
            // Create unitized cell with OntologyAnnotation for unit
            const unitOA = new window.arctrl.OntologyAnnotation(char.unit, "", "");
            return window.arctrl.CompositeCell.createUnitized(charValue, unitOA);
          }

          // Create term cell with OntologyAnnotation (free text converted to OA with empty terms)
          const valueOA = new window.arctrl.OntologyAnnotation(charValue, valueTermSource, valueTermAccession);
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
          window.arctrl.CompositeCell.createFreeText(inp)
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
            const paramValue = param.value || "";
            const paramUnit = param.unit || "";

            // Parameters are term columns - use OntologyAnnotation for values
            const paramCells = Array(rowCount).fill(null).map(() => {
              if (!paramValue || paramValue.trim() === '') {
                // No value provided - empty term cell
                return window.arctrl.CompositeCell.emptyTerm();
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

      // Add Output column(s)
      if (protocol.outputs && protocol.outputs.length > 0) {
        const outputHeader = window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample());
        // Outputs should match the number of rows (usually they do from LLM)
        const outputCells = protocol.outputs.map(out =>
          window.arctrl.CompositeCell.createFreeText(out)
        );
        processTable.AddColumn(outputHeader, outputCells);
        console.log(`  - Added ${protocol.outputs.length} output(s)`);
      } else {
        // Default output if none specified - match row count
        const defaultOutputCells = Array(rowCount).fill(null).map(() =>
          window.arctrl.CompositeCell.createFreeText("Result")
        );
        processTable.AddColumn(
          window.arctrl.CompositeHeader.output(window.arctrl.IOType.sample()),
          defaultOutputCells
        );
        console.log(`  - Added default output (${rowCount} row(s))`);
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
   * @returns {Promise<string>} - Path to generated file
   */
  async function generateIsaStudy(studyPath, studyName, metadata = {}) {
    try {
      console.log(`[ISA Gen] Generating ISA study for: ${studyName}`);

      // Create ArcStudy using ARCtrl
      const arcStudy = window.arctrl.ArcStudy.create(studyName);

      // Set study metadata
      arcStudy.Identifier = studyName;
      arcStudy.Title = metadata.title || studyName;
      arcStudy.Description = metadata.description || '';
      arcStudy.SubmissionDate = new Date().toISOString().split('T')[0];
      arcStudy.PublicReleaseDate = '';

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

        arcStudy.Contacts = [person];
      }

      // Convert ArcStudy to FsWorkbook using ARCtrl XlsxController
      // Note: Second parameter is assays list (empty for now), third is datamapSheet option
      const spreadsheet = window.arctrl.XlsxController.Study.toFsWorkbook(arcStudy, [], true);

      // Write file using window.Xlsx.toFile (same as assay generation)
      const isaPath = memfsPathJoin(studyPath, 'isa.study.xlsx');
      await window.Xlsx.toFile(isaPath, spreadsheet);

      console.log(`[ISA Gen] Created: ${isaPath}`);
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
    generateIsaInvestigation: generateIsaInvestigation
  };

})(window);
