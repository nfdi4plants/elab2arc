function buildTree(parentElement, path) {
    const entries = FS.readdirSync(path).filter(e => e !== '.' && e !== '..');
    
    entries.forEach(entry => {
        const fullPath = path === '.' ? entry : `${path}/${entry}`;
        const stat = FS.statSync(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${stat.isDirectory() ? 'folder' : 'file'}`;
        node.dataset.path = fullPath; // Store path for reference [[5]]
        
        const content = document.createElement('div');
        content.className = 'node-content w-auto';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = entry;
        content.appendChild(textSpan);
        
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
        childrenContainer.style.display = 'none';
        
        if (stat.isDirectory()) {
            const addButton = document.createElement('button');
            addButton.className = 'add-btn';
            addButton.textContent = '+';
            addButton.title = 'Add new folder in this folder';
            addButton.onclick = (e) => {
                e.stopPropagation();
                createFile(fullPath);
            };
            content.appendChild(addButton);
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-btn';
            deleteButton.textContent = '-';
            deleteButton.title = 'delete this folder';
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deletePath(fullPath);
            };
            content.appendChild(deleteButton);

            const selectButton = document.createElement('button');
            selectButton.className = 'select-btn';
            selectButton.textContent = '✔';
            selectButton.title = 'select this folder';
            selectButton.onclick = (e) => {
                e.stopPropagation();
                selectPath(fullPath);
            };
            content.appendChild(selectButton);



            node.onclick = (e) => {
                e.stopPropagation();
                if (childrenContainer.style.display === 'none') {
                    if (childrenContainer.children.length === 0) {
                        buildTree(childrenContainer, fullPath);
                    }
                    childrenContainer.style.display = 'block';
                } else {
                    childrenContainer.style.display = 'none';
                }
            };
        }
        
        node.appendChild(content);
        node.appendChild(childrenContainer);
        parentElement.appendChild(node);
    });
}

function refreshTree(targetPath = '.') {
    const treeDiv = document.getElementById('fileTree');
    treeDiv.innerHTML = '';
    buildTree(treeDiv, '.');
    
    if (targetPath === '.') return;
    
    const pathSegments = targetPath.split('/').filter(p => p !== '.' && p !== '');
    let currentPath = '.';
    
    // Programmatically expand all parent nodes [[2]][[6]]
    pathSegments.forEach(segment => {
        currentPath = currentPath === '.' ? segment : `${currentPath}/${segment}`;
        const node = document.querySelector(`[data-path="${currentPath}"]`);
        
        if (node && node.classList.contains('folder')) {
            node.click(); // Trigger expansion [[4]]
        }
    });
}

function createFile(parentPath = '.') {
    const filename = prompt('Enter new folder name:');
    if (filename) {
        try {
            const fullPath = parentPath === '.' 
                ? filename 
                : `${parentPath}/${filename}`;
            FS.mkdirSync(fullPath);
            refreshTree(fullPath); // Refresh and expand new path [[8]]
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }
}

function deletePath(targetPath) {
    try {
        // Validate path existence [[1]][[5]]
        if (!FS.existsSync(targetPath)) {
            alert(`Error: Path "${targetPath}" does not exist.`);
            return;
        }

        // Verify it's a directory [[5]][[8]]
        const stats = FS.statSync(targetPath);
        if (!stats.isDirectory()) {
            alert(`Error: "${targetPath}" is not a directory.`);
            return;
        }

        // Check if directory is empty [[8]]
        const contents = FS.readdirSync(targetPath);
        if (contents.length > 0) {
            alert(`Deletion failed: Folder "${targetPath}" is not empty.`);
            return;
        }

        // Attempt deletion [[4]][[9]]
        FS.rmdirSync(targetPath);
        alert(`Successfully deleted empty folder: ${targetPath}`);
        refreshTree(memfsPathDirname(targetPath)); // Refresh parent directory [[8]]

    } catch (error) {
        // Handle specific permission errors [[2]][[7]]
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            alert(`Permission denied: Unable to delete "${targetPath}"`);
        } else {
            alert(`Deletion failed: ${error.message}`);
        }
    }
}

function selectPath(targetPath) {
    try {
        // Check existence [[1]][[5]]
        if (!FS.existsSync(targetPath)) {
            alert(`Error: Path "${targetPath}" does not exist.`);
            return;
        }

        // Verify it's a directory [[5]][[8]]
        const stats = FS.statSync(targetPath);
        if (!stats.isDirectory()) {
            alert(`Error: "${targetPath}" is not a directory.`);
            return;
        }

        // Log and display path [[2]][[4]]
        console.log('Selected folder path:', targetPath);
        document.getElementById('arcInfo').innerHTML= targetPath;
        //alert(`Full path logged to console:\n${targetPath}`);
        
    } catch (error) {
        // Handle unexpected errors [[9]]
        alert(`Selection failed: ${error.message}`);
    }
}