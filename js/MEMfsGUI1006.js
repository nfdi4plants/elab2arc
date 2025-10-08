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
            // Add visual indicators for ARC structure compliance
            addARCStructureIndicators(node, fullPath);

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

    // New folder button event
    document.getElementById('new-folder-button').addEventListener('click', createNewFolder);

    // Preview panel events
    document.getElementById('close-preview').addEventListener('click', closePreview);
    document.getElementById('download-file').addEventListener('click', downloadCurrentFile);
    document.getElementById('save-file').addEventListener('click', saveCurrentFile);
    document.getElementById('fullscreen-preview').addEventListener('click', showOffcanvasPreview);

    // Offcanvas events
    document.getElementById('offcanvas-download').addEventListener('click', downloadCurrentFile);
    document.getElementById('offcanvas-save').addEventListener('click', saveCurrentFile);
    document.getElementById('compact-preview').addEventListener('click', showCompactPreview);

    // Close context menu on any click
    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.remove();
            contextMenu = null;
        }
    });

    // Enhanced double-click handler for both folders and files
    document.getElementById('main-area').addEventListener('dblclick', (e) => {
        const item = e.target.closest('.folder-item, .file-item');
        if (item) {
            if (item.classList.contains('folder-item')) {
                navigateTo(item.dataset.path);
            } else if (item.classList.contains('file-item')) {
                showFilePreview(item.dataset.path);
            }
        }
    });

    // Enhanced context menu for both folders, files, and empty space
    document.getElementById('main-area').addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const folderItem = e.target.closest('.folder-item');
        const fileItem = e.target.closest('.file-item');

        if (folderItem) {
            showFolderContextMenu(e, folderItem.dataset.path);
        } else if (fileItem) {
            showFileContextMenu(e, fileItem.dataset.path);
        } else {
            // Right-click on empty space
            showMainAreaContextMenu(e);
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

        if (stat.isDirectory()) {
            item.innerHTML = `
                <div class="item-icon">📁</div>
                <div class="item-name">${entry}</div>
            `;
        } else {
            // Get file extension for better icons
            const extension = entry.split('.').pop().toLowerCase();
            item.dataset.extension = extension;

            const icon = getFileIcon(extension);
            item.innerHTML = `
                <div class="item-icon">${icon}</div>
                <div class="item-name">${entry}</div>
            `;
        }

        mainArea.appendChild(item);
    });

    document.getElementById('current-path').value = currentPath;
}

