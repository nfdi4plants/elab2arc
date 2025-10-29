// =============================================================================
// ELAB2ARC EXTRA FIELDS HANDLER
// Dedicated module for handling all eLabFTW extra field types
// =============================================================================

(function(window) {
  'use strict';

  // Entity cache to avoid duplicate API calls
  const entityCache = {
    experiments: {},
    items: {},
    users: {}
  };

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================

  /**
   * Escape HTML special characters
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape markdown special characters (mainly pipe for tables)
   */
  function escapeMarkdown(str) {
    if (!str) return '';
    return String(str).replace(/\|/g, '\\|');
  }

  /**
   * Check if value is an array (for multi-value fields)
   */
  function normalizeValue(value) {
    if (Array.isArray(value)) {
      return value;
    }
    return value != null ? [value] : [];
  }

  // =============================================================================
  // TYPE-SPECIFIC FORMATTERS FOR HTML
  // =============================================================================

  /**
   * Format text field value for HTML
   */
  function formatTextHTML(field) {
    const value = field.value || '';
    return escapeHTML(value);
  }

  /**
   * Format number field value for HTML (with unit)
   */
  function formatNumberHTML(field) {
    let value = field.value || '';
    if (value && field.unit) {
      value = `${value} ${field.unit}`;
    }
    return escapeHTML(value);
  }

  /**
   * Format date field value for HTML
   */
  function formatDateHTML(field) {
    const value = field.value;
    if (!value) return '';

    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return escapeHTML(value);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return escapeHTML(value);
    }
  }

  /**
   * Format datetime field value for HTML
   */
  function formatDateTimeHTML(field) {
    const value = field.value;
    if (!value) return '';

    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return escapeHTML(value);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return escapeHTML(value);
    }
  }

  /**
   * Format time field value for HTML
   */
  function formatTimeHTML(field) {
    const value = field.value || '';
    return escapeHTML(value);
  }

  /**
   * Format email field value for HTML (with mailto link)
   */
  function formatEmailHTML(field) {
    const value = field.value || '';
    if (!value) return '';
    const escaped = escapeHTML(value);
    return `<a href="mailto:${escaped}">${escaped}</a>`;
  }

  /**
   * Format URL field value for HTML (with hyperlink)
   */
  function formatUrlHTML(field) {
    const value = field.value || '';
    if (!value) return '';
    const escaped = escapeHTML(value);
    return `<a href="${escaped}" target="_blank">${escaped}</a>`;
  }

  /**
   * Format select field value for HTML
   */
  function formatSelectHTML(field) {
    const values = normalizeValue(field.value);
    if (values.length === 0) return '';

    // If multi-value, join with commas
    return escapeHTML(values.join(', '));
  }

  /**
   * Format radio field value for HTML
   */
  function formatRadioHTML(field) {
    const value = field.value || '';
    return escapeHTML(value);
  }

  /**
   * Format checkbox field value for HTML
   */
  function formatCheckboxHTML(field) {
    const values = normalizeValue(field.value);
    if (values.length === 0) return '';

    // For checkboxes, values might be boolean or array of selected options
    if (values.length === 1 && typeof values[0] === 'boolean') {
      return values[0] ? '☑ Yes' : '☐ No';
    }

    // Multiple checkbox values
    return escapeHTML(values.join(', '));
  }

  /**
   * Format experiments field value for HTML (with links)
   * @param {Object} field - The field object
   * @param {Array} resolvedEntities - Resolved experiment data from API
   */
  function formatExperimentsHTML(field, resolvedEntities, instance) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeHTML(`Experiment ID: ${values.join(', ')}`);
    }

    const elabWWW = instance.replace('api/v2/', '');
    const links = resolvedEntities.map(exp => {
      const title = escapeHTML(exp.title || `Experiment ${exp.id}`);
      const url = `${elabWWW}experiments.php?mode=view&id=${exp.id}`;
      return `<a href="${url}" target="_blank">${title}</a>`;
    });

    return links.join('<br>');
  }

  /**
   * Format items/resources field value for HTML (with links)
   * @param {Object} field - The field object
   * @param {Array} resolvedEntities - Resolved item data from API
   */
  function formatItemsHTML(field, resolvedEntities, instance) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeHTML(`Resource ID: ${values.join(', ')}`);
    }

    const elabWWW = instance.replace('api/v2/', '');
    const links = resolvedEntities.map(item => {
      const title = escapeHTML(item.title || `Resource ${item.id}`);
      const url = `${elabWWW}database.php?mode=view&id=${item.id}`;
      return `<a href="${url}" target="_blank">${title}</a>`;
    });

    return links.join('<br>');
  }

  /**
   * Format users field value for HTML
   * @param {Object} field - The field object
   * @param {Array} resolvedEntities - Resolved user data from API
   */
  function formatUsersHTML(field, resolvedEntities) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeHTML(`User ID: ${values.join(', ')}`);
    }

    const names = resolvedEntities.map(user =>
      escapeHTML(user.fullname || user.email || `User ${user.userid}`)
    );

    return names.join(', ');
  }

  // =============================================================================
  // TYPE-SPECIFIC FORMATTERS FOR MARKDOWN
  // =============================================================================

  /**
   * Format text field value for Markdown
   */
  function formatTextMD(field) {
    const value = field.value || '';
    return escapeMarkdown(value);
  }

  /**
   * Format number field value for Markdown (with unit)
   */
  function formatNumberMD(field) {
    let value = field.value || '';
    if (value && field.unit) {
      value = `${value} ${field.unit}`;
    }
    return escapeMarkdown(value);
  }

  /**
   * Format date field value for Markdown
   */
  function formatDateMD(field) {
    const value = field.value;
    if (!value) return '';

    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return escapeMarkdown(value);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return escapeMarkdown(value);
    }
  }

  /**
   * Format datetime field value for Markdown
   */
  function formatDateTimeMD(field) {
    const value = field.value;
    if (!value) return '';

    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return escapeMarkdown(value);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return escapeMarkdown(value);
    }
  }

  /**
   * Format time field value for Markdown
   */
  function formatTimeMD(field) {
    const value = field.value || '';
    return escapeMarkdown(value);
  }

  /**
   * Format email field value for Markdown
   */
  function formatEmailMD(field) {
    const value = field.value || '';
    return escapeMarkdown(value);
  }

  /**
   * Format URL field value for Markdown (with hyperlink)
   */
  function formatUrlMD(field) {
    const value = field.value || '';
    if (!value) return '';
    const escaped = escapeMarkdown(value);
    return `[${escaped}](${escaped})`;
  }

  /**
   * Format select field value for Markdown
   */
  function formatSelectMD(field) {
    const values = normalizeValue(field.value);
    if (values.length === 0) return '';

    return escapeMarkdown(values.join(', '));
  }

  /**
   * Format radio field value for Markdown
   */
  function formatRadioMD(field) {
    const value = field.value || '';
    return escapeMarkdown(value);
  }

  /**
   * Format checkbox field value for Markdown
   */
  function formatCheckboxMD(field) {
    const values = normalizeValue(field.value);
    if (values.length === 0) return '';

    if (values.length === 1 && typeof values[0] === 'boolean') {
      return values[0] ? '☑ Yes' : '☐ No';
    }

    return escapeMarkdown(values.join(', '));
  }

  /**
   * Format experiments field value for Markdown (with links)
   */
  function formatExperimentsMD(field, resolvedEntities, instance) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeMarkdown(`Experiment ID: ${values.join(', ')}`);
    }

    const elabWWW = instance.replace('api/v2/', '');
    const links = resolvedEntities.map(exp => {
      const title = escapeMarkdown(exp.title || `Experiment ${exp.id}`);
      const url = `${elabWWW}experiments.php?mode=view&id=${exp.id}`;
      return `[${title}](${url})`;
    });

    return links.join('<br>');
  }

  /**
   * Format items/resources field value for Markdown (with links)
   */
  function formatItemsMD(field, resolvedEntities, instance) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeMarkdown(`Resource ID: ${values.join(', ')}`);
    }

    const elabWWW = instance.replace('api/v2/', '');
    const links = resolvedEntities.map(item => {
      const title = escapeMarkdown(item.title || `Resource ${item.id}`);
      const url = `${elabWWW}database.php?mode=view&id=${item.id}`;
      return `[${title}](${url})`;
    });

    return links.join('<br>');
  }

  /**
   * Format users field value for Markdown
   */
  function formatUsersMD(field, resolvedEntities) {
    if (!resolvedEntities || resolvedEntities.length === 0) {
      const values = normalizeValue(field.value);
      return escapeMarkdown(`User ID: ${values.join(', ')}`);
    }

    const names = resolvedEntities.map(user =>
      escapeMarkdown(user.fullname || user.email || `User ${user.userid}`)
    );

    return names.join(', ');
  }

  // =============================================================================
  // ENTITY RESOLUTION (API CALLS)
  // =============================================================================

  /**
   * Resolve entity IDs to full data via API
   * @param {string} entityType - 'experiments', 'items', or 'users'
   * @param {Array} ids - Array of entity IDs to resolve
   * @param {string} instance - eLabFTW instance URL
   * @param {string} token - eLabFTW API token
   * @returns {Promise<Array>} Array of resolved entity objects
   */
  async function resolveEntities(entityType, ids, instance, token) {
    if (!ids || ids.length === 0) return [];

    const endpoint = entityType === 'items' ? 'items' : entityType;
    const results = [];

    for (const id of ids) {
      // Check cache first
      const cacheKey = `${instance}_${id}`;
      if (entityCache[entityType][cacheKey]) {
        results.push(entityCache[entityType][cacheKey]);
        continue;
      }

      // Fetch from API
      try {
        const data = await window.fetchElabJSON(token, `${endpoint}/${id}`, instance);
        if (data && !data.error) {
          entityCache[entityType][cacheKey] = data;
          results.push(data);
        } else {
          console.warn(`Failed to resolve ${entityType} ID ${id}`);
        }
      } catch (error) {
        console.error(`Error resolving ${entityType} ID ${id}:`, error);
      }
    }

    return results;
  }

  // =============================================================================
  // MAIN FORMATTING FUNCTIONS
  // =============================================================================

  /**
   * Format extra_fields as HTML table for preview display
   * @param {Object} metadata_decoded - The decoded metadata from eLabFTW
   * @param {string} instance - eLabFTW instance URL
   * @param {string} token - eLabFTW API token
   * @returns {Promise<string>} HTML table string
   */
  async function formatAsHTML(metadata_decoded, instance, token) {
    if (!metadata_decoded || !metadata_decoded.extra_fields) {
      return '';
    }

    const extraFields = metadata_decoded.extra_fields;
    const fieldNames = Object.keys(extraFields);

    if (fieldNames.length === 0) {
      return '';
    }

    // Sort fields by position
    const sortedFields = fieldNames.sort((a, b) => {
      const posA = extraFields[a].position || 999;
      const posB = extraFields[b].position || 999;
      return posA - posB;
    });

    // Pre-resolve all linked entities
    const entitiesToResolve = {
      experiments: [],
      items: [],
      users: []
    };

    sortedFields.forEach(fieldName => {
      const field = extraFields[fieldName];
      const fieldType = field.type || 'text';

      if (fieldType === 'experiments' || fieldType === 'items' || fieldType === 'users') {
        const ids = normalizeValue(field.value);
        entitiesToResolve[fieldType].push(...ids);
      }
    });

    // Resolve entities in parallel
    const [experiments, items, users] = await Promise.all([
      resolveEntities('experiments', entitiesToResolve.experiments, instance, token),
      resolveEntities('items', entitiesToResolve.items, instance, token),
      resolveEntities('users', entitiesToResolve.users, instance, token)
    ]);

    // Build entity lookup maps
    const entityMaps = {
      experiments: new Map(experiments.map(e => [String(e.id), e])),
      items: new Map(items.map(i => [String(i.id), i])),
      users: new Map(users.map(u => [String(u.userid), u]))
    };

    // Build HTML table
    let html = '<h2>Extra Fields</h2>\n<table class="table table-sm table-bordered">\n<thead>\n<tr><th>Field</th><th>Value</th></tr>\n</thead>\n<tbody>\n';

    sortedFields.forEach(fieldName => {
      const field = extraFields[fieldName];
      const fieldType = field.type || 'text';
      let valueHTML = '';

      // Format value based on type
      switch (fieldType) {
        case 'text':
          valueHTML = formatTextHTML(field);
          break;
        case 'number':
          valueHTML = formatNumberHTML(field);
          break;
        case 'date':
          valueHTML = formatDateHTML(field);
          break;
        case 'datetime-local':
          valueHTML = formatDateTimeHTML(field);
          break;
        case 'time':
          valueHTML = formatTimeHTML(field);
          break;
        case 'email':
          valueHTML = formatEmailHTML(field);
          break;
        case 'url':
          valueHTML = formatUrlHTML(field);
          break;
        case 'select':
          valueHTML = formatSelectHTML(field);
          break;
        case 'radio':
          valueHTML = formatRadioHTML(field);
          break;
        case 'checkbox':
          valueHTML = formatCheckboxHTML(field);
          break;
        case 'experiments':
          const expIds = normalizeValue(field.value);
          const expData = expIds.map(id => entityMaps.experiments.get(String(id))).filter(Boolean);
          valueHTML = formatExperimentsHTML(field, expData, instance);
          break;
        case 'items':
          const itemIds = normalizeValue(field.value);
          const itemData = itemIds.map(id => entityMaps.items.get(String(id))).filter(Boolean);
          valueHTML = formatItemsHTML(field, itemData, instance);
          break;
        case 'users':
          const userIds = normalizeValue(field.value);
          const userData = userIds.map(id => entityMaps.users.get(String(id))).filter(Boolean);
          valueHTML = formatUsersHTML(field, userData);
          break;
        default:
          valueHTML = formatTextHTML(field);
      }

      const escapedName = escapeHTML(fieldName);
      html += `<tr><td><strong>${escapedName}</strong>`;

      // Add description if present
      if (field.description) {
        const escapedDesc = escapeHTML(field.description);
        html += `<br><small class="text-muted"><em>${escapedDesc}</em></small>`;
      }

      html += `</td><td>${valueHTML}</td></tr>\n`;
    });

    html += '</tbody>\n</table>\n';

    return html;
  }

  /**
   * Format extra_fields as Markdown table for protocol.md file
   * @param {Object} metadata_decoded - The decoded metadata from eLabFTW
   * @param {string} instance - eLabFTW instance URL
   * @param {string} token - eLabFTW API token
   * @returns {Promise<string>} Markdown table string
   */
  async function formatAsMarkdown(metadata_decoded, instance, token) {
    if (!metadata_decoded || !metadata_decoded.extra_fields) {
      return '';
    }

    const extraFields = metadata_decoded.extra_fields;
    const fieldNames = Object.keys(extraFields);

    if (fieldNames.length === 0) {
      return '';
    }

    // Sort fields by position
    const sortedFields = fieldNames.sort((a, b) => {
      const posA = extraFields[a].position || 999;
      const posB = extraFields[b].position || 999;
      return posA - posB;
    });

    // Pre-resolve all linked entities
    const entitiesToResolve = {
      experiments: [],
      items: [],
      users: []
    };

    sortedFields.forEach(fieldName => {
      const field = extraFields[fieldName];
      const fieldType = field.type || 'text';

      if (fieldType === 'experiments' || fieldType === 'items' || fieldType === 'users') {
        const ids = normalizeValue(field.value);
        entitiesToResolve[fieldType].push(...ids);
      }
    });

    // Resolve entities in parallel
    const [experiments, items, users] = await Promise.all([
      resolveEntities('experiments', entitiesToResolve.experiments, instance, token),
      resolveEntities('items', entitiesToResolve.items, instance, token),
      resolveEntities('users', entitiesToResolve.users, instance, token)
    ]);

    // Build entity lookup maps
    const entityMaps = {
      experiments: new Map(experiments.map(e => [String(e.id), e])),
      items: new Map(items.map(i => [String(i.id), i])),
      users: new Map(users.map(u => [String(u.userid), u]))
    };

    // Build markdown table
    let markdown = '\n## Extra Fields\n\n';
    markdown += '| Field | Value |\n';
    markdown += '|-------|-------|\n';

    sortedFields.forEach(fieldName => {
      const field = extraFields[fieldName];
      const fieldType = field.type || 'text';
      let valueMD = '';

      // Format value based on type
      switch (fieldType) {
        case 'text':
          valueMD = formatTextMD(field);
          break;
        case 'number':
          valueMD = formatNumberMD(field);
          break;
        case 'date':
          valueMD = formatDateMD(field);
          break;
        case 'datetime-local':
          valueMD = formatDateTimeMD(field);
          break;
        case 'time':
          valueMD = formatTimeMD(field);
          break;
        case 'email':
          valueMD = formatEmailMD(field);
          break;
        case 'url':
          valueMD = formatUrlMD(field);
          break;
        case 'select':
          valueMD = formatSelectMD(field);
          break;
        case 'radio':
          valueMD = formatRadioMD(field);
          break;
        case 'checkbox':
          valueMD = formatCheckboxMD(field);
          break;
        case 'experiments':
          const expIds = normalizeValue(field.value);
          const expData = expIds.map(id => entityMaps.experiments.get(String(id))).filter(Boolean);
          valueMD = formatExperimentsMD(field, expData, instance);
          break;
        case 'items':
          const itemIds = normalizeValue(field.value);
          const itemData = itemIds.map(id => entityMaps.items.get(String(id))).filter(Boolean);
          valueMD = formatItemsMD(field, itemData, instance);
          break;
        case 'users':
          const userIds = normalizeValue(field.value);
          const userData = userIds.map(id => entityMaps.users.get(String(id))).filter(Boolean);
          valueMD = formatUsersMD(field, userData);
          break;
        default:
          valueMD = formatTextMD(field);
      }

      const escapedName = escapeMarkdown(fieldName);
      let row = `| **${escapedName}**`;

      // Add description if present
      if (field.description) {
        const escapedDesc = escapeMarkdown(field.description);
        row += `<br>*${escapedDesc}*`;
      }

      row += ` | ${valueMD} |\n`;
      markdown += row;
    });

    markdown += '\n';

    return markdown;
  }

  // =============================================================================
  // EXPORTS
  // =============================================================================

  window.Elab2ArcExtraFields = {
    formatAsHTML: formatAsHTML,
    formatAsMarkdown: formatAsMarkdown
  };

})(window);
