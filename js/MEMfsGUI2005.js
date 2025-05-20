// Improved JavaScript
let currentPath = '.';
let contextMenu = null;
function buildTree(parentElement, path) {
    const entries = fs.readdirSync(path).filter(e => e !== '.' && e !== '..');
    
    entries.forEach(entry => {
        const fullPath = path === '.' ? entry : `${path}/${entry}`;
        const stat = fs.statSync(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${stat.isDirectory() ? 'folder' : 'file'}`;
        node.dataset.path = fullPath; // Store path for reference [[5]]
        
        const content = document.createElement('span');
        content.className = 'node-content w-auto';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = entry;
        content.appendChild(textSpan);
        
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
        childrenContainer.style.display = 'none';
        
        if (stat.isDirectory()) {
            node.onclick = (e) => {
                e.stopPropagation();
                if (childrenContainer.style.display === 'none') {
                    if (childrenContainer.children.length === 0) {
                        buildTree(childrenContainer, fullPath);
                        
                    }
                    childrenContainer.style.display = 'block';
                    selectPath(fullPath);
                } else {
                    childrenContainer.style.display = 'none';
                    selectPath(fullPath);
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
            fs.mkdirSync(fullPath);
            refreshTree(fullPath); // Refresh and expand new path [[8]]
        } catch (e) {
            console.log('Error: ' + e.message);
        }
    }
}


// Add new navigation function
function navigateBack() {
    const parentPath = memfsPathDirname(currentPath);
    if (fs.existsSync(parentPath)) {
        navigateTo(parentPath);
    }
}
// function deletePath(targetPath) {
//     try {
//         // Validate path existence [[1]][[5]]
//         if (!fs.existsSync(targetPath)) {
//             alert(`Error: Path "${targetPath}" does not exist.`);
//             return;
//         }

//         // Verify it's a directory [[5]][[8]]
//         const stats = fs.statSync(targetPath);
//         if (!stats.isDirectory()) {
//             alert(`Error: "${targetPath}" is not a directory.`);
//             return;
//         }

//         // Check if directory is empty [[8]]
//         const contents = fs.readdirSync(targetPath);
//         if (contents.length > 0) {
//             alert(`Deletion failed: Folder "${targetPath}" is not empty.`);
//             return;
//         }

//         // Attempt deletion [[4]][[9]]
//         fs.rmdirSync(targetPath);
//         alert(`Successfully deleted empty folder: ${targetPath}`);
//         refreshTree(memfsPathDirname(targetPath)); // Refresh parent directory [[8]]

//     } catch (error) {
//         // Handle specific permission errors [[2]][[7]]
//         if (error.code === 'EPERM' || error.code === 'EACCES') {
//             alert(`Permission denied: Unable to delete "${targetPath}"`);
//         } else {
//             alert(`Deletion failed: ${error.message}`);
//         }
//     }
// }

// function deletePath(targetPath) {
//     try {
//         // Validate path existence
//         if (!fs.existsSync(targetPath)) {
//             alert(`Error: Path "${targetPath}" does not exist.`);
//             return;
//         }

//         const stats = fs.statSync(targetPath);
//         if (stats.isFile()) {
//             // Delete the file directly
//             fs.unlinkSync(targetPath);
//             console.log(`Successfully deleted file: ${targetPath}`);
//             refreshTree(memfsPathDirname(targetPath));
//             return;
//         }

//         if (!stats.isDirectory()) {
//             alert(`Error: "${targetPath}" is not a directory.`);
//             return;
//         }

//         // Delete all contents of the directory
//         const contents = fs.readdirSync(targetPath);
//         for (const entry of contents) {
//             const entryPath = memfsPathJoin(targetPath, entry);
//             deletePath(entryPath); // Recursively delete each entry
//         }

//         // Delete the now-empty directory
//         fs.rmdirSync(targetPath);
//         console.log(`Successfully deleted folder and its contents: ${targetPath}`);
//         refreshTree(memfsPathDirname(targetPath));

//     } catch (error) {
//         // Handle specific permission errors
//         if (error.code === 'EPERM' || error.code === 'EACCES') {
//             alert(`Permission denied: Unable to delete "${targetPath}"`);
//         } else {
//             alert(`Deletion failed: ${error.message}`);
//         }
//     }
// }


// async function deleteFiles(targetPath) {
//     try {
//         // Validate path existence
//         if (!fs.existsSync(targetPath)) {
//             alert(`Error: Path "${targetPath}" does not exist.`);
//             return;
//         }

//         // Delete all contents of the directory
//         const contents = fs.readdirSync(targetPath);
//         for (const entry of contents) {
//             const entryPath = memfsPathJoin(targetPath, entry);
//                     const stats = fs.statSync(entryPath);
//             if (stats.isFile()) {
//                 // Delete the file directly
//                 fs.unlinkSync(entryPath);
//                 console.log(`Successfully deleted file: ${entryPath}`);
                
//                 const gitroot = entryPath.split("/").slice(0)[0];
//                 const filename = entryPath.replace(gitroot+"/", "");
//                 await git.remove({ fs, dir: gitroot, filepath: filename })
//                 refreshTree(memfsPathDirname(targetPath));
//             }

//         }

//     } catch (error) {
//         // Handle specific permission errors
//         if (error.code === 'EPERM' || error.code === 'EACCES') {
//             alert(`Permission denied: Unable to delete "${targetPath}"`);
//         } else {
//             alert(`Deletion failed: ${error.message}`);
//         }
//     }
// }



// function selectPath(targetPath) {
//     try {
//         // Check existence [[1]][[5]]
//         if (!fs.existsSync(targetPath)) {
//             alert(`Error: Path "${targetPath}" does not exist.`);
//             return;
//         }

//         // Verify it's a directory [[5]][[8]]
//         const stats = fs.statSync(targetPath);
//         if (!stats.isDirectory()) {
//             alert(`Error: "${targetPath}" is not a directory.`);
//             return;
//         }

//         // Log and display path [[2]][[4]]
//         console.log('Selected folder path:', targetPath);
//         document.getElementById('arcInfo').innerHTML= targetPath;
//         //alert(`Full path logged to console:\n${targetPath}`);
        
//     } catch (error) {
//         // Handle unexpected errors [[9]]
//         alert(`Selection failed: ${error.message}`);
//     }
// }



// Initialize Explorer
document.addEventListener('DOMContentLoaded', () => {
    refreshTree();
    refreshMainArea();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('select-button').addEventListener('click', () => {
        finalPath(document.getElementById("current-path").value);
    });
    document.getElementById('back-button').addEventListener('click', navigateBack);
    document.addEventListener('click', () => {
        if (contextMenu) contextMenu.remove();
    });

    document.getElementById('main-area').addEventListener('dblclick', (e) => {
        const item = e.target.closest('.folder-item, .file-item');
        if (item && item.classList.contains('folder-item')) {
            navigateTo(item.dataset.path);
        }
    });

    document.getElementById('main-area').addEventListener('contextmenu', (e) => {
        const folderItem = e.target.closest('.folder-item');
        if (folderItem) {
            e.preventDefault();
            showContextMenu(e, folderItem.dataset.path);
        }
    });
}

function refreshMainArea() {
    const mainArea = document.getElementById('main-area');
    mainArea.innerHTML = '';
    
    const entries = fs.readdirSync(currentPath).filter(e => e !== '.' && e !== '..');
    
    entries.forEach(entry => {
        const fullPath = currentPath === '.' ? entry : `${currentPath}/${entry}`;
        const stat = fs.statSync(fullPath);
        
        const item = document.createElement('div');
        item.className = stat.isDirectory() ? 'folder-item' : 'file-item';
        item.dataset.path = fullPath;
        item.innerHTML = `
            <div style="font-size: 48px">${stat.isDirectory() ? '📁' : '📄'}</div>
            <div style="word-break: break-all">${entry}</div>
        `;
        
        mainArea.appendChild(item);
    });
    
    document.getElementById('current-path').value = currentPath;
}

function navigateTo(path) {
    currentPath = path;
    refreshMainArea();
    refreshTree(path);
}

// Revised Context Menu Function
function showContextMenu(e, targetPath) {
    if (contextMenu) contextMenu.remove();
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    
    const menuItems = [
        { 
            text: 'New Folder', 
            action: () => {
                const filename = prompt('Enter new folder name:');
                if (filename) {
                    const fullPath = `${targetPath}/${filename}`;
                    fs.mkdirSync(fullPath);
                    refreshTree(targetPath);
                    refreshMainArea();
                }
            }
        },
        { 
            text: 'Delete', 
            action: () => {
                if (confirm(`Delete ${targetPath.split('/').pop()}?`)) {
                    deletePath(targetPath);
                    // Navigate up if deleting current folder
                    if (currentPath.startsWith(targetPath)) {
                        navigateTo(memfsPathDirname(targetPath));
                    }
                    refreshMainArea();
                }
            }
        },
        { 
            text: 'Select', 
            action: () => {
                selectPath(targetPath);
                refreshMainArea();
            }
        }
    ];
    
    menuItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'context-menu-item';
        div.textContent = item.text;
        div.addEventListener('click', item.action);
        contextMenu.appendChild(div);
    });
    
    document.body.appendChild(contextMenu);
}

// Modified existing functions to maintain tree sync
function createFile(parentPath) {
    const filename = prompt('Enter new folder name:');
    if (filename) {
        try {
            const fullPath = parentPath === '.' ? filename : `${parentPath}/${filename}`;
            fs.mkdirSync(fullPath);
            refreshTree(fullPath);
            refreshMainArea();
        } catch (e) {
            console.error('Error: ' + e.message);
        }
    }
}

// Modified Delete Function
function deletePath(targetPath) {
    try {
        if (!fs.existsSync(targetPath)) {
            console.error(`Error: Path "${targetPath}" does not exist.`);
            return;
        }

        const stats = fs.statSync(targetPath);
        if (stats.isFile()) {
            fs.unlinkSync(targetPath);
        } else {
            const contents = fs.readdirSync(targetPath);
            contents.forEach(entry => {
                const entryPath = `${targetPath}/${entry}`;
                deletePath(entryPath);
            });
            fs.rmdirSync(targetPath);
        }

        refreshTree(memfsPathDirname(targetPath));
        refreshMainArea();
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Deletion failed: ${error.message}`);
        }else{
            console.error(`Deletion failed: ${error.message}`);
        }

        
    }
}

// Keep existing tree functions but add path synchronization
function selectPath(targetPath) {
    currentPath = targetPath;
    document.getElementById('current-path').value = targetPath;
    refreshMainArea();

}

function finalPath(targetPath){
    document.getElementById("arcInfo").innerHTML = targetPath;
    fileExplorer.hide();
}
// Existing buildTree and refreshTree functions remain but ensure they sync with main area