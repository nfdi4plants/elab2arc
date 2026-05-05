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
//   Fix #11 - Undeclared data file references in process outputs
//   Fix #12 - Missing publications on investigation and studies
//   Fix #13 - Missing measurementType/technologyType on assays
//   Fix #14 - Undeclared protocol references from assay processes
//   Fix #15 - Undeclared material IDs from process inputs/outputs
//   Fix #16 - Undeclared protocol parameters from process parameterValues
//   Fix #17 - Missing dataFiles in assays
//   Fix #18 - Missing executesProtocol when no protocols exist
//   Fix #19 - Missing unitCategories in assays
//   Fix #20 - Missing filename in assays
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
      keywords: ['centrifugation', 'extraction', 'purification', 'preparation', 'digestion', 'lysis'],
      type: { annotationValue: 'sample preparation', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000073' }
    },
    {
      keywords: ['library', 'ffpe', 'repair', 'tail', 'ligation'],
      type: { annotationValue: 'library preparation', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000711' }
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
      keywords: ['dna', 'pcr', 'amplification'],
      type: { annotationValue: 'nucleic acid extraction', termSource: 'OBI', termAccession: 'http://purl.obolibrary.org/obo/OBI_0000856' }
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
      }
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

      // Fix #18 — Ensure at least one protocol exists so executesProtocol can always be resolved
      if (study.protocols.length === 0) {
        study.protocols.push({
          '@id': '#Protocol/_default',
          'name': '_default',
          'protocolType': { 'annotationValue': 'material processing', 'termSource': 'OBI', 'termAccession': 'http://purl.obolibrary.org/obo/OBI_0000094' },
          'parameters': []
        });
      }

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

        // Add executesProtocol reference if missing
        if (!proc.executesProtocol && (study.protocols || []).length > 0) {
          var procNameLower = (proc.name || '').toLowerCase();
          var matched = false;
          for (var k = 0; k < study.protocols.length; k++) {
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
            proc.executesProtocol = { '@id': study.protocols[0]['@id'] };
          }
        }
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

          // Add executesProtocol if missing — match against study protocols, fall back to first
          if (!proc.executesProtocol && assayProtocols.length > 0) {
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

      // Ensure unitCategories exists on study
      if (!Array.isArray(study.unitCategories)) study.unitCategories = [];

      // Collect all declared protocol parameter @ids
      var declaredParamIds = {};
      (study.protocols || []).forEach(function(p) {
        (p.parameters || []).forEach(function(param) {
          if (param && param['@id']) declaredParamIds[param['@id']] = true;
        });
      });

      // Scan all assay processes for undeclared parameterValues and register them
      var defaultProtocol = study.protocols[0];
      (study.assays || []).forEach(function(assay) {
        (assay.processSequence || []).forEach(function(proc) {
          (proc.parameterValues || []).forEach(function(pv) {
            if (!pv || typeof pv !== 'object') return;
            var paramRef = pv.category || pv.parameter;
            if (!paramRef || typeof paramRef !== 'object') return;
            var paramId = paramRef['@id'];
            if (!paramId || declaredParamIds[paramId]) return;

            // Undeclared parameter — add to default protocol or create one
            if (!defaultProtocol) {
              defaultProtocol = {
                '@id': '#Protocol/_default',
                'name': '_default',
                'protocolType': { 'annotationValue': 'material processing', 'termSource': 'OBI', 'termAccession': 'http://purl.obolibrary.org/obo/OBI_0000094' },
                'parameters': []
              };
              study.protocols.push(defaultProtocol);
            }
            var newParam = {
              '@id': paramId,
              'parameterName': { 'annotationValue': nameFromId(paramId) }
            };
            defaultProtocol.parameters.push(newParam);
            declaredParamIds[paramId] = true;
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

      // Collect all material IDs from process inputs/outputs and declare undeclared ones
      var allDeclaredIds = {};
      (study.materials.sources || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });
      (study.materials.samples || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });
      (study.materials.otherMaterials || []).forEach(function(s) { if (s && s['@id']) allDeclaredIds[s['@id']] = true; });

      function ensureMaterialDeclared(matId) {
        if (!matId || allDeclaredIds[matId]) return;
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

      // Scan all assay process inputs/outputs for undeclared material IDs
      (study.assays || []).forEach(function(assay) {
        (assay.processSequence || []).forEach(function(proc) {
          (proc.inputs || []).forEach(function(inp) {
            if (inp && inp['@id']) ensureMaterialDeclared(inp['@id']);
          });
          (proc.outputs || []).forEach(function(out) {
            if (out && out['@id']) ensureMaterialDeclared(out['@id']);
          });
        });
      });

      // Also scan study-level process inputs/outputs
      (study.processSequence || []).forEach(function(proc) {
        (proc.inputs || []).forEach(function(inp) {
          if (inp && inp['@id']) ensureMaterialDeclared(inp['@id']);
        });
        (proc.outputs || []).forEach(function(out) {
          if (out && out['@id']) ensureMaterialDeclared(out['@id']);
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
