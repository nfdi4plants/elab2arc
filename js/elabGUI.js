// Get instance from cookies
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : '';
}

const instance = window.localStorage.getItem('elabURL');

// Fetch and display data
async function loadExperiment() {
    const elabid = getCookie('elabid').split(',')[0];
    const elabtoken = getCookie('elabtoken');
    
    try {
        const data1 = await fetchElabExperimentData(elabid, elabtoken, instance);
        const data = data1.metadata;
        const assayId  = data.title.replace(/\//g, "|").replace(/[^a-zA-Z0-9_\-]/g, "_");
        let protocol = data.body;
          const elabWWW= instance.replace("api/v2/", "");
          protocol = protocol.replace(/\w+\.php\?mode=view/g, elabWWW+"/$&"  );
          
        // Process images
        
        // Populate content
        document.getElementById('expTitle').textContent = data.title;
        
        
        // Metadata
        const metadataList = document.getElementById('metadataList');
        metadataList.innerHTML = `
            <li><strong>ID:</strong> ${data.elabid}</li>
            <li><strong>Created:</strong> ${data.created_at}</li>
            <li><strong>Modified:</strong> ${data.modified_at}</li>
            <li><strong>Author:</strong> ${data.fullname}</li>
            <li><strong>Datahub URL:</strong> 
                <a href="" target="_blank">
                    
                </a>
            </li>
        `;
        
        // Uploads
        const gallery = document.getElementById('uploadGallery');
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
            const markdownPath = "assays/"+encodeURIComponent(assayId)+"/dataset/"+index+"_"+realname;

            //filedict[longname] = datahubURL.slice(0,-4)+`/-/raw/main/`+path;

            //protocol = protocol.replaceAll( "app/download.php?f="+longname , objectURL );
            protocol = protocol.replace( /app\/download\.php(.*)f=/g, "" );
            protocol = protocol.replaceAll( longname , objectURL );
            protocol = protocol.replaceAll( longname2 , objectURL );
            protocol = protocol.replaceAll( "&amp;storage=1" , "" );
            protocol = protocol.replaceAll( "&amp;storage=2" , "" );
        }
        
        // Related items
        const relatedItems = document.getElementById('relatedItems');
        data.items_links.forEach(item => {
            relatedItems.innerHTML += `
                <div>
                    <span class="badge bg-primary ">${item.category_title}</span> <a href="${instance}/${item.page}?mode=view&id=${item.entityid}" target="_blank">
                        ${item.title}
                    </a>   
                </div>
            `;
        });
        const relatedExps = document.getElementById('relatedExps');
        data.experiments_links.forEach(item => {
            relatedExps.innerHTML += `
                <div>
                    <span class="badge bg-primary ">${item.category_title}</span> <a href="${instance}/${item.page}?mode=view&id=${item.entityid}" target="_blank">
                        ${item.title}
                    </a>   
                </div>
            `;
        });
        document.getElementById('expContent').innerHTML = protocol;
    } catch (error) {
        console.error('Error loading experiment:', error);
        document.getElementById('expContent').innerHTML = '<p>Error loading content</p>';
    }
}

