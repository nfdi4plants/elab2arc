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
const version = "2025-06-03";
var blobb = [];
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

    var turndownService = new TurndownService();
    var mainOrMaster = "main";
    turndownService.keep(['table']);
    function connectionTest(url) {

    }

    function proxySwitch() {
    }
    const kblinkJSON = {
      home: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/",
      arc: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#select-arc--start-conversion",
      token: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#create-an-personal-access-token-in-datahub",
      elabftw: "https://nfdi4plants.github.io/nfdi4plants.knowledgebase/resources/elab2arc/#select-elabftw-experimentresource"

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
            alert("there is an error: " + error + ". Experiment No. " + e + " can not be accessed and has been removed from the list.  ")
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
            alert("there is an error: " + error + ". Resource No. " + e + " can not be accessed and has been removed from the list.  ")
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
      const url = 'https://corsproxy.cplantbox.com/https://git.nfdi4plants.org/api/v4/projects';

      try {
        const response = await fetch(url, {
          method: 'GET',
          // Authentication may be required depending on endpoint
          // headers: { 'PRIVATE-TOKEN': 'YOUR_PRIVATE_TOKEN' }
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
        const apiUrl = `https://corsproxy.cplantbox.com/https://git.nfdi4plants.org/api/v4/user`;

        // Fetch the data from the API with the access token in the headers
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}` // Include the token in the Authorization header [[3]]
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
        alert(error.message || error);
      }
    };

    const createNewArc = async () => {
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
      loading.hide()
    }


    const createGitLabRepo = async (projectName, projectDescription, accessToken) => {
      try {
        // Define the API endpoint for creating a new project [[4]][[6]]
        const apiUrl = `https://corsproxy.cplantbox.com/https://git.nfdi4plants.org/api/v4/projects`;

        // Prepare request configuration
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`, // Authentication header [[3]]
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
            visibility: 'private', // Optional: Set default visibility [[7]]
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
        alert(" ARC creation failed, please check if the name is unique" + error.message || error);
        throw new Error(`Project creation failed: ${error.message}`);
      }
    };

    const fetchUserProjects = async (userId, accessToken, apiParameter = "?pagination=keyset&per_page=200&order_by=id&sort=desc&membership=true") => {
      try {
        // Define the API endpoint for fetching user-related projects
        // const apiUrl = `https://corsproxy.cplantbox.com/https://git.nfdi4plants.org/api/v4/users/${userId}/projects`;
        // Define the API endpoint for fetching user-related projects
        const apiUrl = `https://corsproxy.cplantbox.com/https://git.nfdi4plants.org/api/v4/projects` + apiParameter;

        // Fetch the data from the API with the access token in the headers
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}` // Include the token in the Authorization header [[3]]
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
        alert(error.message || error);
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
        alert(error.message || error);
      }
    };




    function setelabURL(elabURL) {
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
    async function fetchElabJSON(elabToken, query = 'experiments/', elabURL, corsproxy = 'https://corsproxy.cplantbox.com/') {
      // Define the API endpoint
      const elabftwServerUrl = corsproxy + elabURL + query;
      // Define the API key      
      const headers = { 'accept': 'application/json', 'Authorization': elabToken, 'Origin': 'x-requested-with' };
      // Make the fetch request      
      try {
        const response = await fetch(elabftwServerUrl, { headers, method: 'GET' });
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

    async function fetchElabFiles(elabToken, query = 'experiments/', elabURL, corsproxy = 'https://corsproxy.cplantbox.com/') {
      // Define the API endpoint
      const elabftwServerUrl = corsproxy + elabURL + query;
      // Define the API key
      const headers = { 'accept': 'application/json', 'Authorization': elabToken, 'Origin': 'x-requested-with' };
      // Make the fetch request
      try {
        var response = await fetch(`${elabftwServerUrl}`, { headers, method: 'GET' });
        return response.blob();
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
          console.log("Added '.git' at the end, current url is " + url);
        }
        if (!url.startsWith("https://")) {
          url = "https://" + url;
          console.log("Added 'https://' at the start, current url is " + url);
        }
        return url;
      }

    }

    async function datahubClone(datahubURL, dir, datahubtoken) {
      const [begin, end] = datahubURL.split("//");
      url = begin + "//oath2:" + datahubtoken + "@" + end;
      console.log(url);
      try {
        const cloneResponse = await git.clone({
          fs,
          http,
          dir,
          corsProxy: 'https://gitcors.cplantbox.com',
          url: url,
          ref: 'main',
          singleBranch: true,
          depth: 1,
          force: true,
          // onProgress: event => {
          //   updateLabel(event.phase)
          //   if (event.total) {
          //     updateProgressBar(10 + (event.loaded / event.total) * 30)
          //   } else {
          //     updateIndeterminateProgressBar(10 + (event.loaded / 100) * 30)
          //   }
          // }
        });
        mainOrMaster = "main";
      } catch (error) {
        console.error(error);
        console.log("Clone branch main failed, now trying to clone branch master")
        const cloneResponse = await git.clone({
          fs,
          http,
          dir,
          corsProxy: 'https://gitcors.cplantbox.com',
          url: url,
          ref: 'master',
          singleBranch: true,
          depth: 1,
          force: true,
          // onProgress: event => {
          //   updateLabel(event.phase)
          //   if (event.total) {
          //     updateProgressBar(50 + (event.loaded / event.total) * 30)
          //   } else {
          //     updateIndeterminateProgressBar(50 + (event.loaded / 100) * 30)
          //   }
          // }
        });
        mainOrMaster = "master";
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
Author: ${fullname}${teamName ? ' (' + teamName + ')' : ''}
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
          name: fullname,
          email: email,
        },
        message: commitMessage
      });
      console.log("commit finished");

      // Calculate progress: 90-100% of this experiment's allocated range
      const baseProgress = (completedEntries / totalEntries) * 90;
      const pushProgressStart = baseProgress + (1 / totalEntries) * 90 * 0.9;
      const pushProgressEnd = baseProgress + (1 / totalEntries) * 90;

      try {
        updateInfo("Pushing to PLANTDataHUB (main branch)...", pushProgressStart);
        let pushResult = await git.push({
          fs,
          http,
          dir: gitRoot,
          remote: 'origin',
          force: true,
          ref: 'main',
          onAuth: () => ({ username: datahubtoken }),
        });
        console.log(pushResult);
        updateInfo("PLANTDataHUB has been updated.  <br>", pushProgressEnd);
        //
      } catch (error) {
        console.error(error);
        updateInfo(error + " Push to main failed, now try to push to branch master", pushProgressStart);
        let pushResult = await git.push({
          fs,
          http,
          dir: dir,
          force: true,
          remote: 'origin',
          ref: 'master',
          onAuth: () => ({ username: datahubtoken }),
        });
        console.log(pushResult);
        updateInfo("PLANTDataHUB has been updated (master branch).  <br>", pushProgressEnd);
        showError(datahubURL + "ARC has been updated on master branch");
        //showError( "push to git failed. The error is "+ error)
      }
    }




    function initCookies() {
      const maxAge = 60 * 60 * 24 * 31;

      elabtoken = document.getElementById("elabToken").value;
      datahubtoken = document.getElementById("datahubToken").value;
      document.cookie = `elabtoken=${encodeURIComponent(elabtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;
      document.cookie = `datahubtoken=${encodeURIComponent(datahubtoken)}; SameSite=lax; max-age=${maxAge}; Secure`;

      // Save Together.AI API key to localStorage if provided
      const togetherAPIKeyInput = document.getElementById("togetherAPIKey");
      if (togetherAPIKeyInput && togetherAPIKeyInput.value) {
        window.localStorage.setItem('togetherAPIKey', togetherAPIKeyInput.value);
      }
    }

    function redirect() {
      const instance = document.getElementById("elabURLInput1").value;
      window.localStorage.setItem("instance", instance);
      location.href = location.href.split('#')[0] + '#home'
      location.reload();

    }

    // Toggle Together.AI API key field visibility
    function toggleTogetherAPIKeyField() {
      const enableSwitch = document.getElementById('enableDatamapSwitch');
      const apiKeyContainer = document.getElementById('togetherAPIKeyContainer');

      if (enableSwitch && apiKeyContainer) {
        if (enableSwitch.checked) {
          apiKeyContainer.classList.remove('d-none');
        } else {
          apiKeyContainer.classList.add('d-none');
        }
      }
    }

    // Load saved Together.AI API key on page load
    window.addEventListener('DOMContentLoaded', function() {
      const savedAPIKey = window.localStorage.getItem('togetherAPIKey');
      const apiKeyInput = document.getElementById('togetherAPIKey');

      if (savedAPIKey && apiKeyInput) {
        apiKeyInput.value = savedAPIKey;
      }
    });

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
            alert("Authorization failed on eLabFTW id " + expId + ", please check your Elab2ARC account or credentials");
            completedEntries++;
            continue;
          }

          // If users not passed, fetch them
          if (!users) {
            users = await fetchElabJSON(params.elabtoken, "users", params.instance);
            if (users.code >= 400) {
              console.error("Failed to fetch users:", users);
              alert("Failed to fetch user data from eLabFTW.");
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
            alert("Authorization failed on eLabFTW id " + expId + ", please check your Elab2ARC account or credentials");
            completedEntries++;
            continue;
          }

          // If users not passed, fetch them
          if (!users) {
            users = await fetchElabJSON(params.elabtoken, "users", params.instance);
            if (users.code >= 400) {
              console.error("Failed to fetch users:", users);
              alert("Failed to fetch user data from eLabFTW.");
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

          const invIsaPath = await generateIsaInvestigation(gitRoot, arcName, investigationMetadata);

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
          const structure = analyzeArcStructure(gitRoot);

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

              const studyIsaPath = await generateIsaStudy(study.path, study.name, studyMetadata);

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

        // Show success notification after a brief delay to ensure modal is visible
        setTimeout(() => {
          alert(`Success! All ${totalEntries} eLabFTW entries have been converted to ARC format and pushed to PLANTDataHUB.`);
        }, 500);

        console.log(users);
      } catch (error) {
        console.error("Error processing eLab entries:", error);
        alert("An unexpected error occurred while processing eLabFTW entries.");
      }
    }
    


    multiConvert = async () => {
      // ============================================================================
      // VALIDATION CHECKS
      // ============================================================================

      // 1. Check if targetPath (ARC selection) is filled
      const targetPathInput = document.getElementById("targetPath");
      if (!targetPathInput || !targetPathInput.value || targetPathInput.value.trim() === '') {
        alert("⚠️ Please select an ARC first!\n\nGo to the ARC tab and select your target ARC from the list.");
        return;
      }

      // 2. Check GitLab URL validity
      const gitlabURL = document.getElementById("gitlabInfo").innerHTML;
      if (!gitlabURL || gitlabURL.includes("Please select") || gitlabURL.trim() === '') {
        alert("⚠️ No ARC selected!\n\nPlease select your ARC from the ARC tab.");
        return;
      }

      // Validate GitLab URL format
      try {
        const url = new URL(gitlabURL);
        if (!url.protocol.startsWith('http')) {
          throw new Error('Invalid protocol');
        }
        if (!gitlabURL.includes('git')) {
          alert("⚠️ Invalid ARC URL!\n\nThe URL does not appear to be a valid Git repository URL.\n\nURL: " + gitlabURL);
          return;
        }
      } catch (error) {
        alert("⚠️ Invalid ARC URL format!\n\nPlease make sure you selected a valid ARC.\n\nURL: " + gitlabURL);
        return;
      }

      // 3. Check if LLM datamap generation is enabled and validate API key
      const datamapSwitch = document.getElementById('enableDatamapSwitch');
      if (datamapSwitch && datamapSwitch.checked) {
        const togetherAPIKeyInput = document.getElementById('togetherAPIKey');
        const togetherAPIKey = togetherAPIKeyInput ? togetherAPIKeyInput.value.trim() : '';

        if (!togetherAPIKey || togetherAPIKey === '') {
          alert("⚠️ Together.AI API Key is required!\n\nYou have enabled LLM Datamap Generation but haven't provided an API key.\n\nPlease either:\n1. Enter your Together.AI API key, or\n2. Disable the LLM Datamap Generation option");
          return;
        }

        // Validate API key format (Together.AI keys typically start with specific patterns)
        if (!togetherAPIKey.startsWith('tgp_') && togetherAPIKey.length < 20) {
          alert("⚠️ Invalid Together.AI API Key format!\n\nThe API key doesn't appear to be valid.\nTogether.AI keys typically start with 'tgp_' and are longer than 20 characters.");
          return;
        }

        // Test API key by making a simple request
        console.log('🔑 Testing Together.AI API key...');
        try {
          const testResponse = await fetch('https://api.together.xyz/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${togetherAPIKey}`
            }
          });

          if (!testResponse.ok) {
            if (testResponse.status === 401) {
              alert("⚠️ Together.AI API Key is invalid!\n\nThe API key was rejected (401 Unauthorized).\n\nPlease check your API key and try again.");
              return;
            } else if (testResponse.status === 403) {
              alert("⚠️ Together.AI API Key access denied!\n\nThe API key doesn't have permission (403 Forbidden).\n\nPlease check your API key permissions.");
              return;
            } else {
              console.warn('API key test returned status:', testResponse.status);
            }
          } else {
            console.log('✅ Together.AI API key validated successfully');
          }
        } catch (error) {
          console.error('❌ Error testing Together.AI API key:', error);
          const proceed = confirm("⚠️ Could not validate Together.AI API key!\n\nNetwork error: " + error.message + "\n\nDo you want to proceed anyway?\n\nClick OK to continue or Cancel to stop.");
          if (!proceed) {
            return;
          }
        }
      }

      // 4. Validate DataHub token
      const datahubToken = document.getElementById("datahubToken");
      if (!datahubToken || !datahubToken.value || datahubToken.value.trim() === '') {
        alert("⚠️ DataHub token is missing!\n\nPlease enter your DataHub API token in the Token tab.");
        return;
      }

      // 5. Validate eLabFTW token
      const elabToken = document.getElementById("elabToken");
      if (!elabToken || !elabToken.value || elabToken.value.trim() === '') {
        alert("⚠️ eLabFTW token is missing!\n\nPlease enter your eLabFTW API token in the Token tab.");
        return;
      }

      // ============================================================================
      // PROCEED WITH CONVERSION
      // ============================================================================

      // Open status modal using Bootstrap API
      const statusModalEl = document.getElementById('statusModal');
      if (statusModalEl) {
        const statusModal = new bootstrap.Modal(statusModalEl, {
          backdrop: true,
          keyboard: true
        });
        statusModal.show();
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
        alert("⚠️ Please select your ARC.");
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
          alert("please select your ARC.");
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

    async function createAssay(assayId, targetPath, useExistingStructure, subDirs) {
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

        // Clear and recreate dataset/resources folder for fresh content
        const datasetPath = memfsPathJoin(targetPath, subDirs.datasets || subDirs.resources);
        if (fs.existsSync(datasetPath)) {
          console.log(`Clearing existing dataset/resources folder: ${datasetPath}`);
          fs.rmSync(datasetPath, { recursive: true, force: true });
        }
        fs.mkdirSync(datasetPath, { recursive: true });

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

        // Delete and recreate dataset/resources folder for fresh content
        const datasetPath = memfsPathJoin(targetPath, subDirs.datasets || subDirs.resources);
        if (fs.existsSync(datasetPath)) {
          fs.rmSync(datasetPath, { recursive: true, force: true });
        }
        fs.mkdirSync(datasetPath, { recursive: true });
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

      return `eLabFTW_protocol_${elabid}_${sanitizedTitle}.md`;
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
      await createAssay(assayId, baseAssayPath, useExistingStructure, standardSubDirs);

      // Generate ISA file for new structures only (not for existing ones)
      if (!useExistingStructure) {
        await fullAssay2(
          assayId,
          "new metadata table",
          res.lastname,
          res.firstname,
          email,
          res.team_name,
          `Generated by elab2ARC tool on ${Date()} datahub_url is: ${datahubURL}`,
          arcDir,
          datahubURL
        );

        const progressStep1 = baseProgress + (1 / totalEntries) * 90 * 0.3;
        updateInfo(`isa.assay.xlsx has been updated at <b>${assayId}</b>`, progressStep1);

        // Calculate git path for ISA file based on the baseAssayPath
        const relativeAssayPath = baseAssayPath.replace(gitRoot, "");
        const isaPath = `${relativeAssayPath}/isa.assay.xlsx`;

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

      const readmePath = memfsPathJoin(datasetPath, 'README.md');
      await fs.promises.writeFile(readmePath, readmeContent);

      const relativeDatasetPath = `${baseAssayPath.replace(gitRoot, "")}/${dataFolderName}/README.md`;
      await git.add({ fs, dir: gitRoot, filepath: relativeDatasetPath });

      // ========== EXPERIMENTAL: Generate ISA files ==========
      try {
        // Generate ISA assay file with metadata from current experiment
        const isaMetadata = {
          measurementType: 'eLabFTW experiment',
          technologyType: entryType === 'resource' ? 'database resource' : 'experiment',
          platform: 'eLabFTW',
          lastName: res.lastname || '',
          firstName: res.firstname || '',
          email: email,
          affiliation: res.team_name || ''
        };

        const isaFilePath = await generateIsaAssay(baseAssayPath, assayId, isaMetadata);

        if (isaFilePath) {
          // Add ISA file to git
          const relativeIsaPath = isaFilePath.replace(gitRoot, '');
          try {
            await git.add({ fs, dir: gitRoot, filepath: relativeIsaPath });
            console.log(`[ISA Gen] Added to git: ${relativeIsaPath}`);
          } catch (gitError) {
            console.warn(`[ISA Gen] Could not add ISA file to git:`, gitError);
          }
        }
      } catch (isaError) {
        // Log error but continue conversion
        console.error('[ISA Gen] ISA generation failed (experimental feature):', isaError);
      }
      // ========== END EXPERIMENTAL ==========

      // ========== EXPERIMENTAL: Generate Datamap from Protocol ==========
      try {
        // Check if datamap generation is enabled via toggle switch
        const datamapSwitch = document.getElementById('enableDatamapSwitch');
        const isDatamapEnabled = datamapSwitch && datamapSwitch.checked;

        if (isDatamapEnabled) {
          console.log('[Datamap] LLM datamap generation enabled, processing protocol...');

          // Update status
          updateInfo(`🤖 Generating datamap with AI for: <b>${assayId}</b>`, baseProgress + 0.5);

          const datamapPath = await parseProtocolToDatamap(markdown, assayId, baseAssayPath);

          if (datamapPath) {
            // Add datamap to git
            const relativeDatamapPath = datamapPath.replace(gitRoot, '');
            try {
              await git.add({ fs, dir: gitRoot, filepath: relativeDatamapPath });
              console.log(`[Datamap] Added to git: ${relativeDatamapPath}`);
              updateInfo(`✓ Datamap generated for: <b>${assayId}</b>`, baseProgress + 0.7);
            } catch (gitError) {
              console.warn(`[Datamap] Could not add datamap to git:`, gitError);
              updateInfo(`⚠️ Datamap generated but not added to git: <b>${assayId}</b>`, baseProgress + 0.7);
            }
          } else {
            updateInfo(`⚠️ Datamap generation failed for: <b>${assayId}</b>`, baseProgress + 0.7);
          }
        } else {
          console.log('[Datamap] LLM datamap generation disabled (toggle switch off)');
        }
      } catch (datamapError) {
        // Log error but continue conversion
        console.error('[Datamap] Datamap generation failed (experimental feature):', datamapError);
      }
      // ========== END EXPERIMENTAL ==========

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

      for (const [index, upload] of Object.entries(uploads)) {
        const blob = await fetchElabFiles(
          params.elabtoken,
          `experiments/${res.id}/uploads/${upload.id}?format=binary`,
          params.instance
        );

        const realname = upload.real_name.replace(/[^a-zA-Z0-9_,.\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
        const longname = upload.long_name;
        const longnameEncoded = encodeURIComponent(longname);
        const fileName = `${index}_${realname}`;
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
        await fs.promises.writeFile(fullPath, new Uint8Array(await blob.arrayBuffer()));

        await git.add({ fs, dir: gitRoot, filepath: relativeFilePath });

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
            uploadGallery.innerHTML = "";
            const uploads = data.uploads;
            for (const [index, ele] of Object.entries(uploads)){
                const blobs = await fetchElabFiles( elabtoken, "experiments/"+ elabid+ "/uploads/"+ ele.id +"?format=´binary´",instance);
                window.blobb.push(blobs);
                let objectURL = URL.createObjectURL(blobs)
                objectURL= objectURL.replace( /&storage=./g , "" );
                let dataArray = new Uint8Array(await blobs.arrayBuffer());
                const realname =  ele.real_name.replace(/[^a-zA-Z0-9_,\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
                const longname= ele.long_name;
                const longname2= encodeURIComponent(ele.long_name);

                if (blobs.type.includes("image")) {
                    uploadGallery.innerHTML += `
                        Image:<img src="${objectURL}"></td>

                    `;
                } else {
                    uploadGallery.innerHTML += `

                        File:${realname}</td>

                    `;
                }

                protocol = protocol.replace( /app\/download\.php(.*)f=/g, "" );
                protocol = protocol.replaceAll( longname , objectURL );
                protocol = protocol.replaceAll( longname2 , objectURL );
                protocol = protocol.replaceAll( "&amp;storage=1" , "" );
                protocol = protocol.replaceAll( "&amp;storage=2" , "" );
            }

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

      const roles = new arctrl.OntologyAnnotation("Researcher", "AGRO", "AGRO:00000373");
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
        const roles = new arctrl.OntologyAnnotation("Researcher", "AGRO", "AGRO:00000373");

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
      alert(text);
      updateInfo(text, "0")

    }

    function extractCookie(name) {
      const cookie = document.cookie;
      const values = cookie.split("; ");
      let value = "";
      values.forEach(e => { if (e.split("=")[0] === name) { value = e.split("=")[1] } });
      return value;
    }

    function softRoute() {
      const urlRoute = window.location.href.split("#");
      const url1 = urlRoute[0].split("?")[1];

      try {
        if (url1) {
          console.log("submission url is " + url1);
          const submitData = url1.split("&");
          let submitJSON = {};
          submitData.forEach(e => { submitJSON[e.split("=")[0]] = e.split("=")[1] }
          );
          getParameters(submitJSON.elabid, submitJSON.elabResourceid, submitJSON.elabtoken, submitJSON.datahubtoken, submitJSON.elabURL);
          //updateAll(submitJSON.elabid, submitJSON.elabtoken, submitJSON.datahubtoken, submitJSON.elabURL )

        } else {
          console.log("submission url is " + url1 + ". If url is undefined, switch tab to token tab");
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
          showTab("ftwTab");


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
    function analyzeArcStructure(gitRoot) {
      try {
        const structure = { studies: [], assays: [] };

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
     */
    function extractDatasetInfo(datasetPath) {
      try {
        const info = { samples: [], files: [] };

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
     */
    function extractProtocolInfo(protocolPath) {
      try {
        const info = { title: '', description: '', files: [] };

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
     * Generate isa.assay.elab2arc.xlsx for an assay
     * Uses ExcelJS to create a simple ISA assay file
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
          ['Assay File Name', `isa.assay.elab2arc.xlsx`],
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
        const isaPath = memfsPathJoin(assayPath, 'isa.assay.elab2arc.xlsx');
        fs.writeFileSync(isaPath, uint8Array);

        console.log(`[ISA Gen] Created: ${isaPath}`);
        return isaPath;

      } catch (error) {
        console.error(`[ISA Gen] Error generating ISA assay for ${assayName}:`, error);
        return null;
      }
    }

    /**
     * Generate isa.study.elab2arc.xlsx for a study
     */
    async function generateIsaStudy(studyPath, studyName, metadata = {}) {
      try {
        console.log(`[ISA Gen] Generating ISA study for: ${studyName}`);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('isa_study');

        // Build basic study metadata
        const metadataRows = [
          ['STUDY'],
          ['Study Identifier', studyName],
          ['Study Title', metadata.title || studyName],
          ['Study Description', metadata.description || ''],
          ['Study Submission Date', new Date().toISOString().split('T')[0]],
          ['Study Public Release Date', ''],
          [],
          ['STUDY CONTACTS'],
          ['Study Person Last Name', metadata.lastName || ''],
          ['Study Person First Name', metadata.firstName || ''],
          ['Study Person Email', metadata.email || ''],
          ['Study Person Affiliation', metadata.affiliation || ''],
          [],
          ['STUDY FILE NAME'],
          ['Study File Name', 'isa.study.elab2arc.xlsx'],
        ];

        metadataRows.forEach(row => worksheet.addRow(row));

        // Write the file
        const buffer = await workbook.xlsx.writeBuffer();
        const uint8Array = new Uint8Array(buffer);
        const isaPath = memfsPathJoin(studyPath, 'isa.study.elab2arc.xlsx');
        fs.writeFileSync(isaPath, uint8Array);

        console.log(`[ISA Gen] Created: ${isaPath}`);
        return isaPath;

      } catch (error) {
        console.error(`[ISA Gen] Error generating ISA study for ${studyName}:`, error);
        return null;
      }
    }

    /**
     * Generate isa.investigation.elab2arc.xlsx for the investigation (root)
     */
    async function generateIsaInvestigation(gitRoot, arcName, metadata = {}) {
      try {
        console.log(`[ISA Gen] Generating ISA investigation for: ${arcName}`);

        // Analyze directory structure
        const structure = analyzeArcStructure(gitRoot);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('isa_investigation');

        // Build investigation metadata
        const metadataRows = [
          ['ONTOLOGY SOURCE REFERENCE'],
          ['Term Source Name', ''],
          ['Term Source File', ''],
          ['Term Source Version', ''],
          ['Term Source Description', ''],
          [],
          ['INVESTIGATION'],
          ['Investigation Identifier', arcName],
          ['Investigation Title', metadata.title || arcName],
          ['Investigation Description', metadata.description || `elab2arc generated investigation for ${arcName}`],
          ['Investigation Submission Date', new Date().toISOString().split('T')[0]],
          ['Investigation Public Release Date', ''],
          [],
          ['INVESTIGATION CONTACTS'],
          ['Investigation Person Last Name', metadata.lastName || ''],
          ['Investigation Person First Name', metadata.firstName || ''],
          ['Investigation Person Email', metadata.email || ''],
          ['Investigation Person Affiliation', metadata.affiliation || ''],
          [],
          ['INVESTIGATION STUDIES'],
          ['Study Identifier', structure.studies.map(s => s.name).join(', ')],
          ['Number of Studies', structure.studies.length.toString()],
          [],
          ['INVESTIGATION ASSAYS'],
          ['Assay Identifier', structure.assays.map(a => a.name).join(', ')],
          ['Number of Assays', structure.assays.length.toString()],
          [],
          ['GENERATED BY'],
          ['Tool', `elab2ARC v${version}`],
          ['Date', new Date().toISOString()],
        ];

        metadataRows.forEach(row => worksheet.addRow(row));

        // Write the file
        const buffer = await workbook.xlsx.writeBuffer();
        const uint8Array = new Uint8Array(buffer);
        const isaPath = memfsPathJoin(gitRoot, 'isa.investigation.elab2arc.xlsx');
        fs.writeFileSync(isaPath, uint8Array);

        console.log(`[ISA Gen] Created: ${isaPath}`);
        return isaPath;

      } catch (error) {
        console.error(`[ISA Gen] Error generating ISA investigation:`, error);
        return null;
      }
    }

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
          onAuth: () => ({ username: datahubtoken }),
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
    // LLM-BASED DATAMAP GENERATION
    // =============================================================================

    /**
     * Call Together.AI API to extract structured data from protocol text
     * @param {string} protocolText - Protocol markdown text
     * @returns {Promise<Object>} - Extracted parameters, inputs, outputs
     */
    async function callClaudeAPI(protocolText) {
      try {
        // Get Together.AI API key from localStorage
        let togetherAPIKey = window.localStorage.getItem('togetherAPIKey');

        if (!togetherAPIKey) {
          console.warn('[Datamap LLM] No Together.AI API key found in localStorage');
          return null;
        }

        const prompt = `You are a scientific data extraction assistant. Analyze this experimental protocol and extract structured information.

Protocol Text:
"""
${protocolText}
"""

Extract and return ONLY a JSON object (no markdown, no explanation) with this structure:
{
  "inputs": ["array of input sample/material names mentioned"],
  "parameters": [
    {
      "name": "parameter name (e.g., temperature, pH, concentration)",
      "unit": "measurement unit (e.g., °C, mL, hours) or empty string if none",
      "type": "data type: number, text, or categorical",
      "description": "brief description of what this parameter measures"
    }
  ],
  "outputs": ["array of expected output file names or data types"]
}

Focus on extracting measurable parameters, experimental conditions, and data that would typically be recorded in a dataset.`;

        console.log('[Datamap LLM] Calling Together.AI API...');

        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${togetherAPIKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Together.AI API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;

        console.log('[Datamap LLM] Raw response:', content);

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Could not extract JSON from LLM response');
        }

        const extractedData = JSON.parse(jsonMatch[0]);
        console.log('[Datamap LLM] Extracted data:', extractedData);

        return extractedData;

      } catch (error) {
        console.error('[Datamap LLM] Error calling Together.AI API:', error);
        return null;
      }
    }

    /**
     * Generate isa.datamap.xlsx from LLM-extracted data
     * @param {Object} llmData - Extracted data from Claude API
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
        if (!fs.existsSync(datasetDir)) {
          fs.mkdirSync(datasetDir, { recursive: true });
        }

        fs.writeFileSync(datamapPath, new Uint8Array(buffer));
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
        const llmData = await callClaudeAPI(protocolMarkdown);

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

    addEventListener("hashchange", (event) => {
      if (true) {
        softRoute();
      }
    });
