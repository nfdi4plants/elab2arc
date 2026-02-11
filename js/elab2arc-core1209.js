// =============================================================================
// ELAB2ARC CORE
// Main application logic for converting eLabFTW experiments to ARCs
// =============================================================================

// =============================================================================
// CONFIGURATION & GLOBALS
// =============================================================================

var fs = FS.fs;
var elabJSON;
var statusInfo = "";
const version = "2025-12-04";
var blobb = [];
var conversionHistory = []; // Store last 5 conversions
var conversionStartTime = null; // Track when conversion starts
    var typeConfig = {
      Experiment: {
        displayName: 'Experiment',
        short: 'Exp',
        endpoint: 'experiments',
        idendpoint: 'experiments/',
        hasPreview: true,
      },
      Resource: {
        displayName: 'Resource',
        short: 'Res',
        endpoint: 'items',
        idendpoint: 'items/',
        hasPreview: true,
      },
      // Add more types here as needed
      /*
      Template: {
        displayName: 'Template',
        short: 'Temp',
        endpoint: 'templates',
        hasPreview: true
      }
      */
    };
    const detailedInfo = document.getElementById("detailedStatus");
    const filesChanged = document.getElementById("filesChanged");

    // =============================================================================
    // PROGRESS UPDATE THROTTLING
    // =============================================================================
    let lastProgressUpdate = 0;
    const PROGRESS_THROTTLE_MS = 1000; // Update at most once per second

    // =============================================================================
    // PROXY CONFIGURATION WITH FALLBACK
    // =============================================================================
    const proxyConfig = {
      corsProxy: {
        primary: 'https://corsproxy.cplantbox.com/',
        backup: 'https://corsproxy2.cplantbox.com/',
        current: 'https://corsproxy.cplantbox.com/',
        tryDirectFirst: true  // Try direct access before using proxy
      },
      gitProxy: {
        primary: 'https://gitcors.cplantbox.com',
        backup: 'https://gitcors2.cplantbox.com',
        current: 'https://gitcors.cplantbox.com'
      }
    };

    // Log CORS info message at application startup
    console.info('%c[elab2arc] Note: CORS errors in the console are normal and expected. The application automatically falls back to using a CORS proxy when direct access is blocked.', 'color: #888; font-style: italic;');

    function getCorsProxy() {
      return proxyConfig.corsProxy.current;
    }

    function getGitProxy() {
      return proxyConfig.gitProxy.current;
    }

    function switchToBackupProxy(proxyType) {
      if (proxyType === 'cors' && proxyConfig.corsProxy.current === proxyConfig.corsProxy.primary) {
        proxyConfig.corsProxy.current = proxyConfig.corsProxy.backup;
        console.warn('[Proxy] Switched CORS proxy to backup:', proxyConfig.corsProxy.current);
        showWarningToast('Switched to backup CORS proxy');
        return true;
      } else if (proxyType === 'git' && proxyConfig.gitProxy.current === proxyConfig.gitProxy.primary) {
        proxyConfig.gitProxy.current = proxyConfig.gitProxy.backup;
        console.warn('[Proxy] Switched Git proxy to backup:', proxyConfig.gitProxy.current);
        showWarningToast('Switched to backup Git proxy');
        return true;
      }
      return false;
    }

    async function fetchWithProxyFallback(url, options = {}) {
      // Helper to detect CORS errors - treat any TypeError as CORS error when in direct-first mode
      // since we're specifically checking if direct browser-to-API access works
      const isCorsError = (error) => {
        // CORS errors typically manifest as TypeError with various messages
        // When tryDirectFirst is enabled, assume TypeError = CORS block
        return error && error.name === 'TypeError';
      };

      // Step 1: Try direct fetch (no proxy) - if enabled
      if (proxyConfig.corsProxy.tryDirectFirst) {
        try {
          console.log('[fetchWithProxyFallback] Trying direct access:', url);
          const response = await fetch(url, options);
          if (response.ok) {
            console.log('[fetchWithProxyFallback] Direct access succeeded');
            return response;
          }
          // If direct fetch got a response but not OK (e.g., 401, 404), proceed to proxy
          console.log('[fetchWithProxyFallback] Direct fetch returned non-OK status:', response.status);
        } catch (directError) {
          if (!isCorsError(directError)) {
            // Not a CORS error - rethrow immediately (e.g., network error, invalid URL)
            console.error('[fetchWithProxyFallback] Non-CORS error on direct fetch:', directError);
            throw directError;
          }
          console.log('[fetchWithProxyFallback] CORS error detected, falling back to proxy');
          console.info('[fetchWithProxyFallback] Note: CORS errors above are expected when server doesn\'t allow direct browser access. The application will use the CORS proxy instead.');
        }
      }

      // Step 2: Try primary CORS proxy
      const corsProxy = getCorsProxy();
      const fullUrl = corsProxy + url;

      // Add Origin header for CORS proxy (required by corsproxy.cplantbox.com)
      const proxyOptions = {
        ...options,
        headers: {
          ...options.headers,
          'Origin': window.location.origin
        }
      };

      try {
        console.log('[fetchWithProxyFallback] Trying primary proxy:', fullUrl);
        const response = await fetch(fullUrl, proxyOptions);
        if (!response.ok && response.status === 0) {
          throw new Error('CORS proxy failed');
        }
        return response;
      } catch (error) {
        // Step 3: Try backup CORS proxy
        if (switchToBackupProxy('cors')) {
          const backupUrl = getCorsProxy() + url;
          console.log('[fetchWithProxyFallback] Retrying with backup proxy:', backupUrl);
          return fetch(backupUrl, proxyOptions);
        }
        throw error;
      }
    }

    // =============================================================================
    // ARC README TEMPLATE
    // =============================================================================

    const arcReadmeText = `#   Project Title: [Your Project Title]

## Abstract

[Provide a concise summary of your research project.]

## Investigators

* [Name 1, Affiliation 1]
* [Name 2, Affiliation 2]
    ...

## Funding

[List funding sources and grant numbers.]

## Project Description

[Provide a detailed description of the research, including background, objectives, and methodology.]

## Data Overview

[Describe the types of data generated in this project.]

## ARC Structure

This ARC is organized as follows:

* **Studies:** Each study represents a specific experiment within the project.
* **Assays:** Each assay represents a specific technical analysis performed within a study.

## Studies

* [Study 1: *Descriptive Study Title 1*](./study1/README.md)
* [Study 2: *Descriptive Study Title 2*](./study2/README.md)
    ...

## License

CC BY 4.0

## Citations

[List relevant publications or datasets.]
`;

    // =============================================================================
    // TOAST NOTIFICATION SYSTEM
    // =============================================================================

    /**
     * Show a Bootstrap toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type: 'success', 'danger', 'warning', 'info', 'primary'
     * @param {number} duration - Auto-hide delay in milliseconds (default: 5000, use 0 for no auto-hide)
     */
    function showToast(message, type = 'info', duration = 5000) {
      const toastContainer = document.getElementById('toastContainer');
      if (!toastContainer) {
        console.error('Toast container not found');
        return;
      }

      // Create unique ID for this toast
      const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Icon mapping
      const icons = {
        success: '✓',
        danger: '✗',
        warning: '⚠',
        info: 'ℹ',
        primary: '▸'
      };

      const icon = icons[type] || 'ℹ';

      // Create toast HTML
      const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body">
              <strong>${icon}</strong> ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>
      `;

      // Add to container
      toastContainer.insertAdjacentHTML('beforeend', toastHTML);

      // Initialize and show toast
      const toastElement = document.getElementById(toastId);
      const bsToast = new bootstrap.Toast(toastElement, {
        autohide: duration > 0,
        delay: duration
      });

      // Remove from DOM after hidden
      toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
      });

      bsToast.show();
    }

    // Convenience functions for different toast types
    function showSuccessToast(message, duration = 5000) {
      showToast(message, 'success', duration);
    }

    function showErrorToast(message, duration = 8000) {
      showToast(message, 'danger', duration);
    }

    function showWarningToast(message, duration = 6000) {
      showToast(message, 'warning', duration);
    }

    function showInfoToast(message, duration = 5000) {
      showToast(message, 'info', duration);
    }

    // =============================================================================
    // END TOAST NOTIFICATION SYSTEM
    // =============================================================================

    var turndownService = new TurndownService();
    var mainOrMaster = "main";
    turndownService.keep(['table']);
    const kblinkJSON = {
      home: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/",
      arc: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#select-arc--start-conversion",
      token: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#create-an-personal-access-token-in-datahub",
      elabftw: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#select-elabftw-experimentresource"

    }

    // =============================================================================
    // SECURITY UTILITIES
    // =============================================================================

    /**
     * Sanitizes URLs by masking embedded credentials for safe logging
     * @param {string} url - URL that may contain credentials
     * @returns {string} - Sanitized URL with credentials masked
     */
    function sanitizeURLForLogging(url) {
      if (!url || typeof url !== 'string') return url;

      // Match pattern: //username:password@domain or //oauth2:token@domain
      // Replace with: //***:***@domain
      return url.replace(/\/\/([^:/@]+):([^@/]+)@/g, '//***:***@');
    }

    /**
     * Safe console logging that masks credentials in URLs
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments (URLs will be sanitized)
     */
    function safeLog(message, ...args) {
      const sanitizedArgs = args.map(arg => {
        if (typeof arg === 'string' && (arg.includes('://') || arg.includes('@'))) {
          return sanitizeURLForLogging(arg);
        }
        return arg;
      });
      console.log(message, ...sanitizedArgs);
    }

    // =============================================================================
    // TOKEN VALIDATION UTILITIES
    // =============================================================================

    /**
     * Validates eLabFTW API token format
     * Expected format: {teamId}-{40 hex characters}
     * Example: "20-b8e2485c173f8d8f8893bc7806f37847625d0c922c4ff7cc6b9cecf10b34035f7a243366ccd50a659c9320"
     * @param {string} token - eLabFTW API token to validate
     * @returns {Object} - { valid: boolean, warning: string }
     */
    function validateElabToken(token) {
      if (!token || typeof token !== 'string') {
        return { valid: false, warning: 'eLabFTW token is required' };
      }

      token = token.trim();

      // Check minimum length
      if (token.length < 10) {
        return { valid: false, warning: 'eLabFTW token is too short' };
      }

      // Check for expected format: number-hexstring
      const elabTokenPattern = /^\d+-[a-f0-9]{40,}$/i;
      if (!elabTokenPattern.test(token)) {
        return { valid: false, warning: 'eLabFTW token format appears invalid (expected: teamId-hexstring)' };
      }

      return { valid: true, warning: '' };
    }

    /**
     * Validates DataHub (GitLab) personal access token format
     * GitLab tokens are typically 20-26 alphanumeric characters with dashes/underscores
     * @param {string} token - DataHub token to validate
     * @returns {Object} - { valid: boolean, warning: string }
     */
    function validateDataHubToken(token) {
      if (!token || typeof token !== 'string') {
        return { valid: false, warning: 'DataHub token is required' };
      }

      token = token.trim();

      // Check minimum length
      if (token.length < 10) {
        return { valid: false, warning: 'DataHub token is too short' };
      }

      // Check for suspicious characters (should be alphanumeric + dash/underscore)
      const gitlabTokenPattern = /^[a-zA-Z0-9_-]+$/;
      if (!gitlabTokenPattern.test(token)) {
        return { valid: false, warning: 'DataHub token contains invalid characters' };
      }

      // Typical GitLab token length is 20-26 characters, warn if unusual
      if (token.length < 15) {
        return { valid: true, warning: 'DataHub token seems short (verify it is correct)' };
      }

      return { valid: true, warning: '' };
    }

    /**
     * Validates Together.AI API key format
     * Together.AI keys typically start with specific prefix and have specific length
     * @param {string} key - Together.AI API key to validate
     * @returns {Object} - { valid: boolean, warning: string }
     */
    function validateTogetherAPIKey(key) {
      if (!key || typeof key !== 'string') {
        return { valid: false, warning: 'Together.AI API key is required' };
      }

      key = key.trim();

      // Check minimum length (API keys are typically 40+ characters)
      if (key.length < 20) {
        return { valid: false, warning: 'Together.AI API key is too short' };
      }

      // Check for alphanumeric characters (API keys shouldn't have spaces or special chars)
      const apiKeyPattern = /^[a-zA-Z0-9_-]+$/;
      if (!apiKeyPattern.test(key)) {
        return { valid: false, warning: 'Together.AI API key contains invalid characters' };
      }

      return { valid: true, warning: '' };
    }

    /**
     * Display inline warning message for a form field
     * @param {string} fieldId - ID of the input field
     * @param {string} message - Warning message to display
     * @param {string} type - 'warning' or 'error' (default: 'warning')
     */
    function showTokenWarning(fieldId, message, type = 'warning') {
      const inputElement = document.getElementById(fieldId);
      if (!inputElement) return;

      // Remove existing warning
      const existingWarning = inputElement.parentElement.querySelector('.token-validation-warning');
      if (existingWarning) {
        existingWarning.remove();
      }

      if (!message) return;  // No message, just clear warnings

      // Create warning element
      const warningDiv = document.createElement('div');
      warningDiv.className = `token-validation-warning alert alert-${type === 'error' ? 'danger' : 'warning'} alert-dismissible fade show mt-2`;
      warningDiv.role = 'alert';
      warningDiv.style.fontSize = '0.875rem';
      warningDiv.innerHTML = `
        <small><strong>${type === 'error' ? '⚠️ Error:' : '⚠️ Warning:'}</strong> ${message}</small>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      `;

      // Insert after the input's parent container
      inputElement.parentElement.appendChild(warningDiv);
    }


    /**
     * Syncs experiment and resource IDs between input fields and localStorage.
     * If a new list is provided, updates DOM and localStorage.
     * If not, reads from DOM and updates internal state.
     *
     * @param {Object} [newList] - Optional object containing elabExperimentid / elabResourceid arrays
     * @returns {Object} - Updated or existing elablist object
     */
    function elabListSync(newList) {
      const expInput = document.getElementById("elabExperimentid");
      const resInput = document.getElementById("elabResourceid");
      const expInfo = document.getElementById("elabExpInfo");
      const resInfo = document.getElementById("elabResInfo");

      let elablist;

      if (newList) {
        // Use provided list and update inputs
        const expIDs = ElabidToText(newList.elabExperimentid);
        const resIDs = ElabidToText(newList.elabResourceid);

        expInput.value = expIDs;
        resInput.value = resIDs;

        // Save to localStorage
        localStorage.setItem('elabid', JSON.stringify(newList));

        elablist = newList;

      } else {
        // Read from inputs and convert to arrays
        const expIDs = textToElabid(expInput.value);
        const resIDs = textToElabid(resInput.value);

        elablist = {
          elabExperimentid: expIDs,
          elabResourceid: resIDs
        };

        // Update localStorage with latest values
        localStorage.setItem('elabid', JSON.stringify(elablist));
      }

      expInfo.innerHTML = "Experiment IDs: " + expInput.value;
      resInfo.innerHTML = "Resource IDs: " + resInput.value;

      return elablist;
    }


    window.updateelabList = async (search) => {
      fillElabTable("?q=" + search + "&order=id&sort=des&limit=999&", "elabTable", "update");
    }


    const elabCheckSync = async () => {
      let newExp = [], newRes = [];
      let elablist = elabListSync();
      const expChecks = document.querySelectorAll('[data-type="Experiment"]');
      expChecks.forEach(e => { e.checked = false });
      const resChecks = document.querySelectorAll('[data-type="Resource"]');
      resChecks.forEach(e => { e.checked = false });
      for (let e of elablist.elabExperimentid) {
        try {
          document.getElementById("checkExp" + e).checked = true;
          newExp.push(e);
        } catch (error) {
          try {
            await fillElabTable("?q=" + e + "&order=last_activity_at&sort=des&limit=999&", "elabTable", "append", { "Experiment": window.typeConfig.Experiment }, e);
            document.getElementById("checkExp" + e).checked = true;
            newExp.push(e);
          } catch (error) {
            showErrorToast("Error: " + error + ". Experiment No. " + e + " can not be accessed and has been removed from the list.");
          }
        }
      }
      for (let e of elablist.elabResourceid) {
        try {
          document.getElementById("checkRes" + e).checked = true;
          newRes.push(e);
        } catch (error) {
          try {
            await fillElabTable("?q=" + e + "&order=id&sort=des&limit=999&", "elabTable", "append", { "Resource": window.typeConfig.Resource }, e);
            document.getElementById("checkRes" + e).checked = true;
            newRes.push(e);
          } catch (error) {
            showErrorToast("Error: " + error + ". Resource No. " + e + " can not be accessed and has been removed from the list.");
          }
        }
      }
      elablist.elabExperimentid = newExp;
      elablist.elabResourceid = newRes;
      elablist.elabExperimentid.forEach(e => { document.getElementById("checkExp" + e).checked = true; })
      elablist.elabResourceid.forEach(e => { document.getElementById("checkRes" + e).checked = true; })
      elabListSync(elablist)
    }






    // Convert comma-separated text to unique ID array
    const textToElabid = (text) => {
      return text.split(',')
        .map(item => item.trim())
        .filter(item => {
          // Check if item is a positive integer
          const num = parseInt(item, 10);
          return item !== '' && !isNaN(num) && num > 0 && /^\d+$/.test(item);
        })
        .map(Number) // Convert strings to numbers
        .filter((item, index, self) => self.indexOf(item) === index); // Remove duplicates
    };
    // Convert array of IDs back to comma-separated text
    const ElabidToText = (arr) => {
      return arr.filter(Boolean).join(',');
    };

    window.elabPreview = async (element) => {
      loading.show();

      // Ensure offcanvas is opened - use getOrCreateInstance to avoid multiple instances
      const offcanvasEl = document.getElementById('elabPreviewCanvas');
      if (offcanvasEl) {
        const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
        offcanvas.show();
      }

      // Get all required parameters using getParameters
      const { elabtoken, datahubtoken, instance, elabidList } = await getParameters();

      // Extract ID from dataset
      const elabid = element.dataset.id;

      // Set cookies with current values
      setCookies(elabtoken, datahubtoken, instance);

      // Load experiment/resource preview
      await window.loadExperiment(instance, elabid, elabtoken, element.dataset.type);

      loading.hide();
    };


    // const startStepByStep= async ()=>{
    //   document.getElementById("ftwBtn").click();
    //   loading.show();
    //   const datahubToken = document.getElementById("datahubToken").value;
    //   const elabToken = document.getElementById("elabToken").value;
    //   const instance = window.localStorage.getItem('instance');
    //   const elablist = elabListSync();
    //   const elabid = elablist.elabExperimentid;
    //   setCookies( elabToken, datahubToken, instance);
    //   const id = await fetchUser(datahubToken);
    //   if (id){
    //   //document.getElementById("usernameInput").value = id.username;
    //   await fetchUserProjects(id.username, datahubToken) 
    //   loading.hide();
    // }
    //   else{
    //     return;
    //   }

    //  await loadExperiment(instance, elabid, elabToken);


    //  //const checkbox = document.getElementById("multiElabSwitch");
    //    // multiElabSelect(checkbox); 

    // }

    // Function to check connection to eLabFTW API
    async function checkElabFTWConnection() {
      const elabid = JSON.parse(localStorage.getItem("elabid"))
      const params = await getParameters(elabid.elabExperimentid, elabid.elabResourceid);
      // const elabtoken = document.getElementById("elabToken").value;
      // const datahubtoken = document.getElementById("datahubToken").value;
      // const instance = document.getElementById("elabURLInput").value;


      try {
        const response = await fetchElabJSON(params.elabtoken, "users", params.instance);

        console.log('ElabFTW API Status Code:', response.statuscode);

        if (response.statuscode == 200) {
          document.getElementById("elabFTWCheck").innerHTML = "&#127760;";
          await fillElabTable();
          await elabCheckSync();
          console.log('✅ Successfully connected to eLabFTW API');
          return true;
        } else {
          document.getElementById("elabFTWCheck").innerHTML = "&#10060;";
          console.error('❌ eLabFTW API returned an error:', response.statuscode);
          return false;
        }
      } catch (error) {
        document.getElementById("elabFTWCheck").innerHTML = "&#128680;";
        console.error('🚨 Failed to connect to eLabFTW API:', error.message);
        return false;
      }
    }

    window.updateARCList = async (search) => {
      const { elabtoken, datahubtoken, instance, elabidList } = await getParameters();
      // Fetch user info
      const id = await fetchUser(datahubtoken);
      const apiParameter = "?pagination=keyset&per_page=200&order_by=id&sort=desc&membership=true&search_namespaces=true&" + "search=" + search;
      if (id) {
        // Optionally load user projects
        await fetchUserProjects(id.username, datahubtoken, apiParameter);
        document.getElementById("arcCheck").innerHTML = "&#127760;";
        console.log('✅ Successfully connected to DataHUB API');
        return true;

      } else {
        console.error('🚨 DataHUB API can be accessed but the user information could not be fetched. Please check your credentials. Error :', error.message);
        return;
      }

    }

    // Function to check connection to GitLab API
    async function checkGitLabConnection() {
      const targetUrl = 'https://git.nfdi4plants.org/api/v4/projects';

      try {
        const response = await fetchWithProxyFallback(targetUrl, {
          method: 'GET',
        });

        console.log('GitLab API Status Code:', response.status);

        if (response.status === 404) {
          console.warn('⚠️ GitLab API endpoint not found (404)');
          return false;
        }

        if (response.ok) {

          const { elabtoken, datahubtoken, instance, elabidList } = await getParameters();
          // Fetch user info
          const id = await fetchUser(datahubtoken);

          if (id) {
            // Optionally load user projects
            await fetchUserProjects(id.username, datahubtoken);
            document.getElementById("arcCheck").innerHTML = "&#127760;";
            console.log('✅ Successfully connected to DataHUB API');
            return true;

          } else {
            console.error('🚨 DataHUB API can be accessed but the user information could not be fetched. Please check your credentials. Error :', error.message);
            return;
          }

        } else {
          document.getElementById("arcCheck").innerHTML = "&#10060;";
          console.error('❌ DataHUB API returned an error:', response.statusText);
          return false;
        }
      } catch (error) {
        document.getElementById("arcCheck").innerHTML = "&#128680;";
        console.error('🚨 Failed to connect to DataHUB API:', error.message);
        return false;
      }
    }


    const fetchUser = async (accessToken) => {
      try {
        // Define the API endpoint for fetching user-related projects
        const targetUrl = 'https://git.nfdi4plants.org/api/v4/user';

        // Fetch the data from the API with the access token in the headers
        const response = await fetchWithProxyFallback(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        console.log(response);
        // Check for bad responses (status codes between 400 and 599)
        if (response.status == 401) {
          loading.hide();
          throw new Error(" Unauthorized, the DataHUB token is wrong or expired. Or a project-token has been used for step by step conversion. Please use a personal-token with correct rights ");
        } else if (response.status >= 400 && response.status < 500) {
          throw new Error(" Unauthorized, the DataHUB token is wrong or expired. Or a project-token has been used for step by step conversion. Please use a personal-token with correct rights  ");
        } else if (response.status >= 500 && response.status < 600) {
          throw new Error("Bad response from server, please check the availability of the server. ");
        }

        // Parse the JSON response
        const userJSON = await response.json();

        // Assign the fetched data to a global variable (if needed)
        window.userId = userJSON;

        // Build the HTML table dynamically
        return userJSON;
      } catch (error) {
        // Handle any errors that occur during the fetch or processing
        showErrorToast(error.message || error);
      }
    };

    const createNewArc = async () => {
      try {
        loading.show();
        // const projectDescription = document.getElementById("descriptionInput").value;
        const projectDescription = arcReadmeText;
        const projectName = document.getElementById("projectnameInput").value.replace(/[^a-zA-Z0-9_\-]/g, "-");
        const username = window.userId.username;

        const accessToken = document.getElementById("datahubToken").value;
        await createGitLabRepo(projectName, projectDescription, accessToken);
        const url = `https://git.nfdi4plants.org/${username}/${projectName}.git`;
        await cloneARC(url, projectName);
        newARC = new arctrl.ARC();
        const name = window.userId.name;

        await arcWrite(projectName, newARC);
        let inv = arctrl.ArcInvestigation.init(projectName);
        const newContact = arctrl.Person.create(void 0, name.split(" ")[0], name.split(" ").slice(-1)[0], window.userId.commit_email, void 0, void 0, void 0, void 0, void 0, void 0);


        // for (const ee of isa_inv.Contacts){
        //     if (ee.toString() != ccc.toString()){
        //         console.log("no same person");
        //     }else{
        //         console.log("same person");
        //         break;
        //     };
        // }
        inv.Contacts = [newContact];
        let invXlsx = arctrl.XlsxController.Investigation.toFsWorkbook(inv);
        Xlsx.toFile(`${projectName}/isa.investigation.xlsx`, invXlsx);
        await git.add({ fs, dir: projectName, filepath: '.' });
        const gitRoot = projectName + "/";
        await commitPush(
          accessToken,
          url,
          "elab2arcTool",
          "",
          projectName,
          gitRoot,
          1,
          "N/A",
          "Initial ARC setup",
          projectName,
          false,
          0,
          "",
          "isa.investigation.xlsx",
          "",
          "",
          0,
          1,
          null
        );
        //document.getElementById('gitlabInfo').innerHTML= `${url}`;
        //document.getElementById('arcInfo').innerHTML= `${projectName}`;
        checkGitLabConnection()
        showToast("ARC created successfully!", "success", 5000);
      } catch (error) {
        console.error("Error creating new ARC:", error);
        showErrorToast(`Failed to create new ARC: ${error.message || error}`, 10000);
      } finally {
        loading.hide();
      }
    }


    const createGitLabRepo = async (projectName, projectDescription, accessToken) => {
      try {
        // Define the API endpoint for creating a new project
        const targetUrl = 'https://git.nfdi4plants.org/api/v4/projects';

        // Prepare request configuration
        const response = await fetchWithProxyFallback(targetUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
            visibility: 'private',
            initialize_with_readme: 'true',
            default_branch: 'main',
            lfs_enabled: 'true',
          })
        });

        // Handle non-success responses [[3]]
        if (response.status >= 400) {
          const errorDetails = await response.json();
          throw new Error(`Error ${response.status}: ${errorDetails.message}`);
        }

        // Return the created project details [[6]]
        return await response.json();

      } catch (error) {
        // Handle network/API errors [[6]]
        showErrorToast("ARC creation failed, please check if the name is unique. " + (error.message || error));
        throw new Error(`Project creation failed: ${error.message}`);
      }
    };

    const fetchUserProjects = async (userId, accessToken, apiParameter = "?pagination=keyset&per_page=200&order_by=id&sort=desc&membership=true") => {
      try {
        // Define the API endpoint for fetching user-related projects
        const targetUrl = 'https://git.nfdi4plants.org/api/v4/projects' + apiParameter;

        // Fetch the data from the API with the access token in the headers
        const response = await fetchWithProxyFallback(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        // Check for bad responses (status codes between 400 and 599)
        if (response.status >= 400 && response.status < 600) {
          throw new Error("Bad response from server, please check the availability of the server");
        }

        // Parse the JSON response
        const projects = await response.json();

        // Assign the fetched data to a global variable (if needed)
        window.userProjects = projects;

        // Build the HTML table dynamically
        let tableHTML = '';
        let newIndex = 0;
        tableHTML += `
              <tr>
                <th scope="row">New ARC</th>
                <td><input type="text" class="form-control" id="projectnameInput"  placeholder="Project Name" aria-label="Projectname"></td>
                <td> </td>
                <td>
                  <div class="" role="group" aria-label="Basic example">
                   <input type="text" class="form-control d-none" id="descriptionInput" value="An ARC created by elab2arc tool" placeholder="Project Name" aria-label="Projectname">
        <button class="btn btn" onclick="createNewArc()"> Create a new ARC </button>
                  </div>
                </td>
              </tr>
            `
        projects.forEach((project) => {
          if (project.name) { // Ensure the project has a valid name
            newIndex += 1;

            tableHTML += `
              <tr>
                <th scope="row">${newIndex}</th>
                <td>${project.name}</td>
                <td><a href="${project.web_url}" target="_blank">View</a></td>
                <td>
                  <div class="" role="group" aria-label="Basic example">
                    <button type="button" onclick="setTargetPath('${project.name}/assays'); document.getElementById('gitlabInfo').innerHTML= '${project.http_url_to_repo}';
        document.getElementById('arcInfo').innerHTML= '${project.name}';" class="btn btn-success btn-sm">
                     Select assay
                    </button>
                    <button type="button" onclick="setTargetPath('${project.name}/studies'); document.getElementById('gitlabInfo').innerHTML= '${project.http_url_to_repo}';
        document.getElementById('arcInfo').innerHTML= '${project.name}/studies';" class="btn btn-success btn-sm">
                     Select study
                    </button>
                    <button type="button" onclick="cloneARCWithLoading('${project.http_url_to_repo}', '${project.name}')"
                            class="btn btn-success btn-sm clone-arc-btn btn-loading-state"
                            id="clone-arc-btn-${project.id}"
                            title="Clone ARC and select target folder for conversion">
                      <span class="btn-content">📂 Select a specific ARC folder</span>
                      <span class="btn-loading d-none btn-loading-content">
                        <div class="btn-spinner"></div>
                        Cloning ARC...
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }
        });



        // Insert the generated table HTML into the DOM
        document.getElementById("userProjectsTable").innerHTML = tableHTML;
      } catch (error) {
        // Handle any errors that occur during the fetch or processing
        showErrorToast(error.message || error);
      }
    };


    function addidToText(ele) {
      const type = ele.dataset.type;
      let newList = [];
      const elements = document.querySelectorAll('[data-type="' + type + '"]');
      let list = elabListSync();
      elements.forEach(e => {
        e.checked == true ? newList.push(e.dataset.id) : {};
      })
      list["elab" + type + "id"] = newList;
      elabListSync(list);
    }
    const linkCheck = async (checkbox) => {
      const str = checkbox.dataset.type1;
      const e = checkbox.dataset.id;
      let typeConfig = [];
      typeConfig[str] = window.typeConfig[str];
      let check = document.getElementById("check" + typeConfig[str].short + e);
      if (checkbox.checked) {
        try {
          check.checked = true;
          check.onchange();
        } catch (error) {
          await fillElabTable("?q=" + e + "&order=id&sort=des&limit=99&", "elabTable", "append", typeConfig, e);
          check = document.getElementById("check" + typeConfig[str].short + e);
          elabCheckSync();
          check.checked = true;
          check.onchange();

        }
      } else {

        check.checked = false;
        check.onchange();
      }
    }
    window.fillElabTable = async (query = "?order=id&sort=des&scope=1&limit=99", tableid = "elabTable", action = "update", typeConfig = window.typeConfig, targetId) => {
      try {
        // Define the API endpoint for fetching user-related projects
        const params = await getParameters();
        async function fetchAndBuildTable(params, typeConfig) {
          // Helper function to fetch data based on type
          async function fetchData(typeKey) {
            const config = typeConfig[typeKey];
            if (!config || !config.idendpoint) {
              console.warn(`No endpoint defined for type: ${typeKey}`);
              return [];
            }
            if (targetId == undefined) {
              return fetchElabJSON(params.elabtoken, `${config.endpoint}/${query}`, params.instance);
            } else {
              return fetchElabJSON(params.elabtoken, `${config.idendpoint}${targetId}`, params.instance);
            }

          }

          // Fetch all configured types in parallel
          const promises = Object.keys(typeConfig).map(key => fetchData(key));
          const results = await Promise.all(promises);
          console.log("here is result")
          console.log(results)
          let tableHTML = '';

          // Process each entry for each type
          Object.keys(typeConfig).forEach((typeKey, index) => {
            const config = typeConfig[typeKey];
            let data;
            if (targetId == undefined) {
              data = results[index];
            } else {
              data = results;
            }

            //console.log("here is data")
            //console.log(data)
            data.forEach((entry) => {
              if (!entry.id) return; // Skip invalid entries
              //if ( !(targetId==undefined || entry.id == targetId) ) return; // Skip invalid entries
              const checkboxId = `check${config.short}${entry.id}`;
              const previewBtn = config.hasPreview
                ? `<button class="btn btn-sm " type="button"
                            data-bs-toggle="offcanvas"
                            data-bs-target="#elabPreviewCanvas"
                            aria-controls="elabPreviewCanvas"
                            data-id="${entry.id}"
                            data-type="${typeKey}"
                            id="preview${config.short}${entry.id}"
                            onclick="elabPreview(this)"
                            >
                      Preview
                    </button>`
                : '';

              const extraDiv = config.hasPreview
                ? `<div id="linked${typeKey}${entry.id}"></div>`
                : '';

              tableHTML += `
                  <tr>
                    <th scope="row">${config.displayName}</th>
                    <td>${entry.id}</td>
                    <td>${entry.title}</td>

                    <td>${entry.date}</td>
                    <td>${entry.fullname}</td>
                    <td>
                      <div class="form-check form-check-inline">
                        <input class="form-check-input" type="checkbox"
                              data-id="${entry.id}"
                              data-type="${typeKey}"
                              id="${checkboxId}"
                              onchange="addidToText(this)"
                              value="option1">
                        <label class="form-check-label" for="${checkboxId}"></label>
                        ${extraDiv}
                          ${previewBtn}
                      </div>
                    </td>
                  </tr>
                `;
            });
          });
          // document.getElementById('your-table-body').innerHTML = tableHTML;

          return tableHTML;
        };

        // Insert the generated table HTML into the DOM
        tableHTML = await fetchAndBuildTable(params, typeConfig);
        switch (action) {
          case "update":
            document.getElementById(tableid).innerHTML = tableHTML;
            break;
          case "append":
            document.getElementById(tableid).innerHTML += tableHTML;
            break;
          default:
            break;
        }


      } catch (error) {
        // Handle any errors that occur during the fetch or processing
        showErrorToast(error.message || error);
      }
    };




    function setelabURL(elabURL) {
      if (!elabURL || elabURL === 'null' || elabURL === 'undefined') {
        elabURL = 'https://elab.dataplan.top/api/v2/';
        showInfoToast('eLabFTW URL has been set to https://elab.dataplan.top/');
      }
      var elabURL1 = unescape(elabURL);
      elabURL1.slice(-1) == "/" ? {} : elabURL1 = elabURL1 + "/";
      try {
        const split = elabURL1.split("/api");
        split.length == 1 ? elabURL1 = elabURL1 + "api/v2/" : {};
        elabURL1 = elabURL1.replace("login.php", "");

      } catch (error) {

      }
      window.localStorage.setItem('instance', elabURL1);

      document.getElementById('elabURLInput1').innerHTML = 'instance: ' + elabURL1;
      document.getElementById('elabURLInput1').value = elabURL1;

    }
    async function fetchElabJSON(elabToken, query = 'experiments/', elabURL) {
      // Define the API endpoint
      const targetUrl = elabURL + query;
      const headers = { 'accept': 'application/json', 'Authorization': elabToken, 'Origin': 'x-requested-with' };
      // Make the fetch request with proxy fallback
      try {
        const response = await fetchWithProxyFallback(targetUrl, { headers, method: 'GET' });
        const json = await response.json();
        json.statuscode = response.status;
        return json;
      } catch (error) {
        if (error.message.includes(`is not valid JSON`) || error.message.includes(`Invalid host`) || error.message.includes(`!DOCTYPE`)) {
          showError("Access of eLabFTW is not successful, the eLabFTW API key might be wrong, or the elabFTW instance might be wrong. Please first check the eLabFTW instance and then go to the settings of the eLabFTW to create a new API key and use it");
        } else {
          showError("Access of eLabFTW is not successful, error message is " + error);
        }
        return error;
      }
    }

    async function fetchElabFiles(elabToken, query = 'experiments/', elabURL) {
      // Define the API endpoint
      const targetUrl = elabURL + query;
      const headers = { 'accept': '*/*', 'Authorization': elabToken, 'Origin': 'x-requested-with' };
      // Make the fetch request with proxy fallback
      try {
        const response = await fetchWithProxyFallback(targetUrl, { headers, method: 'GET' });
        const blob = await response.blob();
        console.log(`[fetchElabFiles] Fetched file with type: ${blob.type}, size: ${blob.size} bytes`);
        return blob;
      } catch (error) {
        if (error.message.includes(`Unexpected token 'N', "No corresp"... is not valid JSON`)) {
          console.error(error);
          showError("Access of eLabFTW is not successful, the eLabFTW API key might be wrong, please go to settings to create a new API key and use it");
        } else {
          showError("Access of eLabFTW is not successful, error message is " + error);
        }

        return error;
      }
    }

    function gitUrlCheck(url) {
      if (/(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/.test(url)) {
        console.log("DataHub URL was collected successfully");
        return url;
      }
      else {
        console.log("DataHub URL is not correct, automatic patches are being applied");
        if (!url.endsWith(".git")) {
          url = url + ".git";
          safeLog("Added '.git' at the end, current url is", url);
        }
        if (!url.startsWith("https://")) {
          url = "https://" + url;
          safeLog("Added 'https://' at the start, current url is", url);
        }
        return url;
      }

    }


    async function datahubClone(datahubURL, dir, datahubtoken) {
      // Use clean URL without embedded credentials (more secure)
      console.log('[DataHub Clone] Cloning from:', datahubURL);

      // Get repo name for display
      const repoName = getRepoName(datahubURL);


      // Reset progress throttle tracker for fresh clone operation
      lastProgressUpdate = 0;

      const cloneWithProxy = async (proxy, branch) => {
        return git.clone({
          fs,
          http,
          dir,
          corsProxy: proxy,
          url: datahubURL,
          ref: branch,
          singleBranch: true,
          depth: 1,                    // Shallow clone - only latest commit
          noCheckout: false,           // Always checkout files to ensure proper git status
          force: true,
          onAuth: () => ({ username: 'oauth2', password: datahubtoken }),
          onProgress: (event) => {
            // event.phase: current phase (e.g., "fetching", "checkout")
            // event.loaded: bytes transferred
            // event.total: total bytes (may be undefined)

            // Throttle progress updates to avoid flooding UI
            const now = Date.now();
            if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS) {
              return; // Skip this update
            }
            lastProgressUpdate = now;

            const phase = event.phase || 'Cloning';
            const loaded = formatBytes(event.loaded || 0);

            let progressText = '';
            if (event.total) {
              const total = formatBytes(event.total);
              const percent = Math.round((event.loaded / event.total) * 100);
              progressText = `${percent}%`;
            } else {
              progressText = loaded;
            }

            // Update status in Conversion Status accordion
            updateInfo(
              `Cloning repository: ${repoName} (${phase}: ${progressText})`,
              1  // Use minimal progress (1%) to show activity without affecting main progress
            );
          }
        });
      };

      try {
        await cloneWithProxy(getGitProxy(), 'main');
        updateInfo(`✓ Clone complete: ${repoName} (main branch)`, 1);
        mainOrMaster = "main";
      } catch (error) {
        // Check for 401 authentication errors
        if (error.message && error.message.includes('401')) {
          showErrorToast('Authentication failed: Your DataHub token may have expired (tokens expire after 2 hours). Please click "get a token" to refresh.');
          console.warn('[DataHub Clone] 401 Unauthorized: Token may be expired. Please refresh your token.');
          throw new Error('DataHub token expired - please refresh your token');
        }

        // Try backup proxy if primary fails with network error
        if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('CORS'))) {
          if (switchToBackupProxy('git')) {
            try {
              await cloneWithProxy(getGitProxy(), 'main');
              updateInfo(`✓ Clone complete: ${repoName} (main branch via backup proxy)`, 1);
              mainOrMaster = "main";
              return;
            } catch (backupError) {
              console.warn("[DataHub Clone] Backup proxy also failed for 'main' branch");
            }
          }
        }

        // Branch "main" not found - trying "master" (common for older repositories)
        console.log("[DataHub Clone] Branch 'main' not found, trying 'master' branch...");
        try {
          await cloneWithProxy(getGitProxy(), 'master');
          updateInfo(`✓ Clone complete: ${repoName} (master branch)`, 1);
          mainOrMaster = "master";
        } catch (masterError) {
          // Try backup proxy for master branch
          if (switchToBackupProxy('git')) {
            await cloneWithProxy(getGitProxy(), 'master');
            updateInfo(`✓ Clone complete: ${repoName} (master branch via backup proxy)`, 1);
            mainOrMaster = "master";
          } else {
            throw masterError;
          }
        }
      }

      // Initialize Git LFS support after clone
      try {
        if (window.GitLFSService) {
          await GitLFSService.initLFS(fs, dir);
          await git.add({ fs, dir, filepath: '.gitattributes' });
          await git.commit({
            fs,
            dir,
            message: 'chore: initialize Git LFS\n\nCo-Authored-By: elab2arc',
            author: { name: 'elab2arc', email: 'elab@dataplan.top' }
          });
          console.log('[LFS] LFS initialized in repository');
        } else {
          console.warn('[LFS] GitLFSService not available - LFS support disabled');
        }
      } catch (lfsError) {
        // LFS initialization is optional - don't fail the entire process
        console.warn('[LFS] Could not initialize LFS (continuing without LFS):', lfsError.message);
      }
    }

    // =============================================================================
    // GIT ADD ALL FUNCTION
    // Stages all changes including deletions using git.statusMatrix()
    // =============================================================================
    async function gitAddAll(gitRoot) {
      try {
        console.log('[Git Add All] Analyzing file changes...');

        // Get status matrix for all files
        const statusMatrix = await git.statusMatrix({
          fs,
          dir: gitRoot,
          filter: f => !f.startsWith('.git/')
        });

        const stagedFiles = [];
        const deletedFiles = [];

        // Process each file based on its status
        // Status format: [filepath, HEAD, WORKDIR, STAGE]
        // 0 = absent, 1 = present, 2 = modified, 3 = added
        for (const [filepath, HEAD, WORKDIR, STAGE] of statusMatrix) {
          // Skip if already staged correctly
          if (HEAD === WORKDIR && WORKDIR === STAGE) continue;

          // File deleted in workdir but exists in HEAD
          if (HEAD === 1 && WORKDIR === 0) {
            try {
              await git.remove({ fs, dir: gitRoot, filepath });
              deletedFiles.push(filepath);
              console.log(`[Git Add All] Removed: ${filepath}`);
            } catch (err) {
              console.warn(`[Git Add All] Could not remove ${filepath}:`, err.message);
            }
          }
          // File added or modified
          else if (WORKDIR === 2 || (HEAD === 0 && WORKDIR === 1)) {
            try {
              await git.add({ fs, dir: gitRoot, filepath });
              stagedFiles.push(filepath);
              console.log(`[Git Add All] Added: ${filepath}`);
            } catch (err) {
              console.warn(`[Git Add All] Could not add ${filepath}:`, err.message);
            }
          }
        }

        console.log(`[Git Add All] Staged ${stagedFiles.length} file(s), removed ${deletedFiles.length} file(s)`);
        return { added: stagedFiles, deleted: deletedFiles };
      } catch (error) {
        console.error('[Git Add All] Failed to stage all changes:', error);
        throw error;
      }
    }

    // Helper function to count files in a directory recursively (for diagnostics)
    async function countFilesInDir(dir, maxDepth = 20, currentDepth = 0) {
      let count = 0;
      try {
        if (currentDepth >= maxDepth) return count;

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            // Skip .git directory
            if (entry.name !== '.git') {
              count += await countFilesInDir(fullPath, maxDepth, currentDepth + 1);
            }
          } else if (entry.isFile()) {
            count++;
          }
        }
      } catch (e) {
        console.warn(`[countFilesInDir] Error reading ${dir}:`, e.message);
      }
      return count;
    }

    async function commitPush(datahubtoken, datahubURL, fullname, email, dir, gitRoot, elabid, experimentTitle, assayId, isStudy, fileCount, targetPath, protocolFilename, teamName, sourceInstance, completedEntries, totalEntries, entryType) {
      // Create structured commit message following Git best practices
      const timestamp = new Date().toISOString();
      let commitMessage;

      // Check if this is an initial ARC setup or an experiment conversion
      if (elabid === "N/A" || experimentTitle === "Initial ARC setup") {
        // Simple commit message for ARC initialization
        commitMessage = `chore: Initialize ARC structure

Created investigation file: ${protocolFilename}
Conversion tool: elab2ARC v${version}
Date: ${timestamp}`;
      } else {
        // Detailed commit message for experiment conversion
        const commitType = isStudy ? "study" : "assay";
        const entryLabel = entryType === 'resource' ? 'resource' : 'experiment';
        const elabUrlPath = entryType === 'resource' ? 'database.php' : 'experiments.php';
        const elabEntryUrl = `${sourceInstance}${elabUrlPath}?mode=view&id=${elabid}`;

        commitMessage = `feat: Convert eLabFTW ${entryLabel} #${elabid} to ARC ${commitType}

Experiment: ${experimentTitle}
Target: ${assayId}
Type: ${isStudy ? 'Study' : 'Assay'}
Path: ${targetPath}
Files: ${fileCount} uploaded file${fileCount !== 1 ? 's' : ''}
Protocol: ${protocolFilename}

Converted from eLabFTW ${entryLabel} #${elabid}
Source URL: ${elabEntryUrl}
eLabFTW Author: ${fullname}${teamName ? ' (' + teamName + ')' : ''}
Converted by: ${window.userId?.name || window.userId?.username || 'unknown'}
Conversion tool: elab2ARC v${version}
Date: ${timestamp}`;
      }

      // Stage all changes including deletions before committing
      try {
        await gitAddAll(gitRoot);
      } catch (stagingError) {
        console.warn('[Commit] Git staging failed, continuing with individual adds:', stagingError);
      }

      let sha = await git.commit({
        fs,
        dir: gitRoot,
        author: {
          name: 'elab2arc',
          email: 'elab@dataplan.top',
        },
        message: commitMessage
      });
      console.log("commit finished");

      // Calculate progress: 90-100% of this experiment's allocated range
      const baseProgress = (completedEntries / totalEntries) * 90;
      const pushProgressStart = baseProgress + (1 / totalEntries) * 90 * 0.9;
      const pushProgressEnd = baseProgress + (1 / totalEntries) * 90;

      // ========== DIAGNOSTIC LOGS BEFORE PUSH ==========
      console.log('[PUSH DIAGNOSTIC] ========== PRE-PUSH CHECK ==========');
      console.log('[PUSH DIAGNOSTIC] Git root:', gitRoot);
      console.log('[PUSH DIAGNOSTIC] Remote:', datahubURL);

      // Log memory usage if available
      if (performance.memory) {
        const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
        const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
        const limitMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
        console.log(`[PUSH DIAGNOSTIC] Memory: ${usedMB}MB used / ${totalMB}MB total / ${limitMB}MB limit`);
      } else {
        console.log('[PUSH DIAGNOSTIC] Memory API not available (non-Chrome browser)');
      }

      // Log file count in repository
      try {
        const fileCount = await countFilesInDir(gitRoot);
        console.log(`[PUSH DIAGNOSTIC] Total files in repository: ${fileCount}`);
      } catch (e) {
        console.log('[PUSH DIAGNOSTIC] Could not count files:', e.message);
      }

      // Log current HEAD
      try {
        const head = await git.resolveRef({ fs, dir: gitRoot, ref: 'HEAD' });
        console.log(`[PUSH DIAGNOSTIC] Current HEAD: ${head}`);
      } catch (e) {
        console.log('[PUSH DIAGNOSTIC] Could not resolve HEAD:', e.message);
      }
      console.log('[PUSH DIAGNOSTIC] ========== STARTING PUSH ==========');
      // ================================================

      // Try to trigger garbage collection before push (Chrome DevTools only)
      if (typeof gc === 'function') {
        console.log('[PUSH] Triggering garbage collection before push...');
        gc();
      }

      try {
        updateInfo("Pushing to PLANTDataHUB (main branch)...", pushProgressStart);
        console.log('[PUSH] Starting push to main branch...');
        let pushResult = await git.push({
          fs,
          http,
          dir: gitRoot,
          remote: 'origin',
          force: true,
          ref: 'main',
          corsProxy: getGitProxy(),
          onAuth: () => ({ username: 'oauth2', password: datahubtoken }),
        });
        console.log('[PUSH] Push completed successfully!');
        console.log('[PUSH DIAGNOSTIC] ========== PUSH RESULT ==========');
        console.log('[PUSH DIAGNOSTIC] Push result:', JSON.stringify(pushResult, null, 2));

        // Log memory after push
        if (performance.memory) {
          const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
          console.log(`[PUSH DIAGNOSTIC] Memory after push: ${usedMB}MB`);
        }
        console.log('[PUSH DIAGNOSTIC] ========== PUSH COMPLETE ==========');
        updateInfo("PLANTDataHUB has been updated.  <br>", pushProgressEnd);
        //
      } catch (error) {
        console.error('[PUSH DIAGNOSTIC] ========== PUSH ERROR ==========');
        console.error('[PUSH ERROR] Error during push:', error);
        console.error('[PUSH ERROR] Error message:', error.message);
        console.error('[PUSH ERROR] Error stack:', error.stack);

        // Log memory at error
        if (performance.memory) {
          const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
          const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
          console.error(`[PUSH ERROR] Memory at error: ${usedMB}MB used / ${totalMB}MB total`);
        }
        console.error('[PUSH DIAGNOSTIC] =====================================');

        // Check for 401 authentication errors
        if (error.message && error.message.includes('401')) {
          showErrorToast('Push failed: Your DataHub token may have expired. Please click "get a token" to refresh and try again.');
          console.warn('[Git Push] 401 Unauthorized: Token may be expired.');
          throw new Error('DataHub token expired - please refresh your token');
        }
        // Branch "main" not found - trying "master" (common for older repositories)
        console.log("[DataHub Push] Branch 'main' not found, trying 'master' branch...");
        if (error.message && !error.message.includes('Could not find')) {
          console.warn("[DataHub Push] Unexpected error:", error);
        }
        updateInfo("Pushing to PLANTDataHUB (master branch)...", pushProgressStart);
        console.log('[PUSH] Retrying with master branch...');
        let pushResult = await git.push({
          fs,
          http,
          dir: dir,
          force: true,
          remote: 'origin',
          ref: 'master',
          corsProxy: getGitProxy(),
          onAuth: () => ({ username: 'oauth2', password: datahubtoken }),
        });
        console.log(pushResult);
        updateInfo("PLANTDataHUB has been updated (master branch).  <br>", pushProgressEnd);
        //showError( "push to git failed. The error is "+ error)
      }
    }




    function initCookies() {
      const maxAge = 60 * 60 * 24 * 31;

      elabtoken = document.getElementById("elabToken").value;
      datahubtoken = document.getElementById("datahubToken").value;

      // Validate eLabFTW token
      const elabValidation = validateElabToken(elabtoken);
      if (!elabValidation.valid) {
        showTokenWarning('elabToken', elabValidation.warning, 'error');
        console.warn('[Token Validation] eLabFTW token validation failed:', elabValidation.warning);
      } else {
        showTokenWarning('elabToken', '');  // Clear any existing warnings
        if (elabValidation.warning) {
          console.info('[Token Validation] eLabFTW token warning:', elabValidation.warning);
        }
      }

      // Validate DataHub token
      const datahubValidation = validateDataHubToken(datahubtoken);
      if (!datahubValidation.valid) {
        showTokenWarning('datahubToken', datahubValidation.warning, 'error');
        console.warn('[Token Validation] DataHub token validation failed:', datahubValidation.warning);
      } else {
        showTokenWarning('datahubToken', '');  // Clear any existing warnings
        if (datahubValidation.warning) {
          showTokenWarning('datahubToken', datahubValidation.warning, 'warning');
          console.info('[Token Validation] DataHub token warning:', datahubValidation.warning);
        }
      }

      // Save to cookies (even if validation warnings exist, user might have special format)
      document.cookie = `elabtoken=${encodeURIComponent(elabtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;
      document.cookie = `datahubtoken=${encodeURIComponent(datahubtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;

      // Save Together.AI API key to localStorage if provided
      const togetherAPIKeyInput = document.getElementById("togetherAPIKey");
      if (togetherAPIKeyInput && togetherAPIKeyInput.value) {
        // Validate Together.AI API key
        const apiKeyValidation = validateTogetherAPIKey(togetherAPIKeyInput.value);
        if (!apiKeyValidation.valid) {
          showTokenWarning('togetherAPIKey', apiKeyValidation.warning, 'error');
          console.warn('[Token Validation] Together.AI API key validation failed:', apiKeyValidation.warning);
        } else {
          showTokenWarning('togetherAPIKey', '');  // Clear any existing warnings
          if (apiKeyValidation.warning) {
            console.info('[Token Validation] Together.AI API key warning:', apiKeyValidation.warning);
          }
        }

        window.localStorage.setItem('togetherAPIKey', togetherAPIKeyInput.value);
      }

      // Set default eLabFTW URL if not set
      const elabURLInput = document.getElementById("elabURLInput1");
      if (elabURLInput && (!elabURLInput.value || elabURLInput.value === 'null' || elabURLInput.value === 'undefined')) {
        setelabURL('https://elab.dataplan.top/api/v2/');
      }
    }

    function redirect() {
      const instance = document.getElementById("elabURLInput1").value;
      window.localStorage.setItem("instance", instance);
      location.href = location.href.split('#')[0] + '#home'
      location.reload();

    }

    // Toggle Together.AI API key field visibility and validate API key
    async function toggleTogetherAPIKeyField() {
      const enableSwitch = document.getElementById('enableDatamapSwitch');
      const apiKeyContainer = document.getElementById('togetherAPIKeyContainer');
      const editPromptBtn = document.getElementById('editPromptBtn');

      if (enableSwitch && apiKeyContainer) {
        if (enableSwitch.checked) {
          apiKeyContainer.classList.remove('d-none');

          // Show Edit Prompt button when LLM is enabled
          if (editPromptBtn) {
            editPromptBtn.classList.remove('d-none');
          }

          // Validate API key when switch is turned ON
          const togetherAPIKey = window.localStorage.getItem('togetherAPIKey');

          if (!togetherAPIKey || togetherAPIKey.trim() === '') {
            showWarningToast("Together.AI API Key Required!<br><br>To use LLM Datamap Generation, you need to provide a Together.AI API key.<br><br>Please enter your API key in the field below, or go to the Token page.");
            // Keep switch ON so user can enter key in the visible field
            return;
          }

          // Validate API key with a test request
          console.log('🔑 Validating Together.AI API key...');
          const isValid = await validateTogetherAPIKey(togetherAPIKey);

          if (!isValid) {
            showWarningToast("Together.AI API Key Invalid!<br><br>The API key you provided is not valid or has expired.<br><br>Please update your API key in the field below, or go to the Token page.<br><br>Get a free key at: https://api.together.xyz/");
            // Keep switch ON so user can fix the key in the visible field

            // Navigate to token page if user wants
            if (confirm("Would you like to go to the Token page now to update your API key?")) {
              window.location.hash = '#home';
            }
          } else {
            console.log('✅ Together.AI API key validated successfully');
          }
        } else {
          apiKeyContainer.classList.add('d-none');

          // Hide Edit Prompt button when LLM is disabled
          if (editPromptBtn) {
            editPromptBtn.classList.add('d-none');
          }
        }
      }
    }

    // Validate Together.AI API key with a test request
    async function validateTogetherAPIKey(apiKey) {
      try {
        const testResponse = await fetch('https://api.together.xyz/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
            messages: [{
              role: 'user',
              content: 'test'
            }],
            max_tokens: 1  // Minimal request to test auth
          })
        });

        // Accept both 200 (success) and other non-auth errors
        // 401 = invalid key, anything else means key is valid but might be rate limited etc
        if (testResponse.status === 401) {
          console.error('❌ API key validation failed: 401 Unauthorized');
          return false;
        }

        if (testResponse.ok) {
          console.log('✅ API key validation successful');
          return true;
        }

        // Other errors (rate limit, etc.) - assume key is valid
        console.warn(`⚠️ API returned status ${testResponse.status}, assuming key is valid`);
        return true;

      } catch (error) {
        console.error('❌ Error validating API key:', error);
        // Network errors - assume key might be valid, let user proceed
        console.warn('⚠️ Network error during validation, allowing user to proceed');
        return true;
      }
    }

    // Load saved Together.AI API key and model on page load
    window.addEventListener('DOMContentLoaded', function() {
      const savedAPIKey = window.localStorage.getItem('togetherAPIKey');
      const apiKeyInput = document.getElementById('togetherAPIKey');

      if (savedAPIKey && apiKeyInput) {
        apiKeyInput.value = savedAPIKey;
      }

      // Load saved model selection with validation
      const savedModel = window.localStorage.getItem('togetherAIModel');
      const modelSelect = document.getElementById('togetherAIModel');

      if (savedModel && modelSelect) {
        // Check if savedModel exists in dropdown options
        const optionExists = Array.from(modelSelect.options).some(option => option.value === savedModel);

        if (optionExists) {
          modelSelect.value = savedModel;
          console.log(`[Config] Loaded saved model: ${savedModel}`);
        } else {
          // Invalid model - clear localStorage and use dropdown default
          console.warn(`[Config] Invalid saved model "${savedModel}" - not found in dropdown. Clearing localStorage.`);
          window.localStorage.removeItem('togetherAIModel');
          // Dropdown will use its default selected value from HTML
        }
      }

      // Load saved fallback models selection with validation
      const savedFallbackModels = window.localStorage.getItem('togetherAIFallbackModels');
      const fallbackSelect = document.getElementById('togetherAIFallbackModels');

      if (savedFallbackModels && fallbackSelect) {
        try {
          const fallbackModelsList = JSON.parse(savedFallbackModels);

          // Get valid options from dropdown
          const validOptions = Array.from(fallbackSelect.options).map(opt => opt.value);

          // Filter out any invalid models
          const validFallbackModels = fallbackModelsList.filter(model => validOptions.includes(model));

          // If some models were invalid, log warning and update localStorage
          if (validFallbackModels.length !== fallbackModelsList.length) {
            const invalidModels = fallbackModelsList.filter(model => !validOptions.includes(model));
            console.warn(`[Config] Removed invalid fallback models from localStorage: ${invalidModels.join(', ')}`);
            window.localStorage.setItem('togetherAIFallbackModels', JSON.stringify(validFallbackModels));
          }

          // Select the valid saved options
          Array.from(fallbackSelect.options).forEach(option => {
            option.selected = validFallbackModels.includes(option.value);
          });

          if (validFallbackModels.length > 0) {
            console.log(`[Config] Loaded ${validFallbackModels.length} fallback model(s): ${validFallbackModels.join(', ')}`);
          }
        } catch (e) {
          console.warn('[Config] Could not parse saved fallback models:', e);
          window.localStorage.removeItem('togetherAIFallbackModels');
        }
      }

      // Load saved LLM test mode setting
      const savedTestMode = window.localStorage.getItem('llmTestMode');
      const testModeSwitch = document.getElementById('llmTestModeSwitch');

      if (testModeSwitch) {
        testModeSwitch.checked = (savedTestMode === 'true');
        if (testModeSwitch.checked) {
          console.log('[Config] LLM Test Mode is ENABLED - will use sample data');
        }
      }

      // Initialize Edit Prompt button visibility based on LLM checkbox state
      const enableDatamapSwitch = document.getElementById('enableDatamapSwitch');
      const editPromptBtn = document.getElementById('editPromptBtn');

      if (enableDatamapSwitch && editPromptBtn) {
        // Set button visibility based on checkbox state
        if (enableDatamapSwitch.checked) {
          editPromptBtn.classList.remove('d-none');
        } else {
          editPromptBtn.classList.add('d-none');
        }
      }
    });

    // Save model selection to localStorage
    window.saveModelSelection = function() {
      const modelSelect = document.getElementById('togetherAIModel');
      if (modelSelect) {
        window.localStorage.setItem('togetherAIModel', modelSelect.value);
        console.log(`[Config] Saved model selection: ${modelSelect.value}`);
      }
    };

    // Save fallback model selection to localStorage
    window.saveFallbackModelSelection = function() {
      const fallbackSelect = document.getElementById('togetherAIFallbackModels');
      if (fallbackSelect) {
        const selectedOptions = Array.from(fallbackSelect.selectedOptions).map(opt => opt.value);
        window.localStorage.setItem('togetherAIFallbackModels', JSON.stringify(selectedOptions));
        console.log(`[Config] Saved fallback models: ${selectedOptions.join(', ')}`);
      }
    };

    // Save LLM test mode setting to localStorage
    window.saveLLMTestMode = function() {
      const testModeSwitch = document.getElementById('llmTestModeSwitch');
      if (testModeSwitch) {
        window.localStorage.setItem('llmTestMode', testModeSwitch.checked ? 'true' : 'false');
        console.log(`[Config] LLM Test Mode: ${testModeSwitch.checked ? 'ENABLED' : 'DISABLED'}`);
      }
    };

    function setCookies(elabtoken, datahubtoken, instance = "https://elabftw.hhu.de/api/v2/") {
      const maxAge = 60 * 60 * 24 * 31;

      document.cookie = `elabtoken=${encodeURIComponent(elabtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;
      document.cookie = `datahubtoken=${encodeURIComponent(datahubtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;
      window.localStorage.setItem("instance", instance);

    }

    function updateInfo(text, percent) {
      // Update label with percentage
      const percentRounded = Math.round(percent);
      updateLabel(`${text} (${percentRounded}%)`);
      updateProgressBar(percent);

      // Add timestamp and formatted status to detailed info
      const event = new Date();
      const timestamp = event.toLocaleString('en-GB', {
        timeZone: 'UTC',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Determine status icon and color based on text content
      let icon = '▸';
      let color = '#6c757d';
      if (text.includes('✓') || text.toLowerCase().includes('success') || text.toLowerCase().includes('complete')) {
        icon = '✓';
        color = '#28a745';
      } else if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
        icon = '✗';
        color = '#dc3545';
      } else if (text.toLowerCase().includes('processing') || text.toLowerCase().includes('starting')) {
        icon = '▸';
        color = '#007bff';
      } else if (text.toLowerCase().includes('pushing') || text.toLowerCase().includes('added')) {
        icon = '↑';
        color = '#17a2b8';
      }

      statusInfo += `<div style="margin-bottom: 8px; padding: 6px; border-left: 3px solid ${color}; background-color: rgba(0,0,0,0.02);">
        <table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
          <tr>
            <td style="width: 30px; padding: 0; vertical-align: top;">
              <span style="color: ${color}; font-weight: bold;">${icon}</span>
            </td>
            <td style="width: 165px; padding: 0; vertical-align: top;">
              <span style="color: #6c757d; font-size: 0.85em;">[${timestamp}]</span>
            </td>
            <td style="padding: 0 8px; vertical-align: top; word-wrap: break-word;">
              ${text}
            </td>
            <td style="width: 50px; padding: 0; text-align: right; vertical-align: top; white-space: nowrap;">
              <span style="color: ${color}; font-weight: bold;">${percentRounded}%</span>
            </td>
          </tr>
        </table>
      </div>`;
      detailedInfo.innerHTML = statusInfo;

      // Auto-scroll to bottom of detailed status
      if (detailedInfo.parentElement) {
        detailedInfo.parentElement.scrollTop = detailedInfo.parentElement.scrollHeight;
      }
    }

    function deleteAll() {
      const vol = FS.Volume.fromJSON({
        '/': null, // Create root directory

      });
      fs = vol;
      // const fileList = fs.readdirSync(".");
      // fileList.forEach(file => {
      //   deletePath(file);
      // })

    }



    /**
     * Process eLabFTW experiments or items by handling possible prefix mismatches and authorization issues.
     * @param {Object} params - Configuration parameters including elabtoken, elabidList, instance
     * @param {Object} users - User data from eLabFTW (optional: if not provided, it will be fetched)
     * @param {string} gitlabURL - Optional GitLab URL override
     * @param {string} arcName - Not used in this snippet but kept for compatibility
     */
    async function processElabEntries(params, users, gitlabURL, arcName) {
      try {
        // Calculate total number of entries to process
        const totalExperiments = (params.elabidList.elabExperimentid || []).filter(id => id).length;
        const totalResources = (params.elabidList.elabResourceid || []).filter(id => id).length;
        const totalEntries = totalExperiments + totalResources;
        let completedEntries = 0;

        updateInfo(`Starting conversion of ${totalEntries} entries (${totalExperiments} experiments, ${totalResources} resources)`, 0);

        // Process experiments
        for (const [expIndex, expId] of Object.entries(params.elabidList.elabExperimentid)) {
          if (!expId) continue;

          let res = await fetchElabJSON(params.elabtoken, `experiments/${expId}`, params.instance);

          // Authorization error
          if (res.code === 403) {
            showErrorToast("Authorization failed on eLabFTW id " + expId + ", please check your Elab2ARC account or credentials");
            completedEntries++;
            continue;
          }

          // If users not passed, fetch them
          if (!users) {
            users = await fetchElabJSON(params.elabtoken, "users", params.instance);
            if (users.code >= 400) {
              console.error("Failed to fetch users:", users);
              showErrorToast("Failed to fetch user data from eLabFTW.");
              completedEntries++;
              continue;
            }
          }

          // Determine URLs
          const extraFields = gitlabURL || res.metadata_decoded?.extra_fields;
          const datahubURL = gitlabURL || gitUrlCheck(extraFields?.datahub_url?.value);
          if (!datahubURL) {
            console.warn(`No valid datahub_url found for experiment ${expId}`);
            completedEntries++;
            continue;
          }

          const gitName = datahubURL.slice(0, -4); // Remove .git suffix
          const dir = arcName;
          // Process the experiment with progress tracking
          await processExperiment(completedEntries, totalEntries, expId, params, res, users, datahubURL, dir, params.instance, 'experiment');
          completedEntries++;
        }

        // Process resources
        for (const [expIndex, expId] of Object.entries(params.elabidList.elabResourceid)) {
          if (!expId) continue;

          let res = await fetchElabJSON(params.elabtoken, `items/${expId}`, params.instance);

          // Authorization error
          if (res.code === 403) {
            showErrorToast("Authorization failed on eLabFTW id " + expId + ", please check your Elab2ARC account or credentials");
            completedEntries++;
            continue;
          }

          // If users not passed, fetch them
          if (!users) {
            users = await fetchElabJSON(params.elabtoken, "users", params.instance);
            if (users.code >= 400) {
              console.error("Failed to fetch users:", users);
              showErrorToast("Failed to fetch user data from eLabFTW.");
              completedEntries++;
              continue;
            }
          }

          // Determine URLs
          const extraFields = gitlabURL || res.metadata_decoded?.extra_fields;
          const datahubURL = gitlabURL || gitUrlCheck(extraFields?.datahub_url?.value);
          if (!datahubURL) {
            console.warn(`No valid datahub_url found for experiment ${expId}`);
            completedEntries++;
            continue;
          }

          const gitName = datahubURL.slice(0, -4); // Remove .git suffix
          const dir = arcName;
          // Process the resource with progress tracking
          await processExperiment(completedEntries, totalEntries, expId, params, res, users, datahubURL, dir, params.instance, 'resource');
          completedEntries++;
        }

        // ========== EXPERIMENTAL: Generate Investigation-level ISA files ==========
        try {
          console.log('[ISA Gen] Generating investigation-level ISA files...');

          // Get git root from arcName
          const gitRoot = arcName.endsWith('/') ? arcName : arcName + '/';

          // Generate investigation ISA file
          // Use GitLab account info instead of eLabFTW users
          const gitlabName = window.userId?.name || '';
          const nameParts = gitlabName.split(' ');
          const gitlabFirstName = nameParts[0] || '';
          const gitlabLastName = nameParts.slice(1).join(' ') || nameParts[0] || '';

          const investigationMetadata = {
            title: arcName,
            description: `eLabFTW to ARC conversion for ${arcName}`,
            lastName: gitlabLastName,
            firstName: gitlabFirstName,
            email: window.userId?.commit_email || '',
            affiliation: ''
          };

          const invIsaPath = await Elab2ArcISA.generateIsaInvestigation(gitRoot, arcName, investigationMetadata);

          if (invIsaPath) {
            try {
              const relativeInvPath = invIsaPath.replace(gitRoot, '');
              await git.add({ fs, dir: gitRoot, filepath: relativeInvPath });
              console.log(`[ISA Gen] Added investigation ISA to git: ${relativeInvPath}`);
            } catch (gitError) {
              console.warn('[ISA Gen] Could not add investigation ISA to git:', gitError);
            }
          }

          // Analyze structure and generate study-level ISA files
          const structure = Elab2ArcISA.analyzeArcStructure(gitRoot);

          for (const study of structure.studies) {
            try {
              const studyMetadata = {
                title: study.name,
                description: `Study: ${study.name}`,
                lastName: gitlabLastName,
                firstName: gitlabFirstName,
                email: window.userId?.commit_email || '',
                affiliation: ''
              };

              const studyIsaPath = await Elab2ArcISA.generateIsaStudy(study.path, study.name, studyMetadata);

              if (studyIsaPath) {
                const relativeStudyPath = studyIsaPath.replace(gitRoot, '');
                try {
                  await git.add({ fs, dir: gitRoot, filepath: relativeStudyPath });
                  console.log(`[ISA Gen] Added study ISA to git: ${relativeStudyPath}`);
                } catch (gitError) {
                  console.warn(`[ISA Gen] Could not add study ISA to git:`, gitError);
                }
              }
            } catch (studyError) {
              console.error(`[ISA Gen] Error generating ISA for study ${study.name}:`, studyError);
            }
          }

        } catch (invIsaError) {
          console.error('[ISA Gen] Investigation ISA generation failed (experimental feature):', invIsaError);
        }
        // ========== END EXPERIMENTAL ==========

        // All conversions complete - set progress to 100%
        updateInfo(`✓ All ${totalEntries} entries converted successfully!`, 100);
        const pbarLabel = document.getElementById("pbarLabel");
        pbarLabel.innerHTML = '<strong style="color: #28a745; font-size: 1.1em;">✓ All conversions complete! You can close this window.</strong>';

        // Save conversion to history
        const conversionEndTime = Date.now();
        const duration = conversionEndTime - conversionStartTime;
        const historyEntry = {
          timestamp: conversionEndTime,
          statusHTML: statusInfo,
          entryCount: totalEntries,
          duration: duration,
          success: true,
          arcName: arcName
        };

        // Add to history array
        conversionHistory.push(historyEntry);

        // Keep only last 5 conversions
        if (conversionHistory.length > 5) {
          conversionHistory.shift();
        }

        // Render the updated history
        renderConversionHistory();

        // Show success notification after a brief delay to ensure modal is visible
        setTimeout(() => {
          showSuccessToast(`Success! All ${totalEntries} eLabFTW entries have been converted to ARC format and pushed to PLANTDataHUB.`, 10000);
        }, 500);

        console.log(users);
      } catch (error) {
        console.error("Error processing eLab entries:", error);

        // Save failed conversion to history
        const conversionEndTime = Date.now();
        const duration = conversionEndTime - conversionStartTime;
        const historyEntry = {
          timestamp: conversionEndTime,
          statusHTML: statusInfo + `<div style="margin-bottom: 8px; padding: 6px; border-left: 3px solid #dc3545; background-color: rgba(220,53,69,0.1);"><span style="color: #dc3545; font-weight: bold;">✗ Error:</span> ${error.message || 'An unexpected error occurred'}</div>`,
          entryCount: 0,
          duration: duration,
          success: false,
          arcName: arcName || 'Unknown'
        };

        // Add to history array
        conversionHistory.push(historyEntry);

        // Keep only last 5 conversions
        if (conversionHistory.length > 5) {
          conversionHistory.shift();
        }

        // Render the updated history
        renderConversionHistory();

        showErrorToast("An unexpected error occurred while processing eLabFTW entries.");
      }
    }
    


    multiConvert = async () => {
      // ============================================================================
      // VALIDATION CHECKS
      // ============================================================================

      // 1. Check if targetPath (ARC selection) is filled
      const targetPathInput = document.getElementById("targetPath");
      if (!targetPathInput || !targetPathInput.value || targetPathInput.value.trim() === '') {
        showWarningToast("Please select an ARC first!<br><br>Go to the ARC tab and select your target ARC from the list.");
        return;
      }

      // 2. Check GitLab URL validity
      const gitlabURL = document.getElementById("gitlabInfo").innerHTML;
      if (!gitlabURL || gitlabURL.includes("Please select") || gitlabURL.trim() === '') {
        showWarningToast("No ARC selected!<br><br>Please select your ARC from the ARC tab.");
        return;
      }

      // Validate GitLab URL format
      try {
        const url = new URL(gitlabURL);
        if (!url.protocol.startsWith('http')) {
          throw new Error('Invalid protocol');
        }
        if (!gitlabURL.includes('git')) {
          showWarningToast("Invalid ARC URL!<br><br>The URL does not appear to be a valid Git repository URL.<br><br>URL: " + gitlabURL);
          return;
        }
      } catch (error) {
        showWarningToast("Invalid ARC URL format!<br><br>Please make sure you selected a valid ARC.<br><br>URL: " + gitlabURL);
        return;
      }

      // 3. Check if LLM datamap generation is enabled
      // Note: API key validation happens when toggle is switched on
      const datamapSwitch = document.getElementById('enableDatamapSwitch');
      if (datamapSwitch && datamapSwitch.checked) {
        console.log('[Validation] LLM Datamap Generation enabled (API key validated on toggle)');
      }

      // 4. Validate DataHub token
      const datahubToken = document.getElementById("datahubToken");
      if (!datahubToken || !datahubToken.value || datahubToken.value.trim() === '') {
        showWarningToast("DataHub token is missing!<br><br>Please enter your DataHub API token in the Token tab.");
        return;
      }

      // 5. Validate eLabFTW token
      const elabToken = document.getElementById("elabToken");
      if (!elabToken || !elabToken.value || elabToken.value.trim() === '') {
        showWarningToast("eLabFTW token is missing!<br><br>Please enter your eLabFTW API token in the Token tab.");
        return;
      }

      // ============================================================================
      // PROCEED WITH CONVERSION
      // ============================================================================

      // Clear status information from previous conversion
      statusInfo = "";
      const detailedInfo = document.getElementById("detailedStatus");
      if (detailedInfo) {
        detailedInfo.innerHTML = "";
      }

      // Clear files changed section
      const filesChanged = document.getElementById("filesChanged");
      if (filesChanged) {
        filesChanged.innerHTML = "";
      }

      // Clear LLM stream content
      const llmStreamContent = document.getElementById("llmStreamContent");
      if (llmStreamContent) {
        llmStreamContent.innerHTML = "";
      }

      // Clear metadata content
      const metadataContent = document.getElementById("metadataContent");
      if (metadataContent) {
        metadataContent.innerHTML = '<p class="text-muted">No conversion metadata available yet. Metadata is saved after each conversion when LLM is enabled.</p>';
      }

      // Reset progress bar
      const pbarModal = document.getElementById("pbarModal");
      if (pbarModal) {
        pbarModal.style.width = "1%";
        pbarModal.setAttribute("aria-valuenow", "1");
      }

      // Reset progress label
      const pbarLabel = document.getElementById("pbarLabel");
      if (pbarLabel) {
        pbarLabel.innerHTML = "Conversion Status";
      }

      // Record conversion start time
      conversionStartTime = Date.now();

      // Open status modal using Bootstrap API
      const statusModalEl = document.getElementById('statusModal');
      if (statusModalEl) {
        const statusModal = new bootstrap.Modal(statusModalEl, {
          backdrop: true,
          keyboard: true
        });
        statusModal.show();
      }

      // Switch to "Current Conversion" tab programmatically
      const currentTab = document.getElementById('current-tab');
      if (currentTab) {
        const tab = new bootstrap.Tab(currentTab);
        tab.show();
      }

      // Get ARC information from arcInfo element (which may contain the full path)
      const arcInfo = document.getElementById("arcInfo").innerHTML;
      let gitRoot, arcName;

      if (arcInfo && !arcInfo.includes("Please select")) {
        // Extract ARC name from the selected path (could be arc_name/folder/subfolder)
        const pathParts = arcInfo.split('/').filter(p => p);
        gitRoot = pathParts.length > 0 ? pathParts[0] : gitlabURL.split("/").slice(-1)[0].replace(".git", "");
        arcName = gitRoot;
      } else {
        // Fallback to extracting from GitLab URL
        arcName = gitlabURL.split("/").slice(-1)[0].replace(".git", "");
        gitRoot = arcName;
      }

      if (gitRoot.includes("Please select your ARC")) {
        showWarningToast("Please select your ARC.");
        return;
      };

      // Check if ARC was already cloned via folder selector
      const skipCloning = window.arcClonedViaFolderSelector && fs && fs.existsSync(`./${gitRoot}`);

      if (!skipCloning) {
        console.log("Cloning ARC as part of conversion process...");
        deleteAll();
        await cloneARC(gitlabURL, gitRoot);
        refreshTree("./" + gitRoot);
      } else {
        console.log("ARC already cloned via folder selector, skipping clone step");
        // Just refresh the tree to ensure it's up to date
        refreshTree("./" + gitRoot);

        // Show notification that we're using the pre-cloned ARC
        showConversionNotification(`📂 Using pre-cloned ARC: ${gitRoot}`);
      }

      const params = await getParameters();
      // const elabtoken = document.getElementById("elabToken").value;
      // const datahubtoken = document.getElementById("datahubToken").value;
      // const instance = document.getElementById("elabURLInput").value;
      const users = await fetchElabJSON(params.elabtoken, "users", params.instance);

      // Process each experiment ID
      await processElabEntries(params, users, gitlabURL, arcName);
      refreshTree(gitRoot);

      // Reset the flag after conversion
      window.arcClonedViaFolderSelector = false;
    }


    /**
     * Show a simple conversion notification
     * @param {string} message - The notification message
     */
    function showConversionNotification(message) {
      // Create or update notification element
      let notification = document.getElementById('conversion-notification');
      if (!notification) {
        notification = document.createElement('div');
        notification.id = 'conversion-notification';
        notification.style.cssText = `
          position: fixed;
          top: 90px;
          right: 20px;
          background: #d1ecf1;
          border: 1px solid #bee5eb;
          color: #0c5460;
          border-radius: 5px;
          padding: 10px 15px;
          max-width: 350px;
          z-index: 9999;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(notification);
      }

      notification.textContent = message;

      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (notification && notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    }


    // Main function orchestrating the process
    async function updateAll(elabidText, elabtoken, datahubtoken, instance = "https://elabftw.hhu.de/api/v2/", gitURL, elabResourceidText) {
      try {
        // Initialize UI elements and parameters
        initializeUI();
        const params = await getParameters(elabidText, elabResourceidText, elabtoken, datahubtoken, instance);

        // Process each experiment ID
        //const gitlabusername = document.getElementById("usernameInput").value;
        const gitlabURL = document.getElementById("gitlabInfo").innerHTML;
        // if (gitlabURL.includes("Please select your")){
        //   alert("No eLabFTW is selected, please go to eLabFTW tab to select.");
        //   return;
        // };
        const arcName = document.getElementById("arcInfo").innerHTML;
        if (arcName.includes("Please select your ARC")) {
          showWarningToast("Please select your ARC.");
          return;
        };

        // const elabtoken = document.getElementById("elabToken").value;
        // const datahubtoken = document.getElementById("datahubToken").value;
        // const instance = document.getElementById("elabURLInput").value;
        const users = await fetchElabJSON(params.elabtoken, "users", params.instance);

        // Process each experiment ID
        await processElabEntries(params, users, gitlabURL, arcName);
      } catch (error) {
        console.error(error);
        handleError(error);
      }
    }

    // Initialize UI elements
    function initializeUI() {
      filesChanged.innerHTML = "";
      statusInfo = "";
    }

    // Render conversion history in the History tab
    function renderConversionHistory() {
      const historyContainer = document.getElementById("conversionHistoryContainer");
      if (!historyContainer) return;

      // If no history, show placeholder message
      if (conversionHistory.length === 0) {
        historyContainer.innerHTML = '<p class="text-muted text-center py-4">No conversion history yet. Your last 5 conversions will appear here.</p>';
        return;
      }

      // Build HTML for history entries (newest first)
      let historyHTML = '<div class="accordion" id="historyAccordion">';

      // Reverse iteration to show newest first
      for (let i = conversionHistory.length - 1; i >= 0; i--) {
        const entry = conversionHistory[i];
        const entryIndex = conversionHistory.length - i; // 1-based index for display

        // Format timestamp
        const date = new Date(entry.timestamp);
        const formattedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });

        // Format duration
        const durationSeconds = Math.floor(entry.duration / 1000);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        // Determine status color
        const statusColor = entry.success ? '#28a745' : '#dc3545';
        const statusIcon = entry.success ? '✓' : '✗';
        const statusText = entry.success ? 'Success' : 'Failed';

        // Create accordion item for this history entry
        historyHTML += `
          <div class="card mb-2">
            <div class="card-header" id="historyHeading${i}">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <button class="btn btn-link text-start text-decoration-none p-0" type="button" data-bs-toggle="collapse"
                          data-bs-target="#historyCollapse${i}" aria-expanded="false" aria-controls="historyCollapse${i}">
                    <span style="color: ${statusColor}; font-weight: bold; font-size: 1.1em;">${statusIcon}</span>
                    <strong>${formattedDate}</strong>
                  </button>
                </div>
                <div class="text-end">
                  <span class="badge bg-primary">${entry.entryCount} entries</span>
                  <span class="badge bg-secondary">${durationStr}</span>
                  <span class="badge" style="background-color: ${statusColor};">${statusText}</span>
                </div>
              </div>
              ${entry.arcName ? `<div class="small text-muted mt-1">ARC: ${entry.arcName}</div>` : ''}
            </div>
            <div id="historyCollapse${i}" class="collapse" aria-labelledby="historyHeading${i}" data-bs-parent="#historyAccordion">
              <div class="card-body">
                <div style="max-height: 400px; overflow-y: auto; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px;">
                  ${entry.statusHTML}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      historyHTML += '</div>';
      historyContainer.innerHTML = historyHTML;
    }


    /**
     * Gets or sets parameter values from/to DOM inputs.
     * If values are provided, they update the DOM.
     * Otherwise, values are read from the DOM.
     *
     * @param {string} [elabidText] - Optional experiment ID to set or read
     * @param {string} [elabResourceidText] - Optional resource ID to set or read
     * @param {string} [elabtoken] - Optional eLab token to set or read
     * @param {string} [datahubtoken] - Optional DataHub token to set or read
     * @param {string} [instance] - Optional eLab instance URL to set or read
     * @returns {Object} - Object containing: elabidList, elabtoken, datahubtoken, instance
     */
    async function getParameters(elabidText, elabResourceidText, elabtoken, datahubtoken, instance) {
      // Set or get eLab API token
      if (elabtoken) {
        document.getElementById("elabToken").value = elabtoken;
      } else {
        elabtoken = extractCookie("elabtoken");
        document.getElementById("elabToken").value = elabtoken;
      }

      // Set or get DataHub token
      if (datahubtoken) {
        document.getElementById("datahubToken").value = datahubtoken;
      } else {
        datahubtoken = extractCookie("datahubtoken");
        document.getElementById("datahubToken").value = datahubtoken;
      }

      // Set or get instance URL
      if (instance) {
        document.getElementById("elabURLInput1").value = instance;
      } else {
        instance = localStorage.getItem("instance");
        document.getElementById("elabURLInput1").value = instance;
      }

      // Persist values in cookies
      setCookies(elabtoken, datahubtoken, instance);

      // Set or get experiment ID
      if (elabidText) {
        document.getElementById("elabExperimentid").value = elabidText;
      } else {
        elabidText = document.getElementById("elabExperimentid").value;
      }

      // Set or get resource ID
      if (elabResourceidText) {
        document.getElementById("elabResourceid").value = elabResourceidText;
      } else {
        // Fixed: Previously used wrong element ("elabExperimentid")
        elabResourceidText = document.getElementById("elabResourceid").value;
      }

      // Sync and retrieve list of IDs
      const elabidList = elabListSync();

      return {
        elabidList,
        elabtoken,
        datahubtoken,
        instance
      };
    }
    const PATH_CONFIG = {
      default: {
        baseDir: 'assays',
        baseDir2: "assays",
        subDirs: {
          protocols: 'protocols',
          datasets: 'dataset'
        },
        slash: "/",
        createNewStructure: true,
        generateISA: true
      },
      studies: {
        baseDir: 'studies',
        baseDir2: "",
        subDirs: {
          protocols: 'protocols',
          resources: 'resources'
        },
        slash: "",
        createNewStructure: true,
        generateISA: false
      },
      existing_study: {
        baseDir: 'studies',
        baseDir2: "",
        subDirs: {
          protocols: 'protocols',
          resources: 'resources'
        },
        slash: "",
        createNewStructure: false,
        generateISA: false,
        useExistingStructure: true
      },
      existing_assay: {
        baseDir: 'assays',
        baseDir2: "assays",
        subDirs: {
          protocols: 'protocols',
          datasets: 'dataset'
        },
        slash: "/",
        createNewStructure: false,
        generateISA: false,
        useExistingStructure: true
      },
      new_assay_in_assays: {
        baseDir: 'assays',
        baseDir2: "assays",
        subDirs: {
          protocols: 'protocols',
          datasets: 'dataset'
        },
        slash: "/",
        createNewStructure: true,
        generateISA: true
      }
    };

    async function createAssay(assayId, targetPath, useExistingStructure, subDirs, gitRoot) {
      console.log(`createAssay called with: assayId=${assayId}, targetPath=${targetPath}, useExisting=${useExistingStructure}`);

      if (useExistingStructure) {
        // For existing structures, just ensure the target directory and subdirs exist
        console.log(`Using existing structure at: ${targetPath}`);

        // Ensure the base directory exists
        if (!fs.existsSync(targetPath)) {
          console.log(`Creating target directory: ${targetPath}`);
          fs.mkdirSync(targetPath, { recursive: true });
        }

        // Ensure the protocols and datasets/resources folders exist within the existing structure
        Object.values(subDirs).forEach(sub => {
          const fullPath = memfsPathJoin(targetPath, sub);
          if (!fs.existsSync(fullPath)) {
            console.log(`Creating missing subfolder: ${fullPath}`);
            fs.mkdirSync(fullPath, { recursive: true });
          }
        });

        // Selectively manage dataset folder - preserve untracked (manual) files
        const datasetPath = memfsPathJoin(targetPath, subDirs.datasets || subDirs.resources);
        if (fs.existsSync(datasetPath)) {
          console.log(`Cleaning dataset folder (preserving manual files): ${datasetPath}`);
          const { deleted, preserved } = await cleanTrackedFiles(gitRoot, datasetPath);
          console.log(`Summary: Removed ${deleted} previous file(s), preserved ${preserved} file(s)`);
        } else {
          fs.mkdirSync(datasetPath, { recursive: true });
          console.log(`Created new dataset folder: ${datasetPath}`);
        }

        return;
      } else {
        // For new structures, create the full hierarchy at the target path
        console.log(`Creating new structure at: ${targetPath}`);

        // Ensure base directory exists
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }

        // Create subfolders
        Object.values(subDirs).forEach(sub => {
          const fullPath = memfsPathJoin(targetPath, sub);
          if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
          }
        });

        // Selectively manage dataset folder - preserve untracked (manual) files
        const datasetPath = memfsPathJoin(targetPath, subDirs.datasets || subDirs.resources);
        if (fs.existsSync(datasetPath)) {
          console.log(`Cleaning dataset folder (preserving manual files): ${datasetPath}`);
          const { deleted, preserved } = await cleanTrackedFiles(gitRoot, datasetPath);
          console.log(`Summary: Removed ${deleted} previous file(s), preserved ${preserved} file(s)`);
        } else {
          fs.mkdirSync(datasetPath, { recursive: true });
          console.log(`Created new dataset folder: ${datasetPath}`);
        }
      }
    }

    function getDirectoryStructure(gitSubfolder = '') {
      // Clean and analyze the path
      const normalizedPath = gitSubfolder.replace(/^\.\//, '').replace(/\/$/, '').trim();
      const pathParts = normalizedPath.split('/').filter(p => p);

      console.log('getDirectoryStructure analysis:', { originalPath: gitSubfolder, normalizedPath, pathParts });

      if (pathParts.length === 0) {
        // Root level - create new assay
        console.log('Selected: Root level - new assay');
        return PATH_CONFIG.default;
      }

      if (pathParts.length === 1) {
        // /arc_name/ - ARC root, create new assay
        console.log('Selected: ARC root level - new assay');
        return PATH_CONFIG.default;
      }

      // Check for studies and assays at the correct level (accounting for ARC name)
      const relevantLevel = pathParts.length >= 2 ? pathParts[1] : pathParts[0];

      if (relevantLevel.toLowerCase() === 'studies') {
        if (pathParts.length === 2) {
          // /arc_name/studies/ - create new study
          console.log('Selected: Studies directory - new study');
          return PATH_CONFIG.studies;
        } else if (pathParts.length === 3) {
          // /arc_name/studies/specific-study/ - load into existing study
          console.log('Selected: Specific study - existing study');
          return PATH_CONFIG.existing_study;
        }
        // Too deep or invalid - fallback to studies
        console.warn('Invalid studies path, falling back to new study');
        return PATH_CONFIG.studies;
      }

      if (relevantLevel.toLowerCase() === 'assays') {
        if (pathParts.length === 2) {
          // /arc_name/assays/ - create new assay in assays directory
          console.log('Selected: Assays directory - new assay in assays');
          return PATH_CONFIG.new_assay_in_assays;
        } else if (pathParts.length === 3) {
          // /arc_name/assays/specific-assay/ - load into existing assay
          console.log('Selected: Specific assay - existing assay');
          return PATH_CONFIG.existing_assay;
        }
        // Too deep or invalid - fallback to new assay in assays
        console.warn('Invalid assays path, falling back to new assay in assays');
        return PATH_CONFIG.new_assay_in_assays;
      }

      // Handle legacy paths without ARC name (for backward compatibility)
      if (pathParts[0].toLowerCase() === 'studies') {
        if (pathParts.length === 1) {
          console.log('Selected: Legacy studies directory - new study');
          return PATH_CONFIG.studies;
        } else if (pathParts.length === 2) {
          console.log('Selected: Legacy specific study - existing study');
          return PATH_CONFIG.existing_study;
        }
      }

      if (pathParts[0].toLowerCase() === 'assays') {
        if (pathParts.length === 1) {
          console.log('Selected: Legacy assays directory - new assay in assays');
          return PATH_CONFIG.new_assay_in_assays;
        } else if (pathParts.length === 2) {
          console.log('Selected: Legacy specific assay - existing assay');
          return PATH_CONFIG.existing_assay;
        }
      }

      // Other paths - fallback to default (root assay)
      console.warn('Non-standard path, falling back to default assay structure');
      return PATH_CONFIG.default;
    }

    function generateProtocolFilename(elabid, title) {
      // Sanitize title: remove special characters, replace spaces/symbols with underscores
      const sanitizedTitle = title
        .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special chars except spaces, hyphens, underscores
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, '') // Remove leading/trailing underscores
        .substring(0, 30); // Limit to 30 characters

      return `eLabFTW_protocol_${elabid}_${sanitizedTitle}.elab2arc.md`;
    }

    function generateExperimentFolderName(elabid, title) {
      // Sanitize title: remove special characters, replace spaces/symbols with underscores
      const sanitizedTitle = title
        .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special chars except spaces, hyphens, underscores
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, '') // Remove leading/trailing underscores
        .substring(0, 20); // Limit to 20 characters for folder names

      return `${elabid}-${sanitizedTitle}`;
    }

    /**
     * Generate filename with human-readable name before upload ID
     * Format: {basename}_{uploadId}.{ext} (e.g., "data_12345.csv")
     * @param {string} realname - Sanitized filename from eLabFTW
     * @param {number|string} uploadId - eLabFTW upload ID
     * @returns {string} Filename with ID before extension
     */
    function generateUploadFileName(realname, uploadId) {
      // Find the last dot to separate basename and extension
      const lastDotIndex = realname.lastIndexOf('.');

      if (lastDotIndex === -1 || lastDotIndex === 0) {
        // No extension or dot at start (hidden file)
        return `${realname}_${uploadId}.elab2arc`;
      }

      // Split into basename and extension
      const basename = realname.substring(0, lastDotIndex);
      const extension = realname.substring(lastDotIndex); // includes the dot

      return `${basename}_${uploadId}.elab2arc${extension}`;
    }

    /**
     * Migrate old index-based filenames to new ID-based filenames
     * @param {string} datasetPath - Path to dataset folder
     * @param {Array} uploads - Upload objects from eLabFTW
     */
    function migrateOldFilenames(datasetPath, uploads) {
      if (!fs.existsSync(datasetPath)) return;

      const migratedFiles = [];

      for (const [index, upload] of Object.entries(uploads)) {
        const realname = upload.real_name.replace(/[^a-zA-Z0-9_,.\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
        const oldFileName = `${index}_${realname}`;  // Old format
        const newFileName = generateUploadFileName(realname, upload.id);  // New format
        const oldPath = memfsPathJoin(datasetPath, oldFileName);
        const newPath = memfsPathJoin(datasetPath, newFileName);

        // If old file exists and new doesn't, rename it
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          migratedFiles.push(`${oldFileName} → ${newFileName}`);
          console.log(`  Migrated: ${oldFileName} → ${newFileName}`);
        }
      }

      if (migratedFiles.length > 0) {
        console.log(`Migrated ${migratedFiles.length} file(s) to new naming scheme`);
      }
    }

    /**
     * Check if a file is tracked by git
     * @param {string} gitRoot - Git repository root
     * @param {string} filePath - Full path to file
     * @returns {Promise<boolean>} True if tracked, false if untracked
     */
    async function isFileTrackedByGit(gitRoot, filePath) {
      try {
        const relativePath = filePath.replace(gitRoot, '').replace(/^\//, '');

        const matrix = await git.statusMatrix({
          fs,
          dir: gitRoot,
          filepaths: [relativePath]
        });

        if (!matrix || matrix.length === 0) {
          return false; // File not in git
        }

        // matrix[0] = [filepath, HEADStatus, WORKDIRStatus, STAGEStatus]
        // HEADStatus: 0 = absent (untracked), 1 = present (tracked)
        const headStatus = matrix[0][1];
        return headStatus === 1;
      } catch (error) {
        console.warn(`Error checking git status for ${filePath}:`, error);
        return false; // Safer to assume untracked
      }
    }

    /**
     * Separate tracked and untracked files in a directory
     * @param {string} gitRoot - Git repository root
     * @param {string} dirPath - Directory to scan
     * @returns {Promise<{tracked: string[], untracked: string[]}>}
     */
    async function categorizeFilesByGitStatus(gitRoot, dirPath) {
      const tracked = [];
      const untracked = [];

      if (!fs.existsSync(dirPath)) {
        return { tracked, untracked };
      }

      try {
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
          const fullPath = memfsPathJoin(dirPath, file);
          const stat = fs.statSync(fullPath);

          // Skip directories
          if (stat.isDirectory()) {
            continue;
          }

          const isTracked = await isFileTrackedByGit(gitRoot, fullPath);

          if (isTracked) {
            tracked.push(file);
          } else {
            untracked.push(file);
          }
        }
      } catch (error) {
        console.error('Error categorizing files:', error);
      }

      return { tracked, untracked };
    }

    /**
     * Remove only git-tracked files, preserve untracked (manual) files
     * @param {string} gitRoot - Git repository root
     * @param {string} dirPath - Directory to clean
     * @param {Array<string>} preserveList - Filenames to always preserve
     * @returns {Promise<{deleted: number, preserved: number}>}
     */
    async function cleanTrackedFiles(gitRoot, dirPath, preserveList = ['README.md', 'readme.md', '.gitkeep']) {
      let deletedCount = 0;
      let preservedCount = 0;

      if (!fs.existsSync(dirPath)) {
        return { deleted: deletedCount, preserved: preservedCount };
      }

      try {
        // Get all files in the directory
        const allFiles = fs.readdirSync(dirPath);
        console.log(`  Found ${allFiles.length} total file(s) in directory`);

        // Only delete files with .elab2arc suffix (these are elab2arc-generated files)
        for (const file of allFiles) {
          const filePath = memfsPathJoin(dirPath, file);

          // Skip directories
          if (fs.statSync(filePath).isDirectory()) {
            continue;
          }

          // Only delete files with .elab2arc suffix
          if (file.includes('.elab2arc')) {
            try {
              fs.unlinkSync(filePath);
              deletedCount++;
              console.log(`  Removed (elab2arc-generated): ${file}`);
            } catch (e) {
              console.warn(`  Failed to remove ${file}:`, e.message);
            }
          } else {
            // Preserve all other files (manually added or other files)
            preservedCount++;
            console.log(`  Preserved (non-elab2arc file): ${file}`);
          }
        }

      } catch (error) {
        console.error('Error cleaning tracked files:', error);
        console.warn('⚠️  Skipping cleanup to preserve all files');
      }

      return { deleted: deletedCount, preserved: preservedCount };
    }

    async function processExperiment(completedEntries, totalEntries, elabid, params, res, users, datahubURL, arcDir, instance, entryType) {
      // Calculate base progress for this experiment (0-90%, leaving 90-100% for final git push)
      const baseProgress = (completedEntries / totalEntries) * 90;
      updateInfo(`Processing entry ${completedEntries + 1}/${totalEntries}: <b>${elabid}</b>`, baseProgress);

      const assayId = formatAssayId(res.title);
      const user = users.find(e => e.fullname === res.fullname);
      const email = user?.email || '';

      // Process protocol HTML
      let protocol = res.body;
      const elabWWW = params.instance.replace("api/v2/", "");
      protocol = protocol.replace(/app\/download\.php(.*)f=/g, "");
      protocol = protocol.replace('<a href="experiments.php?', '<a target="_blank" href="' + instance.replace("api/v2/", "") + 'experiments.php?');
      protocol = protocol.replace('<a href="database.php?', '<a  target="_blank" href="' + instance.replace("api/v2/", "") + 'experiments.php?');
      const protocolHTML = protocol;

      // Convert to markdown
      let markdown = turndownService.turndown(protocol);

      // Add extra_fields as markdown table if they exist (GitHub issue #29)
      const extraFieldsMarkdown = await Elab2ArcExtraFields.formatAsMarkdown(res.metadata_decoded, instance, params.elabtoken);
      if (extraFieldsMarkdown) {
        markdown += extraFieldsMarkdown;
      }

      // Get target path from input field and derive all paths from it
      const targetPathInput = document.getElementById("targetPath");
      let targetPath = targetPathInput ? targetPathInput.value.trim() : "";

      // If targetPath is empty, auto-fill it from arcDir selection
      if (!targetPath && arcDir) {
        // Default to assays folder for the selected ARC
        targetPath = `${arcDir}/assays`;
        console.log("Attempting to auto-fill target path:", targetPath);
        console.log("targetPathInput element:", targetPathInput);

        if (targetPathInput) {
          console.log("Setting targetPath input value to:", targetPath);
          targetPathInput.value = targetPath;
          targetPathInput.classList.add("is-valid");
          console.log("Input value after setting:", targetPathInput.value);
        } else {
          console.error("targetPath input element not found!");
        }
        console.log("Auto-filled target path from arcDir:", targetPath);
      }

      console.log("Target path from input:", targetPath);

      // Derive git info for links and operations
      const gitName = datahubURL.slice(0, -4);
      const gitShortName = gitName.split("/").slice(-1)[0];

      // Derive gitRoot from target path if available, otherwise from arcDir
      let gitRoot;
      if (targetPath) {
        const targetPathParts = targetPath.split("/").filter(p => p);
        gitRoot = targetPathParts.length > 0 ? targetPathParts[0] + "/" : arcDir.split("/")[0] + "/";
      } else {
        gitRoot = arcDir.split("/")[0] + "/";
      }

      console.log("Calculated gitRoot:", gitRoot, "from targetPath:", targetPath, "or arcDir:", arcDir);

      // Determine final paths based on target path
      let baseAssayPath, protocolPath, datasetPath, useExistingStructure, isStudy;

      if (targetPath) {
        const pathParts = targetPath.split("/").filter(p => p);

        if (pathParts.length >= 2) {
          const containerType = pathParts[1].toLowerCase(); // assays or studies
          const lastPart = pathParts[pathParts.length - 1].toLowerCase();

          // Check if target path ends with container names (indicating user wants to create inside)
          if ((lastPart === "assays" || lastPart === "studies") && pathParts.length >= 2) {
            // Target ends with container folder - create new assay/study within it
            baseAssayPath = memfsPathJoin(targetPath, assayId);
            useExistingStructure = false;
          } else {
            // Target is a specific folder - use it directly
            baseAssayPath = targetPath;
            useExistingStructure = true;
          }
        } else {
          // Root level - create new assay structure
          baseAssayPath = memfsPathJoin(targetPath, "assays", assayId);
          useExistingStructure = false;
        }
      } else {
        // No target path - use default structure
        baseAssayPath = memfsPathJoin(arcDir, "assays", assayId);
        useExistingStructure = false;
      }

      // Determine if this is a study or assay based on the path
      isStudy = baseAssayPath.toLowerCase().includes('/studies/');

      // Set correct subdirectories based on whether it's a study or assay
      // Studies: protocols + resources (no dataset)
      // Assays: protocols + dataset (no resources)
      const dataFolderName = isStudy ? "resources" : "dataset";
      const standardSubDirs = { protocols: "protocols", datasets: dataFolderName };

      // Standard subdirectories
      protocolPath = memfsPathJoin(baseAssayPath, "protocols");
      datasetPath = memfsPathJoin(baseAssayPath, dataFolderName);

      console.log(`Final paths: base=${baseAssayPath}, protocols=${protocolPath}, data=${datasetPath}, useExisting=${useExistingStructure}, isStudy=${isStudy}`);

      // Create required directories using simplified approach
      await createAssay(assayId, baseAssayPath, useExistingStructure, standardSubDirs, gitRoot);

      // Generate ISA file for new structures only (not for existing ones)
      // DEPRECATED: Old fullAssay2() method removed - Issue #36 fix
      // The new ISA generation method (generateIsaAssayElab2arcWithDatamap/generateIsaStudy)
      // is now the single source of truth for ISA file generation (see lines 3098-3115)
      if (!useExistingStructure) {
        // await fullAssay2(...) - REMOVED: Was causing duplicate isa.assay.xlsx files

        const progressStep1 = baseProgress + (1 / totalEntries) * 90 * 0.3;
        const isaFileName = isStudy ? 'isa.study.xlsx' : 'isa.assay.xlsx';
        const isaTypeLabel = isStudy ? 'study' : 'assay';
        updateInfo(`${isaFileName} has been updated at <b>${assayId}</b>`, progressStep1);

        // Calculate git path for ISA file based on the baseAssayPath
        const relativeAssayPath = baseAssayPath.replace(gitRoot, "");
        const isaPath = `${relativeAssayPath}/${isaFileName}`;

        try {
          await git.add({ fs, dir: gitRoot, filepath: isaPath });
          console.log(`Added ISA file to git: ${isaPath}`);
        } catch (error) {
          console.warn(`Could not add ISA file to git: ${isaPath}`, error);
        }
      } else {
        const targetName = baseAssayPath.split('/').pop();
        const structureType = targetPath && targetPath.includes('/studies/') ? 'study' : 'assay';
        const progressStep1 = baseProgress + (1 / totalEntries) * 90 * 0.3;
        updateInfo(`No isa.assay.xlsx generated - ${useExistingStructure ? 'adding to existing' : 'creating new'} ${structureType}: <b>${targetName}</b>`, progressStep1);
      }
      // Write isa.assay.xlsx

      // Generate protocol filename
      const protocolFilename = generateProtocolFilename(elabid, res.title);

      // Status HTML
      let statusHTML = `
          <table class="table table-striped table-hover">
            <thead>
              <tr>
                <th>eLabFTW Experiment ${elabid}</th>
                <th>ARC files updated</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td id="protocolHTML">${protocolHTML}</td>
                <td>
                  ARC file path is ${protocolPath}/${protocolFilename}
                  <br>
                  <a href="${gitName}/-/blob/${mainOrMaster}/${baseAssayPath.replace(gitRoot, "")}/protocols/${protocolFilename}" target="_blank">Click to check the file</a>
                </td>
              </tr>
        `;

      // Process uploads
      [statusHTML, markdown] = await processUploadsAndReplaceUrls(
        res.uploads,
        baseAssayPath,
        gitRoot,
        assayId,
        datahubURL,
        params,
        baseProgress,
        totalEntries,
        statusHTML,
        markdown,
        protocolHTML,
        elabid,
        res
      );

      // Finalize HTML and write files
      statusHTML += "</tbody></table>";
      statusHTML = statusHTML.replaceAll("<img", "<img class='img-fluid'");
      filesChanged.innerHTML += statusHTML;

      // Write markdown files
      const protocolMdPath = memfsPathJoin(protocolPath, protocolFilename);
      await fs.promises.writeFile(protocolMdPath, markdown);

      // Calculate relative paths for git operations
      const relativeProtocolPath = `${baseAssayPath.replace(gitRoot, "")}/protocols/${protocolFilename}`;
      await git.add({ fs, dir: gitRoot, filepath: relativeProtocolPath });

      // Generate experiment folder name for readme documentation
      const experimentFolderName = generateExperimentFolderName(elabid, res.title);

      // Create comprehensive readme with conversion documentation
      const readmeContent = `# ${isStudy ? 'Resources' : 'Dataset'}

## Overview
This ${isStudy ? 'resources' : 'dataset'} folder contains files converted from eLabFTW experiment.

## Source Information
- **eLabFTW Experiment ID**: ${elabid}
- **Experiment Title**: ${res.title}
- **Author**: ${res.fullname}
- **Team**: ${res.team_name || 'N/A'}
- **Source Instance**: ${params.instance.replace('api/v2/', '')}

## Conversion Details
- **Conversion Tool**: elab2ARC
- **Conversion Date**: ${new Date().toISOString().split('T')[0]}
- **Target ${isStudy ? 'Study' : 'Assay'}**: ${assayId}
- **DataHub Repository**: ${datahubURL}

## Folder Structure
- **protocols/**: Contains the experiment protocol converted to markdown format
- **${dataFolderName}/**: Contains all data files and resources from the eLabFTW experiment

## File Organization
Files are organized in subfolders named after the eLabFTW experiment:
\`${experimentFolderName}/\`

Each file maintains its original filename from eLabFTW for traceability.

## Protocol Reference
The experimental protocol can be found in:
\`protocols/${protocolFilename}\`

## Data Files
${res.uploads && res.uploads.length > 0 ?
`This folder contains ${res.uploads.length} file(s) uploaded in the original eLabFTW experiment.` :
'No files were uploaded in the original eLabFTW experiment.'}

## Notes
- All file references in the protocol markdown have been updated to point to their new locations in this ARC
- Original eLabFTW links are preserved for reference and traceability
- This conversion was performed automatically by the elab2ARC tool

---
*Generated by [elab2ARC](https://github.com/nfdi4plants/elab2arc)*
`;

      const readmePath = memfsPathJoin(datasetPath, 'README.elab2arc.md');
      await fs.promises.writeFile(readmePath, readmeContent);

      const relativeDatasetPath = `${baseAssayPath.replace(gitRoot, "")}/${dataFolderName}/README.elab2arc.md`;
      await git.add({ fs, dir: gitRoot, filepath: relativeDatasetPath });

      // ========== METADATA TRACKING: Initialize conversion metadata (BEFORE try block for scope) ==========
      const conversionStartTime = Date.now();
      let conversionMetadata = null;
      let llmData = null;
      const datamapSwitch = document.getElementById('enableDatamapSwitch');

      // ========== EXPERIMENTAL: Generate ISA files with Multi-Protocol Support ==========
      try {
        // Extract metadata info from assay folders
        const protocolPath = memfsPathJoin(baseAssayPath, 'protocols');
        const datasetPath = memfsPathJoin(baseAssayPath, 'dataset');
        const protocolInfo = Elab2ArcISA.extractProtocolInfo(protocolPath);
        const datasetInfo = Elab2ArcISA.extractDatasetInfo(datasetPath);

        // Check if LLM datamap is enabled
        if (datamapSwitch && datamapSwitch.checked) {
          console.log('[ISA Gen] LLM datamap enabled, extracting protocols from markdown...');
          updateInfo(`🤖 Analyzing protocol with AI for: <b>${assayId}</b>`, baseProgress + 0.3);

          // Clear previous LLM stream content
          if (window.Elab2ArcLLM && window.Elab2ArcLLM.clearLLMStream) {
            window.Elab2ArcLLM.clearLLMStream();
          }

          // Pass protocol metadata to LLM for better context
          const protocolMetadata = {
            protocolFilename: protocolFilename,
            protocolPath: `${baseAssayPath.replace(gitRoot + '/', '')}/protocols/${protocolFilename}`,
            assayId: assayId
          };

          llmData = await Elab2ArcLLM.callTogetherAI(markdown, false, protocolMetadata);  // Now returns multi-protocol structure

          if (llmData) {
            // Validate structure (backward compatibility with old format)
            if (!llmData.protocols && llmData.inputs) {
              // Old format - wrap in protocols array
              console.log('[ISA Gen] Converting old LLM format to multi-protocol structure');
              llmData = {
                protocols: [{
                  name: "Main Protocol",
                  description: "",
                  inputs: llmData.inputs || [],
                  parameters: llmData.parameters || [],
                  outputs: llmData.outputs || []
                }]
              };
            }

            console.log(`[ISA Gen] Extracted ${llmData.protocols?.length || 0} protocol(s) from LLM`);
            updateInfo(`✓ Extracted ${llmData.protocols?.length || 0} protocol step(s) for: <b>${assayId}</b>`, baseProgress + 0.5);

            // Save LLM JSON to protocols folder
            try {
              const protocolJsonFilename = protocolFilename.replace('.md', '.json');
              const protocolJsonPath = memfsPathJoin(protocolPath, protocolJsonFilename);
              const jsonContent = JSON.stringify(llmData, null, 2);
              await fs.promises.writeFile(protocolJsonPath, jsonContent);
              console.log(`[ISA Gen] Saved LLM JSON to: ${protocolJsonFilename}`);

              // Verify file was written before adding to git
              try {
                await fs.promises.access(protocolJsonPath);
                console.log(`[ISA Gen] Verified JSON file exists: ${protocolJsonFilename}`);

                // Add JSON file to git
                const relativeJsonPath = protocolJsonPath.replace(gitRoot + '/', '');
                await git.add({ fs, dir: gitRoot, filepath: relativeJsonPath });
                console.log(`[ISA Gen] Added ${protocolJsonFilename} to git`);
              } catch (gitError) {
                console.error('[ISA Gen] Error adding protocol JSON to git:', gitError);
                console.error('[ISA Gen] File path:', protocolJsonPath);
                console.error('[ISA Gen] Relative path:', protocolJsonPath.replace(gitRoot + '/', ''));
              }
            } catch (jsonError) {
              console.error('[ISA Gen] Error saving protocol JSON:', jsonError);
            }
          } else {
            console.warn('[ISA Gen] LLM extraction returned no data');
            updateInfo(`⚠️ LLM extraction failed, using default structure for: <b>${assayId}</b>`, baseProgress + 0.5);
          }
        } else {
          console.log('[ISA Gen] LLM datamap generation disabled (toggle switch off)');
        }

        // Prepare ISA metadata
        const isaMetadata = {
          measurementType: 'eLabFTW experiment',
          technologyType: entryType === 'resource' ? 'database resource' : 'experiment',
          platform: 'eLabFTW',
          lastName: res.lastname || '',
          firstName: res.firstname || '',
          familyName: res.lastname || '',
          email: email,
          affiliation: res.team_name || ''
        };

        // Generate ISA file (study or assay) with metadata + multi-process sheets
        const isaType = isStudy ? 'study' : 'assay';

        // Use actual folder name for batch conversions, experiment name for individual
        const assayIdentifier = useExistingStructure
          ? baseAssayPath.split('/').filter(p => p).pop()  // Extract folder name (e.g., "allinone")
          : assayId;  // Use experiment-based name for new structures

        updateInfo(`📝 Generating ISA ${isaType} file for: <b>${assayIdentifier}</b>`, baseProgress + 0.6);

        let isaFilePath;
        if (isStudy) {
          // Generate isa.study.xlsx for studies
          // Issue #42 fix: Pass protocolInfo, datasetInfo, and llmData to study generation
          isaFilePath = await Elab2ArcISA.generateIsaStudy(
            baseAssayPath,
            assayIdentifier,
            isaMetadata,
            protocolInfo,
            datasetInfo,
            llmData
          );
        } else {
          // Generate isa.assay.xlsx for assays
          isaFilePath = await Elab2ArcISA.generateIsaAssayElab2arcWithDatamap(
            baseAssayPath,
            assayIdentifier,
            isaMetadata,
            protocolInfo,
            datasetInfo,
            llmData
          );
        }

        if (isaFilePath) {
          // Add ISA file to git
          const relativeIsaPath = isaFilePath.replace(gitRoot, '');
          try {
            await git.add({ fs, dir: gitRoot, filepath: relativeIsaPath });
            console.log(`[ISA Gen] Added to git: ${relativeIsaPath}`);
            updateInfo(`✓ ISA ${isaType} file created for: <b>${assayIdentifier}</b>`, baseProgress + 0.8);
          } catch (gitError) {
            console.warn(`[ISA Gen] Could not add ISA file to git:`, gitError);
            updateInfo(`⚠️ ISA file created but not added to git: <b>${assayIdentifier}</b>`, baseProgress + 0.8);
          }
        } else {
          updateInfo(`⚠️ ISA file generation failed for: <b>${assayIdentifier}</b>`, baseProgress + 0.8);
        }
      } catch (isaError) {
        // Log error but continue conversion
        console.error('[ISA Gen] ISA generation failed (experimental feature):', isaError);
        updateInfo(`⚠️ ISA generation error for: <b>${assayIdentifier}</b>`, baseProgress + 0.8);
      }
      // ========== END EXPERIMENTAL ==========

      // ========== METADATA TRACKING: Save conversion metadata ==========
      // Saves to: {assayPath}/elab2arc-metadata/conversion-{UUID}.json and latest.json
      // Automatically cleans up old conversions (keeps last 10)
      if (window.Elab2ArcMetadata) {
        try {
          const conversionEndTime = Date.now();

          // Get custom prompt if LLM was used
          let promptData = null;
          let llmModel = null;
          let llmModelUsed = null;

          if (datamapSwitch && datamapSwitch.checked) {
            promptData = window.getCustomPromptSections ? window.getCustomPromptSections() : null;
            llmModel = window.Elab2ArcLLM?.getSelectedModel ? window.Elab2ArcLLM.getSelectedModel() : 'unknown';
            llmModelUsed = window.Elab2ArcLLM?.lastUsedModel || llmModel;
          }

          // Assemble full prompt for metadata
          const fullPrompt = promptData ?
            `${promptData.systemRole}\n\n${promptData.jsonSchema}\n\n${promptData.extractionRules}\n\n${promptData.examples}` :
            '';

          // Create metadata
          conversionMetadata = window.Elab2ArcMetadata.createConversionMetadata({
            elabftw: {
              experimentId: elabid,
              title: res.title,
              author: res.fullname,
              team: res.team_name || '',
              instance: params.instance,
              type: entryType
            },
            llmEnabled: datamapSwitch && datamapSwitch.checked,
            llmModel: llmModel,
            llmModelUsed: llmModelUsed,
            promptSections: promptData,
            fullPrompt: fullPrompt,
            apiParams: {
              temperature: 0.1,
              max_tokens: 8192,
              stream: true
            },
            chunkInfo: {
              required: false,
              chunkCount: 1,
              chunkSizes: []
            },
            tokenInfo: {
              estimated: 0,
              actual: 0
            },
            results: {
              status: llmData ? 'success' : (datamapSwitch && datamapSwitch.checked ? 'failed' : 'llm_disabled'),
              samplesExtracted: llmData?.samples?.length || 0,
              protocolsExtracted: llmData?.protocols?.length || 0,
              errors: [],
              warnings: []
            },
            files: {
              protocolPath: `protocols/${protocolFilename}`,
              isaPath: isStudy ? 'isa.study.xlsx' : 'isa.assay.xlsx',
              dataFiles: (res.uploads || []).map(u => {
                const sanitized = u.real_name.replace(/[^a-zA-Z0-9_,.\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
                const dataFolder = isStudy ? 'resources' : 'dataset';
                return `${dataFolder}/${generateUploadFileName(sanitized, u.id)}`;
              })
            },
            startTime: conversionStartTime,
            endTime: conversionEndTime
          });

          // Save metadata to ARC
          const metadataPath = await window.Elab2ArcMetadata.saveMetadataToARC(conversionMetadata, baseAssayPath);

          if (metadataPath) {
            console.log('[Metadata] Saved conversion metadata:', metadataPath);

            // Display metadata in Status Modal
            if (window.displayConversionMetadata) {
              window.displayConversionMetadata(conversionMetadata);
            }

            // Add metadata files to git
            try {
              // Ensure paths are relative to gitRoot and don't start with /
              const normalizeGitPath = (fullPath) => {
                let relative = fullPath.replace(gitRoot, '');
                // Remove leading slash if present
                if (relative.startsWith('/')) {
                  relative = relative.substring(1);
                }
                return relative;
              };

              // Helper to wait for file to exist (with retry)
              const waitForFile = async (filePath, maxRetries = 5, delayMs = 100) => {
                for (let i = 0; i < maxRetries; i++) {
                  if (fs.existsSync(filePath)) {
                    return true;
                  }
                  console.log(`[Metadata] Waiting for file to be written: ${filePath} (attempt ${i + 1}/${maxRetries})`);
                  await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                return false;
              };

              // Wait for primary metadata file to exist
              const fileExists = await waitForFile(metadataPath);
              if (!fileExists) {
                console.error(`[Metadata] File does not exist after retries: ${metadataPath}`);
                throw new Error(`Metadata file not found: ${metadataPath}`);
              }

              const relativeMetadataPath = normalizeGitPath(metadataPath);
              console.log(`[Metadata] Adding to git: ${relativeMetadataPath}`);
              await git.add({ fs, dir: gitRoot, filepath: relativeMetadataPath });

              // Also add latest.json
              const latestFullPath = `${baseAssayPath}/elab2arc-metadata/latest.json`;
              if (await waitForFile(latestFullPath)) {
                const latestPath = normalizeGitPath(latestFullPath);
                console.log(`[Metadata] Adding to git: ${latestPath}`);
                await git.add({ fs, dir: gitRoot, filepath: latestPath });
              }

              console.log('[Metadata] Successfully added metadata files to git');
            } catch (gitError) {
              console.warn('[Metadata] Could not add metadata to git:', gitError);
            }
          }
        } catch (metadataError) {
          console.error('[Metadata] Error saving conversion metadata:', metadataError);
          // Don't fail the conversion if metadata saving fails
        }
      }
      // ========== END METADATA TRACKING ==========

      finalizeExperimentDisplay(baseProgress, totalEntries);
      await commitPush(
        params.datahubtoken,
        datahubURL,
        res.fullname,
        email,
        arcDir,
        gitRoot,
        elabid,
        res.title,
        assayId,
        isStudy,
        res.uploads?.length || 0,
        baseAssayPath.replace(gitRoot, ""),
        protocolFilename,
        res.team_name,
        params.instance.replace('api/v2/', ''),
        completedEntries,
        totalEntries,
        entryType
      );
    }

    async function processUploadsAndReplaceUrls(
      uploads,
      baseAssayPath,
      gitRoot,
      assayId,
      datahubURL,
      params,
      baseProgress,
      totalEntries,
      statusHTML,
      markdown,
      protocolHTML,
      elabid,
      res
    ) {
      const gitName = datahubURL.slice(0, -4);
      const gitShortName = gitName.split("/").slice(-1)[0];

      console.log("Processing uploads for baseAssayPath:", baseAssayPath);

      // Determine if this is an assay or study based on the path
      const isStudy = baseAssayPath.toLowerCase().includes('/studies/');
      const containerFolder = isStudy ? "resources" : "dataset";

      // Generate experiment folder name for organizing files
      const experimentFolderName = generateExperimentFolderName(elabid, res.title);
      const containerPath = memfsPathJoin(baseAssayPath, containerFolder);
      const experimentPath = memfsPathJoin(containerPath, experimentFolderName);

      // Clean only this experiment's files (preserve manual additions)
      if (fs.existsSync(experimentPath)) {
        console.log(`Cleaning experiment folder: ${experimentFolderName}`);
        await cleanTrackedFiles(gitRoot, experimentPath);
      } else {
        fs.mkdirSync(experimentPath, { recursive: true });
      }

      // Check if migration from old index-based names is needed
      if (fs.existsSync(experimentPath)) {
        migrateOldFilenames(experimentPath, uploads);
      }

      for (const [index, upload] of Object.entries(uploads)) {
        const blob = await fetchElabFiles(
          params.elabtoken,
          `experiments/${res.id}/uploads/${upload.id}?format=binary`,
          params.instance
        );

        const realname = upload.real_name.replace(/[^a-zA-Z0-9_,.\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
        const longname = upload.long_name;
        const longnameEncoded = encodeURIComponent(longname);
        const fileName = generateUploadFileName(realname, upload.id);
        const fullPath = memfsPathJoin(experimentPath, fileName);
        const relativeFilePath = `${baseAssayPath.replace(gitRoot, "")}/${containerFolder}/${experimentFolderName}/${fileName}`;

        // Replace URLs in HTML and markdown
        statusHTML = statusHTML.replaceAll(longname, URL.createObjectURL(blob));
        statusHTML = statusHTML.replaceAll(longnameEncoded, URL.createObjectURL(blob));
        statusHTML = statusHTML.replace(/&amp;storage=[12]/g, "");

        markdown = markdown.replace(new RegExp(longname, "g"), `../${containerFolder}/${experimentFolderName}/${fileName}`);
        markdown = markdown.replace(new RegExp(longnameEncoded, "g"), `../${containerFolder}/${experimentFolderName}/${fileName}`);
        markdown = markdown.replace(/&storage=./g, "");

        // Ensure experiment folder exists before writing file
        await fs.promises.mkdir(experimentPath, { recursive: true });

        // Write file
        console.log("fileName:", fileName, "| fullPath:", fullPath, "| relativeFilePath:", relativeFilePath);
        console.log(`[Upload] File type: ${blob.type}, size: ${blob.size} bytes`);
        await fs.promises.writeFile(fullPath, new Uint8Array(await blob.arrayBuffer()));

        // Add file with LFS support for large files
        // Get token using standardized method
        const datahubToken = getDatahubToken();
        // Use dedicated LFS proxy for LFS API calls - it properly handles CORS headers AND Authorization forwarding
        // The general CORS proxy (corsproxy.cplantbox.com) does NOT forward Authorization headers
        // Tested: lfsproxy.cplantbox.com returns proper CORS headers for LFS batch API with auth
        const lfsProxy = 'https://lfsproxy.cplantbox.com';

        if (window.GitLFSService) {
          // GitLab LFS requires Basic auth with username "oauth2" and token as password
          // Format: Basic base64("oauth2:token")
          const lfsAuth = `Basic ${btoa('oauth2:' + datahubToken)}`;
          const lfsResult = await GitLFSService.addFileWithLFS(
            fs, git, gitRoot, relativeFilePath,
            datahubURL, lfsAuth,
            lfsProxy
          );
          if (lfsResult.usedLFS) {
            console.log(`[LFS] File ${fileName} (${GitLFSService.formatBytes(lfsResult.size)}) stored via LFS`);
          }
        } else {
          // Fallback to normal git.add if LFS service not available
          await git.add({ fs, dir: gitRoot, filepath: relativeFilePath });
        }

        // Update status HTML

        if (blob.type.includes("image")) { //
          statusHTML += `
              <tr>
                <td><img src="${URL.createObjectURL(blob)}"></td>
                <td>
                  Submitted ARC file path is: ${relativeFilePath}.
                  <br>
                  <a href="${gitName}/-/blob/${mainOrMaster}/${relativeFilePath}" target="_blank">Click to check the file</a>
                </td>
              </tr>
            `;
        } else {//
          statusHTML += `
              <tr>
                <td>File name is ${realname}</td>
                <td>
                  Submitted ARC file path is: ${relativeFilePath}.
                  <br>

                  <a href="${gitName}/-/blob/${mainOrMaster}/${relativeFilePath}" target="_blank">Click to check the file</a>
                </td>
              </tr>
            `;
        }

        // Progress: within this experiment's allocation (40-70% of experiment range)
        const progressStep2 = baseProgress + (1 / totalEntries) * 90 * (0.4 + (parseInt(index) + 1) / uploads.length * 0.3);
        updateInfo(`Added file ${parseInt(index) + 1}/${uploads.length}: ${realname}`, progressStep2);
      }

      return [statusHTML, markdown];
    }

    function formatAssayId(title) {
      return title.replace(/\//g, "|").replace(/[^a-zA-Z0-9_\-]/g, "_");
    }

    // Read directory contents
    async function readDirectory(dir) {
      try {
        return fs.readdirSync(`${dir}/assays`);
      } catch (error) {
        return fs.readdirSync(dir);
      }
    }


    // Finalize experiment display
    function finalizeExperimentDisplay(baseProgress, totalEntries) {
      const progressStep3 = baseProgress + (1 / totalEntries) * 90 * 0.7;
      updateInfo("Finished adding protocol files in ARC", progressStep3);
      const progressStep4 = baseProgress + (1 / totalEntries) * 90 * 0.85;
      updateInfo("All files have been added to ARC, starting to push to DataHub", progressStep4);
      //document.getElementById("filesAcc").click();

    }

    // Handle errors
    function handleError(error) {
      if (error.message.includes("401")) {

        showError("Error: Unable to access PLANTdataHUB. Please verify that the DataHub Token matches the datahub_url in the extra_fields of eLabFTW.");
      } else if (error.message.includes("Cannot read properties of undefined")) {

        showError("eLabFTW accessed successfully, but extra_fields is missing. Please check the experiment ID and extra_fields in eLabFTW.");
      } else if (error.message.includes("403")) {

        showError("Error: PLANTdataHUB cannot be accessed. Please verify that the datahub_url in the extra_fields of eLabFTW is correct.");
      } else {

        showError("Error: eLabFTW to ARC conversion failed.");
      }
      console.error(error);
    }

    async function fetchElabExperimentData(elabid, elabtoken, instance, type) {
      let res;
      ;
      res = await fetchElabJSON(elabtoken, `${typeConfig[type].endpoint}/${elabid}`, instance);

      if (res.code > 400) {
        console.error(res);

      }
      const users = await fetchElabJSON(elabtoken, "users", instance);
      const user = users.find(u => u.fullname === res.fullname);
      return res;
    }

    // Load and display eLabFTW experiment/resource in preview offcanvas
    window.loadExperiment = async function(instance, elabid, elabtoken, type) {
        try {
            const data = await fetchElabExperimentData(elabid, elabtoken, instance, type);
            window.elabJSON = data;

            const assayId  = data.title.replace(/\//g, "|").replace(/[^a-zA-Z0-9_\-]/g, "_");
            let protocol = data.body;
            const elabWWW= instance.replace("api/v2/", "");
            protocol = protocol.replace(/\w+\.php\?mode=view/g, elabWWW+"/$&"  );

            // Add extra_fields to protocol preview if they exist (GitHub issue #29)
            const extraFieldsHTML = await Elab2ArcExtraFields.formatAsHTML(data.metadata_decoded, instance, elabtoken);
            if (extraFieldsHTML) {
                protocol += '\n' + extraFieldsHTML;
            }

            // Populate content - wait for DOM to be ready
            const expTitleEl = document.getElementById('expTitle');
            if (expTitleEl) {
                expTitleEl.textContent = data.title || 'Untitled';
            } else {
                console.warn('expTitle element not found in DOM');
            }

            const headLine = document.getElementById("elabHeadLine");
            if (headLine) {
                headLine.innerHTML= `
            <li><strong>ElabFTW URL:</strong> ${data.sharelink}
                    <a href="${data.sharelink}" target="_blank">
                        View in ElabFTW
                    </a>
                </li>
                <div class="form-check-inline">
                        <input class="form-check-input" type="checkbox" value="" name="multiElabCheckbox" id="multiCheck${data.id}" data-id="${data.id}" data-type1="${type}" data-elabtitle="${data.title}" onclick="linkCheck(this)">
                        <label class="form-check-label" for="multiCheck${data.id}">

                        </label>
                        </div>`;
            }

            // Metadata
            const metadataList = document.getElementById('metadataList');
            if (metadataList) {
                metadataList.innerHTML = `
                <li><strong>ID:</strong> ${data.elabid}</li>
                <li><strong>Created:</strong> ${data.created_at}</li>
                <li><strong>Modified:</strong> ${data.modified_at}</li>
                <li><strong>Author:</strong> ${data.fullname}</li>

            `;
            }

            // Uploads
            const uploadGallery = document.getElementById('uploadGallery');
            if (!uploadGallery) {
                console.warn('uploadGallery element not found in DOM');
                return;
            }

            const uploads = data.uploads;
            if (!uploads || uploads.length === 0) {
                uploadGallery.innerHTML = "<p class='text-muted'>No attachments</p>";
            } else {
                // Create placeholders immediately for fast rendering
                uploadGallery.innerHTML = "";
                const uploadPromises = [];
                const uploadElements = [];

            // First pass: Create placeholders and prepare metadata
            for (const [index, ele] of Object.entries(uploads)) {
                const realname = ele.real_name.replace(/[^a-zA-Z0-9_,\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
                const fileName = generateUploadFileName(realname, ele.id);
                const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(ele.real_name);
                const uploadId = `upload-${ele.id}`;

                // Create placeholder element
                const placeholderHTML = isImage
                    ? `<div class="col-6 col-md-4 mb-2" id="${uploadId}">
                         <div class="card h-100">
                           <div class="card-body text-center p-2">
                             <div class="spinner-border spinner-border-sm text-primary mb-2" role="status">
                               <span class="visually-hidden">Loading...</span>
                             </div>
                             <small class="d-block text-truncate">${fileName}</small>
                             <small class="text-muted">${(ele.filesize / 1024).toFixed(1)} KB</small>
                           </div>
                         </div>
                       </div>`
                    : `<div class="col-12 mb-2" id="${uploadId}">
                         <div class="card">
                           <div class="card-body p-2">
                             <small>📄 File: ${fileName}</small>
                           </div>
                         </div>
                       </div>`;

                uploadGallery.insertAdjacentHTML('beforeend', placeholderHTML);

                // Store element reference and metadata
                uploadElements.push({
                    id: uploadId,
                    ele: ele,
                    index: index,
                    realname: realname,
                    isImage: isImage,
                    longname: ele.long_name,
                    longname2: encodeURIComponent(ele.long_name)
                });
            }

            // Second pass: Load files progressively with limited concurrency
            const loadFile = async (uploadMeta) => {
                try {
                    const blobs = await fetchElabFiles(
                        elabtoken,
                        `experiments/${elabid}/uploads/${uploadMeta.ele.id}?format=binary`,
                        instance
                    );

                    window.blobb.push(blobs);
                    let objectURL = URL.createObjectURL(blobs);
                    objectURL = objectURL.replace(/&storage=./g, "");

                    // Update protocol text replacements
                    protocol = protocol.replace(/app\/download\.php(.*)f=/g, "");
                    protocol = protocol.replaceAll(uploadMeta.longname, objectURL);
                    protocol = protocol.replaceAll(uploadMeta.longname2, objectURL);
                    protocol = protocol.replaceAll("&amp;storage=1", "");
                    protocol = protocol.replaceAll("&amp;storage=2", "");

                    // Update the experiment content with new image URLs
                    const expContentEl = document.getElementById('expContent');
                    if (expContentEl) {
                        expContentEl.innerHTML = protocol;
                    }

                    // Update placeholder with actual content
                    const placeholder = document.getElementById(uploadMeta.id);
                    if (placeholder) {
                        if (uploadMeta.isImage) {
                            placeholder.innerHTML = `
                                <div class="card h-100">
                                  <img src="${objectURL}" class="card-img-top" alt="${uploadMeta.realname}"
                                       loading="lazy" style="max-height: 200px; object-fit: cover;">
                                  <div class="card-body p-1">
                                    <small class="text-truncate d-block">${uploadMeta.realname}</small>
                                  </div>
                                </div>`;
                        } else {
                            placeholder.innerHTML = `
                                <div class="card">
                                  <div class="card-body p-2">
                                    <small>📄 <a href="${objectURL}" download="${uploadMeta.realname}">${uploadMeta.realname}</a></small>
                                  </div>
                                </div>`;
                        }
                    }

                    return { success: true, uploadMeta };
                } catch (error) {
                    console.error(`Failed to load upload ${uploadMeta.realname}:`, error);
                    const placeholder = document.getElementById(uploadMeta.id);
                    if (placeholder) {
                        placeholder.innerHTML = `
                            <div class="card border-danger">
                              <div class="card-body p-2 text-danger">
                                <small>❌ Failed to load: ${uploadMeta.realname}</small>
                              </div>
                            </div>`;
                    }
                    return { success: false, uploadMeta, error };
                }
            };

            // Load files with concurrency limit (5 at a time) - NON-BLOCKING
            // This runs in background so UI can be shown immediately with placeholders
            const concurrencyLimit = 5;
            (async () => {
                for (let i = 0; i < uploadElements.length; i += concurrencyLimit) {
                    const batch = uploadElements.slice(i, i + concurrencyLimit);
                    await Promise.all(batch.map(loadFile));
                }
                console.log('[eLabFTW Preview] All uploads loaded');
            })();
            } // End of else block for upload processing

            // Related items
            const relatedItems = document.getElementById('relatedItems');
            if (relatedItems && data.items_links) {
                relatedItems.innerHTML= "";
                data.items_links.forEach(item => {
                relatedItems.innerHTML += `
                    <li>
                    <div class="form-check-inline">
                        <input class="form-check-input" type="checkbox" value="" name="multiElabCheckbox" id="multiCheck${item.entityid}" data-id="${item.entityid}" data-type1="Resource" onclick="linkCheck(this)" data-elabtitle="${item.title}">
                        <label class="form-check-label" for="multiCheck${item.entityid}">

                        </label>
                        </div>
                    <span class="badge bg-info ">Resources</span><span class="badge bg-secondary ">${item.category_title}</span> <a href="${instance.replace("api/v2/", "")}/${item.page}?mode=view&id=${item.entityid}" target="_blank">
                            ${item.title}
                        </a> &nbsp;&nbsp;


                    </li>
                `;
                });
            }

            const relatedExps = document.getElementById('relatedExps');
            if (relatedExps && data.experiments_links) {
                relatedExps.innerHTML= "";
                data.experiments_links.forEach(item => {
                relatedExps.innerHTML += `
                    <li>
                        <div class="form-check-inline">
                        <input class="form-check-input" type="checkbox" value="" name="multiElabCheckbox" id="multiCheck${item.entityid}" data-id="${item.entityid}" data-type1="Experiment" onclick="linkCheck(this)"  data-elabtitle="${item.title}">
                        <label class="form-check-label" for="multiCheck${item.entityid}">

                        </label>
                        </div>
                        <span class="badge bg-info ">Experiment</span> <a href="${instance.replace("api/v2/", "")}/${item.page}?mode=view&id=${item.entityid}" target="_blank">
                            ${item.title}
                        </a>  &nbsp;&nbsp;


                    </li>
                `;
            });
            }

            const expContentEl = document.getElementById('expContent');
            if (expContentEl) {
                expContentEl.innerHTML = protocol;
            }

        } catch (error) {
            console.error('Error loading experiment:', error);
            const expContentEl = document.getElementById('expContent');
            if (expContentEl) {
                expContentEl.innerHTML = '<p>Error loading content</p>';
            }
        }
    }


    const loading = new bootstrap.Modal(document.getElementById('loadingModal'), {
      keyboard: true, show: false
    });

    const fileExplorer = new bootstrap.Modal(document.getElementById('folderModal'), {
      keyboard: true, show: false
    });

    addEventListener("load", (event) => {

      //showError("sorry there is currently a connection problem between this tool and DataHUB, please try again later.")
      const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
      softRoute();
      const instance = window.localStorage.getItem("instance");
      document.getElementById("elabURLInput1").value = instance;
      document.getElementById("elabURLInput1").innerHTML = "instance: " + instance;

      document.getElementById("elabSearch").addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          document.getElementById("elabSearchBtn").click()
        }
      });
      document.getElementById("arcSearch").addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          document.getElementById("arcSearchBtn").click()
        }
      });

      checkElabFTWConnection();
      checkGitLabConnection();


    }
    );
    function showPassword(ele) {

      const id = ele.dataset.showId;

      const passwordInput = document.getElementById(id);
      const eyeIcon = this;

      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.textContent = '👁️'; // Show open eye
      } else {
        passwordInput.type = 'password';
        eyeIcon.textContent = '👁️'; // Still show open eye (you can change to a slashed eye using another Unicode)
      }
    }



    function normalizePathSeparators(str) {
      const normalizedPath = path.normalize(str)
      return normalizedPath.replace(/\\/g, '/');
    }

    function memfsPathDirname(filePath) {
      if (typeof filePath !== 'string') filePath = String(filePath);
      if (filePath === '') return '.';

      // Remove trailing slashes (except if path is all slashes)
      let len = filePath.length;
      while (len > 0 && filePath[len - 1] === '/') len--;
      if (len === 0) return '/'; // Handle root path

      const normalized = filePath.slice(0, len);
      const lastSlashIndex = normalized.lastIndexOf('/');

      if (lastSlashIndex === -1) {
        // No directory separators found
        return (normalized === '.' || normalized === '..') ? normalized : '.';
      }

      // Slice to last slash and remove trailing slashes from the result
      let result = normalized.slice(0, lastSlashIndex);
      len = result.length;
      while (len > 0 && result[len - 1] === '/') len--;

      return len === 0 ? '/' : result.slice(0, len);
    }
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

    // Expose path utilities globally for use by other modules
    window.normalizePathSeparators = normalizePathSeparators;
    window.memfsPathDirname = memfsPathDirname;
    window.memfsPathJoin = memfsPathJoin;

    async function arcWrite(arcPath, arc) {
      let contracts = arc.GetWriteContracts()
      for (const contract of contracts) {
        // from Contracts.js docs
        await fulfillWriteContract(arcPath, contract)
      };
    }




    async function fulfillWriteContract(basePath, contract) {
      function ensureDirectory(filePath) {
        let dirPath = memfsPathDirname(filePath)
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }

      const p = memfsPathJoin(basePath, contract.Path)
      if (contract.Operation = "CREATE") {
        if (contract.DTO == undefined) {
          ensureDirectory(p)
          fs.writeFileSync(p, "")
        } else if (contract.DTOType == "ISA_Assay" || contract.DTOType == "ISA_Assay" || contract.DTOType == "ISA_Investigation") {
          ensureDirectory(p)
          await Xlsx.toFile(p, contract.DTO)
        } else if (contract.DTOType == "PlainText") {
          ensureDirectory(p)
          fs.writeFileSync(p, contract.DTO)
        } else {
          console.log("Warning: The given contract is not a correct ARC write contract: ", contract)
        }
      }
    }

    // Read

    async function fulfillReadContract(basePath, contract) {
      async function fulfill() {
        const normalizedPath = normalizePathSeparators(memfsPathJoin(basePath, contract.Path))
        switch (contract.DTOType) {
          case "ISA_Assay":
          case "ISA_Study":
          case "ISA_Investigation":
            let fswb = await Xlsx.fromXlsxFile(normalizedPath)
            return fswb
            break;
          case "PlainText":
            let content = fs.load(normalizedPath)
            return content
            break;
          default:
            console.log(`Handling of ${contract.DTOType} in a READ contract is not yet implemented`)
        }
      }
      if (contract.Operation == "READ") {
        return await fulfill()
      } else {
        console.error(`Error (fulfillReadContract): "${contract}" is not a READ contract`)
      }
    }



    function getAllFilePaths(basePath) {
      const filesList = []
      function loop(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = getAllFilePaths(dir, file);

          if (fs.statSync(filePath).isDirectory()) {
            // If it's a directory, recursively call the function on that directory
            loop(filePath);
          } else {
            // If it's a file, calculate the relative path and add it to the list
            const relativePath = path.relative(basePath, filePath);
            const normalizePath = normalizePathSeparators(relativePath)
            filesList.push(normalizePath);
          }
        }
      }
      loop(basePath)
      return filesList;
    }




    // put it all together
    async function read(basePath) {
      let allFilePaths = getAllFilePaths(basePath)
      // Initiates an ARC from FileSystem but no ISA info.
      let arc = arctrl.ARC.fromFilePaths(allFilePaths)
      // Read contracts will tell us what we need to read from disc.
      let readContracts = arc.GetReadContracts()
      console.log(readContracts)
      let fcontracts = await Promise.all(
        readContracts.map(async (contract) => {
          let content = await fulfillReadContract(basePath, contract)
          contract.DTO = content
          return (contract)
        })
      )
      arc.SetISAFromContracts(fcontracts);
      console.log(fcontracts);
      return arc
    }

    // execution

    // execution
    window.ARC2JSON = async function (ARCName, JSONname) {
      await read(ARCName).then(
        arc => {
          try {
            fs.writeFileSync(JSONname, arctrl.JsonController.Investigation.toISAJsonString(arc.ISA, void 0, true))
            // file written successfully
          } catch (err) {
            console.error(err);
          }
        }
      )
    }

    window.addInvestigationPerformers = async function (arcDir, firstname, familyName) {

      const inv1 = await Xlsx.fromXlsxFile(arcDir + "/isa.investigation.xlsx");
      let isa_inv = await arctrl.XlsxController.Investigation.fromFsWorkbook(inv1);

      const roles = new arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");
      const comment = "generated by elab2arc"
      let comments_p = arctrl.Comment$.create("generation log", comment);
      const newContact = arctrl.Person.create(void 0, firstname, familyName, void 0, void 0, void 0, void 0, void 0, void 0, void 0);


      // for (const ee of isa_inv.Contacts){
      //     if (ee.toString() != ccc.toString()){
      //         console.log("no same person");
      //     }else{ 
      //         console.log("same person");
      //         break;
      //     };
      // }
      isa_inv.Contacts = [newContact];
      let spreadsheet = arctrl.XlsxController.Investigation.toFsWorkbook(isa_inv);
      const outPath = arcDir + "/isa.investigation.xlsx";

      console.log(spreadsheet);

      await Xlsx.toFile(outPath, spreadsheet);
    }




    window.fullAssay2 = async function (assayName, tableName = "newtable", firstName = void 0, familyName = void 0, email = void 0, affiliation = void 0, comment = "generated by elab2arc", dir, datahubURL) {
      try {
        // -------- 1. Create and manipulate object in datamodel ----------
        const growth = arctrl.ArcTable.init(tableName);
        // Add input column with one value to table
        growth.AddColumn(arctrl.CompositeHeader.input(arctrl.IOType.source()), [arctrl.CompositeCell.createFreeText("Input1")]);

        // Add characteristic column with one value
        const oa_species = new arctrl.OntologyAnnotation("species", "GO", "GO:0123456");
        const oa_chlamy = new arctrl.OntologyAnnotation("Chlamy", "NCBI", "NCBI:0123456");
        //growth.AddColumn(arctrl.CompositeHeader.characteristic(oa_species), [arctrl.CompositeCell.createTerm(oa_chlamy)]);


        // Create assay
        //const mtype = new arctrl.OntologyAnnotation("measurement type", "1", "2");
        //const mtech = new arctrl.OntologyAnnotation("technology type", "1", "2");
        //const mplat = new arctrl.OntologyAnnotation("technology platform", "1", "2");
        const roles = new arctrl.OntologyAnnotation("researcher", "SCORO", "http://purl.org/spar/scoro/researcher");

        let comments_p = arctrl.Comment$.create("generation log", comment);
        const person = arctrl.Person.create(void 0, firstName, familyName, void 0, email, void 0, void 0, void 0, affiliation, [roles], [comments_p]);
        let comments_m = arctrl.Comment$.create("name", "value");
        let comments_datahub_url = arctrl.Comment$.create("datahub_url", "arctest");

        // Create annotation table
        if (fs.existsSync(dir + "/assays/" + assayName + "/isa.assay.xlsx")) {
          try {
            console.log("isa.assay.xlsx file exist");
            assay = await Xlsx.fromXlsxFile(dir + "/assays/" + assayName + "/isa.assay.xlsx");
            isa_assay = await arctrl.XlsxController.Assay.fromFsWorkbook(assay);
            isa_assay.Performers = [person];
            isa_assay.Comment = [comments_datahub_url];
            let spreadsheet = arctrl.XlsxController.Assay.toFsWorkbook(isa_assay);
            const outPath = dir + "/assays/" + assayName + "/isa.assay.xlsx";

            console.log(spreadsheet);

            await Xlsx.toFile(outPath, spreadsheet);
          } catch (error) {
            console.log(error);

          }
        } else {
          //growth.AddColumn(arctrl.CompositeHeader.characteristic(oa_species), [arctrl.CompositeCell.createTerm(oa_chlamy )]);

          const myAssay = arctrl.ArcAssay.create(assayName, void 0, void 0, void 0, [growth], void 0, [person], [comments_datahub_url]);
          // -------- 2. Transform object to generic spreadsheet ----------
          let spreadsheet = arctrl.XlsxController.Assay.toFsWorkbook(myAssay);
          // -------- 3. Write spreadsheet to xlsx file (or bytes) ----------
          const outPath = dir + "/assays/" + assayName + "/isa.assay.xlsx";

          console.log(spreadsheet);

          await Xlsx.toFile(outPath, spreadsheet);
        }
      } catch (err) {
        console.error(err);
      }
    }


    function showError(text) {
      showErrorToast(text);
      updateInfo(text, "0")

    }

    function extractCookie(name) {
      const cookie = document.cookie;
      const values = cookie.split("; ");
      let value = "";
      values.forEach(e => { if (e.split("=")[0] === name) { value = e.split("=")[1] } });
      return value;
    }

    /**
     * Standardized token getter functions
     * Centralizes token retrieval from cookies (the app's standard storage method)
     */

    /**
     * Get eLabFTW API token from cookies
     * @returns {string} eLabFTW token
     */
    function getElabToken() {
      return extractCookie('elabtoken');
    }

    /**
     * Get DataHub (GitLab) token from cookies
     * @returns {string} DataHub token
     */
    function getDatahubToken() {
      return extractCookie('datahubtoken');
    }

    function softRoute() {
      const urlRoute = window.location.href.split("#");
      const url1 = urlRoute[0].split("?")[1];

      try {
        if (url1) {
          // Note: url1 contains tokens in URL parameters, sanitize before logging
          console.log("[Submission] Processing URL parameters (credentials masked)");
          const submitData = url1.split("&");
          let submitJSON = {};
          submitData.forEach(e => { submitJSON[e.split("=")[0]] = e.split("=")[1] }
          );
          getParameters(submitJSON.elabid, submitJSON.elabResourceid, submitJSON.elabtoken, submitJSON.datahubtoken, submitJSON.elabURL);
          //updateAll(submitJSON.elabid, submitJSON.elabtoken, submitJSON.datahubtoken, submitJSON.elabURL )

        } else {
          console.log("[Submission] No URL parameters found. If url is undefined, switch tab to token tab");
          showTab("tokenTab");
        }
        try {
          const cookie = document.cookie;
          // const cookieElabid= decodeURIComponent(decodeURIComponent(extractCookie("elabid")));
          // if (cookieElabid){
          //   document.getElementById("elabExperimentid").value = cookieElabid;
          //   elabListSync()

          // }

          document.getElementById("elabToken").value = extractCookie("elabtoken");
          document.getElementById("datahubToken").value = extractCookie("datahubtoken");
        } catch (error) {
          console.error(error);

        }
      } catch (error) {
        showError("submission URL is wrong, error is " + error + ". Please check your URL or remove everything after /elab2arc/")
      }


      const para = urlRoute.slice(-1)[0];
      switch (para) {
        case "home":
          showTab("homeTab");

        case "elabftw":
          showTab("elabftwTab");

          break;
        case "token":
          showTab("tokenTab");

          break;
        case "arc":
          showTab("arcTab");

          break;
        case "ftw":
          showTab("homeTab");

          break;
        case "https://xrzhou.com/elab2arc/":
          showTab("homeTab");

          break;
        case "":
          showTab("homeTab");
          break;

        default:

      }
    }

    function multiElabSelect(sw) {
      if (sw.checked) {
        document.getElementById("multiElabBtn").classList.remove("d-none");


        document.querySelectorAll('input[name="multiElabCheckbox"]').forEach((e) => {
          e.classList.remove("d-none");
        });
      } else {
        document.getElementById("multiElabBtn").classList.add("d-none");

        document.querySelectorAll('input[name="multiElabCheckbox"]').forEach((e) => {
          e.classList.add("d-none");
        });
      }
    }


    function showTab(name) {
      document.querySelectorAll('div[name="tab"]').forEach((e) => {
        if (e.id == name) { e.classList.remove("d-none"); }
        else { e.classList.add("d-none") }
      });
      document.querySelectorAll('button[name="navBtn"]').forEach((e) => {
        if (e.id == name.replace("Tab", "Btn")) { e.setAttribute("style", "background-color:white; color:black; border-radius: 5px 5px 0px 0px;"); }
        else { e.setAttribute("style", "") }
      })
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.getElementById("kblink").href = kblinkJSON[name.replace("Tab", "")]
    }

    function setTargetPath(path) {
      const targetPathInput = document.getElementById("targetPath");
      if (targetPathInput) {
        targetPathInput.value = path;

        // Visual feedback for path validity
        targetPathInput.classList.remove("is-valid", "is-invalid");
        if (path && path.includes('/')) {
          targetPathInput.classList.add("is-valid");
        }

        // Update display info
        console.log(`Target path set to: ${path}`);
      }
    }

    async function cloneARC(http_url_to_repo, name) {
      loading.show()
      try {

        const token = document.getElementById("datahubToken").value;
        await datahubClone(http_url_to_repo, name, token)
        refreshTree("./" + name);
      } catch (error) {
        //throw showError(error),
        console.error(error);
      }
      loading.hide();
    }

    async function cloneARCWithLoading(http_url_to_repo, name) {
      // Find the clicked button (there might be multiple ARC clone buttons)
      const projectId = extractProjectIdFromUrl(http_url_to_repo);
      const btn = document.getElementById(`clone-arc-btn-${projectId}`) ||
                  document.querySelector('.clone-arc-btn');

      if (!btn) {
        console.error('Clone button not found');
        return;
      }

      const btnContent = btn.querySelector('.btn-content');
      const btnLoading = btn.querySelector('.btn-loading');

      try {
        // Show button loading state
        btnContent.classList.add('d-none');
        btnLoading.classList.remove('d-none');
        btn.disabled = true;

        // Perform the actual clone operation
        await cloneARC(http_url_to_repo, name);

        // Update UI info
        document.getElementById('gitlabInfo').innerHTML = http_url_to_repo;
        document.getElementById('arcInfo').innerHTML = name + '/';

        // Open file explorer after successful clone
        fileExplorer.show();

      } catch (error) {
        console.error('ARC clone failed:', error);

        // Show error state temporarily
        btnLoading.innerHTML = `
          <span style="color: #dc3545;">❌ Clone Failed</span>
        `;

        setTimeout(() => {
          // Reset to original state after 3 seconds
          btnLoading.innerHTML = `
            <div class="btn-spinner"></div>
            Cloning ARC...
          `;
        }, 3000);

      } finally {
        // Reset button state
        setTimeout(() => {
          btnContent.classList.remove('d-none');
          btnLoading.classList.add('d-none');
          btn.disabled = false;
        }, 1000); // Small delay to show completion
      }
    }

    function extractProjectIdFromUrl(url) {
      // Extract project ID from GitLab URL for button identification
      // Example: https://gitlab.com/user/project -> project
      try {
        const parts = url.split('/');
        return parts[parts.length - 1] || 'unknown';
      } catch (error) {
        return 'unknown';
      }
    }

    /**
     * Format bytes to human-readable string (KB, MB, GB)
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string (e.g., "2.4 MB")
     */
    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Download the entire ARC repository as a ZIP file
     * @param {string} gitRoot - Root directory path of the git repository
     * @param {string} repoName - Repository name for the ZIP filename
     */
    async function downloadARCAsZip(gitRoot, repoName) {
      try {
        updateInfo("Preparing ZIP archive...", 5);
        showToast("Preparing ZIP archive...", "info", 3000);

        const zip = new JSZip();
        let fileCount = 0;
        let totalSize = 0;
        const filesToProcess = [];

        // Recursively collect all files (excluding .git directory)
        async function collectFiles(dir, maxDepth = 20, currentDepth = 0) {
          if (currentDepth >= maxDepth) return;

          try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = `${dir}/${entry.name}`;

              // Skip .git directory and temporary files
              if (entry.name === '.git' || entry.name === '.DS_Store') {
                continue;
              }

              if (entry.isDirectory()) {
                await collectFiles(fullPath, maxDepth, currentDepth + 1);
              } else if (entry.isFile()) {
                // Get file stats for size tracking
                try {
                  const stats = await fs.promises.stat(fullPath);
                  totalSize += stats.size;
                  filesToProcess.push({ path: fullPath, size: stats.size });
                } catch (e) {
                  console.warn(`[downloadARCAsZip] Error stating file ${fullPath}:`, e.message);
                }
              }
            }
          } catch (e) {
            console.warn(`[downloadARCAsZip] Error reading ${dir}:`, e.message);
          }
        }

        await collectFiles(gitRoot);
        fileCount = filesToProcess.length;
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

        console.log(`[downloadARCAsZip] Found ${fileCount} files (${totalSizeMB} MB)`);

        // Add files to ZIP with progress updates
        let processedFiles = 0;
        const progressUpdateInterval = 50; // Update progress every 50 files

        for (const file of filesToProcess) {
          try {
            // Read file content from memfs
            const content = fs.readFileSync(file.path);

            // Calculate relative path from gitRoot
            let relativePath = file.path.substring(gitRoot.length);
            if (relativePath.startsWith('/')) {
              relativePath = relativePath.substring(1);
            }

            // Add to ZIP
            zip.file(relativePath, content);

            processedFiles++;

            // Update progress periodically
            if (processedFiles % progressUpdateInterval === 0 || processedFiles === fileCount) {
              const progress = Math.min(90, 5 + (processedFiles / fileCount) * 80);
              const processedSizeMB = (filesToProcess.slice(0, processedFiles)
                .reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2);
              updateInfo(`Adding files... (${processedFiles}/${fileCount}, ${processedSizeMB} MB / ${totalSizeMB} MB)`, progress);
            }

            // Small delay to keep UI responsive
            if (processedFiles % 100 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          } catch (e) {
            console.warn(`[downloadARCAsZip] Error processing ${file.path}:`, e.message);
          }
        }

        // Generate ZIP blob
        updateInfo("Generating ZIP file...", 95);
        console.log("[downloadARCAsZip] Generating ZIP blob...");

        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        }, (metadata) => {
          if (metadata.percent) {
            const progress = 95 + (metadata.percent / 100) * 4;
            updateProgressBar(progress);
          }
        });

        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const zipFilename = `${repoName.replace(/[\/\\]/g, '-')}-${timestamp}.zip`;

        // Trigger download
        updateInfo("Starting download...", 99);
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateInfo("Download started!", 100);
        showToast(`ZIP archive downloaded: ${zipFilename} (${formatBytes(totalSize)})`, 'success', 5000);
        updateProgressBar(100);

        console.log(`[downloadARCAsZip] Download complete: ${zipFilename}`);

      } catch (error) {
        console.error("[downloadARCAsZip] Error creating ZIP:", error);
        showToast(`Failed to create ZIP: ${error.message}`, 'error', 8000);
        updateInfo("ZIP creation failed", 0);
      }
    }

    /**
     * Extract repository name from GitLab URL
     * @param {string} url - Full repository URL
     * @returns {string} Repository name (e.g., "username/reponame")
     */
    function getRepoName(url) {
      try {
        // Remove protocol and git suffix
        const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\.git$/, '');
        // Extract path components (e.g., git.nfdi4plants.org/username/reponame)
        const parts = cleanUrl.split('/');
        // Return the last two parts (username/reponame)
        if (parts.length >= 2) {
          return parts.slice(-2).join('/');
        }
        return cleanUrl;
      } catch (e) {
        return url;
      }
    }

    function updateLabel(phrase) {
      document.getElementById("pbarLabel").innerHTML = phrase;
    }
    function updateProgressBar(progress) {
      const pbar = document.getElementById("pbarModal");
      // Ensure progress is capped at 100
      const cappedProgress = Math.min(100, Math.max(0, progress));
      pbar.setAttribute("style", 'width:' + cappedProgress + '%;')
      pbar.setAttribute("aria-valuenow", cappedProgress)

      // Add visual feedback when complete
      if (cappedProgress >= 100) {
        pbar.classList.add('bg-success');
      } else {
        pbar.classList.remove('bg-success');
      }
    }
    function updateIndeterminateProgressBar(progress) {

      const pbar = document.getElementById("pbarModal");
      pbar.setAttribute("style", 'width:' + progress + '%;')
      pbar.setAttribute("aria-valuenow", progress)
    }

    // ========== ISA File Generation Functions (Experimental) ==========

    /**
     * Analyze ARC directory structure to find studies and assays
     */
    // =============================================================================
    // ISA GENERATION - Now in separate module (js/modules/isa-generation.js)
    // Functions are accessed via Elab2ArcISA.* namespace
    // =============================================================================
    // Moved functions:
    // - analyzeArcStructure() → Elab2ArcISA.analyzeArcStructure()
    // - extractDatasetInfo() → Elab2ArcISA.extractDatasetInfo()
    // - extractProtocolInfo() → Elab2ArcISA.extractProtocolInfo()
    // - mergeContactsUnique() → Elab2ArcISA.mergeContactsUnique()
    // - generateIsaAssay() → Elab2ArcISA.generateIsaAssay()
    // - createSampleTable() → Elab2ArcISA.createSampleTable()
    // - createDefaultProcessTable() → Elab2ArcISA.createDefaultProcessTable()
    // - createProcessTable() → Elab2ArcISA.createProcessTable()
    // - generateIsaAssayElab2arcWithDatamap() → Elab2ArcISA.generateIsaAssayElab2arcWithDatamap()
    // - generateIsaStudy() → Elab2ArcISA.generateIsaStudy()
    // - generateIsaInvestigation() → Elab2ArcISA.generateIsaInvestigation()

    // =============================================================================
    // MANUAL GIT COMMIT & PUSH FUNCTION
    // Exposed to window for console access
    // =============================================================================
    window.manualGitCommitPush = async function(gitRoot, commitMessage = 'Manual commit via console') {
      try {
        // Validate gitRoot
        if (!gitRoot) {
          throw new Error('gitRoot parameter is required');
        }

        // Ensure gitRoot ends with /
        if (!gitRoot.endsWith('/')) {
          gitRoot = gitRoot + '/';
        }

        console.log(`[Manual Git] Starting manual commit & push for: ${gitRoot}`);
        console.log(`[Manual Git] Commit message: ${commitMessage}`);

        // Stage all changes including deletions
        const stagingResult = await gitAddAll(gitRoot);
        console.log(`[Manual Git] Staging complete:`, stagingResult);

        // Get user info from window.userId or use defaults
        let fullname = 'elab2arc User';
        let email = 'elab2arc@example.com';

        if (window.userId) {
          fullname = window.userId.name || fullname;
          email = window.userId.commit_email || email;
        }

        // Create commit
        const sha = await git.commit({
          fs,
          dir: gitRoot,
          author: {
            name: fullname,
            email: email,
          },
          message: commitMessage
        });

        console.log(`[Manual Git] Commit created: ${sha}`);

        // Get datahub token from localStorage or prompt
        let datahubtoken = window.localStorage.getItem('datahubtoken');
        if (!datahubtoken) {
          console.warn('[Manual Git] No datahub token found. Skipping push. Set window.localStorage.setItem("datahubtoken", "YOUR_TOKEN") to enable push.');
          return {
            success: true,
            committed: true,
            pushed: false,
            sha: sha,
            message: 'Committed locally but not pushed (no token)'
          };
        }

        // Push to remote
        console.log('[Manual Git] Pushing to remote...');
        const pushResult = await git.push({
          fs,
          http,
          dir: gitRoot,
          remote: 'origin',
          force: false,
          ref: 'main',
          corsProxy: getGitProxy(),
          onAuth: () => ({ username: 'oauth2', password: datahubtoken }),
        });

        console.log('[Manual Git] Push successful!', pushResult);

        return {
          success: true,
          committed: true,
          pushed: true,
          sha: sha,
          staging: stagingResult
        };

      } catch (error) {
        console.error('[Manual Git] Error during commit/push:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    };

    // =============================================================================
    // LLM-BASED DATAMAP GENERATION - Now in separate module (js/modules/llm-service.js)
    // Functions are accessed via Elab2ArcLLM.* namespace
    // =============================================================================
    // Moved functions:
    // - getSelectedModel() → Elab2ArcLLM.getSelectedModel()
    // - getModelContextWindow() → Elab2ArcLLM.getModelContextWindow()
    // - estimateTokens() → Elab2ArcLLM.estimateTokens()
    // - chunkProtocolText() → Elab2ArcLLM.chunkProtocolText()
    // - splitByParagraphs() → Elab2ArcLLM.splitByParagraphs()
    // - splitBySentences() → Elab2ArcLLM.splitBySentences()
    // - mergeChunkResults() → Elab2ArcLLM.mergeChunkResults()
    // - callTogetherAI() → Elab2ArcLLM.callTogetherAI()
    // - generateDatamapFromLLM() → Elab2ArcLLM.generateDatamapFromLLM()
    // - parseProtocolToDatamap() → Elab2ArcLLM.parseProtocolToDatamap()

    // =============================================================================
    // PROMPT EDITOR FUNCTIONALITY
    // =============================================================================

    // Default prompt template (matches llm-service.js structure)
    const DEFAULT_PROMPT = {
      systemRole: `You are a scientific data extraction assistant. Analyze this experimental protocol and extract structured information.`,

      jsonSchema: `Extract and return ONLY a JSON object (no markdown, no explanation) with this structure:
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
}`,

      extractionRules: `CRITICAL - PARAMETER EXTRACTION RULES:
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
   - Or omit dataFiles field entirely (backward compatible)`,

      examples: `EXAMPLES:
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

Return ONLY valid JSON, no additional text.`
    };

    // Load custom prompt from localStorage or use default
    function loadPromptFromStorage() {
      const saved = localStorage.getItem('customLLMPrompt');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('[Prompt Editor] Could not parse saved prompt, using default');
          return DEFAULT_PROMPT;
        }
      }
      return DEFAULT_PROMPT;
    }

    // Save custom prompt to localStorage
    function savePromptToStorage(promptSections) {
      localStorage.setItem('customLLMPrompt', JSON.stringify(promptSections));
      console.log('[Prompt Editor] Saved custom prompt to localStorage');

      // Also save to version history
      savePromptVersion(promptSections);
    }

    // Assemble full prompt from sections
    function assembleFullPrompt(sections) {
      return sections.systemRole + '\n\n' +
             sections.jsonSchema + '\n\n' +
             sections.extractionRules + '\n\n' +
             sections.examples;
    }

    // ========== PROMPT VERSION HISTORY ==========

    /**
     * Save a prompt version to history
     * @param {Object} promptSections - Prompt sections object
     * @param {string} description - Optional description
     */
    function savePromptVersion(promptSections, description = '') {
      try {
        const promptId = window.Elab2ArcMetadata?.generateUUID() || Date.now().toString();
        const timestamp = new Date().toISOString();
        const fullPrompt = assembleFullPrompt(promptSections);

        const version = {
          promptId: promptId,
          timestamp: timestamp,
          sections: promptSections,
          fullPrompt: fullPrompt,
          description: description || `Saved on ${new Date(timestamp).toLocaleString()}`
        };

        // Load existing history
        let history = loadPromptHistory();

        // Add new version at the beginning
        history.unshift(version);

        // Keep only last 50 versions
        history = history.slice(0, 50);

        // Save back to localStorage
        localStorage.setItem('promptHistory', JSON.stringify(history));
        console.log('[Prompt History] Saved version:', promptId);

        return promptId;
      } catch (error) {
        console.error('[Prompt History] Error saving version:', error);
        return null;
      }
    }

    /**
     * Load prompt history from localStorage
     * @returns {Array} - Array of prompt versions
     */
    function loadPromptHistory() {
      try {
        const saved = localStorage.getItem('promptHistory');
        if (saved) {
          return JSON.parse(saved);
        }
        return [];
      } catch (error) {
        console.error('[Prompt History] Error loading history:', error);
        return [];
      }
    }

    /**
     * Restore a specific prompt version
     * @param {string} promptId - ID of the prompt to restore
     */
    function restorePromptVersion(promptId) {
      try {
        const history = loadPromptHistory();
        const version = history.find(v => v.promptId === promptId);

        if (version) {
          // Update current prompt
          savePromptToStorage(version.sections);

          // Update UI if modal is open
          document.getElementById('systemRoleInput').value = version.sections.systemRole;
          document.getElementById('jsonSchemaInput').value = version.sections.jsonSchema;
          document.getElementById('extractionRulesInput').value = version.sections.extractionRules;
          document.getElementById('examplesInput').value = version.sections.examples;

          updateFullPromptPreview();

          console.log('[Prompt History] Restored version:', promptId);
          return true;
        } else {
          console.warn('[Prompt History] Version not found:', promptId);
          return false;
        }
      } catch (error) {
        console.error('[Prompt History] Error restoring version:', error);
        return false;
      }
    }

    /**
     * Delete a specific prompt version
     * @param {string} promptId - ID of the prompt to delete
     */
    function deletePromptVersion(promptId) {
      try {
        let history = loadPromptHistory();
        history = history.filter(v => v.promptId !== promptId);
        localStorage.setItem('promptHistory', JSON.stringify(history));
        console.log('[Prompt History] Deleted version:', promptId);
        return true;
      } catch (error) {
        console.error('[Prompt History] Error deleting version:', error);
        return false;
      }
    }

    /**
     * Compare two prompt versions
     * @param {string} promptId1 - First prompt ID
     * @param {string} promptId2 - Second prompt ID (or 'current')
     * @returns {Object} - Diff object with changes
     */
    function comparePrompts(promptId1, promptId2) {
      try {
        const history = loadPromptHistory();

        let version1, version2;

        if (promptId2 === 'current') {
          version1 = history.find(v => v.promptId === promptId1);
          version2 = {
            promptId: 'current',
            sections: loadPromptFromStorage(),
            fullPrompt: assembleFullPrompt(loadPromptFromStorage())
          };
        } else {
          version1 = history.find(v => v.promptId === promptId1);
          version2 = history.find(v => v.promptId === promptId2);
        }

        if (!version1 || !version2) {
          console.warn('[Prompt History] One or both versions not found');
          return null;
        }

        // Create simple diff object
        const diff = {
          version1: version1,
          version2: version2,
          sections: {
            systemRole: {
              changed: version1.sections.systemRole !== version2.sections.systemRole,
              v1: version1.sections.systemRole,
              v2: version2.sections.systemRole
            },
            jsonSchema: {
              changed: version1.sections.jsonSchema !== version2.sections.jsonSchema,
              v1: version1.sections.jsonSchema,
              v2: version2.sections.jsonSchema
            },
            extractionRules: {
              changed: version1.sections.extractionRules !== version2.sections.extractionRules,
              v1: version1.sections.extractionRules,
              v2: version2.sections.extractionRules
            },
            examples: {
              changed: version1.sections.examples !== version2.sections.examples,
              v1: version1.sections.examples,
              v2: version2.sections.examples
            }
          }
        };

        return diff;
      } catch (error) {
        console.error('[Prompt History] Error comparing prompts:', error);
        return null;
      }
    }

    /**
     * Export prompt version as JSON
     * @param {string} promptId - ID of the prompt to export
     */
    function exportPromptVersion(promptId) {
      try {
        const history = loadPromptHistory();
        const version = history.find(v => v.promptId === promptId);

        if (version) {
          const json = JSON.stringify(version, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `prompt-${promptId}.json`;
          a.click();

          URL.revokeObjectURL(url);
          console.log('[Prompt History] Exported version:', promptId);
          return true;
        } else {
          console.warn('[Prompt History] Version not found:', promptId);
          return false;
        }
      } catch (error) {
        console.error('[Prompt History] Error exporting version:', error);
        return false;
      }
    }

    // Make functions available globally for UI
    window.PromptVersionHistory = {
      save: savePromptVersion,
      load: loadPromptHistory,
      restore: restorePromptVersion,
      delete: deletePromptVersion,
      compare: comparePrompts,
      export: exportPromptVersion
    };

    // ========== END PROMPT VERSION HISTORY ==========

    // Initialize prompt editor when modal is shown
    document.getElementById('promptEditorModal')?.addEventListener('show.bs.modal', function() {
      const currentPrompt = loadPromptFromStorage();

      // Populate textareas
      document.getElementById('systemRoleInput').value = currentPrompt.systemRole;
      document.getElementById('jsonSchemaInput').value = currentPrompt.jsonSchema;
      document.getElementById('extractionRulesInput').value = currentPrompt.extractionRules;
      document.getElementById('examplesInput').value = currentPrompt.examples;

      // Update preview
      updateFullPromptPreview();

      // Check if this is the first time opening the prompt editor
      const hasVisited = localStorage.getItem('promptEditorVisited');
      if (!hasVisited) {
        // Show welcome message
        const welcomeAlert = document.getElementById('promptEditorWelcome');
        if (welcomeAlert) {
          welcomeAlert.style.display = 'block';
        }
        // Mark as visited
        localStorage.setItem('promptEditorVisited', 'true');
      }
    });

    // Update full prompt preview when any tab is changed
    function updateFullPromptPreview() {
      const sections = {
        systemRole: document.getElementById('systemRoleInput').value,
        jsonSchema: document.getElementById('jsonSchemaInput').value,
        extractionRules: document.getElementById('extractionRulesInput').value,
        examples: document.getElementById('examplesInput').value
      };

      const fullPrompt = assembleFullPrompt(sections);
      document.getElementById('fullPromptPreview').value = fullPrompt;
    }

    // Update preview when switching to Full Prompt tab
    document.getElementById('fullPrompt-tab')?.addEventListener('shown.bs.tab', updateFullPromptPreview);

    // Also update preview when typing in any textarea (with debounce)
    let previewUpdateTimeout;
    ['systemRoleInput', 'jsonSchemaInput', 'extractionRulesInput', 'examplesInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', function() {
        clearTimeout(previewUpdateTimeout);
        previewUpdateTimeout = setTimeout(updateFullPromptPreview, 500);
      });
    });

    // Save prompt button
    document.getElementById('savePromptBtn')?.addEventListener('click', function() {
      const sections = {
        systemRole: document.getElementById('systemRoleInput').value,
        jsonSchema: document.getElementById('jsonSchemaInput').value,
        extractionRules: document.getElementById('extractionRulesInput').value,
        examples: document.getElementById('examplesInput').value
      };

      savePromptToStorage(sections);

      // Show success feedback
      const btn = this;
      const originalText = btn.textContent;
      btn.textContent = 'Saved!';
      btn.classList.remove('btn-info');
      btn.classList.add('btn-success');

      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('btn-success');
        btn.classList.add('btn-info');
      }, 2000);
    });

    // Save and convert button
    document.getElementById('saveAndConvertBtn')?.addEventListener('click', function() {
      const sections = {
        systemRole: document.getElementById('systemRoleInput').value,
        jsonSchema: document.getElementById('jsonSchemaInput').value,
        extractionRules: document.getElementById('extractionRulesInput').value,
        examples: document.getElementById('examplesInput').value
      };

      savePromptToStorage(sections);

      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('promptEditorModal'));
      modal?.hide();

      // Trigger conversion
      multiConvert();
    });

    // Reset to default button
    document.getElementById('resetPromptBtn')?.addEventListener('click', function() {
      if (confirm('Are you sure you want to reset the prompt to default? This will overwrite your custom prompt.')) {
        document.getElementById('systemRoleInput').value = DEFAULT_PROMPT.systemRole;
        document.getElementById('jsonSchemaInput').value = DEFAULT_PROMPT.jsonSchema;
        document.getElementById('extractionRulesInput').value = DEFAULT_PROMPT.extractionRules;
        document.getElementById('examplesInput').value = DEFAULT_PROMPT.examples;

        savePromptToStorage(DEFAULT_PROMPT);
        updateFullPromptPreview();

        // Show feedback
        const btn = this;
        const originalText = btn.textContent;
        btn.textContent = 'Reset Complete!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    });

    // Export function to get custom prompt for use in llm-service.js
    window.getCustomPromptSections = function() {
      return loadPromptFromStorage();
    };

    // ========== VERSION HISTORY UI HANDLERS ==========

    /**
     * Render version history list
     */
    function renderVersionHistoryList() {
      const versionList = document.getElementById('promptVersionList');
      const emptyState = document.getElementById('emptyVersionState');

      if (!versionList) return;

      const history = loadPromptHistory();

      if (history.length === 0) {
        versionList.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      // Render version cards with compact horizontal layout
      versionList.innerHTML = history.map((version, index) => {
        const timestamp = new Date(version.timestamp);
        const dateStr = timestamp.toLocaleDateString() + ', ' + timestamp.toLocaleTimeString();
        const isFirst = index === 0;
        const versionNumber = history.length - index;

        return `
          <div class="list-group-item" data-version-id="${version.promptId}" data-version-number="${versionNumber}" data-version-date="${dateStr}" data-version-desc="${version.description || ''}">
            <div class="d-flex w-100 justify-content-between align-items-center gap-2">
              <div class="d-flex align-items-center gap-2 flex-grow-1 flex-wrap">
                <strong class="text-nowrap">Version ${versionNumber}</strong>
                ${isFirst ? '<span class="badge bg-success">Latest</span>' : ''}
                <span class="text-muted small text-nowrap">${dateStr}</span>
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-outline-primary btn-sm" onclick="viewPromptVersion('${version.promptId}')" title="View this version">
                  View
                </button>
                <button class="btn btn-outline-info btn-sm" onclick="comparePromptVersion('${version.promptId}')" title="Compare with current">
                  Compare
                </button>
                <button class="btn btn-outline-success btn-sm" onclick="restorePromptVersionUI('${version.promptId}')" title="Restore this version">
                  Restore
                </button>
                <button class="btn btn-outline-secondary btn-sm" onclick="exportPromptVersionUI('${version.promptId}')" title="Export as JSON">
                  Export
                </button>
                ${!isFirst ? `<button class="btn btn-outline-danger btn-sm" onclick="deletePromptVersionUI('${version.promptId}')" title="Delete this version">Delete</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Update version count display
      updateVersionCount();
    }

    /**
     * Update version count display
     */
    function updateVersionCount() {
      const countDisplay = document.getElementById('versionCountDisplay');
      if (!countDisplay) return;

      const allItems = document.querySelectorAll('#promptVersionList .list-group-item');
      const visibleItems = Array.from(allItems).filter(item => item.style.display !== 'none');
      const totalCount = allItems.length;

      if (visibleItems.length === totalCount) {
        countDisplay.textContent = `${totalCount} version${totalCount !== 1 ? 's' : ''}`;
      } else {
        countDisplay.textContent = `Showing ${visibleItems.length} of ${totalCount} versions`;
      }
    }

    /**
     * Filter version list based on search query
     * @param {string} query - Search query
     */
    function filterVersionList(query) {
      const versionItems = document.querySelectorAll('#promptVersionList .list-group-item');
      const searchLower = query.toLowerCase().trim();

      if (!searchLower) {
        // Show all items if search is empty
        versionItems.forEach(item => item.style.display = '');
        updateVersionCount();
        return;
      }

      versionItems.forEach(item => {
        const versionNumber = item.dataset.versionNumber || '';
        const versionDate = item.dataset.versionDate || '';
        const versionDesc = item.dataset.versionDesc || '';

        const searchText = `${versionNumber} ${versionDate} ${versionDesc}`.toLowerCase();

        if (searchText.includes(searchLower)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });

      updateVersionCount();
    }

    /**
     * View a specific prompt version (show in modal/alert)
     */
    window.viewPromptVersion = function(promptId) {
      const history = loadPromptHistory();
      const version = history.find(v => v.promptId === promptId);

      if (version) {
        const content = `
=== SYSTEM ROLE ===
${version.sections.systemRole}

=== JSON SCHEMA ===
${version.sections.jsonSchema}

=== EXTRACTION RULES ===
${version.sections.extractionRules}

=== EXAMPLES ===
${version.sections.examples}
        `.trim();

        // Create a modal-like display using Bootstrap alert
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-light border';
        alertDiv.style.cssText = 'max-height: 500px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; font-size: 12px;';
        alertDiv.textContent = content;

        const container = document.getElementById('diffOutputContainer');
        container.innerHTML = '';
        container.appendChild(alertDiv);

        document.getElementById('diffViewerSection').style.display = 'block';
      }
    };

    /**
     * Compare prompt version with current
     */
    window.comparePromptVersion = function(promptId) {
      try {
        const history = loadPromptHistory();
        const version = history.find(v => v.promptId === promptId);
        const current = loadPromptFromStorage();

        if (!version) {
          showWarningToast('Version not found');
          return;
        }

        // Check if Diff library is available
        if (!window.Diff) {
          showWarningToast('Diff library not loaded. Please refresh the page.');
          return;
        }

        // Create unified diff for full prompt
        const oldText = version.fullPrompt;
        const newText = assembleFullPrompt(current);

        const diff = window.Diff.createPatch(
          'prompt.txt',
          oldText,
          newText,
          `Version ${new Date(version.timestamp).toLocaleString()}`,
          'Current Version'
        );

        // Render with diff2html
        const diffContainer = document.getElementById('diffOutputContainer');

        if (window.Diff2HtmlUI) {
          const diff2htmlUi = new window.Diff2HtmlUI(diffContainer, diff, {
            drawFileList: false,
            matching: 'lines',
            outputFormat: 'side-by-side',
            highlight: true
          });
          diff2htmlUi.draw();
        } else {
          // Fallback: simple text display
          diffContainer.innerHTML = `<pre style="white-space: pre-wrap; font-size: 12px;">${diff}</pre>`;
        }

        document.getElementById('diffViewerSection').style.display = 'block';
      } catch (error) {
        console.error('[Version History] Error comparing versions:', error);
        showErrorToast('Error comparing versions. Check console for details.');
      }
    };

    /**
     * Restore prompt version with confirmation
     */
    window.restorePromptVersionUI = function(promptId) {
      const history = loadPromptHistory();
      const version = history.find(v => v.promptId === promptId);

      if (!version) {
        showWarningToast('Version not found');
        return;
      }

      const timestamp = new Date(version.timestamp).toLocaleString();
      if (confirm(`Restore prompt version from ${timestamp}?\n\nThis will replace your current prompt.`)) {
        const success = restorePromptVersion(promptId);

        if (success) {
          showSuccessToast('Version restored successfully!');
          // Refresh the version list
          renderVersionHistoryList();
        } else {
          showErrorToast('Error restoring version. Please try again.');
        }
      }
    };

    /**
     * Export prompt version as JSON
     */
    window.exportPromptVersionUI = function(promptId) {
      exportPromptVersion(promptId);
    };

    /**
     * Delete prompt version with confirmation
     */
    window.deletePromptVersionUI = function(promptId) {
      const history = loadPromptHistory();
      const version = history.find(v => v.promptId === promptId);

      if (!version) {
        showWarningToast('Version not found');
        return;
      }

      const timestamp = new Date(version.timestamp).toLocaleString();
      if (confirm(`Delete prompt version from ${timestamp}?\n\nThis action cannot be undone.`)) {
        const success = deletePromptVersion(promptId);

        if (success) {
          // Refresh the version list
          renderVersionHistoryList();
          // Hide diff viewer if it was showing the deleted version
          document.getElementById('diffViewerSection').style.display = 'none';
        } else {
          showErrorToast('Error deleting version. Please try again.');
        }
      }
    };

    /**
     * Export all prompt versions as a single JSON file
     */
    function exportAllVersions() {
      try {
        const history = loadPromptHistory();

        if (history.length === 0) {
          showInfoToast('No version history to export.');
          return;
        }

        const exportData = {
          exportedAt: new Date().toISOString(),
          exportedBy: 'elab2arc-prompt-editor',
          versionCount: history.length,
          versions: history
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `prompt-history-all-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        console.log('[Prompt History] Exported all versions:', history.length);
        return true;
      } catch (error) {
        console.error('[Prompt History] Error exporting all versions:', error);
        showErrorToast('Error exporting versions. Check console for details.');
        return false;
      }
    }

    /**
     * Import a single prompt version from JSON file
     * @param {File} file - JSON file to import
     */
    function importSingleVersion(file) {
      try {
        const reader = new FileReader();

        reader.onload = function(e) {
          try {
            const importedData = JSON.parse(e.target.result);

            // Validate structure
            if (!importedData.promptId || !importedData.sections) {
              showErrorToast('Invalid prompt version file. Missing required fields.');
              return;
            }

            // Load existing history
            let history = loadPromptHistory();

            // Check if this version already exists
            const existingIndex = history.findIndex(v => v.promptId === importedData.promptId);
            if (existingIndex >= 0) {
              if (!confirm('A version with this ID already exists. Replace it?')) {
                return;
              }
              // Remove existing version
              history.splice(existingIndex, 1);
            }

            // Add imported version at the beginning
            history.unshift(importedData);

            // Keep only last 50 versions
            history = history.slice(0, 50);

            // Save back to localStorage
            localStorage.setItem('promptHistory', JSON.stringify(history));

            console.log('[Prompt History] Imported single version:', importedData.promptId);
            showSuccessToast('Version imported successfully!');

            // Refresh the version list
            renderVersionHistoryList();
          } catch (parseError) {
            console.error('[Prompt History] Error parsing imported file:', parseError);
            showErrorToast('Error parsing JSON file. Please check the file format.');
          }
        };

        reader.readAsText(file);
      } catch (error) {
        console.error('[Prompt History] Error importing single version:', error);
        showErrorToast('Error importing version. Check console for details.');
      }
    }

    /**
     * Import all prompt versions from JSON file (with auto-backup)
     * @param {File} file - JSON file to import
     */
    function importAllVersions(file) {
      try {
        const reader = new FileReader();

        reader.onload = function(e) {
          try {
            const importedData = JSON.parse(e.target.result);

            // Validate structure
            if (!importedData.versions || !Array.isArray(importedData.versions)) {
              showErrorToast('Invalid prompt history file. Missing or invalid "versions" array.');
              return;
            }

            // Confirm replacement
            const currentHistory = loadPromptHistory();
            if (currentHistory.length > 0) {
              const confirmMsg = `This will replace your current ${currentHistory.length} version(s) with ${importedData.versions.length} imported version(s).\n\nYour current history will be automatically downloaded as a backup.\n\nContinue?`;
              if (!confirm(confirmMsg)) {
                return;
              }

              // Auto-backup current history before replacing
              const backupData = {
                exportedAt: new Date().toISOString(),
                exportedBy: 'elab2arc-prompt-editor-auto-backup',
                versionCount: currentHistory.length,
                versions: currentHistory
              };

              const backupJson = JSON.stringify(backupData, null, 2);
              const backupBlob = new Blob([backupJson], { type: 'application/json' });
              const backupUrl = URL.createObjectURL(backupBlob);

              const backupLink = document.createElement('a');
              backupLink.href = backupUrl;
              backupLink.download = `prompt-history-backup-${Date.now()}.json`;
              backupLink.click();

              URL.revokeObjectURL(backupUrl);
              console.log('[Prompt History] Auto-backup created before import');
            }

            // Replace history with imported versions
            let newHistory = importedData.versions;

            // Keep only last 50 versions
            newHistory = newHistory.slice(0, 50);

            // Save to localStorage
            localStorage.setItem('promptHistory', JSON.stringify(newHistory));

            console.log('[Prompt History] Imported all versions:', newHistory.length);
            showSuccessToast(`Successfully imported ${newHistory.length} version(s)!${currentHistory.length > 0 ? '<br><br>Your previous history has been downloaded as a backup.' : ''}`);

            // Refresh the version list
            renderVersionHistoryList();
          } catch (parseError) {
            console.error('[Prompt History] Error parsing imported file:', parseError);
            showErrorToast('Error parsing JSON file. Please check the file format.');
          }
        };

        reader.readAsText(file);
      } catch (error) {
        console.error('[Prompt History] Error importing all versions:', error);
        showErrorToast('Error importing versions. Check console for details.');
      }
    }

    // Load version history when Version History tab is shown
    document.getElementById('versionHistory-tab')?.addEventListener('shown.bs.tab', function() {
      renderVersionHistoryList();

      // Check if this is the first time viewing version history
      const hasVisitedVersionHistory = localStorage.getItem('versionHistoryVisited');
      if (!hasVisitedVersionHistory) {
        // Show welcome message for version history
        const versionWelcome = document.getElementById('versionHistoryWelcome');
        if (versionWelcome) {
          versionWelcome.style.display = 'block';
        }
        // Mark as visited
        localStorage.setItem('versionHistoryVisited', 'true');
      }
    });

    // Close diff viewer button
    document.getElementById('closeDiffBtn')?.addEventListener('click', function() {
      document.getElementById('diffViewerSection').style.display = 'none';
    });

    // Search input event listener
    document.getElementById('versionSearchInput')?.addEventListener('input', function(e) {
      filterVersionList(e.target.value);
    });

    // Export All button
    document.getElementById('exportAllVersionsBtn')?.addEventListener('click', function() {
      exportAllVersions();
    });

    // Import Single button
    document.getElementById('importSingleVersionBtn')?.addEventListener('click', function() {
      document.getElementById('importSingleFileInput')?.click();
    });

    // Import All button
    document.getElementById('importAllVersionsBtn')?.addEventListener('click', function() {
      document.getElementById('importAllFileInput')?.click();
    });

    // File input handlers
    document.getElementById('importSingleFileInput')?.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        importSingleVersion(file);
        // Reset file input
        e.target.value = '';
      }
    });

    document.getElementById('importAllFileInput')?.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        importAllVersions(file);
        // Reset file input
        e.target.value = '';
      }
    });

    // ========== END VERSION HISTORY UI HANDLERS ==========

    // ========== METADATA VIEWER HANDLERS ==========

    // Store latest metadata for display
    window.latestConversionMetadata = null;

    /**
     * Display conversion metadata in Status Modal
     */
    function displayConversionMetadata(metadata) {
      if (!metadata) return;

      window.latestConversionMetadata = metadata;
      const contentDiv = document.getElementById('metadataContent');
      const actionsDiv = document.getElementById('metadataActions');

      if (!contentDiv) return;

      // Create formatted display
      const html = `
        <div class="card">
          <div class="card-header bg-primary text-white">
            <strong>Conversion ID:</strong> ${metadata.conversionId}
          </div>
          <div class="card-body">
            <h6 class="card-title">Source Information</h6>
            <ul class="list-unstyled">
              <li><strong>Experiment ID:</strong> ${metadata.source?.elabftw?.experimentId || 'N/A'}</li>
              <li><strong>Title:</strong> ${metadata.source?.elabftw?.title || 'N/A'}</li>
              <li><strong>Author:</strong> ${metadata.source?.elabftw?.author || 'N/A'}</li>
              <li><strong>Instance:</strong> ${metadata.source?.elabftw?.instance || 'N/A'}</li>
            </ul>

            <h6 class="card-title mt-3">Timing</h6>
            <ul class="list-unstyled">
              <li><strong>Start:</strong> ${new Date(metadata.timestamp?.start).toLocaleString()}</li>
              <li><strong>Duration:</strong> ${(metadata.timestamp?.duration / 1000).toFixed(2)}s</li>
            </ul>

            ${metadata.llm?.enabled ? `
            <h6 class="card-title mt-3">LLM Configuration</h6>
            <ul class="list-unstyled">
              <li><strong>Model:</strong> ${metadata.llm.model}</li>
              <li><strong>Model Used:</strong> ${metadata.llm.modelUsed}</li>
              <li><strong>Temperature:</strong> ${metadata.llm.apiParams?.temperature}</li>
              <li><strong>Max Tokens:</strong> ${metadata.llm.apiParams?.max_tokens}</li>
            </ul>

            <h6 class="card-title mt-3">Results</h6>
            <ul class="list-unstyled">
              <li><strong>Status:</strong> <span class="badge ${metadata.results?.status === 'success' ? 'bg-success' : 'bg-warning'}">${metadata.results?.status}</span></li>
              <li><strong>Samples Extracted:</strong> ${metadata.results?.samplesExtracted || 0}</li>
              <li><strong>Protocols Extracted:</strong> ${metadata.results?.protocolsExtracted || 0}</li>
            </ul>

            <details class="mt-3">
              <summary style="cursor: pointer;"><strong>Prompt Used (Click to Expand)</strong></summary>
              <pre style="max-height: 300px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 11px;">${metadata.llm.prompt?.full || 'No prompt available'}</pre>
            </details>
            ` : `
            <p class="text-muted mt-3">LLM was not enabled for this conversion.</p>
            `}
          </div>
        </div>
      `;

      contentDiv.innerHTML = html;

      if (actionsDiv) {
        actionsDiv.style.display = 'block';
      }
    }

    // Download metadata button handler
    document.getElementById('downloadMetadataBtn')?.addEventListener('click', function() {
      if (window.latestConversionMetadata && window.Elab2ArcMetadata) {
        const url = window.Elab2ArcMetadata.exportMetadataAsJSON(window.latestConversionMetadata);
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `conversion-metadata-${window.latestConversionMetadata.conversionId}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    });

    // View troubleshooting report button handler
    document.getElementById('viewTroubleshootingReportBtn')?.addEventListener('click', function() {
      if (window.latestConversionMetadata && window.Elab2ArcMetadata) {
        const report = window.Elab2ArcMetadata.generateTroubleshootingReport(window.latestConversionMetadata);

        // Display report in a new window or modal
        const reportWindow = window.open('', 'Troubleshooting Report', 'width=800,height=600');
        if (reportWindow) {
          reportWindow.document.write(`
            <html>
              <head>
                <title>Troubleshooting Report</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                  pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
                  h1, h2, h3 { color: #333; }
                </style>
              </head>
              <body>
                <pre>${report}</pre>
              </body>
            </html>
          `);
          reportWindow.document.close();
        }
      }
    });

    // Make display function available globally
    window.displayConversionMetadata = displayConversionMetadata;

    // ========== END METADATA VIEWER HANDLERS ==========

    addEventListener("hashchange", (event) => {
      if (true) {
        softRoute();
      }
    });
