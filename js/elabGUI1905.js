// Get instance from cookies
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : '';
}

const instance = window.localStorage.getItem('elabURL');

// Fetch and display data
async function loadExperiment(instance, elabid, elabtoken, type) {
    
    
    try {
        const data = await fetchElabExperimentData(elabid, elabtoken, instance, type);
        window.elabJSON = data;
       
        const assayId  = data.title.replace(/\//g, "|").replace(/[^a-zA-Z0-9_\-]/g, "_");
        let protocol = data.body;
          const elabWWW= instance.replace("api/v2/", "");
          protocol = protocol.replace(/\w+\.php\?mode=view/g, elabWWW+"/$&"  );
          
        // Process images
        
        // Populate content
        document.getElementById('expTitle').textContent = data.title;
        
        const headLine = document.getElementById("elabHeadLine");
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
                    </div>`
        // Metadata
        const metadataList = document.getElementById('metadataList');
        metadataList.innerHTML = `
            <li><strong>ID:</strong> ${data.elabid}</li>
            <li><strong>Created:</strong> ${data.created_at}</li>
            <li><strong>Modified:</strong> ${data.modified_at}</li>
            <li><strong>Author:</strong> ${data.fullname}</li>
            
        `;
        
        // Uploads
        const gallery = document.getElementById('uploadGallery');
        const uploadGallery = document.getElementById('uploadGallery');
        uploadGallery.innerHTML = "";
        const uploads = data.uploads;
        for (const [index, ele] of Object.entries(uploads)){
            const blobs = await fetchElabFiles( elabtoken, "experiments/"+ elabid+ "/uploads/"+ ele.id +"?format=´binary´",instance);
            window.blobb.push(blobs);
            let objectURL = URL.createObjectURL(blobs)
            objectURL= objectURL.replace( /&storage=./g , "" );        
            let data = new Uint8Array(await blobs.arrayBuffer());
            // const extension = blobs.type.split("/").slice(-1)[0];
            const realname =  ele.real_name.replace(/[^a-zA-Z0-9_,\-+%$|(){}\[\]*=#?&$!^°<>;]/g, "_");
            const longname= ele.long_name;
            const longname2= encodeURIComponent(ele.long_name);
            
            
            //const path = "assays/"+assayId+"/dataset/"+index+"_"+realname;
            //const markdownPath = "assays/"+encodeURIComponent(assayId)+"/dataset/"+index+"_"+realname;

            //filedict[longname] = instance.slice(0,-4)+`/-/raw/main/`+path;
            
            if (blobs.type.includes("image")) {
                uploadGallery.innerHTML += `
                    Image:<img src="${objectURL}"></td>

                `;
            } else {
                uploadGallery.innerHTML += `
                  
                    File:${realname}</td>
  
                `;
            }
           

            
            //protocol = protocol.replaceAll( "app/download.php?f="+longname , objectURL );
            protocol = protocol.replace( /app\/download\.php(.*)f=/g, "" );
            protocol = protocol.replaceAll( longname , objectURL );
            protocol = protocol.replaceAll( longname2 , objectURL );
            protocol = protocol.replaceAll( "&amp;storage=1" , "" );
            protocol = protocol.replaceAll( "&amp;storage=2" , "" );
        }
        
        // Related items
        const relatedItems = document.getElementById('relatedItems');
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
        const relatedExps = document.getElementById('relatedExps');
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

       
        document.getElementById('expContent').innerHTML = protocol;
        
    } catch (error) {
        console.error('Error loading experiment:', error);
        document.getElementById('expContent').innerHTML = '<p>Error loading content</p>';
    }
}

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
`