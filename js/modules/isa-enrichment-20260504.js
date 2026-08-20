// =============================================================================
// ISA ENRICHMENT MODULE
// Enriches ISA-JSON objects with ontology annotations and structural fixes.
// Port of enrich_isa.py for browser-based in-memory operation.
//
// Applies structural fixes and semantic enrichment:
//   Fix #1  - Missing assays array in studies
//   Fix #2  - Missing inputs/outputs in processes
//   Fix #3  - Missing characteristicCategories in studies
//   Fix #4  - Missing factorValues in samples
//   Fix #5  - Missing parameterValues in processes
//   Fix #6  - Missing parameters in protocols
//   Fix #7  - characteristicType as bare string/id-only object
//   Fix #8  - Missing protocolType in protocols
//   Fix #9  - Missing parameterName in protocol parameters
//   Fix #10 - Missing ontology source references (SCORO, OBI, EFO, UO)
//   Fix #10b - Missing ontology source references actually used in the data
//              but not in the required list above (e.g. NCBITaxon)
//   Fix #11 - Undeclared data file references in process outputs
//   Fix #12 - Missing publications on investigation and studies
//   Fix #13 - Missing measurementType/technologyType on assays
//   Fix #14 - Undeclared protocol references from assay processes
//   Fix #15 - Undeclared material IDs from process inputs/outputs
//   Fix #16 - Undeclared protocol parameters from process parameterValues
//   Fix #17 - Missing dataFiles in assays
//   Fix #18 - Lazy _default protocol creation for study-level processes
//   Fix #19 - Missing unitCategories in assays
//   Fix #20 - Missing filename in assays
//   Fix #21 - Assay protocols constructed directly from assay processes (no _default)
//   Fix #22 - Remove unused materials (medium, robust with try/catch)
//   Fix #23 - Remove unused protocol parameters
//   Fix #24 - Remove unused protocols (including _default)
//   Fix #25 - Remove unused characteristic categories and units
//   Fix #26 - Remove unused ontology sources
//   Fix #27 - Link processSequence entries (previousProcess/nextProcess) in
//             array order when none are already linked, so ISA-API's
//             protocol-sequence check runs once per assay instead of once
//             per unlinked process row
//
// Exports: window.Elab2ArcEnrich
// =============================================================================

