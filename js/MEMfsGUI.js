function buildTree(parentElement, path) {
    const entries = FS.readdirSync(path).filter(e => e !== '.' && e !== '..');
    
    entries.forEach(entry => {
        const fullPath = path === '.' ? entry : `${path}/${entry}`;
        const stat = FS.statSync(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${stat.isDirectory() ? 'folder' : 'file'}`;
        
        // Main content container
        const content = document.createElement('div');
        content.className = 'node-content w-auto';
        
        // Add folder/file name
        const textSpan = document.createElement('span');
        textSpan.textContent = entry;
        content.appendChild(textSpan);
        
        // Create children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
        childrenContainer.style.display = 'none';
        
        if (stat.isDirectory()) {
            // Add "+" button for directories
            const addButton = document.createElement('button');
            addButton.className = 'add-btn';
            addButton.textContent = '+';
            addButton.title = 'Add new file in this folder';
            addButton.onclick = (e) => {
                e.stopPropagation();
                createFile(fullPath);
            };
            content.appendChild(addButton);
            
            // Directory click handler
            node.onclick = (e) => {
                e.stopPropagation();
                if (childrenContainer.style.display === 'none') {
                    // Lazy load children if not already loaded
                    if (childrenContainer.children.length === 0) {
                        buildTree(childrenContainer, fullPath);
                    }
                    childrenContainer.style.display = 'block';
                } else {
                    childrenContainer.style.display = 'none';
                }
            };
        }
        
        // Assemble node structure
        node.appendChild(content);
        node.appendChild(childrenContainer);
        parentElement.appendChild(node);
    });
}

function refreshTree() {
    const treeDiv = document.getElementById('fileTree');
    treeDiv.innerHTML = '';
    buildTree(treeDiv, '.');
}

function createFile(parentPath = '.') {
    const filename = prompt('Enter new folder name:');
    if (filename) {
        try {
            const fullPath = parentPath === '.' 
                ? filename 
                : `${parentPath}/${filename}`;
            FS.mkdirSync(fullPath);
            refreshTree();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }
}