function getFileIcon(extension) {
    const iconMap = {
        'txt': '📝',
        'md': '📝',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'bmp': '🖼️',
        'svg': '🖼️',
        'csv': '📊',
        'tsv': '📊',
        'xlsx': '📊',
        'xls': '📊',
        'pdf': '📕',
        'doc': '📄',
        'docx': '📄',
        'zip': '📦',
        'rar': '📦',
        'js': '⚙️',
        'html': '🌐',
        'css': '🎨',
        'json': '🔧'
    };

    return iconMap[extension] || '📄';
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
        const deletedPaths = [];

        if (stats.isFile()) {
            fs.unlinkSync(targetPath);
            deletedPaths.push(targetPath);
        } else {
            const contents = fs.readdirSync(targetPath);
            contents.forEach(entry => {
                const entryPath = `${targetPath}/${entry}`;
                deletePath(entryPath);
            });
            fs.rmdirSync(targetPath);
            deletedPaths.push(targetPath);
        }

        // Attempt to stage deletions in git if inside a git repo
        stageFileDeletions(deletedPaths);

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

// Helper function to stage file deletions in git
async function stageFileDeletions(deletedPaths) {
    try {
        // Find the git root by traversing up from deleted path
        let gitRoot = null;
        const firstPath = deletedPaths[0];

        // Try to find git root by checking parent directories
        let testPath = memfsPathDirname(firstPath);
        while (testPath && testPath !== '/' && testPath !== '.') {
            const gitDir = `${testPath}/.git`;
            if (fs.existsSync(gitDir)) {
                gitRoot = testPath.endsWith('/') ? testPath : testPath + '/';
                break;
            }
            testPath = memfsPathDirname(testPath);
        }

        if (!gitRoot) {
            console.log('[Git Delete] Not inside a git repository, skipping git staging');
            return;
        }

        // Stage each deletion
        for (const deletedPath of deletedPaths) {
            try {
                const relativePath = deletedPath.replace(gitRoot, '');
                if (relativePath && !relativePath.startsWith('.git/')) {
                    await git.remove({ fs, dir: gitRoot, filepath: relativePath });
                    console.log(`[Git Delete] Staged deletion: ${relativePath}`);
                }
            } catch (gitError) {
                // File might not be tracked in git, silently continue
                console.debug(`[Git Delete] Could not stage ${deletedPath}:`, gitError.message);
            }
        }

    } catch (error) {
        console.warn('[Git Delete] Error during git staging:', error);
    }
}

// Keep existing tree functions but add path synchronization
function selectPath(targetPath) {
    currentPath = targetPath;
    document.getElementById('current-path').value = targetPath;
    refreshMainArea();

}

async function finalPath(targetPath){
    // Validate and analyze the selected path
    const validationResult = validateARCPath(targetPath);

    if (validationResult.isValid) {
        // Update the arcInfo to indicate ARC cloning is in progress
        document.getElementById("arcInfo").innerHTML = `${targetPath} (preparing...)`;

        // Show user feedback about what will happen
        showPathSelectionFeedback(validationResult);

        // Clone the ARC if it hasn't been cloned already
        const cloneSuccess = await cloneARCIfNeeded(targetPath);

        if (cloneSuccess) {
            // Update arcInfo to show the selected path
            document.getElementById("arcInfo").innerHTML = targetPath;

            // Update the target path input field
            if (typeof setTargetPath === 'function') {
                setTargetPath(targetPath);
            } else {
                console.warn('setTargetPath function not available');
            }

            // Mark that ARC has been cloned via folder selector
            window.arcClonedViaFolderSelector = true;

            // Show success feedback
            showARCCloneSuccessNotification(targetPath);
        } else {
            // Revert arcInfo on failure
            document.getElementById("arcInfo").innerHTML = "Please select your ARC";
        }

        fileExplorer.hide();
    } else {
        // Show warning for invalid path
        alert(validationResult.message);
    }
}

/**
 * Clone the ARC repository if it hasn't been cloned already
 * @param {string} targetPath - The selected folder path
 * @returns {boolean} Success status
 */
async function cloneARCIfNeeded(targetPath) {
    try {
        // Get GitLab URL from the UI
        const gitlabURL = document.getElementById("gitlabInfo").innerHTML;

        if (!gitlabURL || gitlabURL.includes("Please select") || gitlabURL.includes("GitLab URL")) {
            alert("Error: No GitLab repository URL found. Please select an ARC repository first.");
            return false;
        }

        // Extract ARC name from the path or URL
        const pathParts = targetPath.split('/').filter(p => p);
        const arcName = pathParts.length > 0 ? pathParts[0] : gitlabURL.split("/").slice(-1)[0].replace(".git", "");

        // Check if ARC is already cloned
        if (window.fs && window.fs.existsSync(`./${arcName}`)) {
            console.log(`ARC ${arcName} already exists, skipping clone`);
            showARCExistsNotification(arcName);
            return true;
        }

        // Show loading notification
        showARCCloningNotification(arcName);

        // Delete any existing files first
        if (typeof deleteAll === 'function') {
            deleteAll();
        }

        // Clone the ARC
        if (typeof cloneARC === 'function') {
            await cloneARC(gitlabURL, arcName);
            console.log(`Successfully cloned ARC: ${arcName}`);

            // Refresh the file tree to show the cloned ARC
            if (typeof refreshTree === 'function') {
                refreshTree(`./${arcName}`);
            }

            return true;
        } else {
            throw new Error("cloneARC function not available");
        }
    } catch (error) {
        console.error("Failed to clone ARC:", error);
        alert(`Failed to clone ARC: ${error.message || error}`);
        return false;
    }
}

/**
 * Show notification that ARC is being cloned
 */
function showARCCloningNotification(arcName) {
    showNotification(`🔄 Cloning ARC repository: ${arcName}...`, 'info', 0); // Don't auto-hide
}

/**
 * Show notification that ARC already exists
 */
function showARCExistsNotification(arcName) {
    showNotification(`✅ ARC repository ${arcName} already exists`, 'success', 3000);
}

/**
 * Show notification that ARC has been successfully cloned and is ready
 */
function showARCCloneSuccessNotification(targetPath) {
    const pathParts = targetPath.split('/').filter(p => p);
    const arcName = pathParts.length > 0 ? pathParts[0] : 'ARC';
    showNotification(`✅ ARC repository ${arcName} cloned successfully! Ready for conversion.`, 'success', 5000);
}

/**
 * Generic notification function
 */
function showNotification(message, type = 'info', autoHideMs = 5000) {
    // Remove any existing notification
    const existingNotification = document.getElementById('arc-clone-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'arc-clone-notification';

    const colors = {
        info: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' },
        success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
        error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' }
    };

    const color = colors[type] || colors.info;

    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${color.bg};
        border: 1px solid ${color.border};
        color: ${color.text};
        border-radius: 5px;
        padding: 15px 20px;
        max-width: 400px;
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInFromRight 0.3s ease-out;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="flex: 1;">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="background: none; border: none; color: ${color.text};
                           font-size: 18px; cursor: pointer; padding: 0; opacity: 0.7;">×</button>
        </div>
    `;

    document.body.appendChild(notification);

    // Auto-hide after specified time
    if (autoHideMs > 0) {
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.style.animation = 'slideOutToRight 0.3s ease-in';
                setTimeout(() => {
                    if (notification && notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, autoHideMs);
    }

    // Add CSS animations if not already present
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInFromRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutToRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Validates if the selected path is appropriate for ARC conversion
 * @param {string} path - The selected folder path
 * @returns {Object} Validation result with isValid, type, and message
 */
function validateARCPath(path) {
    // Clean and normalize the path
    const normalizedPath = path.replace(/^\.\//, '').replace(/\/$/, '');
    const pathParts = normalizedPath.split('/').filter(p => p);

    if (pathParts.length === 0) {
        // Root level - valid, will create new assay
        return {
            isValid: true,
            type: 'new_assay',
            message: 'Will create new assay in ARC root directory',
            behavior: 'Creates new assay structure with isa.assay.xlsx'
        };
    }

    if (pathParts.length === 1) {
        // /arc_name/ - ARC root level, will create new assay
        return {
            isValid: true,
            type: 'new_assay',
            message: `Will create new assay in ARC root: ${pathParts[0]}`,
            behavior: 'Creates new assay structure with isa.assay.xlsx'
        };
    }

    if (pathParts.length === 2) {
        const arcName = pathParts[0];
        const secondLevel = pathParts[1];

        if (secondLevel === 'studies') {
            // /arc_name/studies/ - valid, will create new study
            return {
                isValid: true,
                type: 'new_study',
                message: `Will create new study in ${arcName}/studies/`,
                behavior: 'Creates new study structure (no isa.assay.xlsx)'
            };
        } else if (secondLevel === 'assays') {
            // /arc_name/assays/ - valid, will create new assay in assays directory
            return {
                isValid: true,
                type: 'new_assay_in_assays',
                message: `Will create new assay in ${arcName}/assays/`,
                behavior: 'Creates new assay structure with isa.assay.xlsx'
            };
        } else {
            // Other second-level directories
            return {
                isValid: false,
                type: 'unmapped',
                message: `Path "${normalizedPath}" is not a standard ARC structure. In ARC "${arcName}", please select:\n- /${arcName}/ for new assay in root\n- /${arcName}/studies/ for new study\n- /${arcName}/assays/ for new assay in assays\n- /${arcName}/studies/study-name/ for existing study\n- /${arcName}/assays/assay-name/ for existing assay`,
                behavior: 'Requires standard ARC folder selection'
            };
        }
    }

    if (pathParts.length === 3) {
        const arcName = pathParts[0];
        const secondLevel = pathParts[1];
        const thirdLevel = pathParts[2];

        if (secondLevel === 'studies') {
            // /arc_name/studies/specific-study/ - valid, will load into existing study
            return {
                isValid: true,
                type: 'existing_study',
                message: `Will add protocols and resources to existing study: ${arcName}/studies/${thirdLevel}`,
                behavior: 'Adds content to existing study (no new structure created)'
            };
        } else if (secondLevel === 'assays') {
            // /arc_name/assays/specific-assay/ - valid, will load into existing assay
            return {
                isValid: true,
                type: 'existing_assay',
                message: `Will add protocols and datasets to existing assay: ${arcName}/assays/${thirdLevel}`,
                behavior: 'Adds content to existing assay (no new isa.assay.xlsx)'
            };
        } else {
            // Invalid second level with third level
            return {
                isValid: false,
                type: 'invalid',
                message: `Invalid ARC structure. "${secondLevel}" is not a standard ARC folder. Please select studies or assays.`,
                behavior: 'Cannot process this path'
            };
        }
    }

    if (pathParts.length > 3) {
        const arcName = pathParts[0];
        const secondLevel = pathParts[1];

        if (secondLevel === 'studies') {
            return {
                isValid: false,
                type: 'invalid',
                message: `Too deep in studies hierarchy. Please select either /${arcName}/studies/ or /${arcName}/studies/study-name/`,
                behavior: 'Cannot process this path'
            };
        } else if (secondLevel === 'assays') {
            return {
                isValid: false,
                type: 'invalid',
                message: `Too deep in assays hierarchy. Please select /${arcName}/assays/assay-name/`,
                behavior: 'Cannot process this path'
            };
        }
    }

    // Fallback for any other cases
    return {
        isValid: false,
        type: 'unmapped',
        message: `Path "${normalizedPath}" is not a standard ARC structure. Please select:\n- /arc-name/ for new assay in root\n- /arc-name/studies/ for new study\n- /arc-name/studies/study-name/ for existing study\n- /arc-name/assays/assay-name/ for existing assay`,
        behavior: 'Requires proper ARC folder selection'
    };
}

/**
 * Show user feedback about the selected path and its behavior
 * @param {Object} validationResult - Result from validateARCPath
 */
function showPathSelectionFeedback(validationResult) {
    // Create or update feedback display
    let feedbackElement = document.getElementById('path-selection-feedback');
    if (!feedbackElement) {
        feedbackElement = document.createElement('div');
        feedbackElement.id = 'path-selection-feedback';
        feedbackElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 5px;
            padding: 10px 15px;
            max-width: 300px;
            z-index: 9999;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(feedbackElement);
    }

    feedbackElement.innerHTML = `
        <div style="font-weight: bold; color: #155724; margin-bottom: 5px;">
            ✓ Valid ARC Path Selected
        </div>
        <div style="color: #155724;">
            ${validationResult.behavior}
        </div>
    `;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (feedbackElement && feedbackElement.parentNode) {
            feedbackElement.parentNode.removeChild(feedbackElement);
        }
    }, 5000);
}

/**
 * Add visual indicators to folder nodes based on ARC structure compliance
 * @param {HTMLElement} node - The folder node element
 * @param {string} fullPath - The full path to the folder
 */
function addARCStructureIndicators(node, fullPath) {
    const pathValidation = validateARCPathForDisplay(fullPath);
    const contentSpan = node.querySelector('.node-content');

    if (!contentSpan) return;

    // Remove any existing indicators
    const existingIndicator = contentSpan.querySelector('.arc-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    // Add new indicator based on validation result
    const indicator = document.createElement('span');
    indicator.className = 'arc-indicator';
    indicator.style.marginLeft = '8px';
    indicator.style.fontSize = '12px';
    indicator.style.fontWeight = 'bold';

    if (pathValidation.isValid) {
        switch (pathValidation.type) {
            case 'new_assay':
                indicator.textContent = '🔬 New Assay';
                indicator.style.color = '#28a745';
                indicator.title = 'Will create new assay structure';
                break;
            case 'new_study':
                indicator.textContent = '📊 New Study';
                indicator.style.color = '#007bff';
                indicator.title = 'Will create new study structure';
                break;
            case 'existing_study':
                indicator.textContent = '📊+ Existing Study';
                indicator.style.color = '#17a2b8';
                indicator.title = 'Will add content to existing study';
                break;
            case 'existing_assay':
                indicator.textContent = '🔬+ Existing Assay';
                indicator.style.color = '#20c997';
                indicator.title = 'Will add content to existing assay';
                break;
            case 'new_assay_in_assays':
                indicator.textContent = '🔬 New Assay';
                indicator.style.color = '#28a745';
                indicator.title = 'Will create new assay in assays directory';
                break;
        }
        node.style.backgroundColor = '#f8fff8';
        node.style.border = '1px solid #d4edda';
    } else {
        indicator.textContent = '⚠️ Invalid';
        indicator.style.color = '#dc3545';
        indicator.title = pathValidation.message;
        node.style.backgroundColor = '#fff8f8';
        node.style.border = '1px solid #f5c6cb';
    }

    contentSpan.appendChild(indicator);
}

/**
 * Simplified version of validateARCPath for display purposes
 * @param {string} path - The folder path to validate
 * @returns {Object} Validation result for display
 */
function validateARCPathForDisplay(path) {
    const normalizedPath = path.replace(/^\.\//, '').replace(/\/$/, '');
    const pathParts = normalizedPath.split('/').filter(p => p);

    if (pathParts.length === 0) {
        return { isValid: true, type: 'new_assay', message: 'Root level - will create new assay' };
    }

    if (pathParts.length === 1) {
        return { isValid: true, type: 'new_assay', message: `ARC root (${pathParts[0]}) - will create new assay` };
    }

    if (pathParts.length === 2) {
        const secondLevel = pathParts[1];
        const arcName = pathParts[0];

        if (secondLevel === 'studies') {
            return { isValid: true, type: 'new_study', message: `${arcName}/studies - will create new study` };
        } else if (secondLevel === 'assays') {
            return { isValid: true, type: 'new_assay_in_assays', message: `${arcName}/assays - will create new assay` };
        }
        return { isValid: false, type: 'unmapped', message: `Non-standard folder in ${arcName}` };
    }

    if (pathParts.length === 3) {
        const secondLevel = pathParts[1];
        const thirdLevel = pathParts[2];

        if (secondLevel === 'studies') {
            return { isValid: true, type: 'existing_study', message: `Existing study (${thirdLevel}) - will add content` };
        } else if (secondLevel === 'assays') {
            return { isValid: true, type: 'existing_assay', message: `Existing assay (${thirdLevel}) - will add content` };
        }
        return { isValid: false, type: 'invalid', message: 'Invalid structure' };
    }

    // Too deep
    if (pathParts.length > 3) {
        const secondLevel = pathParts[1];
        if (secondLevel === 'studies' || secondLevel === 'assays') {
            return { isValid: false, type: 'invalid', message: `Too deep in ${secondLevel} hierarchy` };
        }
    }

    return { isValid: false, type: 'unmapped', message: 'Non-standard ARC structure' };
}

// New Functions for Enhanced UI

// Global variables for preview functionality
let currentPreviewFile = null;
let originalFileContent = null;

// New Folder Creation
function createNewFolder() {
    const folderName = prompt('Enter new folder name:');
    if (folderName && folderName.trim()) {
        const newFolderPath = currentPath === '.' ? folderName.trim() : `${currentPath}/${folderName.trim()}`;
        try {
            fs.mkdirSync(newFolderPath);
            refreshMainArea();
            refreshTree(currentPath);
        } catch (error) {
            alert(`Failed to create folder: ${error.message}`);
        }
    }
}

// Enhanced Context Menu Functions
function showMainAreaContextMenu(e) {
    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;

    const menuItems = [
        {
            text: '📁 Select Current Folder',
            action: () => {
                selectPath(currentPath);
                refreshMainArea();
            }
        },
        { separator: true },
        {
            text: '📁 Create New Folder',
            action: createNewFolder
        },
        {
            text: '📄 Create New File',
            action: createNewFile
        }
    ];

    createContextMenuItems(contextMenu, menuItems);
    document.body.appendChild(contextMenu);
}

function showFolderContextMenu(e, targetPath) {
    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;

    const menuItems = [
        {
            text: '📂 Open',
            action: () => navigateTo(targetPath)
        },
        {
            text: '✅ Select',
            action: () => {
                selectPath(targetPath);
                refreshMainArea();
            }
        },
        { separator: true },
        {
            text: '📁 New Folder',
            action: () => {
                const filename = prompt('Enter new folder name:');
                if (filename) {
                    const fullPath = `${targetPath}/${filename}`;
                    try {
                        fs.mkdirSync(fullPath);
                        refreshMainArea();
                        refreshTree(currentPath);
                    } catch (error) {
                        alert(`Failed to create folder: ${error.message}`);
                    }
                }
            }
        },
        {
            text: '🗑️ Delete',
            action: () => {
                if (confirm(`Delete folder "${targetPath.split('/').pop()}"?`)) {
                    deletePath(targetPath);
                    if (currentPath.startsWith(targetPath)) {
                        navigateTo(memfsPathDirname(targetPath));
                    }
                    refreshMainArea();
                }
            }
        }
    ];

    createContextMenuItems(contextMenu, menuItems);
    document.body.appendChild(contextMenu);
}

function showFileContextMenu(e, targetPath) {
    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;

    const menuItems = [
        {
            text: '👁️ Open Preview',
            action: () => showFilePreview(targetPath)
        },
        {
            text: '💾 Download',
            action: () => downloadFile(targetPath)
        },
        { separator: true },
        {
            text: '✏️ Rename',
            action: () => renameFile(targetPath)
        },
        {
            text: '🗑️ Delete',
            action: () => {
                if (confirm(`Delete file "${targetPath.split('/').pop()}"?`)) {
                    try {
                        fs.unlinkSync(targetPath);
                        refreshMainArea();
                        if (currentPreviewFile === targetPath) {
                            closePreview();
                        }
                    } catch (error) {
                        alert(`Failed to delete file: ${error.message}`);
                    }
                }
            }
        }
    ];

    createContextMenuItems(contextMenu, menuItems);
    document.body.appendChild(contextMenu);
}

function createContextMenuItems(menu, items) {
    items.forEach(item => {
        if (item.separator) {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            menu.appendChild(separator);
        } else {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = item.text;
            menuItem.onclick = (e) => {
                e.stopPropagation();
                item.action();
                menu.remove();
                contextMenu = null;
            };
            menu.appendChild(menuItem);
        }
    });
}

// File Operations
function createNewFile() {
    const fileName = prompt('Enter new file name:');
    if (fileName && fileName.trim()) {
        const newFilePath = currentPath === '.' ? fileName.trim() : `${currentPath}/${fileName.trim()}`;
        try {
            fs.writeFileSync(newFilePath, '');
            refreshMainArea();
        } catch (error) {
            alert(`Failed to create file: ${error.message}`);
        }
    }
}

function renameFile(filePath) {
    const currentName = filePath.split('/').pop();
    const newName = prompt('Enter new file name:', currentName);
    if (newName && newName.trim() && newName !== currentName) {
        const newPath = filePath.replace(currentName, newName.trim());
        try {
            const content = fs.readFileSync(filePath);
            fs.writeFileSync(newPath, content);
            fs.unlinkSync(filePath);
            refreshMainArea();
            if (currentPreviewFile === filePath) {
                currentPreviewFile = newPath;
                document.getElementById('preview-title').textContent = `Preview: ${newName}`;
            }
        } catch (error) {
            alert(`Failed to rename file: ${error.message}`);
        }
    }
}

function downloadFile(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        const fileName = filePath.split('/').pop();

        // Create a blob and download link
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Failed to download file: ${error.message}`);
    }
}

