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

// Existing buildTree and refreshTree functions remain but ensure they sync with main area