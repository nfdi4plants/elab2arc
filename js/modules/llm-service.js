// =============================================================================
// LLM SERVICE MODULE
// Handles Together.AI API integration for protocol analysis and extraction
// =============================================================================

(function(window) {
  'use strict';

  // Test data for ISA assay generation (bypasses API calls)
  const TEST_PROTOCOL_DATA = {
    "samples": [
      {"name": "CAM 76-1", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-16", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "1", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.4", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]},
      {"name": "CAM 76-2", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-16", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "1", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.55", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]},
      {"name": "CAM 31", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-22", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "2", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.57", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]},
      {"name": "CAM 37", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-22", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "1", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.52", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]},
      {"name": "CAM 78", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-22", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "2", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.59", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]},
      {"name": "CAM 269", "organism": "Plant", "characteristics": [{"category": "sample type", "value": "CAM", "unit": "", "termSource": "", "termAccession": ""}, {"category": "collection date", "value": "2025-05-22", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}, {"category": "plant number", "value": "2", "unit": "", "termSource": "", "termAccession": ""}, {"category": "weight", "value": "1.55", "unit": "g", "termSource": "UO", "termAccession": "UO:0000009"}]}
    ],
    "protocols": [
      {"name": "DNA Extraction", "description": "DNA extraction using Macherey & Nagel HMW NucleoBond kit with extended lysis time. Elution in HE buffer.", "inputs": ["CAM 76-1", "CAM 76-2", "CAM 31", "CAM 37", "CAM 78", "CAM 269"], "parameters": [{"name": "Kit", "value": "Macherey & Nagel, HMW NucleoBond", "unit": "", "description": "Extraction kit used"}, {"name": "Artikelnummer", "value": "740160.20", "unit": "", "description": "Kit catalog number"}, {"name": "Lysis time", "value": "60", "unit": "min", "description": "Extended lysis duration"}, {"name": "Elution buffer", "value": "HE Buffer", "unit": "", "description": "Buffer used for DNA elution"}, {"name": "Elution volume", "value": "33", "unit": "µl", "description": "Volume of elution buffer used for initial extractions"}], "outputs": ["DNA_CAM76-1", "DNA_CAM76-2", "DNA_CAM31", "DNA_CAM37", "DNA_CAM78", "DNA_CAM269"], "dataFiles": ["5_CAM-269.jpg", "5_CAM-269.jpg", "5_CAM-269.jpg", "5_CAM-269.jpg", "5_CAM-269.jpg", "5_CAM-269.jpg"]},
      {"name": "Size Selection", "description": "Size selection using Circulomics Short Read Eliminator Kit followed by sodium acetate precipitation.", "inputs": ["DNA_CAM76-1", "DNA_CAM76-2", "DNA_CAM31", "DNA_CAM37", "DNA_CAM78", "DNA_CAM269"], "parameters": [{"name": "Method", "value": "MTH0004", "unit": "", "description": "Circulomics Short Read Eliminator Kit protocol"}, {"name": "Precipitation method", "value": "MTH0017", "unit": "", "description": "Sodium acetate precipitation protocol"}, {"name": "Input volume", "value": "21", "unit": "µl", "description": "Volume used per size selection reaction for CAM76"}, {"name": "EB volume added", "value": "45", "unit": "µl", "description": "Volume of elution buffer added to samples"}, {"name": "LTE volume", "value": "33", "unit": "µl", "description": "Volume of LTE buffer added to supernatants"}], "outputs": ["SizeSelected_CAM76", "SizeSelected_CAM76", "SizeSelected_CAM31", "SizeSelected_CAM37", "SizeSelected_CAM78", "SizeSelected_CAM269"], "dataFiles": ["6_12_grafik.png", "6_12_grafik.png", "8_11_grafik.png", "8_11_grafik.png", "8_11_grafik.png", "8_11_grafik.png"]},
      {"name": "FFPE Repair and A-tailing", "description": "DNA repair and end preparation using NEBNext FFPE DNA Repair Mix.", "inputs": ["SizeSelected_CAM76", "SizeSelected_CAM76", "SizeSelected_CAM31", "SizeSelected_CAM37", "SizeSelected_CAM78", "SizeSelected_CAM269"], "parameters": [{"name": "Method", "value": "MTH0005", "unit": "", "description": "NEBNext FFPE DNA Repair Mix protocol"}, {"name": "Target DNA amount", "value": "1500", "unit": "ng", "description": "Approximate amount of DNA used per reaction"}, {"name": "Reaction volume", "value": "60", "unit": "µl", "description": "Final volume of repair reaction"}], "outputs": ["FFPE_Repaired_CAM76_A", "FFPE_Repaired_CAM76_B", "FFPE_Repaired_CAM31", "FFPE_Repaired_CAM37", "FFPE_Repaired_CAM78", "FFPE_Repaired_CAM269"], "dataFiles": ["", "", "", "", "", ""]},
      {"name": "Adapter Ligation", "description": "Adapter ligation using Oxford Nanopore SQK-LSK114XL Kit.", "inputs": ["FFPE_Repaired_CAM76_A", "FFPE_Repaired_CAM76_B", "FFPE_Repaired_CAM31", "FFPE_Repaired_CAM37", "FFPE_Repaired_CAM78", "FFPE_Repaired_CAM269"], "parameters": [{"name": "Kit", "value": "SQK-LSK114XL", "unit": "", "description": "ONT ligation kit used"}, {"name": "Kit manufacturer", "value": "ONT", "unit": "", "description": "Oxford Nanopore Technologies"}, {"name": "Elution buffer added", "value": "20", "unit": "µl", "description": "Volume of EB added after ligation"}], "outputs": ["Ligated_CAM76_A", "Ligated_CAM76_B", "Ligated_CAM31", "Ligated_CAM37", "Ligated_CAM78", "Ligated_CAM269"], "dataFiles": ["", "", "", "", "", ""]},
      {"name": "Sequencing", "description": "ONT sequencing on PromethION platform with specified run parameters.", "inputs": ["Ligated_CAM76_A", "Ligated_CAM76_B", "Ligated_CAM31", "Ligated_CAM37", "Ligated_CAM78", "Ligated_CAM269"], "parameters": [{"name": "Sequencing platform", "value": "PromethION", "unit": "", "description": "Sequencing instrument used"}, {"name": "Run time", "value": "100", "unit": "h", "description": "Duration of sequencing run"}, {"name": "Pore count", "value": "various", "unit": "", "description": "Number of active pores per flow cell"}], "outputs": ["Sequencing_CAM76_run1", "Sequencing_CAM76_run2", "Sequencing_CAM31_run1", "Sequencing_CAM37_run1", "Sequencing_CAM78_run1", "Sequencing_CAM269_run1"], "dataFiles": ["20250528_CAM76_prom", "20250602_CAM76_run2_prom", "20250602_CAM31_run1_prom", "20250602_CAM37_run1_prom", "20250602_CAM78_run1_prom", "20250602_CAM269_run1_prom"]}
    ]
  };

  // Helper function for path joining (used in generateDatamapFromLLM)
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

  // Valid model IDs available in Together AI
  const VALID_MODELS = [
    'meta-llama/Llama-3.2-3B-Instruct-Turbo',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
    'google/gemma-3n-E4B-it',
    'lgai/exaone-deep-32b',
    'ServiceNow-AI/Apriel-1.5-15b-Thinker',
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free'
  ];

  const DEFAULT_MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput';

  /**
   * Get the currently selected LLM model from localStorage with validation
   * @returns {string} - Model identifier
   */
  function getSelectedModel() {
    const savedModel = window.localStorage.getItem('togetherAIModel');

    // If no saved model, use default
    if (!savedModel) {
      return DEFAULT_MODEL;
    }

    // Validate saved model against valid list
    if (VALID_MODELS.includes(savedModel)) {
      return savedModel;
    }

    // Invalid model found - clear it and use default
    console.warn(`[LLM Model] Invalid model in localStorage: "${savedModel}". Resetting to default: "${DEFAULT_MODEL}"`);
    window.localStorage.removeItem('togetherAIModel');
    return DEFAULT_MODEL;
  }

  /**
   * Get fallback models to try when rate limited
   * Reads from localStorage or returns default fallbacks
   * @returns {Array<string>} - Array of fallback model identifiers
   */
  function getFallbackModels() {
    // Try to get user-configured fallback models from localStorage
    const savedFallbackModels = window.localStorage.getItem('togetherAIFallbackModels');

    if (savedFallbackModels) {
      try {
        const fallbackList = JSON.parse(savedFallbackModels);
        if (Array.isArray(fallbackList) && fallbackList.length > 0) {
          console.log(`[Fallback Models] Using user-configured models: ${fallbackList.join(', ')}`);
          return fallbackList;
        }
      } catch (e) {
        console.warn('[Fallback Models] Could not parse saved fallback models, using defaults');
      }
    }

    // Default fallback models if none configured
    console.log('[Fallback Models] Using default fallback models');
    return [
      'openai/gpt-oss-20b',             // 20B model, balanced
      'openai/gpt-oss-120b',            // 120B model, large capacity
      'google/gemma-3n-E4B-it',         // Google Gemma, efficient
      'lgai/exaone-deep-32b'            // 32B model, good for complex reasoning
    ];
  }

  /**
   * Get context window size for the selected model
   * @param {string} model - Model identifier
   * @returns {number} - Context window size in tokens
   */
  function getModelContextWindow(model) {
    if (model.includes('Llama-3.3-70B')) {
      return 131072; // 131K tokens
    } else if (model.includes('Qwen3-235B-A22B')) {
      return 131072; // 131K tokens
    } else if (model.includes('DeepSeek-R1')) {
      return 64000; // ~64K tokens
    } else if (model.includes('gpt-oss-120b')) {
      return 32768; // 32K tokens
    } else if (model.includes('exaone-deep-32b')) {
      return 32768; // 32K tokens
    } else if (model.includes('Apriel-1.5-15b')) {
      return 32768; // 32K tokens
    } else if (model.includes('gemma-3n-E4B')) {
      return 32768; // 32K tokens
    } else if (model.includes('gpt-oss-20b')) {
      return 16384; // 16K tokens
    } else if (model.includes('Llama-3.2-3B')) {
      return 8192; // 8K tokens
    }
    return 100000; // Default fallback
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   * @param {string} text - Text to estimate
   * @returns {number} - Estimated token count
   */
  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Chunk protocol text intelligently by sections, paragraphs, or sentences
   * Tries to split at natural boundaries: ### headers, ## headers, paragraphs, sentences
   * @param {string} protocolText - Full protocol text
   * @param {number} maxChunkTokens - Maximum tokens per chunk
   * @returns {Array<string>} - Array of text chunks
   */
  function chunkProtocolText(protocolText, maxChunkTokens) {
    const estimatedTokens = estimateTokens(protocolText);

    console.log(`[Chunking] Protocol size: ${protocolText.length} chars (~${estimatedTokens} tokens)`);
    console.log(`[Chunking] Max chunk size: ${maxChunkTokens} tokens (~${maxChunkTokens * 4} chars)`);

    // If small enough, return as single chunk
    if (estimatedTokens <= maxChunkTokens) {
      console.log(`[Chunking] Protocol fits in single chunk`);
      return [protocolText];
    }

    const maxChunkChars = maxChunkTokens * 4; // Rough conversion
    const chunks = [];

    // Try splitting by sections first (### headers)
    const sectionPattern = /(?=^#{1,3}\s)/gm;
    const sections = protocolText.split(sectionPattern).filter(s => s.trim());

    let currentChunk = '';

    for (const section of sections) {
      const sectionTokens = estimateTokens(section);
      const currentTokens = estimateTokens(currentChunk);

      // If adding this section keeps us under limit, add it
      if (currentTokens + sectionTokens <= maxChunkTokens) {
        currentChunk += section;
      } else {
        // Save current chunk if not empty
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          console.log(`[Chunking] Created chunk ${chunks.length}: ${estimateTokens(currentChunk)} tokens`);
        }

        // If this section is too large, need to split it further
        if (sectionTokens > maxChunkTokens) {
          const subChunks = splitByParagraphs(section, maxChunkTokens);
          chunks.push(...subChunks);
        } else {
          currentChunk = section;
        }
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      console.log(`[Chunking] Created chunk ${chunks.length}: ${estimateTokens(currentChunk)} tokens`);
    }

    console.log(`[Chunking] Total chunks created: ${chunks.length}`);
    return chunks;
  }

  /**
   * Split text by paragraphs when section is too large
   * @param {string} text - Text to split
   * @param {number} maxChunkTokens - Maximum tokens per chunk
   * @returns {Array<string>} - Array of chunks
   */
  function splitByParagraphs(text, maxChunkTokens) {
    const maxChunkChars = maxChunkTokens * 4;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    const chunks = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);
      const currentTokens = estimateTokens(currentChunk);

      if (currentTokens + paraTokens <= maxChunkTokens) {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }

        // If single paragraph is too large, split by sentences
        if (paraTokens > maxChunkTokens) {
          const subChunks = splitBySentences(para, maxChunkTokens);
          chunks.push(...subChunks);
        } else {
          currentChunk = para;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Split text by sentences when paragraph is too large (last resort)
   * @param {string} text - Text to split
   * @param {number} maxChunkTokens - Maximum tokens per chunk
   * @returns {Array<string>} - Array of chunks
   */
  function splitBySentences(text, maxChunkTokens) {
    const maxChunkChars = maxChunkTokens * 4;
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const sentTokens = estimateTokens(sentence);
      const currentTokens = estimateTokens(currentChunk);

      if (currentTokens + sentTokens <= maxChunkTokens) {
        currentChunk += sentence;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }

        // If single sentence is still too large, force split by chars
        if (sentTokens > maxChunkTokens) {
          let remaining = sentence;
          while (remaining.length > maxChunkChars) {
            chunks.push(remaining.substring(0, maxChunkChars).trim());
            remaining = remaining.substring(maxChunkChars);
          }
          if (remaining.trim()) {
            currentChunk = remaining;
          }
        } else {
          currentChunk = sentence;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Merge multiple chunk results into a single protocol structure
   * @param {Array<Object>} chunkResults - Array of parsed results from each chunk
   * @returns {Object} - Merged protocol structure
   */
  function mergeChunkResults(chunkResults) {
    try {
      console.log(`[Merging] Merging ${chunkResults.length} chunk result(s)`);

      const merged = {
        samples: [],
        protocols: []
      };

      const sampleMap = new Map(); // Track samples by name to merge duplicates
      const protocolMap = new Map(); // Track protocols by name to merge duplicates

      for (const result of chunkResults) {
        if (!result) continue;

        // Merge samples
        if (result.samples) {
          try {
            for (const sample of result.samples) {
              const key = sample.name || 'Sample';
              if (!sampleMap.has(key)) {
                sampleMap.set(key, {
                  name: sample.name || 'Sample',
                  organism: sample.organism || '',
                  characteristics: sample.characteristics || []
                });
              }
            }
          } catch (sampleError) {
            console.error('[Merging] Error merging samples:', sampleError);
            // Continue with other results
          }
        }

        // Merge protocols
        if (result.protocols) {
          try {
            for (const protocol of result.protocols) {
              const key = protocol.name || 'Main Protocol';

              if (protocolMap.has(key)) {
                // Merge with existing protocol
                const existing = protocolMap.get(key);

                // Merge inputs (unique)
                const inputSet = new Set([...(existing.inputs || []), ...(protocol.inputs || [])]);
                existing.inputs = Array.from(inputSet);

                // Merge parameters (by name)
                const paramMap = new Map((existing.parameters || []).map(p => [p.name, p]));
                for (const param of (protocol.parameters || [])) {
                  if (!paramMap.has(param.name)) {
                    paramMap.set(param.name, param);
                  }
                }
                existing.parameters = Array.from(paramMap.values());

                // Merge outputs (unique)
                const outputSet = new Set([...(existing.outputs || []), ...(protocol.outputs || [])]);
                existing.outputs = Array.from(outputSet);

                // Combine descriptions
                if (protocol.description && !existing.description.includes(protocol.description)) {
                  existing.description += ' ' + protocol.description;
                }
              } else {
                // Add new protocol
                protocolMap.set(key, {
                  name: protocol.name || 'Main Protocol',
                  description: protocol.description || '',
                  inputs: protocol.inputs || [],
                  parameters: protocol.parameters || [],
                  outputs: protocol.outputs || []
                });
              }
            }
          } catch (protocolError) {
            console.error('[Merging] Error merging protocols:', protocolError);
            // Continue with other results
          }
        }
      }

      merged.samples = Array.from(sampleMap.values());
      merged.protocols = Array.from(protocolMap.values());

      console.log(`[Merging] Merged into ${merged.samples.length} sample(s) and ${merged.protocols.length} protocol(s)`);
      return merged;
    } catch (error) {
      console.error('[Merging] Critical error in mergeChunkResults:', error);
      // Return minimal fallback structure
      return {
        samples: [],
        protocols: []
      };
    }
  }

  /**
   * Helper: Retry a fetch request with exponential backoff and model fallback
   * Handles 429 (rate limit) by switching models, 503 (service unavailable), and network errors
   * @param {Function} fetchFn - Async function that takes (model) and returns a fetch response
   * @param {string} initialModel - Initial model to try
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @param {number} initialDelay - Initial delay in ms (default: 1000)
   * @returns {Promise<{response: Response, model: string}>} - Fetch response and model used
   */
  async function retryWithBackoff(fetchFn, initialModel, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    let lastResponse;
    let currentModel = initialModel;
    // Filter out the initial model from fallback list to avoid retrying with same model
    const allFallbacks = getFallbackModels();
    const fallbackModels = allFallbacks.filter(model => model !== initialModel);
    let fallbackIndex = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchFn(currentModel);
        lastResponse = response;

        // If successful, return immediately with the model used
        if (response.ok) {
          return { response, model: currentModel };
        }

        // 429 Rate Limit - switch to fallback model if available
        if (response.status === 429 && attempt < maxRetries) {
          // Try to parse error message to confirm it's a model rate limit
          let errorData;
          try {
            errorData = await response.clone().json();
            console.warn(`[Datamap LLM] Rate limit (429) on model: ${currentModel}`);
            if (errorData.error?.message) {
              console.warn(`[Datamap LLM] Error message: ${errorData.error.message}`);
            }
          } catch (e) {
            // Ignore JSON parse errors
          }

          // Switch to next fallback model if available
          if (fallbackIndex < fallbackModels.length) {
            currentModel = fallbackModels[fallbackIndex];
            fallbackIndex++;
            console.warn(`[Datamap LLM] Switching to fallback model: ${currentModel}`);
            continue; // Retry immediately with new model
          } else {
            // No more fallback models, use delay
            const delay = 5000;
            console.warn(`[Datamap LLM] No more fallback models, retrying with delay ${delay/1000}s (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // Server error (5xx) - retry with exponential backoff
        if (response.status >= 500 && attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`[Datamap LLM] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Other client errors (4xx except 429) - don't retry
        if (response.status >= 400 && response.status < 500) {
          return { response, model: currentModel };
        }

        return { response, model: currentModel };
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`[Datamap LLM] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Return the last response if we have one, otherwise throw error
    if (lastResponse) {
      return { response: lastResponse, model: currentModel };
    }
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Attempt to repair malformed JSON strings
   * Handles common issues like missing commas, trailing commas, unescaped quotes
   * @param {string} jsonString - Potentially malformed JSON string
   * @returns {string|null} - Repaired JSON string or null if repair failed
   */
  function repairJSON(jsonString) {
    try {
      let repaired = jsonString;

      // Fix 1: Remove trailing commas before closing brackets/braces
      repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

      // Fix 2: Add missing commas between array elements (common LLM error)
      // Look for patterns like }\n{ or ]\n[ without comma
      repaired = repaired.replace(/\}(\s*)\{/g, '},$1{');
      repaired = repaired.replace(/\](\s*)\[/g, '],$1[');

      // Fix 3: Add missing commas between object properties
      // Look for patterns like "value"\n"value" without comma
      repaired = repaired.replace(/"(\s*)\n(\s*)"/g, '",$1\n$2"');

      // Fix 4: Fix unescaped quotes inside strings (basic attempt)
      // This is tricky and may not work in all cases

      // Fix 5: Remove any trailing text after final closing brace
      const lastBrace = repaired.lastIndexOf('}');
      if (lastBrace !== -1) {
        repaired = repaired.substring(0, lastBrace + 1);
      }

      // Fix 6: Ensure proper structure for common patterns
      // Fix missing commas after closing braces in arrays
      repaired = repaired.replace(/\}(\s+)\]/g, '}\n]'); // Clean up spacing
      repaired = repaired.replace(/\}(\s+)(?=")/g, '},\n'); // Add comma before next property

      console.log(`[JSON Repair] Applied ${6} repair patterns`);

      // Try to parse the repaired JSON
      JSON.parse(repaired);
      return repaired;
    } catch (error) {
      console.error(`[JSON Repair] Repair attempt failed:`, error.message);
      return null;
    }
  }

  /**
   * Call Together.AI API to extract structured data from protocol text
   * Supports chunking for long protocols and model selection
   * @param {string} protocolText - Protocol markdown text
   * @returns {Promise<Object>} - Extracted parameters, inputs, outputs
   */
  async function callTogetherAI(protocolText, useTestData = false, metadata = {}) {
    try {
      // TEST MODE: Return test data directly without API call
      if (useTestData || window.localStorage.getItem('llmTestMode') === 'true') {
        console.log('[Datamap LLM] Using TEST DATA - bypassing API call');
        console.log('[Datamap LLM] Test data:', TEST_PROTOCOL_DATA);
        // Simulate API delay for realism
        await new Promise(resolve => setTimeout(resolve, 500));
        return TEST_PROTOCOL_DATA;
      }

      // Get Together.AI API key from localStorage
      let togetherAPIKey = window.localStorage.getItem('togetherAPIKey');

      if (!togetherAPIKey) {
        console.warn('[Datamap LLM] No Together.AI API key found in localStorage');
        return null;
      }

      // Get selected model
      const selectedModel = getSelectedModel();
      const contextWindow = getModelContextWindow(selectedModel);

      console.log(`[Datamap LLM] Using model: ${selectedModel}`);
      console.log(`[Datamap LLM] Context window: ${contextWindow} tokens`);

      // Reserve tokens for prompt template and response
      const promptOverhead = 1000; // Tokens for instructions
      const responseBuffer = 2000; // Tokens for response
      const maxInputTokens = contextWindow - promptOverhead - responseBuffer;

      // Check if chunking is needed
      const estimatedTokens = estimateTokens(protocolText);
      console.log(`[Datamap LLM] Protocol estimated tokens: ${estimatedTokens}`);

      let chunks = [];
      if (estimatedTokens > maxInputTokens) {
        console.log(`[Datamap LLM] Protocol exceeds limit, chunking required`);
        chunks = chunkProtocolText(protocolText, maxInputTokens);
        console.log(`[Datamap LLM] Created ${chunks.length} chunk(s)`);
      } else {
        console.log(`[Datamap LLM] Protocol fits in single request`);
        chunks = [protocolText];
      }

      // Process each chunk
      const chunkResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkInfo = chunks.length > 1 ? ` (chunk ${i + 1}/${chunks.length})` : '';
        console.log(`[Datamap LLM] Processing${chunkInfo}...`);

        // Build context information if metadata provided
        let contextInfo = '';
        if (metadata.protocolFilename) {
          contextInfo += `\nProtocol File: ${metadata.protocolFilename}`;
        }
        if (metadata.protocolPath) {
          contextInfo += `\nProtocol Path: ${metadata.protocolPath}`;
        }
        if (metadata.assayId) {
          contextInfo += `\nAssay/Experiment ID: ${metadata.assayId}`;
        }

        // Check for custom prompt from localStorage (set via Prompt Editor)
        let customPrompt = null;
        try {
          const savedPrompt = window.localStorage.getItem('customLLMPrompt');
          if (savedPrompt) {
            customPrompt = JSON.parse(savedPrompt);
            console.log('[Datamap LLM] Using custom prompt from localStorage');
          }
        } catch (e) {
          console.warn('[Datamap LLM] Could not parse custom prompt, using default');
        }

        // Build prompt template (use custom if available, otherwise use default)
        let promptTemplate;
        if (customPrompt) {
          // Assemble custom prompt
          promptTemplate = `${customPrompt.systemRole}${chunks.length > 1 ? ' Analyze this experimental protocol section and extract structured information.' : ''}
${contextInfo}
Protocol Text${chunkInfo}:
"""
${chunk}
"""

${customPrompt.jsonSchema}

${customPrompt.extractionRules}

${chunks.length > 1 ? 'NOTE: This is part of a larger protocol, extract what you can from this section\n\n' : ''}${customPrompt.examples}`;
        } else {
          // Use default prompt
          promptTemplate = `You are a scientific data extraction assistant. Analyze this experimental protocol${chunks.length > 1 ? ' section' : ''} and extract structured information.
${contextInfo}
Protocol Text${chunkInfo}:
"""
${chunk}
"""

Extract and return ONLY a JSON object (no markdown, no explanation) with this structure:
{
  "samples": [
    {
      "name": "Sample identifier or name (e.g., Sample_1, Blood_Sample_A, Patient_001)",
      "organism": "Organism or source (e.g., Homo sapiens, E. coli, Arabidopsis)",
      "characteristics": [
        {
          "category": "Characteristic category (e.g., age, tissue type, genotype, treatment, location, collection date)",
          "value": "Characteristic value (actual value, not a description)",
          "unit": "Unit if applicable (e.g., years, °C, mg/L) or empty string",
          "termSource": "Ontology source (e.g., NCIT, OBI, EFO) or empty string if unknown",
          "termAccession": "Ontology term ID or empty string if unknown"
        }
      ]
    }
  ],
  "protocols": [
    {
      "name": "Protocol step name (e.g., Sample Preparation, Measurement, Analysis)",
      "description": "Brief description of this protocol step",
      "inputs": ["array of input sample/material names - ONE VALUE PER ROW. For 3 samples, use 3 entries: ['Sample_1', 'Sample_2', 'Sample_3']"],
      "parameters": [
        {
          "name": "parameter name (e.g., temperature, incubation time, buffer concentration)",
          "value": "actual value if specified in protocol (e.g., '37', '60', '100'), empty string if not specified",
          "unit": "measurement unit (e.g., °C, min, mM, µL) or empty string",
          "description": "what this parameter represents"
        }
      ],
      "outputs": ["array of output sample/material names - ONE VALUE PER ROW. Length MUST match inputs. For 3 input samples, use 3 output entries: ['Output_1', 'Output_2', 'Output_3']"],
      "dataFiles": ["array of data file names - ONE VALUE PER ROW. MUST match length of inputs/outputs. Can repeat filenames if multiple samples share the same file. Use empty string for rows with no data files. Examples: 'results.csv', '*.fastq', 'plot.png'"]
    }
  ]
}

CRITICAL - PARAMETER EXTRACTION RULES:
1. **Extract ALL parameters mentioned in the protocol**, including:
   - Software/tool names and versions (e.g., "FastQC version", "SPAdes assembler version")
   - Command-line arguments and flags (e.g., "SLIDINGWINDOW parameter", "k-mer size")
   - File paths and directories (e.g., "output directory", "reference database path")
   - Thresholds and cutoffs (e.g., "quality score threshold", "coverage cutoff")
   - Settings and configurations (e.g., "thread count", "memory allocation")
   - Physical measurements (e.g., "temperature", "incubation time", "volume")
   - Chemical concentrations (e.g., "NaCl concentration", "DNA concentration")
   - Equipment settings (e.g., "centrifuge speed", "voltage")

2. **For bioinformatics/computational protocols**, extract:
   - Software tool names (e.g., "Trimmomatic", "FastQC", "SPAdes")
   - Version numbers (even if not specified, include as parameter)
   - Algorithm parameters (e.g., "minimum read length", "quality threshold")
   - Reference databases (e.g., "NCBI RefSeq", "UniProt database")
   - File format specifications (e.g., "FASTQ format", "GFF3 format")

3. **If a parameter value is mentioned**, include it in the description field
4. **If a parameter is implied but not detailed**, still include it with empty unit
5. **Even if parameters array would be empty**, try to infer at least 2-3 key parameters from context

IMPORTANT - SAMPLE EXTRACTION:
1. **Extract sample information** from protocol:
   - Sample names/identifiers mentioned in the protocol
   - Organism or source material (human, bacteria, plant, cell line, etc.)
   - Sample characteristics (age, tissue type, genotype, treatment, condition, etc.)
   - If no specific samples mentioned, create generic samples (e.g., "Sample_1", "Sample_2")

IMPORTANT - PROTOCOL LINKING:
1. **Link protocols sequentially** - CRITICAL:
   - The OUTPUT of one protocol MUST EXACTLY MATCH the INPUT of the next protocol
   - Example: Protocol 1 outputs "Trimmed reads" → Protocol 2 inputs "Trimmed reads" (exact match!)
   - DO NOT use generic terms like "data" or "result" - be specific
2. **Protocol naming**:
   - Use clear names (e.g., "Quality Control", "Trimming", "Assembly", "Annotation")
   - If multiple steps, create separate protocol objects
3. **First protocol inputs**:
   - Should reference sample names from the samples array
   - Or use specific material names (e.g., "Raw sequencing data from Sample_1")
4. **Tools/software are parameters**, NOT outputs
5. **Protocol REF (Reference)**:
   - Each protocol should reference the source protocol file${metadata.protocolPath ? ` (${metadata.protocolPath})` : ''}
   - The "description" field can include: "See detailed protocol in: [protocol file path]"
   - This helps link the extracted data back to the original documentation

IMPORTANT - DATA FILE LINKING:
1. **Array length rule** - CRITICAL:
   - dataFiles array MUST have SAME LENGTH as inputs/outputs arrays
   - If 3 inputs → 3 dataFiles entries (one per row/sample)
   - If 2 outputs → 2 dataFiles entries
2. **Duplication for shared files**:
   - Multiple samples in ONE file → REPEAT the filename
   - Example: 3 samples in "measurements.xlsx" → ["measurements.xlsx", "measurements.xlsx", "measurements.xlsx"]
3. **Individual files per sample**:
   - Each sample has its own file → list each filename
   - Example: ["sample1.csv", "sample2.csv", "sample3.csv"]
4. **Mixed scenarios**:
   - Some samples share a file, others don't → repeat as needed
   - Example: ["batch1.csv", "batch1.csv", "sample3_only.csv"]
5. **File name extraction**:
   - Explicit names: "saved as results.csv" → "results.csv"
   - Patterns: "FASTQ files for each sample" → ["*.fastq", "*.fastq", "*.fastq"]
   - Images: "Figure 1 (plot.png)" → "plot.png"
   - Formats: "exported to CSV" → "results.csv" or "*.csv"
6. **No data files**:
   - If no files mentioned → use empty strings: ["", "", ""]
   - Or omit dataFiles field entirely (backward compatible)

${chunks.length > 1 ? 'NOTE: This is part of a larger protocol, extract what you can from this section\n\n' : ''}EXAMPLES:
**Good parameter extraction with values and units**:
- {"name": "Temperature", "value": "37", "unit": "°C", "description": "Incubation temperature"}
- {"name": "FastQC version", "value": "0.11.9", "unit": "", "description": "Quality control tool version"}
- {"name": "Minimum read length", "value": "50", "unit": "bp", "description": "Threshold for read trimming"}

Note: Parameters are stored as free text with units combined (e.g., "37 °C"), not as ontology terms.

**Good protocol linking**:
- Protocol 1: inputs: ["Raw sequencing data"], outputs: ["Quality report", "Trimmed reads"]
- Protocol 2: inputs: ["Trimmed reads"], outputs: ["Assembled contigs"]
- Protocol 3: inputs: ["Assembled contigs"], outputs: ["Annotated genomes"]

**Good sample extraction with characteristics**:
Sample with location and collection date:
- {"name": "Sample_1", "organism": "E. coli", "characteristics": [
    {"category": "strain", "value": "K-12", "unit": "", "termSource": "NCBI", "termAccession": ""},
    {"category": "Location", "value": "Lab A", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C25341"},
    {"category": "Collection Date", "value": "2024-01-15", "unit": "", "termSource": "NCIT", "termAccession": "NCIT:C81286"}
  ]}

Sample with treatment:
- {"name": "Sample_2", "organism": "Mus musculus", "characteristics": [
    {"category": "age", "value": "8", "unit": "weeks", "termSource": "UO", "termAccession": "UO:0000034"},
    {"category": "treatment", "value": "Drug X", "unit": "mg/kg", "termSource": "", "termAccession": ""}
  ]}

**Good data file linking**:
Example 1 - Shared measurement file (3 samples, 1 file):
- Protocol: "All samples measured together in measurements.xlsx"
- inputs: ["Plant_A", "Plant_B", "Plant_C"]
- outputs: ["Measurement_A", "Measurement_B", "Measurement_C"]
- dataFiles: ["measurements.xlsx", "measurements.xlsx", "measurements.xlsx"]

Example 2 - Individual sequencing files (2 samples, 2 files):
- Protocol: "Each sample sequenced separately: sample1.fastq, sample2.fastq"
- inputs: ["Sample_1", "Sample_2"]
- outputs: ["Reads_1", "Reads_2"]
- dataFiles: ["sample1.fastq", "sample2.fastq"]

Example 3 - Mixed scenario (some shared, some individual):
- Protocol: "Samples 1-2 analyzed together in batch1.csv, sample 3 processed separately as sample3.csv"
- inputs: ["S1", "S2", "S3"]
- outputs: ["Result_1", "Result_2", "Result_3"]
- dataFiles: ["batch1.csv", "batch1.csv", "sample3.csv"]

Example 4 - Wildcard pattern for multiple files:
- Protocol: "FASTQ files generated for each sample"
- inputs: ["Sample_A", "Sample_B"]
- outputs: ["Sequencing_A", "Sequencing_B"]
- dataFiles: ["*.fastq", "*.fastq"]

Example 5 - No data files mentioned:
- inputs: ["Sample_1", "Sample_2"]
- outputs: ["Processed_1", "Processed_2"]
- dataFiles: ["", ""]

Return ONLY valid JSON, no additional text.`;
        }

        // Use retry with exponential backoff and model fallback for resilience
        const { response, model: usedModel } = await retryWithBackoff(async (model) => {
          return fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${togetherAPIKey}`
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 8192, // Increase token limit to prevent truncation
              temperature: 0.1, // Lower temperature for more consistent JSON output
              stream: true, // Enable streaming mode
              messages: [{
                role: 'user',
                content: promptTemplate
              }]
            })
          });
        }, selectedModel, 3, 2000); // Start with selected model, 3 retries, 2s delay

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Datamap LLM] API error ${response.status}:`, errorText);
          throw new Error(`Together.AI API error: ${response.status} - ${errorText}`);
        }

        console.log(`[Datamap LLM] Successfully used model: ${usedModel} (streaming mode)`);

        // Display stream header
        appendToLLMStream(`\n${'='.repeat(80)}\n[Chunk ${i + 1}/${chunks.length}] Model: ${usedModel} (Streaming)\n${'='.repeat(80)}\n`);

        // Read streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let content = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;

            // Check for stream end marker
            if (line.includes('[DONE]')) continue;

            try {
              // Remove 'data: ' prefix and parse
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                content += delta;
                appendToLLMStream(delta); // Real-time display in UI
              }
            } catch (err) {
              console.error('[Datamap LLM] Streaming parse error:', err, 'Line:', line);
            }
          }
        }

        console.log(`[Datamap LLM] Raw response${chunkInfo} (full):`, content);

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn(`[Datamap LLM] Could not extract JSON from chunk ${i + 1}, skipping`);
          continue;
        }

        const jsonString = jsonMatch[0];
        console.log(`[Datamap LLM] Extracted JSON string (length: ${jsonString.length}):`, jsonString);

        try {
          const extractedData = JSON.parse(jsonString);
          console.log(`[Datamap LLM] Extracted data${chunkInfo}:`, extractedData);
          chunkResults.push(extractedData);
        } catch (parseError) {
          console.error(`[Datamap LLM] JSON parse error for chunk ${i + 1}:`, parseError);
          console.error(`[Datamap LLM] Error position: ${parseError.message}`);

          // Try to repair the JSON
          console.log(`[Datamap LLM] Attempting to repair JSON...`);
          const repairedJSON = repairJSON(jsonString);

          if (repairedJSON) {
            try {
              const extractedData = JSON.parse(repairedJSON);
              console.log(`[Datamap LLM] ✓ Successfully repaired and parsed JSON`);
              console.log(`[Datamap LLM] Extracted data${chunkInfo}:`, extractedData);
              chunkResults.push(extractedData);
            } catch (repairError) {
              console.error(`[Datamap LLM] ✗ Failed to parse repaired JSON:`, repairError);
              console.error(`[Datamap LLM] Repaired JSON:`, repairedJSON);
              continue;
            }
          } else {
            console.error(`[Datamap LLM] ✗ Could not repair JSON`);
            continue;
          }
        }
      }

      // Merge results if multiple chunks
      if (chunkResults.length === 0) {
        console.error('[Datamap LLM] No valid results from any chunk');
        return null;
      } else if (chunkResults.length === 1) {
        return chunkResults[0];
      } else {
        return mergeChunkResults(chunkResults);
      }

    } catch (error) {
      console.error('[Datamap LLM] Error calling Together.AI API:', error);
      return null;
    }
  }

  /**
   * Generate isa.datamap.xlsx from LLM-extracted data
   * @param {Object} llmData - Extracted data from Together.AI API
   * @param {string} assayName - Assay identifier
   * @param {string} assayPath - Full path to assay folder
   * @param {string} collaborators - Comma-separated collaborator names
   * @returns {Promise<string>} - Path to generated datamap file
   */
  async function generateDatamapFromLLM(llmData, assayName, assayPath, collaborators) {
    try {
      console.log('[Datamap Gen] Generating datamap from LLM data...');

      // Load datamap template
      const response = await fetch('templates/isa.datamap.xlsx');
      if (!response.ok) {
        throw new Error('Could not load datamap template');
      }

      const templateBuffer = await response.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);

      const worksheet = workbook.getWorksheet('isa_datamap');
      if (!worksheet) {
        throw new Error('Template missing isa_datamap worksheet');
      }

      const datasetPath = `./dataset/${assayName}-data.csv`;
      let colIndex = 1;

      // Add sample name row (always first)
      worksheet.addRow([
        `"${datasetPath}#col=${colIndex}"`,
        'text/csv',
        'https://datatracker.ietf.org/doc/html/rfc7111',
        'Sample Name',
        'DPBO',
        'DPBO:0000180',
        ' ',
        ' ',
        ' ',
        'text',
        ' ',
        ' ',
        'Samples are a kind of material and represent major outputs resulting from a protocol application.',
        `"${collaborators}"`
      ]);
      colIndex++;

      // Add input columns
      if (llmData.inputs && llmData.inputs.length > 0) {
        for (const input of llmData.inputs) {
          worksheet.addRow([
            `"${datasetPath}#col=${colIndex}"`,
            'text/csv',
            'https://datatracker.ietf.org/doc/html/rfc7111',
            input,
            ' ',
            ' ',
            ' ',
            ' ',
            ' ',
            'text',
            ' ',
            ' ',
            `Input: ${input}`,
            `"${collaborators}"`
          ]);
          colIndex++;
        }
      }

      // Add parameter columns from LLM extraction
      if (llmData.parameters && llmData.parameters.length > 0) {
        for (const param of llmData.parameters) {
          worksheet.addRow([
            `"${datasetPath}#col=${colIndex}"`,
            'text/csv',
            'https://datatracker.ietf.org/doc/html/rfc7111',
            param.name || 'Unknown Parameter',
            ' ',
            ' ',
            param.unit || ' ',
            ' ',
            ' ',
            param.type || 'text',
            ' ',
            ' ',
            param.description || '',
            `"${collaborators}"`
          ]);
          colIndex++;
        }
      }

      // Add output columns
      if (llmData.outputs && llmData.outputs.length > 0) {
        for (const output of llmData.outputs) {
          worksheet.addRow([
            `"${datasetPath}#col=${colIndex}"`,
            'text/csv',
            'https://datatracker.ietf.org/doc/html/rfc7111',
            output,
            ' ',
            ' ',
            ' ',
            ' ',
            ' ',
            'text',
            ' ',
            ' ',
            `Output: ${output}`,
            `"${collaborators}"`
          ]);
          colIndex++;
        }
      }

      // Write datamap file
      const buffer = await workbook.xlsx.writeBuffer();
      const datamapPath = memfsPathJoin(assayPath, 'dataset', 'isa.datamap.xlsx');

      // Ensure dataset directory exists
      const datasetDir = memfsPathJoin(assayPath, 'dataset');
      if (!window.FS.fs.existsSync(datasetDir)) {
        window.FS.fs.mkdirSync(datasetDir, { recursive: true });
      }

      window.FS.fs.writeFileSync(datamapPath, new Uint8Array(buffer));
      console.log(`[Datamap Gen] Created: ${datamapPath}`);

      return datamapPath;

    } catch (error) {
      console.error('[Datamap Gen] Error generating datamap:', error);
      return null;
    }
  }

  /**
   * Main coordinator function: Parse protocol and generate datamap
   * @param {string} protocolMarkdown - Protocol text in markdown format
   * @param {string} assayName - Assay identifier
   * @param {string} assayPath - Full path to assay folder
   * @returns {Promise<string|null>} - Path to generated datamap or null if failed
   */
  async function parseProtocolToDatamap(protocolMarkdown, assayName, assayPath) {
    try {
      console.log('[Datamap] Starting protocol-to-datamap conversion...');

      // Call LLM to extract structured data
      const llmData = await callTogetherAI(protocolMarkdown);

      if (!llmData) {
        console.warn('[Datamap] LLM extraction failed or returned no data');
        return null;
      }

      // Get collaborator info from GitLab user
      const collaborators = window.userId?.name || 'elab2arc';

      // Generate datamap from extracted data
      const datamapPath = await generateDatamapFromLLM(llmData, assayName, assayPath, collaborators);

      if (datamapPath) {
        console.log('[Datamap] Successfully created datamap:', datamapPath);
      } else {
        console.warn('[Datamap] Failed to generate datamap file');
      }

      return datamapPath;

    } catch (error) {
      console.error('[Datamap] Error in parseProtocolToDatamap:', error);
      return null;
    }
  }

  /**
   * Append text to LLM stream UI accordion with auto-scroll
   * @param {string} text - Text to append
   */
  function appendToLLMStream(text) {
    const streamContent = document.getElementById('llmStreamContent');
    if (streamContent) {
      streamContent.textContent += text;
      // Auto-scroll to bottom
      streamContent.scrollTop = streamContent.scrollHeight;
    }
  }

  /**
   * Clear LLM stream UI accordion
   */
  function clearLLMStream() {
    const streamContent = document.getElementById('llmStreamContent');
    if (streamContent) {
      streamContent.textContent = '';
    }
  }

  // Export public API
  window.Elab2ArcLLM = {
    getSelectedModel: getSelectedModel,
    getModelContextWindow: getModelContextWindow,
    estimateTokens: estimateTokens,
    chunkProtocolText: chunkProtocolText,
    splitByParagraphs: splitByParagraphs,
    splitBySentences: splitBySentences,
    mergeChunkResults: mergeChunkResults,
    callTogetherAI: callTogetherAI,
    generateDatamapFromLLM: generateDatamapFromLLM,
    parseProtocolToDatamap: parseProtocolToDatamap,
    appendToLLMStream: appendToLLMStream,
    clearLLMStream: clearLLMStream
  };

})(window);