// File Preview Functions
function showFilePreview(filePath) {
    currentPreviewFile = filePath;
    const fileName = filePath.split('/').pop();
    const extension = fileName.split('.').pop().toLowerCase();

    // Show preview panel
    const previewPanel = document.getElementById('preview-panel');
    const mainContent = document.querySelector('.main-content');

    previewPanel.style.display = 'flex';
    mainContent.classList.add('with-preview');

    // Update title
    document.getElementById('preview-title').textContent = `Preview: ${fileName}`;

    // Clear navigation for non-Excel files
    const navigation = document.getElementById('preview-navigation');
    if (!isExcelFile(extension)) {
        if (navigation) navigation.innerHTML = '';
        currentWorkbook = null; // Clear workbook reference
    }

    // Load content based on file type
    const previewContent = document.getElementById('preview-content');
    previewContent.innerHTML = '<div class="loading-spinner"></div> Loading...';

    try {
        if (isTextFile(extension)) {
            previewTextFile(filePath, previewContent);
        } else if (isImageFile(extension)) {
            previewImageFile(filePath, previewContent);
        } else if (isExcelFile(extension)) {
            previewExcelFile(filePath, previewContent);
        } else if (isTableFile(extension)) {
            previewTableFile(filePath, previewContent);
        } else {
            previewContent.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                    <p>Preview not available for this file type.</p>
                    <p>File: ${fileName}</p>
                    <button onclick="downloadFile('${filePath}')" class="btn btn-primary">Download File</button>
                </div>
            `;
        }
    } catch (error) {
        previewContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: red;">
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <p>Error loading file preview:</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function isTextFile(extension) {
    const textExtensions = ['txt', 'md', 'json', 'css', 'js', 'html', 'xml', 'log', 'cfg', 'conf', 'ini'];
    return !extension || textExtensions.includes(extension);
}

function isImageFile(extension) {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    return imageExtensions.includes(extension);
}

function isTableFile(extension) {
    const tableExtensions = ['csv', 'tsv'];
    return tableExtensions.includes(extension);
}

function isExcelFile(extension) {
    const excelExtensions = ['xlsx', 'xls'];
    return excelExtensions.includes(extension);
}

function previewTextFile(filePath, container) {
    const content = fs.readFileSync(filePath, 'utf8');
    originalFileContent = content;
    const fileName = filePath.split('/').pop();
    const extension = fileName.split('.').pop().toLowerCase();

    // Check if this is a markdown file
    if (extension === 'md') {
        // Render markdown with both rendered view and raw editor
        const renderedHtml = renderMarkdown(content);
        container.innerHTML = `
            <div class="markdown-preview-container">
                <div class="mb-3">
                    <button class="btn btn-sm btn-outline-primary" onclick="toggleMarkdownView('rendered')">📄 Rendered</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleMarkdownView('source')">📝 Source</button>
                </div>
                <div id="markdown-rendered" class="markdown-preview" style="padding: 20px; border: 1px solid #ddd; border-radius: 4px; background: white;">
                    ${renderedHtml}
                </div>
                <textarea class="text-preview-editor d-none" id="text-editor">${content}</textarea>
            </div>
        `;
    } else {
        // Regular text file - show editor only
        container.innerHTML = `
            <textarea class="text-preview-editor" id="text-editor">${content}</textarea>
        `;
    }

    // Show save button for text files
    document.getElementById('save-file').style.display = 'inline-block';
}

function renderMarkdown(markdown) {
    // Simple markdown renderer - converts basic markdown to HTML
    let html = markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Images
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;">')
        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Unordered lists
        .replace(/^\* (.+)$/gim, '<li>$1</li>')
        .replace(/^- (.+)$/gim, '<li>$1</li>')
        // Ordered lists
        .replace(/^\d+\. (.+)$/gim, '<li>$1</li>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap lists
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    // Wrap in paragraphs
    html = '<p>' + html + '</p>';

    return html;
}

function toggleMarkdownView(view) {
    const rendered = document.getElementById('markdown-rendered');
    const source = document.getElementById('text-editor');
    const buttons = document.querySelectorAll('.markdown-preview-container button');

    if (view === 'rendered') {
        rendered.classList.remove('d-none');
        source.classList.add('d-none');
        buttons[0].classList.remove('btn-outline-primary');
        buttons[0].classList.add('btn-primary');
        buttons[1].classList.remove('btn-secondary');
        buttons[1].classList.add('btn-outline-secondary');
    } else {
        rendered.classList.add('d-none');
        source.classList.remove('d-none');
        buttons[0].classList.remove('btn-primary');
        buttons[0].classList.add('btn-outline-primary');
        buttons[1].classList.remove('btn-outline-secondary');
        buttons[1].classList.add('btn-secondary');
    }
}

function previewImageFile(filePath, container) {
    const content = fs.readFileSync(filePath);
    const blob = new Blob([content]);
    const imageUrl = URL.createObjectURL(blob);

    container.innerHTML = `
        <div class="image-preview">
            <img src="${imageUrl}" alt="Image preview" id="preview-image">
        </div>
    `;

    // Clean up object URL after image loads
    const img = container.querySelector('#preview-image');
    if (img) {
        img.onload = function() {
            URL.revokeObjectURL(imageUrl);
        };
    }

    // Hide save button for images
    document.getElementById('save-file').style.display = 'none';
}

function previewTableFile(filePath, container) {
    const content = fs.readFileSync(filePath, 'utf8');
    const extension = filePath.split('.').pop().toLowerCase();

    let rows;
    if (extension === 'csv') {
        rows = content.split('\n').map(row => row.split(','));
    } else if (extension === 'tsv') {
        rows = content.split('\n').map(row => row.split('\t'));
    }

    // Filter out empty rows
    rows = rows.filter(row => row.some(cell => cell.trim()));

    let tableHtml = '<div class="table-preview"><table>';

    if (rows.length > 0) {
        // Header row
        tableHtml += '<thead><tr>';
        rows[0].forEach(cell => {
            tableHtml += `<th>${cell.trim()}</th>`;
        });
        tableHtml += '</tr></thead>';

        // Data rows (limit to first 100 rows for performance)
        tableHtml += '<tbody>';
        const maxRows = Math.min(rows.length, 101); // Header + 100 rows
        for (let i = 1; i < maxRows; i++) {
            tableHtml += '<tr>';
            rows[i].forEach(cell => {
                tableHtml += `<td>${cell.trim()}</td>`;
            });
            tableHtml += '</tr>';
        }
        if (rows.length > 101) {
            tableHtml += `<tr><td colspan="${rows[0].length}" style="text-align: center; font-style: italic;">... and ${rows.length - 101} more rows</td></tr>`;
        }
        tableHtml += '</tbody>';
    }

    tableHtml += '</table></div>';
    container.innerHTML = tableHtml;

    // Hide save button for tables
    document.getElementById('save-file').style.display = 'none';
}

function closePreview() {
    const previewPanel = document.getElementById('preview-panel');
    const mainContent = document.querySelector('.main-content');

    previewPanel.style.display = 'none';
    mainContent.classList.remove('with-preview');

    currentPreviewFile = null;
    originalFileContent = null;
    document.getElementById('save-file').style.display = 'none';
}

function downloadCurrentFile() {
    if (currentPreviewFile) {
        downloadFile(currentPreviewFile);
    }
}

function saveCurrentFile() {
    if (currentPreviewFile && originalFileContent !== null) {
        const editor = document.getElementById('text-editor');
        if (editor) {
            try {
                fs.writeFileSync(currentPreviewFile, editor.value);
                originalFileContent = editor.value;
                alert('File saved successfully!');
            } catch (error) {
                alert(`Failed to save file: ${error.message}`);
            }
        }
    }
}

// Excel Preview Functions
let currentWorkbook = null;
let currentActiveSheet = 0;
let currentExcelFilePath = null;
let cellChanges = {}; // Track cell edits: {sheetIndex: {rowCol: newValue}}
let currentIsaType = null; // Track ISA file type: 'assay', 'study', 'investigation', or null
let currentArcObject = null; // Store parsed ARCtrl object (ArcAssay, ArcStudy, or ArcInvestigation)

/**
 * Detect if file is an ISA-Tab file
 * @param {string} filePath - Full file path
 * @returns {string|null} - 'assay', 'study', 'investigation', or null
 */
function detectIsaFileType(filePath) {
    const fileName = filePath.split('/').pop().toLowerCase();

    // Match both new format (isa.assay.xlsx) and backup format (isa.assay.backup.xlsx)
    if ((fileName === 'isa.assay.xlsx' || fileName.includes('isa.assay.backup')) && fileName.endsWith('.xlsx')) {
        return 'assay';
    } else if ((fileName === 'isa.study.xlsx' || fileName.includes('isa.study.backup')) && fileName.endsWith('.xlsx')) {
        return 'study';
    } else if ((fileName === 'isa.investigation.xlsx' || fileName.includes('isa.investigation.backup')) && fileName.endsWith('.xlsx')) {
        return 'investigation';
    }

    return null;
}

async function previewExcelFile(filePath, container) {
    try {
        // Detect if this is an ISA file
        const isaType = detectIsaFileType(filePath);
        currentIsaType = isaType;
        currentExcelFilePath = filePath;

        console.log(`[Excel Preview] Loading ${isaType ? 'ISA-' + isaType : 'Excel'} file: ${filePath}`);

        // Load file content
        const content = fs.readFileSync(filePath);

        if (isaType && window.arctrl && window.Xlsx) {
            // Use ARCtrl for ISA files
            await loadIsaFileWithArctrl(filePath, content, isaType, container);
        } else {
            // Fall back to ExcelJS for non-ISA files
            await loadExcelFileWithExcelJS(content, container);
        }

    } catch (error) {
        console.error('Excel preview error:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: red;">
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <p>Error loading Excel file:</p>
                <p style="font-size: 14px; color: #666;">${error.message}</p>
                <p>Try downloading the file instead.</p>
            </div>
        `;
    }

    // Hide text save button for Excel files
    document.getElementById('save-file').style.display = 'none';
    document.getElementById('offcanvas-save').style.display = 'none';
}

/**
 * Load ISA file using ARCtrl library
 */
async function loadIsaFileWithArctrl(filePath, content, isaType, container) {
    try {
        console.log(`[ARCtrl] Loading ISA file: ${filePath}`);

        // Convert content to FsWorkbook using ARCtrl
        const arrayBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
        const blob = new Blob([arrayBuffer]);
        const file = new File([blob], filePath.split('/').pop());

        // Use Xlsx.fromXlsxFile to load as FsWorkbook
        const fsWorkbook = await window.Xlsx.fromXlsxFile(filePath);

        console.log(`[ARCtrl] Loaded FsWorkbook:`, fsWorkbook);
        console.log(`[ARCtrl] FsWorkbook type:`, typeof fsWorkbook);
        console.log(`[ARCtrl] FsWorkbook properties:`, Object.keys(fsWorkbook));

        // Check GetWorksheets method
        if (typeof fsWorkbook.GetWorksheets === 'function') {
            const worksheets = fsWorkbook.GetWorksheets();
            console.log(`[ARCtrl] Worksheets count: ${worksheets.length}`);
            console.log(`[ARCtrl] First worksheet:`, worksheets[0]);
        } else {
            console.error('[ARCtrl] GetWorksheets is not a function!');
        }

        // Parse based on ISA type
        let arcObject = null;

        if (isaType === 'assay') {
            arcObject = window.arctrl.XlsxController.Assay.fromFsWorkbook(fsWorkbook);
            console.log(`[ARCtrl] Parsed ArcAssay:`, arcObject);
            console.log(`[ARCtrl] ArcAssay Identifier: ${arcObject.Identifier}`);
        } else if (isaType === 'study') {
            const result = window.arctrl.XlsxController.Study.fromFsWorkbook(fsWorkbook);
            arcObject = result[0]; // First element is ArcStudy, second is assay identifiers
            console.log(`[ARCtrl] Parsed ArcStudy:`, arcObject);
            console.log(`[ARCtrl] ArcStudy Identifier: ${arcObject.Identifier}`);
        } else if (isaType === 'investigation') {
            arcObject = window.arctrl.XlsxController.Investigation.fromFsWorkbook(fsWorkbook);
            console.log(`[ARCtrl] Parsed ArcInvestigation:`, arcObject);
            console.log(`[ARCtrl] ArcInvestigation Identifier: ${arcObject.Identifier}`);
        }

        // Store the parsed ARCtrl object and FsWorkbook
        currentArcObject = arcObject;
        currentWorkbook = fsWorkbook;

        // Render using ARCtrl-aware renderer
        renderIsaPreview(container, fsWorkbook, arcObject, isaType);

    } catch (error) {
        console.error('[ARCtrl] Error loading ISA file:', error);
        console.error('[ARCtrl] Error stack:', error.stack);
        console.log('[ARCtrl] Falling back to ExcelJS');
        // Fallback to ExcelJS if ARCtrl fails
        await loadExcelFileWithExcelJS(content, container);
    }
}

/**
 * Load generic Excel file using ExcelJS
 */
async function loadExcelFileWithExcelJS(content, container) {
    const arrayBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);

    // Use ExcelJS to load the Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
        throw new Error('No worksheets found in Excel file');
    }

    // Store workbook and clear ARCtrl objects
    currentWorkbook = workbook;
    currentArcObject = null;
    currentIsaType = null;

    renderExcelPreview(container, workbook);
}

