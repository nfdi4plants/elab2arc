/**
 * Xlsx Wrapper Module
 *
 * This module wraps FsSpreadsheet's Xlsx class for browser compatibility.
 * It provides Excel file read/write operations using ExcelJS (bundled with ARCtrl).
 *
 * The import path uses a short identifier that webpack rewrites via
 * NormalModuleReplacementPlugin to the actual file location.
 *
 * API:
 * - Xlsx.fromXlsxFile(path) - Read Excel file to FsWorkbook
 * - Xlsx.fromFile(path) - Alias for fromXlsxFile
 * - Xlsx.fromXlsxBytes(bytes) - Read bytes to FsWorkbook
 * - Xlsx.fromBytes(bytes) - Alias for fromXlsxBytes
 * - Xlsx.toXlsxFile(path, workbook) - Write FsWorkbook to Excel file (via memfs)
 * - Xlsx.toFile(path, workbook) - Alias for toXlsxFile
 * - Xlsx.toXlsxBytes(workbook) - Write FsWorkbook to bytes/buffer
 * - Xlsx.toBytes(workbook) - Alias for toXlsxBytes
 */

// Import from ARCtrl's bundled FsSpreadsheet
// Path is rewritten by webpack NormalModuleReplacementPlugin
import { Xlsx as FsXlsx } from 'fable_modules/FsSpreadsheet.Js.7.0.0-alpha.1/Xlsx.fs.js';

/**
 * Get the correct fs instance (window.FS.fs)
 * This ensures we use the same filesystem as git operations
 */
function getFs() {
    if (typeof window !== 'undefined' && window.FS && window.FS.fs) {
        return window.FS.fs;
    }
    // Fallback for non-browser environments (shouldn't happen in production)
    throw new Error('window.FS.fs not available - Xlsx.js requires browser context with memfs initialized');
}

/**
 * Write FsWorkbook to Excel file using memfs
 * This is a browser-compatible implementation that uses toXlsxBytes + writeFileSync
 * Uses window.FS.fs to ensure files are written to the same filesystem git uses
 * @param {string} path - File path in memfs
 * @param {object} workbook - FsWorkbook to write
 * @returns {Promise<void>}
 */
async function toXlsxFileBrowser(path, workbook) {
    console.log('[Xlsx.js] toXlsxFileBrowser called with path:', path);

    try {
        // Use toXlsxBytes to get the buffer
        console.log('[Xlsx.js] Calling FsXlsx.toXlsxBytes...');
        const buffer = await FsXlsx.toXlsxBytes(workbook);
        console.log('[Xlsx.js] Got buffer, size:', buffer.length, 'bytes');

        // Write to memfs using window.FS.fs (same fs instance as git operations)
        const uint8Array = new Uint8Array(buffer);
        // Strip leading slash for compatibility
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        console.log('[Xlsx.js] Writing to normalized path:', normalizedPath);

        const fs = getFs();
        console.log('[Xlsx.js] fs instance:', !!fs, 'is window.FS.fs:', fs === window.FS.fs);

        // Ensure parent directory exists before writing
        const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
        if (dirPath && !fs.existsSync(dirPath)) {
            console.log('[Xlsx.js] Creating directory:', dirPath);
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(normalizedPath, uint8Array);
        console.log('[Xlsx.js] Write successful!');
    } catch (error) {
        console.error('[Xlsx.js] Error in toXlsxFileBrowser:', error);
        throw error;
    }
}

/**
 * Read Excel file from memfs and return FsWorkbook
 * This is a browser-compatible implementation that uses readFileSync + fromXlsxBytes
 * Uses window.FS.fs to ensure files are read from the same filesystem git uses
 * @param {string} path - File path in memfs
 * @returns {Promise<object>} FsWorkbook
 */
async function fromXlsxFileBrowser(path) {
    // Read from memfs using window.FS.fs (same fs instance as git operations)
    const fs = getFs();
    // Strip leading slash for compatibility
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const buffer = fs.readFileSync(normalizedPath);
    // Use fromXlsxBytes to parse
    return await FsXlsx.fromXlsxBytes(buffer);
}

// Export a simple Xlsx object matching the expected API
// Using browser-compatible implementations for file operations
export const Xlsx = {
    // Read Excel file and return FsWorkbook (browser-compatible)
    fromXlsxFile: fromXlsxFileBrowser,

    // Alias for fromXlsxFile
    fromFile: fromXlsxFileBrowser,

    // Read bytes and return FsWorkbook
    fromXlsxBytes: FsXlsx.fromXlsxBytes,

    // Alias for fromXlsxBytes
    fromBytes: FsXlsx.fromBytes,

    // Write FsWorkbook to Excel file (browser-compatible)
    toXlsxFile: toXlsxFileBrowser,

    // Alias for toXlsxFile
    toFile: toXlsxFileBrowser,

    // Write FsWorkbook to bytes/buffer
    toXlsxBytes: FsXlsx.toXlsxBytes,

    // Alias for toXlsxBytes
    toBytes: FsXlsx.toBytes
};