(function(window) {
  'use strict';

  // ===========================================================================
  // CONSTANT LOOKUP TABLES
  // ===========================================================================

  // Protocol type patterns — ordered array, first match wins.
  // Each entry: { keywords: string[], type: OntologyAnnotation }
  var PROTOCOL_TYPE_PATTERNS = [
    {
      keywords: ['inoculation', 'cultivation', 'growth', 'sampling', 'collection'],
      type: { annotationValue: 'sample collection', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000659' }
    },
    {
      // Checked before the DNA-extraction pattern below: a library-prep
      // protocol's name can legitimately mention "DNA" too (e.g. a reagent
      // name like "NEBNext FFPE DNA Repair Mix"), and library/ffpe/ligation
      // wording is the more specific signal in that case. Label aligned with
      // ISA-API's default "metagenome sequencing" config, which expects the
      // exact string 'library construction' (not 'library preparation') for
      // this pipeline step — same OBI term either way.
      keywords: ['library', 'ffpe', 'repair', 'tail', 'ligation'],
      type: { annotationValue: 'library construction', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000711' }
    },
    {
      // Checked before the broader 'sample preparation' pattern below (which
      // also matches on the bare word "extraction") so a DNA/PCR-specific
      // extraction protocol gets this more specific label instead of being
      // shadowed by the generic one. This also matches ISA-API's default
      // "metagenome sequencing" config's exact expected protocol-type string
      // ('nucleic acid extraction'), so real sequencing-pipeline assays no
      // longer trip validator warning [4004] on this step.
      keywords: ['dna', 'pcr', 'amplification'],
      type: { annotationValue: 'nucleic acid extraction', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000856' }
    },
    {
      keywords: ['centrifugation', 'extraction', 'purification', 'preparation', 'digestion', 'lysis'],
      type: { annotationValue: 'sample preparation', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000073' }
    },
    {
      keywords: ['sequencing', 'sequencer', 'run', 'illumina', 'nanopore'],
      type: { annotationValue: 'nucleic acid sequencing', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000626' }
    },
    {
      keywords: ['analysis', 'bioinformatic', 'alignment', 'assembly', 'annotation', 'computational'],
      type: { annotationValue: 'data transformation', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000094' }
    },
    {
      keywords: ['measurement', 'assay', 'detection', 'quantification'],
      type: { annotationValue: 'assay', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000070' }
    }
  ];

  var PROTOCOL_TYPE_DEFAULT = {
    annotationValue: 'material processing', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000094'
  };

  // Unit patterns — ordered from longest/most-specific to shortest to prevent
  // false substring matches (e.g. 'ml' before 'l', 'mg' before 'g').
  // Single-letter patterns ('h','l','g','m','c') require word-boundary matching.
  // Fixes Python bug where duplicate dict keys ('rpm','v') silently dropped entries.
  var UNIT_PATTERNS = [
    { pattern: '°c',     wb: false, unit: { annotationValue: 'degree Celsius',            termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000027' } },
    { pattern: 'rpm',    wb: false, unit: { annotationValue: 'revolutions per minute',     termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000280' } },
    { pattern: 'minute', wb: false, unit: { annotationValue: 'minute',                     termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000031' } },
    { pattern: 'min',    wb: false, unit: { annotationValue: 'minute',                     termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000031' } },
    { pattern: 'hour',   wb: false, unit: { annotationValue: 'hour',                       termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000032' } },
    { pattern: 'volt',   wb: false, unit: { annotationValue: 'volt',                       termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000218' } },
    { pattern: 'ml',     wb: false, unit: { annotationValue: 'milliliter',                 termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000098' } },
    { pattern: 'ul',     wb: false, unit: { annotationValue: 'microliter',                 termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000101' } },
    { pattern: 'mm',     wb: false, unit: { annotationValue: 'millimeter',                 termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000016' } },
    { pattern: 'mg',     wb: false, unit: { annotationValue: 'milligram',                  termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000022' } },
    { pattern: 'ng',     wb: false, unit: { annotationValue: 'nanogram',                   termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000024' } },
    { pattern: 'nm',     wb: false, unit: { annotationValue: 'nanometer',                  termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000018' } },
    { pattern: 'od',     wb: false, unit: { annotationValue: 'optical density unit',       termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000062' } },
    // Single-letter patterns — only match when the letter appears as a standalone word/suffix
    { pattern: 'h',      wb: true,  unit: { annotationValue: 'hour',                       termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000032' } },
    { pattern: 'l',      wb: true,  unit: { annotationValue: 'liter',                      termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000099' } },
    { pattern: 'g',      wb: true,  unit: { annotationValue: 'gram',                       termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000021' } },
    { pattern: 'm',      wb: true,  unit: { annotationValue: 'meter',                      termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000008' } },
    { pattern: 'c',      wb: true,  unit: { annotationValue: 'degree Celsius',             termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000027' } }
  ];

  // Parameter value type patterns — infers dataType and optional unit from param name.
  var PARAMETER_VALUE_PATTERNS = [
    {
      keywords: ['temperature'],
      result: { dataType: 'decimal', unit: { annotationValue: 'degree Celsius', termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000027' } }
    },
    {
      keywords: ['time', 'duration', 'interval', 'period', 'incubation'],
      result: { dataType: 'decimal', unit: { annotationValue: 'minute', termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000031' } }
    },
    {
      keywords: ['speed', 'rpm', 'agitation', 'shaking'],
      result: { dataType: 'decimal', unit: { annotationValue: 'rpm', termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000280' } }
    },
    {
      keywords: ['volume', 'amount', 'medium'],
      result: { dataType: 'decimal', unit: { annotationValue: 'milliliter', termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000098' } }
    },
    {
      keywords: ['concentration', 'od', 'density', 'dilution'],
      result: { dataType: 'decimal', unit: { annotationValue: 'optical density unit', termSource: 'UO', termAccession: 'http://purl.obolibrary.org/obo/UO_0000062' } }
    },
    {
      keywords: ['ph'],
      result: { dataType: 'decimal' }
    },
    {
      keywords: ['count', 'number', 'amount', 'quantity'],
      result: { dataType: 'integer' }
    }
  ];

  // Factor type patterns — maps process name keywords to EFO experimental factors.
  var FACTOR_PATTERNS = [
    {
      keywords: ['temperature'],
      factor: { id: '#Factor/Temperature', factorName: 'Temperature', factorType: { annotationValue: 'temperature', termSource: 'EFO', termAccession: 'http://www.ebi.ac.uk/efo/EFO_0000716' } }
    },
    {
      keywords: ['time', 'duration', 'period'],
      factor: { id: '#Factor/Time', factorName: 'Time', factorType: { annotationValue: 'time', termSource: 'EFO', termAccession: 'http://www.ebi.ac.uk/efo/EFO_0000721' } }
    },
    {
      keywords: ['growth', 'culture', 'cultivation', 'inoculation'],
      factor: { id: '#Factor/Growth_Condition', factorName: 'Growth Condition', factorType: { annotationValue: 'growth condition', termSource: 'EFO', termAccession: 'http://www.ebi.ac.uk/efo/EFO_0000683' } }
    },
    {
      keywords: ['treatment', 'exposure', 'condition'],
      factor: { id: '#Factor/Treatment', factorName: 'Treatment', factorType: { annotationValue: 'treatment', termSource: 'EFO', termAccession: 'http://www.ebi.ac.uk/efo/EFO_0000727' } }
    }
  ];

  // Required ontology source references — added if missing (idempotent by name).
  var REQUIRED_ONTOLOGIES = [
    { name: 'SCORO', file: 'http://purl.org/spar/scoro',                   version: '1.0',        description: 'Scientific Contribution Roles Ontology' },
    { name: 'OBI',   file: 'http://purl.obolibrary.org/obo/obi.owl',       version: '2024-01-01', description: 'Ontology for Biomedical Investigations' },
    { name: 'EFO',   file: 'http://www.ebi.ac.uk/efo/efo.owl',             version: '3.60.0',     description: 'Experimental Factor Ontology' },
    { name: 'UO',    file: 'http://purl.obolibrary.org/obo/uo.owl',        version: '2023-01-01', description: 'Units of Measurement Ontology' }
  ];

  // Metadata for ontology sources that show up in the data (e.g. LLM-extracted
  // organism/strain characteristics) but aren't unconditionally required like
  // REQUIRED_ONTOLOGIES above — declared on demand by Fix #10b, only when
  // actually referenced. Unrecognized names still get declared with a minimal
  // placeholder (see collectTermSources use below), just without this metadata.
  var KNOWN_ONTOLOGY_METADATA = {
    'NCBITaxon': { file: 'http://purl.obolibrary.org/obo/ncbitaxon.owl', version: '2024-01-01', description: 'NCBI Organismal Classification' },
    'NCIT':      { file: 'http://purl.obolibrary.org/obo/ncit.owl',      version: '24.01e',      description: 'NCI Thesaurus OBO Edition' }
  };

  /**
   * Recursively collect every non-empty `termSource` value found anywhere in obj.
   * @param {*} obj
   * @param {object} out - accumulator, { [termSourceName]: true }
   */
  function collectTermSources(obj, out) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.termSource) out[obj.termSource] = true;
    if (Array.isArray(obj)) {
      obj.forEach(function(item) { collectTermSources(item, out); });
    } else {
      Object.keys(obj).forEach(function(key) { collectTermSources(obj[key], out); });
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Check whether a short pattern (single letter) appears as a standalone
   * word or suffix in text, not as part of a longer word.
   * @param {string} text
   * @param {string} pattern - single-character pattern
   * @returns {boolean}
   */
  function hasWordBoundary(text, pattern) {
    var escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var re = new RegExp('(?:^|[\\s_\\-/])' + escaped + '(?:$|[\\s_\\-/])', 'i');
    return re.test(text);
  }

  /**
   * Extract a human-readable name from an ISA @id string.
   * Examples:
   *   "#MaterialAttribute/#UserTerm_Organism" -> "Organism"
   *   "#Factor/Temperature"                   -> "Temperature"
   *   "#UserTerm_pH"                          -> "pH"
   * @param {string} id
   * @returns {string}
   */
  function nameFromId(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    var name = id;
    // Take the last segment after '/' or '#'
    if (name.includes('/')) name = name.split('/').pop();
    else if (name.includes('#')) name = name.split('#').pop();
    // Replace underscores with spaces, strip common prefixes
    name = name.replace(/_/g, ' ').replace(/^UserTerm\s+/, '').trim();
    return name || 'unknown';
  }

  // Returns true for @ids that represent digital/file entities rather than
  // biological materials. These must not be placed in otherMaterials.
  function isDigitalEntity(matId) {
    if (!matId || typeof matId !== 'string') return false;
    if (matId.startsWith('dataset/') || matId.startsWith('protocols/') || matId.startsWith('resources/')) return true;
    if (/^(smb|http|https|ftp|sftp|file):\/\//i.test(matId)) return true;
    if (matId.includes('*')) return true;
    if (/\.(fastq|fq|bam|sam|vcf|bed|csv|tsv|txt|pdf|png|jpg|jpeg|zip|gz|tar|md|json|html|xml|bigwig|bw|narrowPeak|broadPeak)$/i.test(matId)) return true;
    return false;
  }

  /**
   * Return a shallow copy of an ontology annotation object to prevent
   * accidental mutation of constant tables.
   * @param {object} ont
   * @returns {object}
   */
  function copyOnt(ont) {
    return { annotationValue: ont.annotationValue, termSource: ont.termSource, termAccession: ont.termAccession };
  }

  // ===========================================================================
  // EXPORTED FUNCTIONS
  // ===========================================================================

  /**
   * Infer protocol type from protocol name using keyword patterns.
   * Maps to OBI ontology terms. Returns default 'material processing' if no match.
   * @param {string} name - Protocol name
   * @returns {object} OntologyAnnotation with annotationValue, termSource, termAccession
   */
  function inferProtocolType(name) {
    if (!name || typeof name !== 'string') return copyOnt(PROTOCOL_TYPE_DEFAULT);
    var lower = name.toLowerCase();
    for (var i = 0; i < PROTOCOL_TYPE_PATTERNS.length; i++) {
      var entry = PROTOCOL_TYPE_PATTERNS[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (lower.includes(entry.keywords[j])) return copyOnt(entry.type);
      }
    }
    return copyOnt(PROTOCOL_TYPE_DEFAULT);
  }

  /**
   * Extract a UO unit annotation from a parameter or attribute name.
   * Uses ordered pattern list; single-letter patterns require word-boundary match.
   * @param {string} name - Parameter name
   * @returns {object|null} UO ontology annotation or null if no match
   */
  function extractUnitFromName(name) {
    if (!name || typeof name !== 'string') return null;
    var lower = name.toLowerCase();
    for (var i = 0; i < UNIT_PATTERNS.length; i++) {
      var entry = UNIT_PATTERNS[i];
      var matched = entry.wb ? hasWordBoundary(lower, entry.pattern) : lower.includes(entry.pattern);
      if (matched) return copyOnt(entry.unit);
    }
    return null;
  }

  /**
   * Infer the expected value type (dataType + optional unit) for a protocol parameter.
   * @param {string} paramName - Parameter annotationValue
   * @param {string} paramId   - Parameter @id
   * @returns {object} { dataType: string, unit?: object }
   */
  function inferParameterValueType(paramName, paramId) {
    var combined = ((paramName || '') + ' ' + (paramId || '')).toLowerCase();
    for (var i = 0; i < PARAMETER_VALUE_PATTERNS.length; i++) {
      var entry = PARAMETER_VALUE_PATTERNS[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (combined.includes(entry.keywords[j])) {
          var result = { dataType: entry.result.dataType };
          if (entry.result.unit) result.unit = copyOnt(entry.result.unit);
          return result;
        }
      }
    }
    return { dataType: 'string' };
  }

  /**
   * Infer experimental factors (EFO) from a process name.
   * @param {string} processName
   * @returns {Array} Array of factor objects (may be empty)
   */
  function inferFactorFromProcess(processName) {
    if (!processName || typeof processName !== 'string') return [];
    var lower = processName.toLowerCase();
    var result = [];
    for (var i = 0; i < FACTOR_PATTERNS.length; i++) {
      var entry = FACTOR_PATTERNS[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (lower.includes(entry.keywords[j])) {
          result.push({
            '@id': entry.factor.id,
            'factorName': entry.factor.factorName,
            'factorType': copyOnt(entry.factor.factorType)
          });
          break;
        }
      }
    }
    return result;
  }

  /**
   * Enrich an ISA-JSON object with ontology annotations and structural fixes.
   *
   * - Works on a deep copy — the caller's object is never mutated.
   * - Idempotent: calling twice yields the same result.
   * - Null-safe: missing arrays/fields are handled gracefully.
   *
   * @param {object} isaJson - Plain ISA-JSON object (not a string)
   * @returns {object} Enriched ISA-JSON object
   */
  function enrichIsaJson(isaJson) {
    if (!isaJson || typeof isaJson !== 'object') {
      console.warn('[Elab2ArcEnrich] enrichIsaJson: invalid input, returning unchanged');
      return isaJson;
    }

    // Deep copy to avoid mutating the caller's object
    var data = JSON.parse(JSON.stringify(isaJson));

    // -------------------------------------------------------------------------
    // Investigation-level required fields
    // -------------------------------------------------------------------------
    if (!Array.isArray(data.publications)) data.publications = [];

    // -------------------------------------------------------------------------
    // Fix #10 — Ensure required ontology sources exist (idempotent by name)
    // -------------------------------------------------------------------------
    if (!Array.isArray(data.ontologySourceReferences)) {
      data.ontologySourceReferences = [];
    }
    var existingOntNames = {};
    data.ontologySourceReferences.forEach(function(ref) {
      if (ref && ref.name) existingOntNames[ref.name] = true;
    });
    REQUIRED_ONTOLOGIES.forEach(function(ont) {
      if (!existingOntNames[ont.name]) {
        data.ontologySourceReferences.push({ name: ont.name, file: ont.file, version: ont.version, description: ont.description });
        existingOntNames[ont.name] = true;
      }
    });

    // Fix #10b — Declare any other ontology source actually referenced in the
    // incoming data (e.g. NCBITaxon from LLM-extracted organism/strain
    // characteristics) that isn't one of the always-added REQUIRED_ONTOLOGIES
    // above. Scanned before any other enrichment runs, so it only reflects
    // what the input itself already uses.
    var usedTermSources = {};
    collectTermSources(data.studies, usedTermSources);
    collectTermSources(data.people, usedTermSources);
    Object.keys(usedTermSources).forEach(function(name) {
      if (existingOntNames[name]) return;
      var known = KNOWN_ONTOLOGY_METADATA[name];
      data.ontologySourceReferences.push({
        name: name,
        file: known ? known.file : '',
        version: known ? known.version : '',
        description: known ? known.description : name
      });
      existingOntNames[name] = true;
    });

    // -------------------------------------------------------------------------
    // Per-study enrichment
    // -------------------------------------------------------------------------
    (data.studies || []).forEach(function(study) {

      // Fix #1 — assays array
      if (!Array.isArray(study.assays)) study.assays = [];

      // Ensure required study fields (ISA-API validator requires title, description, materials, protocols)
      if (!study.title) study.title = study.identifier || '';
      if (!study.description) study.description = '';
      if (!study.materials) study.materials = { sources: [], samples: [], otherMaterials: [] };
      if (!Array.isArray(study.materials.sources)) study.materials.sources = [];
      if (!Array.isArray(study.materials.samples)) study.materials.samples = [];
      if (!Array.isArray(study.materials.otherMaterials)) study.materials.otherMaterials = [];
      if (!Array.isArray(study.protocols)) study.protocols = [];

      // Note: _default protocol is created lazily only when needed by study-level processes

      if (!Array.isArray(study.processSequence)) study.processSequence = [];
      if (!Array.isArray(study.publications)) study.publications = [];

      // Fix #3 — characteristicCategories array
      if (!Array.isArray(study.characteristicCategories)) study.characteristicCategories = [];

      // Fix #7 — ensure each characteristic category has a characteristicType object
      study.characteristicCategories.forEach(function(cat, i) {
        if (typeof cat === 'string') {
          // Bare string id — wrap it
          study.characteristicCategories[i] = {
            '@id': cat,
            'characteristicType': { '@id': cat, 'annotationValue': nameFromId(cat) }
          };
        } else if (cat && typeof cat === 'object' && !cat.characteristicType) {
          // Object with @id but no characteristicType
          var catId = cat['@id'] || ('#Characteristic' + i);
          cat.characteristicType = { '@id': catId, 'annotationValue': nameFromId(catId) };
        }
      });

      // -----------------------------------------------------------------------
      // Protocol enrichment — Fix #6, #8, #9 + valueType
      // -----------------------------------------------------------------------
      (study.protocols || []).forEach(function(protocol) {

        // Fix #6 — parameters array
        if (!Array.isArray(protocol.parameters)) protocol.parameters = [];

        // Fix #8 — protocolType: infer if missing or bare {annotationValue:'unknown'}
        var pt = protocol.protocolType;
        if (!pt || (typeof pt === 'object' && pt.annotationValue === 'unknown' && !pt.termSource)) {
          protocol.protocolType = inferProtocolType(protocol.name || '');
        }

        // Per-parameter: Fix #9 + valueType
        (protocol.parameters || []).forEach(function(param) {
          if (!param || typeof param !== 'object') return;

          // Fix #9 — extract parameterName from @id if missing
          if (!param.parameterName) {
            var pid = param['@id'] || '';
            var pname;
            if (pid.includes('Parameter_')) {
              pname = pid.split('Parameter_').pop().replace(/_/g, ' ');
            } else if (pid.includes('=')) {
              pname = pid.split('=').pop();
            } else if (pid.includes('/')) {
              pname = pid.split('/').pop();
            } else {
              pname = pid || 'unknown';
            }
            param.parameterName = { annotationValue: pname.trim() };
          } else if (typeof param.parameterName === 'string') {
            // Normalise bare string to annotation object
            param.parameterName = { annotationValue: param.parameterName };
          }

          // Note: valueType is not allowed on protocol parameters per ISA-JSON schema
        });
      });

      // -----------------------------------------------------------------------
      // Collect declared material @ids for Fix #11
      // -----------------------------------------------------------------------
      var materials = study.materials || {};
      var declaredIds = {};
      (materials.sources || []).forEach(function(s) { if (s && s['@id']) declaredIds[s['@id']] = true; });
      (materials.samples || []).forEach(function(s) { if (s && s['@id']) declaredIds[s['@id']] = true; });
      (materials.otherMaterials || []).forEach(function(s)   { if (s && s['@id']) declaredIds[s['@id']] = true; });

      // -----------------------------------------------------------------------
      // Process sequence enrichment — Fix #2, #5, #11 + executesProtocol
      // -----------------------------------------------------------------------
      (study.processSequence || []).forEach(function(proc) {
        // Fix #2
        if (!Array.isArray(proc.inputs))  proc.inputs  = [];
        if (!Array.isArray(proc.outputs)) proc.outputs = [];

        // Fix #5
        if (!Array.isArray(proc.parameterValues)) proc.parameterValues = [];

        // Fix #11 — remove undeclared data file outputs
        proc.outputs = proc.outputs.filter(function(out) {
          if (!out || typeof out !== 'object') return true;
          var typeStr = (out.type || '').toLowerCase();
          if (typeStr.includes('data file') || typeStr.includes('raw data') || typeStr.includes('derived data')) {
            return !!declaredIds[out['@id']];
          }
          return true;
        });

        // executesProtocol assignment deferred until after assay protocols are built
      });

      // -----------------------------------------------------------------------
      // Material enrichment
      // -----------------------------------------------------------------------

      // Sources — ensure characteristics array and name
      (materials.sources || []).forEach(function(source) {
        if (!Array.isArray(source.characteristics)) source.characteristics = [];
        if (!source.name) {
          var sid = source['@id'] || '';
          source.name = sid.includes('_') ? sid.split('_').pop() : 'Source';
        }
      });

      // Samples — Fix #4 + characteristics + name
      (materials.samples || []).forEach(function(sample) {
        // Fix #4
        if (!Array.isArray(sample.factorValues)) sample.factorValues = [];
        if (!Array.isArray(sample.characteristics)) sample.characteristics = [];
        if (!sample.name) {
          var sid = sample['@id'] || '';
          sample.name = sid.includes('_') ? sid.split('_').pop() : 'Sample';
        }
      });

      // -----------------------------------------------------------------------
      // Per-assay enrichment (same patterns as study-level)
      // -----------------------------------------------------------------------
      (study.assays || []).forEach(function(assay) {

        // Ensure required assay fields (note: 'protocols' is NOT allowed on assays per ISA-JSON schema)
        if (!assay.measurementType || !assay.measurementType.annotationValue) {
          assay.measurementType = { annotationValue: 'metagenome sequencing', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000626' };
        }
        if (!assay.technologyType || !assay.technologyType.annotationValue) {
          assay.technologyType = { annotationValue: 'nucleotide sequencing', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000626' };
        }
        if (!assay.materials) assay.materials = { sources: [], samples: [], otherMaterials: [] };
        if (!Array.isArray(assay.materials.sources)) assay.materials.sources = [];
        if (!Array.isArray(assay.materials.samples)) assay.materials.samples = [];
        if (!Array.isArray(assay.materials.otherMaterials)) assay.materials.otherMaterials = [];
        if (!Array.isArray(assay.processSequence)) assay.processSequence = [];

        // Fix #17 — Ensure dataFiles array on every assay (ISA-API requires this key)
        if (!Array.isArray(assay.dataFiles)) assay.dataFiles = [];

        // Fix #19 — Ensure unitCategories array on every assay (ISA-API validator requires this key)
        if (!Array.isArray(assay.unitCategories)) assay.unitCategories = [];

        // Fix #20 — Ensure every assay has a filename (ISA-API validator requires this key)
        if (!assay.filename) {
          var assayId = assay['@id'] || '';
          var assayName = assayId.replace('#assay/', '').replace('#study/', '');
          assay.filename = assayName ? 'assays/' + assayName + '/isa.assay.xlsx' : 'assays/unknown/isa.assay.xlsx';
        }

        // Fix #21 — elab2arc assays represent individual protocols.
        // Extract protocol from assay comments, create it in study.protocols,
        // and populate its parameters directly from the assay's processes.
        var elab2arcProtocolId = null;
        var elab2arcProtocolName = null;
        (assay.comments || []).forEach(function(comment) {
          if (comment && comment.name === 'protocol_files' && comment.value) {
            elab2arcProtocolName = comment.value;
            elab2arcProtocolId = '#Protocol_protocols/' + comment.value;
          }
        });
        // Fallback: try protocol_name comment if protocol_files not found
        if (!elab2arcProtocolId) {
          (assay.comments || []).forEach(function(comment) {
            if (comment && comment.name === 'protocol_name' && comment.value) {
              var pfn = comment.value;
              // protocol_name might not have .md extension
              if (!pfn.endsWith('.md')) pfn += '.md';
              elab2arcProtocolName = pfn;
              elab2arcProtocolId = '#Protocol_protocols/' + pfn;
            }
          });
        }

        if (elab2arcProtocolId) {
          // Find or create the protocol
          var assayProtocol = null;
          for (var pi = 0; pi < (study.protocols || []).length; pi++) {
            if (study.protocols[pi]['@id'] === elab2arcProtocolId) {
              assayProtocol = study.protocols[pi];
              break;
            }
          }
          if (!assayProtocol) {
            var displayName = elab2arcProtocolName.replace(/_/g, ' ');
            assayProtocol = {
              '@id': elab2arcProtocolId,
              'name': displayName,
              'protocolType': inferProtocolType(displayName),
              'parameters': []
            };
            study.protocols.push(assayProtocol);
          }

          // Build a global parameter definition index from all existing protocols
          var globalParamDefs = {};
          (study.protocols || []).forEach(function(proto) {
            (proto.parameters || []).forEach(function(param) {
              if (param && param['@id'] && !globalParamDefs[param['@id']]) {
                globalParamDefs[param['@id']] = JSON.parse(JSON.stringify(param));
              }
            });
          });

          // Collect parameter IDs used by this assay's processes
          var usedParamIds = {};
          (assay.processSequence || []).forEach(function(proc) {
            (proc.parameterValues || []).forEach(function(pv) {
              var ref = pv.category || pv.parameter;
              if (ref && ref['@id']) usedParamIds[ref['@id']] = true;
            });
          });

          // Add missing parameters directly to the assay protocol
          var existingParamIds = {};
          (assayProtocol.parameters || []).forEach(function(p) {
            if (p && p['@id']) existingParamIds[p['@id']] = true;
          });
          Object.keys(usedParamIds).forEach(function(pid) {
            if (existingParamIds[pid]) return;
            if (globalParamDefs[pid]) {
              assayProtocol.parameters.push(JSON.parse(JSON.stringify(globalParamDefs[pid])));
            } else {
              assayProtocol.parameters.push({
                '@id': pid,
                'parameterName': { 'annotationValue': nameFromId(pid) }
              });
            }
          });
        }

        // Assay protocol enrichment — use study-level protocols since assay schema doesn't allow 'protocols'
        var assayProtocols = study.protocols || [];
        assayProtocols.forEach(function(protocol) {
          if (!Array.isArray(protocol.parameters)) protocol.parameters = [];
          var pt = protocol.protocolType;
          if (!pt || (typeof pt === 'object' && pt.annotationValue === 'unknown' && !pt.termSource)) {
            protocol.protocolType = inferProtocolType(protocol.name || '');
          }
          (protocol.parameters || []).forEach(function(param) {
            if (!param || typeof param !== 'object') return;
            if (!param.parameterName) {
              var pid = param['@id'] || '';
              var pname;
              if (pid.includes('Parameter_')) {
                pname = pid.split('Parameter_').pop().replace(/_/g, ' ');
              } else if (pid.includes('=')) {
                pname = pid.split('=').pop();
              } else if (pid.includes('/')) {
                pname = pid.split('/').pop();
              } else {
                pname = pid || 'unknown';
              }
              param.parameterName = { annotationValue: pname.trim() };
            } else if (typeof param.parameterName === 'string') {
              param.parameterName = { annotationValue: param.parameterName };
            }
          });
        });

        // Collect declared material @ids for undeclared output filtering
        var assayMaterials = assay.materials || {};
        var assayDeclaredIds = {};
        (assayMaterials.sources || []).forEach(function(s) { if (s && s['@id']) assayDeclaredIds[s['@id']] = true; });
        (assayMaterials.samples || []).forEach(function(s) { if (s && s['@id']) assayDeclaredIds[s['@id']] = true; });
        (assayMaterials.otherMaterials || []).forEach(function(s)   { if (s && s['@id']) assayDeclaredIds[s['@id']] = true; });

        // Assay processSequence — Fix #2, #5, #11 + executesProtocol
        (assay.processSequence || []).forEach(function(proc) {
          if (!Array.isArray(proc.inputs))  proc.inputs  = [];
          if (!Array.isArray(proc.outputs)) proc.outputs = [];
          if (!Array.isArray(proc.parameterValues)) proc.parameterValues = [];

          // Remove undeclared data file outputs
          proc.outputs = proc.outputs.filter(function(out) {
            if (!out || typeof out !== 'object') return true;
            var typeStr = (out.type || '').toLowerCase();
            if (typeStr.includes('data file') || typeStr.includes('raw data') || typeStr.includes('derived data')) {
              return !!assayDeclaredIds[out['@id']];
            }
            return true;
          });

          // Add executesProtocol if missing or _default
          if (!proc.executesProtocol || proc.executesProtocol['@id'] === '#Protocol/_default') {
            if (elab2arcProtocolId) {
              // Fix #21 — elab2arc assays represent one protocol; all processes use it
              proc.executesProtocol = { '@id': elab2arcProtocolId };
            } else if (assayProtocols.length > 0) {
              // Generic fallback: match process name against protocol names
              var procNameLower = (proc.name || '').toLowerCase();
              var matched = false;
              for (var k = 0; k < assayProtocols.length; k++) {
                var prot = assayProtocols[k];
                var protNameLower = (prot.name || '').toLowerCase();
                if (procNameLower && protNameLower &&
                    (procNameLower.includes(protNameLower) || protNameLower.includes(procNameLower))) {
                  proc.executesProtocol = { '@id': prot['@id'] };
                  matched = true;
                  break;
                }
              }
              if (!matched) {
                proc.executesProtocol = { '@id': assayProtocols[0]['@id'] };
              }
            }
          }
        });

        // Assay materials
        (assayMaterials.sources || []).forEach(function(source) {
          if (!Array.isArray(source.characteristics)) source.characteristics = [];
          if (!source.name) {
            var sid = source['@id'] || '';
            source.name = sid.includes('_') ? sid.split('_').pop() : 'Source';
          }
        });
        (assayMaterials.samples || []).forEach(function(sample) {
          if (!Array.isArray(sample.factorValues)) sample.factorValues = [];
          if (!Array.isArray(sample.characteristics)) sample.characteristics = [];
          if (!sample.name) {
            var sid = sample['@id'] || '';
            sample.name = sid.includes('_') ? sid.split('_').pop() : 'Sample';
          }
        });

        // Assay characteristic categories
        if (!Array.isArray(assay.characteristicCategories)) assay.characteristicCategories = [];
        assay.characteristicCategories.forEach(function(cat, i) {
          if (typeof cat === 'string') {
            assay.characteristicCategories[i] = {
              '@id': cat,
              'characteristicType': { '@id': cat, 'annotationValue': nameFromId(cat) }
            };
          } else if (cat && typeof cat === 'object' && !cat.characteristicType) {
            var catId = cat['@id'] || ('#Characteristic' + i);
            cat.characteristicType = { '@id': catId, 'annotationValue': nameFromId(catId) };
          }
        });
      });

      // -----------------------------------------------------------------------
      // Aggregate assay materials & protocols into study (ISA-API requires study-level declarations)
      // -----------------------------------------------------------------------
      var studySourceIds = {};
      study.materials.sources.forEach(function(s) { if (s && s['@id']) studySourceIds[s['@id']] = true; });
      var studySampleIds = {};
      study.materials.samples.forEach(function(s) { if (s && s['@id']) studySampleIds[s['@id']] = true; });
      var studyOtherIds = {};
      study.materials.otherMaterials.forEach(function(s) { if (s && s['@id']) studyOtherIds[s['@id']] = true; });
      var studyProtocolIds = {};
      study.protocols.forEach(function(p) { if (p && p['@id']) studyProtocolIds[p['@id']] = true; });

      (study.assays || []).forEach(function(assay) {
        var am = assay.materials || {};
        (am.sources || []).forEach(function(s) {
          if (s && s['@id'] && !studySourceIds[s['@id']]) {
            study.materials.sources.push(s);
            studySourceIds[s['@id']] = true;
          }
        });
        (am.samples || []).forEach(function(s) {
          if (s && s['@id'] && !studySampleIds[s['@id']]) {
            study.materials.samples.push(s);
            studySampleIds[s['@id']] = true;
          }
        });
        (am.otherMaterials || []).forEach(function(s) {
          if (s && s['@id'] && !studyOtherIds[s['@id']]) {
            study.materials.otherMaterials.push(s);
            studyOtherIds[s['@id']] = true;
          }
        });
      });

      // Remove digital entities (data files, paths) that may have been aggregated
      // from assay otherMaterials — these are not biological materials.
      study.materials.otherMaterials = study.materials.otherMaterials.filter(function(m) {
        return m && m['@id'] && !isDigitalEntity(m['@id']);
      });
      (study.assays || []).forEach(function(assay) {
        if (assay.materials && Array.isArray(assay.materials.otherMaterials)) {
          assay.materials.otherMaterials = assay.materials.otherMaterials.filter(function(m) {
            return m && m['@id'] && !isDigitalEntity(m['@id']);
          });
        }
      });

      // Ensure unitCategories exists on study
      if (!Array.isArray(study.unitCategories)) study.unitCategories = [];

      // Scan all assay processes for undeclared parameterValues and add them
      // directly to the protocol being executed.
      function ensureParamDeclaredOnProtocol(targetProto, paramId) {
        if (!targetProto || !paramId) return;
        var alreadyDeclared = false;
        (targetProto.parameters || []).forEach(function(p) {
          if (p && p['@id'] === paramId) alreadyDeclared = true;
        });
        if (alreadyDeclared) return;
        targetProto.parameters.push({
          '@id': paramId,
          'parameterName': { 'annotationValue': nameFromId(paramId) }
        });
      }

      function findProtocolById(protoId) {
        for (var pi = 0; pi < (study.protocols || []).length; pi++) {
          if (study.protocols[pi]['@id'] === protoId) return study.protocols[pi];
        }
        return null;
      }

      (study.assays || []).forEach(function(assay) {
        (assay.processSequence || []).forEach(function(proc) {
          var targetProtoId = proc.executesProtocol && proc.executesProtocol['@id'];
          if (!targetProtoId) return;
          var targetProto = findProtocolById(targetProtoId);
          if (!targetProto) return;
          (proc.parameterValues || []).forEach(function(pv) {
            if (!pv || typeof pv !== 'object') return;
            var paramRef = pv.category || pv.parameter;
            if (!paramRef || typeof paramRef !== 'object') return;
            var paramId = paramRef['@id'];
            if (!paramId) return;
            ensureParamDeclaredOnProtocol(targetProto, paramId);
          });
        });
      });

      // Collect all declared protocol @ids and aggregate undeclared ones from assay processes
      var declaredProtocolIds = {};
      study.protocols.forEach(function(p) { if (p && p['@id']) declaredProtocolIds[p['@id']] = true; });

      (study.assays || []).forEach(function(assay) {
        (assay.processSequence || []).forEach(function(proc) {
          if (proc.executesProtocol && proc.executesProtocol['@id'] && !declaredProtocolIds[proc.executesProtocol['@id']]) {
            var protoId = proc.executesProtocol['@id'];
            var protoName = nameFromId(protoId);
            var newProto = {
              '@id': protoId,
              'name': protoName,
              'protocolType': inferProtocolType(protoName),
              'parameters': []
            };
            study.protocols.push(newProto);
            declaredProtocolIds[protoId] = true;
          }
        });
      });

      // Handle study-level processes that still lack executesProtocol
      (study.processSequence || []).forEach(function(proc) {
        if (!proc.executesProtocol) {
          var procNameLower = (proc.name || '').toLowerCase();
          var matched = false;
          for (var k = 0; k < (study.protocols || []).length; k++) {
            var prot = study.protocols[k];
            var protNameLower = (prot.name || '').toLowerCase();
            if (procNameLower && protNameLower &&
                (procNameLower.includes(protNameLower) || protNameLower.includes(procNameLower))) {
              proc.executesProtocol = { '@id': prot['@id'] };
              matched = true;
              break;
            }
          }
          if (!matched) {
            // Create _default only if needed
            var defaultProto = null;
            for (var pi = 0; pi < (study.protocols || []).length; pi++) {
              if (study.protocols[pi]['@id'] === '#Protocol/_default') {
                defaultProto = study.protocols[pi];
                break;
              }
            }
            if (!defaultProto) {
              defaultProto = {
                '@id': '#Protocol/_default',
                'name': '_default',
                'protocolType': { 'annotationValue': 'material processing', 'termSource': 'OBI', 'termAccession': 'http://purl.obolibrary.org/obo/OBI_0000094' },
                'parameters': []
              };
              study.protocols.push(defaultProto);
            }
            proc.executesProtocol = { '@id': '#Protocol/_default' };
          }
        }

        // Ensure study-level process params are declared on their protocol
        var targetProtoId = proc.executesProtocol && proc.executesProtocol['@id'];
        if (targetProtoId) {
          var targetProto = findProtocolById(targetProtoId);
          if (targetProto) {
            var existingIds = {};
            (targetProto.parameters || []).forEach(function(p) {
              if (p && p['@id']) existingIds[p['@id']] = true;
            });
            (proc.parameterValues || []).forEach(function(pv) {
              if (!pv || typeof pv !== 'object') return;
              var paramRef = pv.category || pv.parameter;
              if (!paramRef || typeof paramRef !== 'object') return;
              var paramId = paramRef['@id'];
              if (!paramId || existingIds[paramId]) return;
              targetProto.parameters.push({
                '@id': paramId,
                'parameterName': { 'annotationValue': nameFromId(paramId) }
              });
              existingIds[paramId] = true;
            });
          }
        }
      });

      // Collect all material IDs from process inputs/outputs and declare undeclared ones
      var allDeclaredIds = {};
      (study.materials.sources || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });
      (study.materials.samples || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });
      (study.materials.otherMaterials || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });

      function ensureMaterialDeclared(matId) {
        if (!matId || allDeclaredIds[matId]) return;
        if (isDigitalEntity(matId)) return;  // data files/paths are not biological materials
        allDeclaredIds[matId] = true;
        var name = nameFromId(matId);
        if (matId.includes('Source') || matId.includes('#Source_')) {
          study.materials.sources.push({ '@id': matId, 'name': name, 'characteristics': [] });
        } else if (matId.includes('Sample') || matId.includes('#Sample_')) {
          study.materials.samples.push({ '@id': matId, 'name': name, 'characteristics': [], 'factorValues': [] });
        } else {
          study.materials.otherMaterials.push({ '@id': matId, 'name': name });
        }
      }

      function ensureDataFileDeclared(matId, targetAssay) {
        if (!matId || !targetAssay) return;
        if (!Array.isArray(targetAssay.dataFiles)) targetAssay.dataFiles = [];
        var alreadyThere = targetAssay.dataFiles.some(function(f) { return f && f['@id'] === matId; });
        if (alreadyThere) return;
        targetAssay.dataFiles.push({ '@id': matId, 'name': nameFromId(matId), 'type': 'Raw Data File', 'comments': [] });
      }

      // Scan all assay process inputs/outputs for undeclared material IDs.
      // Digital entities (data files, paths) are routed to assay.dataFiles instead
      // of otherMaterials, which is reserved for biological materials only.
      (study.assays || []).forEach(function(assay) {
        (assay.processSequence || []).forEach(function(proc) {
          (proc.inputs || []).forEach(function(inp) {
            if (!inp || !inp['@id']) return;
            if (isDigitalEntity(inp['@id'])) ensureDataFileDeclared(inp['@id'], assay);
            else ensureMaterialDeclared(inp['@id']);
          });
          (proc.outputs || []).forEach(function(out) {
            if (!out || !out['@id']) return;
            if (isDigitalEntity(out['@id'])) ensureDataFileDeclared(out['@id'], assay);
            else ensureMaterialDeclared(out['@id']);
          });
        });
      });

      // Also scan study-level process inputs/outputs
      (study.processSequence || []).forEach(function(proc) {
        (proc.inputs || []).forEach(function(inp) {
          if (inp && inp['@id'] && !isDigitalEntity(inp['@id'])) ensureMaterialDeclared(inp['@id']);
        });
        (proc.outputs || []).forEach(function(out) {
          if (out && out['@id'] && !isDigitalEntity(out['@id'])) ensureMaterialDeclared(out['@id']);
        });
      });

      // -----------------------------------------------------------------------
      // Factor inference from process names (deduped by @id)
      // -----------------------------------------------------------------------
      if (!Array.isArray(study.factors)) study.factors = [];
      var factorIdSet = {};
      study.factors.forEach(function(f) { if (f && f['@id']) factorIdSet[f['@id']] = true; });

      (study.processSequence || []).forEach(function(proc) {
        var inferred = inferFactorFromProcess(proc.name || '');
        inferred.forEach(function(factor) {
          if (!factorIdSet[factor['@id']]) {
            study.factors.push(factor);
            factorIdSet[factor['@id']] = true;
          }
        });
      });

      // -----------------------------------------------------------------------
      // unitCategories — built from protocol parameter names
      // -----------------------------------------------------------------------
      if (!Array.isArray(study.unitCategories)) {
        var unitMap = {};
        (study.protocols || []).forEach(function(protocol) {
          (protocol.parameters || []).forEach(function(param) {
            var pnameVal = (param.parameterName && param.parameterName.annotationValue) || '';
            var unit = extractUnitFromName(pnameVal);
            if (unit && !unitMap[unit.annotationValue]) {
              unitMap[unit.annotationValue] = unit;
            }
          });
        });
        var units = Object.keys(unitMap).map(function(k) { return unitMap[k]; });
        if (units.length > 0) study.unitCategories = units;
      }

      // =====================================================================
      // CLEANUP: Remove unused declarations to reduce ISA-API warnings
      // =====================================================================

      // Collect all material IDs actually used in process inputs/outputs
      var usedMaterialIds = {};
      function collectUsedMaterials(processSeq) {
        (processSeq || []).forEach(function(proc) {
          (proc.inputs || []).forEach(function(i) { if (i && i['@id']) usedMaterialIds[i['@id']] = true; });
          (proc.outputs || []).forEach(function(o) { if (o && o['@id']) usedMaterialIds[o['@id']] = true; });
        });
      }
      collectUsedMaterials(study.processSequence);
      (study.assays || []).forEach(function(assay) {
        collectUsedMaterials(assay.processSequence);
      });

      // Fix #22 — Remove unused materials (medium, wrapped for safety)
      try {
        function filterUnusedMaterials(materials) {
          if (!materials) return;
          materials.sources = (materials.sources || []).filter(function(s) { return s && usedMaterialIds[s['@id']]; });
          materials.samples = (materials.samples || []).filter(function(s) { return s && usedMaterialIds[s['@id']]; });
          materials.otherMaterials = (materials.otherMaterials || []).filter(function(m) { return m && usedMaterialIds[m['@id']]; });
        }
        filterUnusedMaterials(study.materials);
        (study.assays || []).forEach(function(assay) {
          filterUnusedMaterials(assay.materials);
        });
      } catch (e) {
        console.warn('[Elab2ArcEnrich] Material cleanup failed, skipping:', e.message);
      }

      // Collect all parameter IDs actually used in process parameterValues
      var usedParamIds = {};
      function collectUsedParams(processSeq) {
        (processSeq || []).forEach(function(proc) {
          (proc.parameterValues || []).forEach(function(pv) {
            var ref = pv.category || pv.parameter;
            if (ref && ref['@id']) usedParamIds[ref['@id']] = true;
          });
        });
      }
      collectUsedParams(study.processSequence);
      (study.assays || []).forEach(function(assay) {
        collectUsedParams(assay.processSequence);
      });

      // Fix #23 — Remove unused parameters from protocols (easy)
      (study.protocols || []).forEach(function(protocol) {
        if (protocol.parameters) {
          protocol.parameters = protocol.parameters.filter(function(param) {
            return param && usedParamIds[param['@id']];
          });
        }
      });

      // Collect all protocol IDs actually executed by processes
      var usedProtocolIds = {};
      function collectUsedProtocols(processSeq) {
        (processSeq || []).forEach(function(proc) {
          if (proc.executesProtocol && proc.executesProtocol['@id']) {
            usedProtocolIds[proc.executesProtocol['@id']] = true;
          }
        });
      }
      collectUsedProtocols(study.processSequence);
      (study.assays || []).forEach(function(assay) {
        collectUsedProtocols(assay.processSequence);
      });

      // Fix #24 — Remove unused protocols including _default (easy)
      study.protocols = (study.protocols || []).filter(function(p) {
        return p && usedProtocolIds[p['@id']];
      });

      // Collect all characteristic category IDs actually used
      var usedCharCatIds = {};
      function collectUsedCharCats(materials) {
        if (!materials) return;
        (materials.sources || []).forEach(function(s) {
          (s.characteristics || []).forEach(function(c) {
            if (c && c.characteristicType && c.characteristicType['@id']) usedCharCatIds[c.characteristicType['@id']] = true;
          });
        });
        (materials.samples || []).forEach(function(s) {
          (s.characteristics || []).forEach(function(c) {
            if (c && c.characteristicType && c.characteristicType['@id']) usedCharCatIds[c.characteristicType['@id']] = true;
          });
        });
      }
      collectUsedCharCats(study.materials);
      (study.assays || []).forEach(function(assay) {
        collectUsedCharCats(assay.materials);
      });

      // Collect all unit IDs actually used
      var usedUnitIds = {};
      function collectUsedUnits(materials) {
        if (!materials) return;
        (materials.sources || []).forEach(function(s) {
          (s.characteristics || []).forEach(function(c) {
            if (c && c.unit && c.unit['@id']) usedUnitIds[c.unit['@id']] = true;
          });
        });
        (materials.samples || []).forEach(function(s) {
          (s.characteristics || []).forEach(function(c) {
            if (c && c.unit && c.unit['@id']) usedUnitIds[c.unit['@id']] = true;
          });
        });
      }
      collectUsedUnits(study.materials);
      (study.assays || []).forEach(function(assay) {
        collectUsedUnits(assay.materials);
      });
      collectUsedParams(study.processSequence);
      (study.assays || []).forEach(function(assay) {
        collectUsedParams(assay.processSequence);
      });

      // Fix #25 — Remove unused characteristic categories and units (easy)
      study.characteristicCategories = (study.characteristicCategories || []).filter(function(cat) {
        return cat && usedCharCatIds[cat['@id']];
      });
      (study.assays || []).forEach(function(assay) {
        assay.characteristicCategories = (assay.characteristicCategories || []).filter(function(cat) {
          return cat && usedCharCatIds[cat['@id']];
        });
      });
      study.unitCategories = (study.unitCategories || []).filter(function(u) {
        return u && usedUnitIds[u['@id']];
      });
      (study.assays || []).forEach(function(assay) {
        assay.unitCategories = (assay.unitCategories || []).filter(function(u) {
          return u && usedUnitIds[u['@id']];
        });
      });
    });

    // Fix #26 — Remove unused ontology sources (easy)
    // Reuses collectTermSources (Fix #10b's generic walker) over the whole
    // studies/people trees, rather than enumerating specific fields by hand —
    // the previous field-by-field version never looked inside processSequence
    // inputs/outputs, so a termSource used only on a process input's
    // characteristics (e.g. NCBITaxon on an organism characteristic) was
    // wrongly treated as unused and stripped back out right after Fix #10b
    // added it.
    var usedOntSources = {};
    collectTermSources(data.studies, usedOntSources);
    collectTermSources(data.people, usedOntSources);
    if (Array.isArray(data.ontologySourceReferences)) {
      data.ontologySourceReferences = data.ontologySourceReferences.filter(function(ref) {
        return ref && usedOntSources[ref.name];
      });
    }

    // Fix #27 — Link processSequence entries via previousProcess/nextProcess
    // elab2arc always writes a study/assay's process-table rows in intended
    // pipeline order (the "samples" sheet, then "process nr. 1", "process
    // nr. 2", ... in creation order — see isa-generation's per-protocol
    // loop), but never sets these ISA-JSON chain-link fields. ISA-API's
    // validator (Rule 4004) walks the chain backward from every process that
    // has no nextProcess — with no links at all, every single row counts as
    // its own independent "last process", so one genuine protocol-sequence
    // mismatch gets reported once per row instead of once per assay (e.g. a
    // 5-row assay produces 5 duplicate warnings for what is really one
    // mismatch). This restores the links using array order, which is
    // elab2arc's own intended order and safe to assume — it does not change
    // which assays match the configuration (Rule 4004 still fires exactly
    // when it should), it only removes the row-count-driven duplication.
    // No-op whenever a processSequence already has any links (nothing to
    // fix) or has fewer than 2 processes (nothing to link).
    function linkProcessSequence(processSequence) {
      if (!Array.isArray(processSequence) || processSequence.length < 2) return;
      var alreadyLinked = processSequence.some(function(p) {
        return p && (p.nextProcess || p.previousProcess);
      });
      if (alreadyLinked) return;
      for (var i = 0; i < processSequence.length - 1; i++) {
        processSequence[i].nextProcess = { '@id': processSequence[i + 1]['@id'] };
        processSequence[i + 1].previousProcess = { '@id': processSequence[i]['@id'] };
      }
    }
    (data.studies || []).forEach(function(study) {
      linkProcessSequence(study.processSequence);
      (study.assays || []).forEach(function(assay) {
        linkProcessSequence(assay.processSequence);
      });
    });

    return data;
  }

  // ===========================================================================
  // EXPORTS
  // ===========================================================================

  window.Elab2ArcEnrich = {
    enrichIsaJson:              enrichIsaJson,
    inferProtocolType:          inferProtocolType,
    extractUnitFromName:        extractUnitFromName,
    inferParameterValueType:    inferParameterValueType,
    inferFactorFromProcess:     inferFactorFromProcess
  };

})(window);