/**
 * Render ISA file preview using ARCtrl FsWorkbook
 */
function renderIsaPreview(container, fsWorkbook, arcObject, isaType) {
    const worksheets = fsWorkbook.GetWorksheets();

    let html = '<div class="excel-preview isa-preview">';

    // Add ISA file info banner
    html += `
        <div class="alert alert-info mb-3">
            <strong>📋 ISA-Tab ${isaType.charAt(0).toUpperCase() + isaType.slice(1)} File</strong>
            <br><small>Loaded with ARCtrl - ${arcObject?.Identifier || 'Unknown ID'}</small>
        </div>
    `;

    // Add Save Excel button
    html += '<div class="mb-3"><button class="btn btn-primary btn-sm" onclick="saveExcelFile()">💾 Save ISA File</button></div>';

    // Add sheet tabs if multiple sheets
    if (worksheets.length > 1) {
        html += '<div class="sheet-tabs mb-3">';
        worksheets.forEach((sheet, index) => {
            const isActive = index === currentActiveSheet;
            html += `
                <button class="sheet-tab ${isActive ? 'active' : ''}"
                        onclick="switchExcelSheet(${index})"
                        data-sheet-index="${index}">
                    ${sheet.Name || `Sheet ${index + 1}`}
                </button>
            `;
        });
        html += '</div>';
    }

    // Render current sheet from FsWorkbook
    html += '<div class="excel-sheet-container">';
    html += renderFsWorksheet(worksheets[currentActiveSheet]);
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Render FsWorksheet from ARCtrl
 * Based on FsSpreadsheet transpiled F# code structure
 */
function renderFsWorksheet(fsWorksheet) {
    if (!fsWorksheet) {
        return '<p>Empty worksheet</p>';
    }

    let html = '<div class="excel-sheet">';

    try {
        // Access Rows property (F# transpiled getter)
        const rows = fsWorksheet.Rows;

        if (!rows || rows.length === 0) {
            return '<p>Empty worksheet - no data found</p>';
        }

        console.log(`[ARCtrl] Rendering ${rows.length} rows from FsWorksheet`);

        // Calculate dimensions
        const rowCount = Math.min(rows.length, 500);
        let maxCols = 0;

        // Find max column count by converting Cells iterable to array
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const cellsArray = Array.from(row.Cells);
                if (cellsArray.length > maxCols) {
                    maxCols = cellsArray.length;
                }
            } catch (e) {
                console.warn(`[ARCtrl] Error accessing cells in row ${i}:`, e);
            }
        }

        const colCount = Math.min(maxCols, 50);
        console.log(`[ARCtrl] Table dimensions: ${rowCount} rows x ${colCount} cols`);

        // Create table
        html += '<table class="table table-bordered excel-table" id="excel-table-editable">';

        // Generate column headers (A, B, C, etc.)
        html += '<thead><tr><th style="width: 40px;">#</th>';
        for (let col = 1; col <= colCount; col++) {
            const colLetter = numberToExcelColumn(col);
            html += `<th style="min-width: 100px;">${colLetter}</th>`;
        }
        html += '</tr></thead><tbody>';

        // Generate rows from FsWorksheet
        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
            const row = rows[rowIdx];
            html += `<tr><td class="row-header">${row.Index || rowIdx + 1}</td>`;

            try {
                // Get cells as array for indexing
                const cellsArray = Array.from(row.Cells);

                for (let col = 1; col <= colCount; col++) {
                    let cellValue = '';
                    const cellKey = `${rowIdx + 1}-${col}`;

                    try {
                        // Find cell at this column index (FsCell has ColumnNumber property)
                        const cell = cellsArray.find(c => c.ColumnNumber === col);

                        if (cell && cell.Value !== null && cell.Value !== undefined) {
                            cellValue = String(cell.Value);
                        }
                    } catch (error) {
                        // Silent fail for individual cell access
                    }

                    // Check if this cell has been edited
                    const isModified = cellChanges[currentActiveSheet] && cellChanges[currentActiveSheet][cellKey];
                    const modifiedStyle = isModified ? 'background-color: #fff3cd;' : '';

                    html += `<td contenteditable="true"
                                data-row="${rowIdx + 1}"
                                data-col="${col}"
                                style="${modifiedStyle}"
                                onblur="handleCellEdit(this, ${rowIdx + 1}, ${col})"
                                title="${cellValue}">${cellValue}</td>`;
                }
            } catch (rowError) {
                console.error(`[ARCtrl] Error rendering row ${rowIdx}:`, rowError);
                // Fill with empty cells if row fails
                for (let col = 1; col <= colCount; col++) {
                    html += `<td contenteditable="true"></td>`;
                }
            }

            html += '</tr>';
        }

        html += '</tbody></table>';

        // Add info about truncation if applicable
        if (rows.length > 500 || maxCols > 50) {
            html += `
                <div class="excel-info mt-2">
                    <small class="text-muted">
                        Showing ${Math.min(rowCount, 500)} of ${rows.length} rows,
                        ${Math.min(colCount, 50)} of ${maxCols} columns
                    </small>
                </div>
            `;
        }

    } catch (error) {
        console.error('[ARCtrl] Error rendering FsWorksheet:', error);
        console.error('[ARCtrl] Error stack:', error.stack);
        html += `<p class="text-danger">Error rendering worksheet: ${error.message}</p>`;
        html += `<pre class="text-muted">${error.stack}</pre>`;
    }

    html += '</div>';
    return html;
}

function renderExcelPreview(container, workbook) {
    const worksheets = workbook.worksheets;

    let html = '<div class="excel-preview">';

    // Add Save Excel button
    html += '<div class="mb-3"><button class="btn btn-primary btn-sm" onclick="saveExcelFile()">💾 Save Excel File</button></div>';

    // Add sheet tabs if multiple sheets
    if (worksheets.length > 1) {
        html += '<div class="sheet-tabs mb-3">';
        worksheets.forEach((sheet, index) => {
            const isActive = index === currentActiveSheet;
            html += `
                <button class="sheet-tab ${isActive ? 'active' : ''}"
                        onclick="switchExcelSheet(${index})"
                        data-sheet-index="${index}">
                    ${sheet.name || `Sheet ${index + 1}`}
                </button>
            `;
        });
        html += '</div>';
    }

    // Render current sheet
    html += '<div class="excel-sheet-container">';
    html += renderExcelSheet(worksheets[currentActiveSheet]);
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

function renderExcelSheet(worksheet) {
    if (!worksheet) {
        return '<p>Empty worksheet</p>';
    }

    let html = '<div class="excel-sheet">';

    // Use ExcelJS API - calculate actual dimensions
    const actualRowCount = worksheet.actualRowCount || worksheet.rowCount || 0;
    const actualColCount = worksheet.actualColumnCount || worksheet.columnCount || 0;

    // If truly empty, show message
    if (actualRowCount === 0 && actualColCount === 0) {
        return '<p>Empty worksheet - no data found</p>';
    }

    const rowCount = Math.min(Math.max(actualRowCount, 1), 500);
    const colCount = Math.min(Math.max(actualColCount, 1), 50);

    // Create table
    html += '<table class="table table-bordered excel-table" id="excel-table-editable">';

    // Generate column headers (A, B, C, etc.)
    html += '<thead><tr><th style="width: 40px;">#</th>';
    for (let col = 1; col <= colCount; col++) {
        const colLetter = numberToExcelColumn(col);
        html += `<th style="min-width: 100px;">${colLetter}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Generate rows using ExcelJS getRow() method
    for (let rowIdx = 1; rowIdx <= rowCount; rowIdx++) {
        html += `<tr><td class="row-header">${rowIdx}</td>`;

        const row = worksheet.getRow(rowIdx);

        for (let col = 1; col <= colCount; col++) {
            let cellValue = '';
            const cellKey = `${rowIdx}-${col}`;

            try {
                const cell = row.getCell(col);

                if (cell && cell.value !== null && cell.value !== undefined) {
                    if (typeof cell.value === 'object' && cell.value.result) {
                        cellValue = String(cell.value.result);
                    } else if (cell.value instanceof Date) {
                        cellValue = cell.value.toLocaleDateString();
                    } else if (typeof cell.value === 'object' && cell.value.richText) {
                        cellValue = cell.value.richText.map(t => t.text).join('');
                    } else {
                        cellValue = String(cell.value);
                    }
                }
            } catch (error) {
                // Silent fail for cell access
            }

            // Check if this cell has been edited
            const isModified = cellChanges[currentActiveSheet] && cellChanges[currentActiveSheet][cellKey];
            const modifiedStyle = isModified ? 'background-color: #fff3cd;' : '';

            html += `<td contenteditable="true"
                        data-row="${rowIdx}"
                        data-col="${col}"
                        style="${modifiedStyle}"
                        onblur="handleCellEdit(this, ${rowIdx}, ${col})"
                        title="${cellValue}">${cellValue}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';

    // Add info about truncation if applicable
    if (worksheet.rowCount > 500 || worksheet.columnCount > 50) {
        html += `
            <div class="excel-info mt-2">
                <small class="text-muted">
                    Showing ${Math.min(rowCount, 500)} of ${worksheet.rowCount} rows,
                    ${Math.min(colCount, 50)} of ${worksheet.columnCount} columns
                </small>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

function numberToExcelColumn(num) {
    let result = '';
    while (num > 0) {
        num--;
        result = String.fromCharCode(65 + (num % 26)) + result;
        num = Math.floor(num / 26);
    }
    return result;
}

function switchExcelSheet(sheetIndex) {
    if (!currentWorkbook) return;

    currentActiveSheet = sheetIndex;
    console.log(`[Excel Preview] Switching to sheet ${sheetIndex}`);

    // Update active tab
    document.querySelectorAll('.sheet-tab').forEach((tab, index) => {
        tab.classList.toggle('active', index === sheetIndex);
    });

    // Re-render sheet content in all containers
    const sheetContainers = document.querySelectorAll('.excel-sheet-container');
    console.log(`[Excel Preview] Found ${sheetContainers.length} sheet container(s)`);

    sheetContainers.forEach(sheetContainer => {
        // Check if it's FsWorkbook (ARCtrl) or ExcelJS workbook
        if (currentIsaType && currentWorkbook.GetWorksheets) {
            // ARCtrl FsWorkbook
            const worksheets = currentWorkbook.GetWorksheets();
            console.log(`[Excel Preview] Rendering ARCtrl worksheet ${sheetIndex} with ${worksheets[sheetIndex].Rows.length} rows`);
            sheetContainer.innerHTML = renderFsWorksheet(worksheets[sheetIndex]);
        } else if (currentWorkbook.worksheets) {
            // ExcelJS workbook
            console.log(`[Excel Preview] Rendering ExcelJS worksheet ${sheetIndex}`);
            sheetContainer.innerHTML = renderExcelSheet(currentWorkbook.worksheets[sheetIndex]);
        }
    });
}

function handleCellEdit(cell, row, col) {
    const newValue = cell.textContent.trim();
    const cellKey = `${row}-${col}`;

    // Initialize sheet changes if needed
    if (!cellChanges[currentActiveSheet]) {
        cellChanges[currentActiveSheet] = {};
    }

    // Store the change
    cellChanges[currentActiveSheet][cellKey] = { row, col, value: newValue };

    // Visual feedback - highlight edited cell
    cell.style.backgroundColor = '#fff3cd';
}

async function saveExcelFile() {
    if (!currentWorkbook || !currentExcelFilePath) {
        alert('No Excel file loaded for saving');
        return;
    }

    try {
        console.log(`[Save] Saving ${currentIsaType ? 'ISA-' + currentIsaType : 'Excel'} file: ${currentExcelFilePath}`);

        if (currentIsaType && currentArcObject && window.Xlsx) {
            // Use ARCtrl to save ISA files
            await saveIsaFileWithArctrl();
        } else {
            // Use ExcelJS to save generic Excel files
            await saveExcelFileWithExcelJS();
        }

        // Clear changes tracking
        cellChanges = {};

        // Show success message
        alert(`${currentIsaType ? 'ISA file' : 'Excel file'} saved successfully!`);

        // Reload preview to show saved state
        const container = document.getElementById('preview-content');
        await previewExcelFile(currentExcelFilePath, container);

    } catch (error) {
        console.error('Error saving Excel file:', error);
        alert('Error saving file: ' + error.message);
    }
}

/**
 * Save ISA file using ARCtrl - applies cell changes and preserves ISA structure
 */
async function saveIsaFileWithArctrl() {
    console.log('[ARCtrl] Saving ISA file with ARCtrl');

    // Apply all cell changes to the FsWorkbook
    for (const [sheetIndex, changes] of Object.entries(cellChanges)) {
        const worksheets = currentWorkbook.GetWorksheets();
        const worksheet = worksheets[parseInt(sheetIndex)];
        if (!worksheet) continue;

        for (const [cellKey, change] of Object.entries(changes)) {
            try {
                const row = worksheet.Rows[change.row - 1];
                if (row && row.Cells) {
                    const cell = row.Cells[change.col - 1];
                    if (cell) {
                        cell.Value = change.value;
                        console.log(`[ARCtrl] Updated cell ${cellKey} to: ${change.value}`);
                    }
                }
            } catch (error) {
                console.error(`[ARCtrl] Error updating cell ${cellKey}:`, error);
            }
        }
    }

    // Write FsWorkbook back to memfs using Xlsx.toFile
    await window.Xlsx.toFile(currentExcelFilePath, currentWorkbook);
    console.log(`[ARCtrl] Successfully saved ISA file to: ${currentExcelFilePath}`);
}

/**
 * Save generic Excel file using ExcelJS
 */
async function saveExcelFileWithExcelJS() {
    console.log('[ExcelJS] Saving Excel file with ExcelJS');

    // Apply all cell changes to the ExcelJS workbook
    for (const [sheetIndex, changes] of Object.entries(cellChanges)) {
        const worksheet = currentWorkbook.worksheets[parseInt(sheetIndex)];
        if (!worksheet) continue;

        for (const [cellKey, change] of Object.entries(changes)) {
            const cell = worksheet.getRow(change.row).getCell(change.col);
            cell.value = change.value;
        }
    }

    // Generate updated Excel file
    const buffer = await currentWorkbook.xlsx.writeBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Write back to memfs
    fs.writeFileSync(currentExcelFilePath, uint8Array);
    console.log(`[ExcelJS] Successfully saved Excel file to: ${currentExcelFilePath}`);
}

// Offcanvas Functions
function showOffcanvasPreview() {
    if (!currentPreviewFile) return;

    // Copy content from side panel to offcanvas
    const sideContent = document.getElementById('preview-content').innerHTML;
    const offcanvasContent = document.getElementById('offcanvas-content');
    const offcanvasTitle = document.getElementById('offcanvas-title');

    // Update title
    offcanvasTitle.textContent = document.getElementById('preview-title').textContent;

    // Copy content
    offcanvasContent.innerHTML = sideContent;

    // Show navigation if it's an Excel file with multiple sheets
    const navigation = document.getElementById('preview-navigation');
    if (currentWorkbook && currentWorkbook.worksheets && currentWorkbook.worksheets.length > 1) {
        navigation.style.display = 'block';
        renderSheetNavigation();
    } else {
        navigation.style.display = 'none';
        navigation.innerHTML = ''; // Clear the navigation content
    }

    // Show the offcanvas
    const offcanvas = new bootstrap.Offcanvas(document.getElementById('preview-offcanvas'));
    offcanvas.show();
}

function showCompactPreview() {
    // Hide the offcanvas and show the side panel
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('preview-offcanvas'));
    if (offcanvas) {
        offcanvas.hide();
    }

    // Ensure side panel is visible
    if (currentPreviewFile) {
        const previewPanel = document.getElementById('preview-panel');
        const mainContent = document.querySelector('.main-content');
        previewPanel.style.display = 'flex';
        mainContent.classList.add('with-preview');
    }
}

function renderSheetNavigation() {
    if (!currentWorkbook || !currentWorkbook.worksheets) return;

    const navigation = document.getElementById('preview-navigation');
    let html = '<div class="sheet-tabs">';

    currentWorkbook.worksheets.forEach((sheet, index) => {
        const isActive = index === currentActiveSheet;
        html += `
            <button class="sheet-tab ${isActive ? 'active' : ''}"
                    onclick="switchExcelSheetOffcanvas(${index})"
                    data-sheet-index="${index}">
                ${sheet.name || `Sheet ${index + 1}`}
            </button>
        `;
    });

    html += '</div>';
    navigation.innerHTML = html;
}

function switchExcelSheetOffcanvas(sheetIndex) {
    currentActiveSheet = sheetIndex;

    // Update both side panel and offcanvas
    if (currentWorkbook) {
        // Update side panel
        const sideSheetContainer = document.querySelector('#preview-content .excel-sheet-container');
        if (sideSheetContainer) {
            sideSheetContainer.innerHTML = renderExcelSheet(currentWorkbook.worksheets[sheetIndex]);
        }

        // Update offcanvas
        const offcanvasSheetContainer = document.querySelector('#offcanvas-content .excel-sheet-container');
        if (offcanvasSheetContainer) {
            offcanvasSheetContainer.innerHTML = renderExcelSheet(currentWorkbook.worksheets[sheetIndex]);
        }

        // Update navigation
        renderSheetNavigation();

        // Update side panel tabs too
        document.querySelectorAll('.sheet-tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === sheetIndex);
        });
    }
}

// Enhanced File Type Detection
function getFileIcon(extension) {
    const iconMap = {
        // Text files
        'txt': '📝',
        'md': '📝',
        'rtf': '📝',

        // Images
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'bmp': '🖼️',
        'svg': '🖼️',
        'webp': '🖼️',
        'ico': '🖼️',

        // Tables and data
        'csv': '📊',
        'tsv': '📊',
        'xlsx': '📊',
        'xls': '📊',

        // Documents
        'pdf': '📕',
        'doc': '📄',
        'docx': '📄',
        'odt': '📄',
        'ppt': '📑',
        'pptx': '📑',

        // Archives
        'zip': '📦',
        'rar': '📦',
        'tar': '📦',
        'gz': '📦',
        '7z': '📦',

        // Code
        'js': '⚙️',
        'html': '🌐',
        'css': '🎨',
        'json': '🔧',
        'xml': '🔧',
        'py': '🐍',
        'java': '☕',
        'cpp': '⚡',
        'c': '⚡',
        'php': '🐘',
        'rb': '💎',
        'go': '🐹',
        'sql': '🗃️',

        // Media
        'mp3': '🎵',
        'wav': '🎵',
        'flac': '🎵',
        'ogg': '🎵',
        'mp4': '🎬',
        'avi': '🎬',
        'mov': '🎬',
        'webm': '🎬',

        // Other
        'log': '📋',
        'cfg': '⚙️',
        'conf': '⚙️',
        'ini': '⚙️',
        'yml': '⚙️',
        'yaml': '⚙️'
    };

    return iconMap[extension] || '📄';
}

// Existing buildTree and refreshTree functions remain but ensure they sync with main area

// =============================================================================
// FILE SYSTEM PATH UTILITIES
// =============================================================================

// Normalize path separators to forward slashes
function normalizePathSeparators(str) {
    const path = require('path');
    const normalizedPath = path.normalize(str);
    return normalizedPath.replace(/\\/g, '/');
}

// Get directory name from path (like path.dirname)
function memfsPathDirname(filePath) {
    // Normalize separators
    filePath = filePath.replace(/\\/g, '/');

    // Handle edge cases
    if (!filePath || filePath === '/' || filePath === '.') {
        return '/';
    }

    // Remove trailing slash
    if (filePath.endsWith('/') && filePath.length > 1) {
        filePath = filePath.slice(0, -1);
    }

    // Get directory part
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) {
        return '.';
    }
    if (lastSlash === 0) {
        return '/';
    }

    return filePath.substring(0, lastSlash);
}

// Join path segments (like path.join)
function memfsPathJoin(...segments) {
    // Filter out empty segments and normalize
    const filtered = segments.filter(s => s && s !== '');

    if (filtered.length === 0) {
        return '.';
    }

    // Join with forward slashes
    let joined = filtered.join('/');

    // Normalize: remove double slashes, handle . and ..
    const parts = [];
    const tokens = joined.split('/');

    for (const token of tokens) {
        if (token === '' || token === '.') {
            continue;
        }
        if (token === '..') {
            if (parts.length > 0 && parts[parts.length - 1] !== '..') {
                parts.pop();
            } else {
                parts.push('..');
            }
        } else {
            parts.push(token);
        }
    }

    // Handle absolute paths
    const isAbsolute = joined.startsWith('/');
    let result = parts.join('/');

    if (isAbsolute) {
        result = '/' + result;
    }

    return result || '.';
}

// Read directory contents (async)
async function readDirectory(dir) {
    try {
        const entries = fs.readdirSync(dir);
        return entries;
    } catch (error) {
        console.error('Error reading directory:', error);
        return [];
    }
}

// Get directory structure for UI display
function getDirectoryStructure(gitSubfolder = '') {
    // Clean and analyze the path
    const cleanPath = gitSubfolder.replace(/^\/+|\/+$/g, '');

    if (!cleanPath) {
        return {
            isValid: false,
            type: 'root',
            message: 'Please select a folder from the file browser'
        };
    }

    const parts = cleanPath.split('/').filter(p => p);

    // Check what level we're at
    if (parts.length === 0) {
        return {
            isValid: false,
            type: 'root',
            message: 'Root level selected. Please select a folder (assays/studies/workflows)'
        };
    }

    const firstLevel = parts[0].toLowerCase();
    const secondLevel = parts[1] || null;

    // Determine structure type
    if (firstLevel === 'assays' || firstLevel === 'studies' || firstLevel === 'workflows') {
        if (!secondLevel) {
            // Selected the container folder itself
            return {
                isValid: true,
                type: 'container',
                container: firstLevel,
                message: `Will create new item in ${firstLevel}/`,
                targetPath: cleanPath
            };
        } else {
            // Selected a specific assay/study/workflow
            return {
                isValid: true,
                type: 'specific',
                container: firstLevel,
                itemName: secondLevel,
                message: `Will add to existing: ${firstLevel}/${secondLevel}`,
                targetPath: cleanPath
            };
        }
    } else {
        // Not a standard ARC folder
        return {
            isValid: false,
            type: 'invalid',
            message: 'Please select a folder inside assays/, studies/, or workflows/'
        };
    }
}

// Set target path in UI
function setTargetPath(path) {
    const targetPathInput = document.getElementById("targetPath");
    if (targetPathInput) {
        // Normalize the path
        const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
        targetPathInput.value = normalized;

        // Analyze and show feedback
        const structure = getDirectoryStructure(normalized);

        // Update UI feedback
        const feedbackElement = document.getElementById("pathFeedback");
        if (feedbackElement) {
            if (structure.isValid) {
                feedbackElement.className = "alert alert-success mt-2";
                feedbackElement.textContent = `✓ ${structure.message}`;
                targetPathInput.classList.add("is-valid");
                targetPathInput.classList.remove("is-invalid");
            } else {
                feedbackElement.className = "alert alert-warning mt-2";
                feedbackElement.textContent = structure.message;
                targetPathInput.classList.remove("is-valid");
                targetPathInput.classList.add("is-invalid");
            }
        }
    }
}