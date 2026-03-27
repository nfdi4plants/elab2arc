/**
 * ARCtrl Bundle Entry Point
 *
 * This file is the entry point for the webpack bundle that provides:
 * - ARCtrl library exports (ARC, ArcAssay, ArcTable, Comment, etc.)
 * - Excel file handling via FsSpreadsheet Xlsx
 * - In-memory filesystem via memfs
 * - Helper functions for ARC operations
 *
 * Exports are attached to the window object for use in the main application.
 */

// Import ARCtrl (includes bundled FsSpreadsheet)
import * as arctrl from '@nfdi4plants/arctrl';

// Import Xlsx wrapper for Excel file operations
import { Xlsx } from './Xlsx.js';

// Import memfs for in-memory filesystem
import { fs, vol, Volume } from 'memfs';
import path from 'path-browserify';

// ============================================================
// Helper Functions
// ============================================================

/**
 * Normalize path separators to forward slashes
 * @param {string} str - Path string to normalize
 * @returns {string} Normalized path
 */
function normalizePathSeparators (str) {
  const normalizedPath = path.normalize(str)
  return normalizedPath.replace(/\\/g, '/');
}

/**
 * Fulfill write contract for ARC operations
 * @param {string} basePath - Base directory path
 * @param {object} contract - ARC write contract
 */
async function fulfillWriteContract (basePath, contract) {
    function ensureDirectory (filePath) {
        let dirPath = path.dirname(filePath)
        if (!fs.existsSync(dirPath)){
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    const p = path.join(basePath, contract.Path)
    if (contract.Operation === "CREATE") {
        if (contract.DTO == undefined) {
            ensureDirectory(p)
            fs.writeFileSync(p, "")
        } else if (contract.DTOType === "ISA_Assay" || contract.DTOType === "ISA_Study" || contract.DTOType === "ISA_Investigation") {
            ensureDirectory(p)
            await Xlsx.toFile(p, contract.DTO)
        } else if (contract.DTOType === "PlainText") {
            ensureDirectory(p)
            fs.writeFileSync(p, contract.DTO)
        } else {
            console.log("Warning: The given contract is not a correct ARC write contract: ", contract)
        }
    }
}

/**
 * Fulfill read contract for ARC operations
 * @param {string} basePath - Base directory path
 * @param {object} contract - ARC read contract
 * @returns {Promise<object>} Contract DTO content
 */
async function fulfillReadContract (basePath, contract) {
  async function fulfill() {
      const normalizedPath = normalizePathSeparators(path.join(basePath, contract.Path))
      switch (contract.DTOType) {
          case "ISA_Assay":
          case "ISA_Study":
          case "ISA_Investigation":
              let fswb = await Xlsx.fromXlsxFile(normalizedPath)
              return fswb
          case "PlainText":
              let content = fs.readFileSync(normalizedPath, 'utf8')
              return content
          default:
              console.log(`Handling of ${contract.DTOType} in a READ contract is not yet implemented`)
      }
  }
  if (contract.Operation === "READ") {
      return await fulfill()
  } else {
      console.error(`Error (fulfillReadContract): "${contract}" is not a READ contract`)
  }
}

/**
 * Get all file paths in a directory recursively
 * @param {string} basePath - Base directory path
 * @returns {string[]} List of relative file paths
 */
function getAllFilePaths(basePath) {
  const filesList = []
  function loop (dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
          const filePath = path.join(dir, file);

          if (fs.statSync(filePath).isDirectory()) {
              loop(filePath);
          } else {
              const relativePath = path.relative(basePath, filePath);
              const normalizePath = normalizePathSeparators(relativePath)
              filesList.push(normalizePath);
          }
      }
  }
  loop(basePath)
  return filesList;
}

/**
 * Read ARC from filesystem
 * @param {string} basePath - Base directory path
 * @returns {Promise<object>} ARC object
 */
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

// ============================================================
// Window Exports - Helper Functions
// ============================================================

/**
 * Export ARC to JSON format
 * @param {string} ARCName - ARC directory name
 * @param {string} JSONname - Output JSON file name
 */
window.ARC2JSON = async function(ARCName, JSONname) {
    await read(ARCName).then(
        arc => {
            try {
                fs.writeFileSync(JSONname, arctrl.JsonController.Investigation.toISAJsonString(arc.ISA, void 0, true))
            } catch (err) {
                console.error(err);
            }
        }
    )
}

/**
 * Create a new assay with a basic annotation table
 * @param {string} assayName - Name for the assay
 * @param {string} tableName - Name for the annotation table (default: "newtable")
 */
window.newAssay = async function(assayName, tableName = "newtable") {
    try {
        // Create assay
        const myAssay = arctrl.ArcAssay.init(assayName);

        // Create annotation table
        const growth = arctrl.ArcTable.init(tableName);

        // Add input column with one value to table
        growth.AddColumn(arctrl.CompositeHeader.input(arctrl.IOType.source()), [arctrl.CompositeCell.createFreeText("Input1")]);

        // Add characteristic column with one value
        const oa_species = new arctrl.OntologyAnnotation("species", "GO", "GO:0123456");
        const oa_chlamy = new arctrl.OntologyAnnotation("Chlamy", "NCBI", "NCBI:0123456");
        growth.AddColumn(arctrl.CompositeHeader.characteristic(oa_species), [arctrl.CompositeCell.createTerm(oa_chlamy)]);

        // Add table to assay
        myAssay.AddTable(growth);

        // Transform object to generic spreadsheet
        let spreadsheet = arctrl.XlsxController.Assay.toFsWorkbook(myAssay);

        // Write spreadsheet to xlsx file
        const outPath = "arc/assay/" + assayName + "/isa.assay.xlsx";

        console.log(spreadsheet);

        await Xlsx.toFile(outPath, spreadsheet);
    } catch (err) {
        console.error(err);
    }
}

/**
 * Create a full assay with metadata and person information
 * @param {string} assayName - Name for the assay
 * @param {string} tableName - Name for the annotation table
 * @param {string} firstName - First name of the person
 * @param {string} familyName - Family name of the person
 * @param {string} email - Email of the person
 * @param {string} affiliation - Affiliation of the person
 * @param {string} comment - Generation comment (default: "generated by elab2arc")
 */
window.fullAssay = async function(assayName, tableName = "newtable", firstName, familyName, email, affiliation, comment = "generated by elab2arc") {
    try {
        const growth = arctrl.ArcTable.init(tableName);
        // Add input column with one value to table
        growth.AddColumn(arctrl.CompositeHeader.input(arctrl.IOType.source()), [arctrl.CompositeCell.createFreeText("Input1")]);

        // Add characteristic column with one value
        const oa_species = new arctrl.OntologyAnnotation("species", "GO", "GO:0123456");
        const oa_chlamy = new arctrl.OntologyAnnotation("Chlamy", "NCBI", "NCBI:0123456");
        growth.AddColumn(arctrl.CompositeHeader.characteristic(oa_species), [arctrl.CompositeCell.createTerm(oa_chlamy)]);

        // Create assay
        const roles = new arctrl.OntologyAnnotation("Researcher", "AGRO", "AGRO:00000373");

        // Note: Comment (not Comment$) in ARCtrl 3.0.1+
        let comments_p = arctrl.Comment.create("generation log", comment);
        const person = arctrl.Person.create(void 0, firstName, familyName, void 0, email, void 0, void 0, void 0, affiliation, [roles], [comments_p]);
        let comments_m = arctrl.Comment.create("name", "value");
        const myAssay = arctrl.ArcAssay.create("myassay", void 0, void 0, void 0, [growth], void 0, [person], [comments_m]);

        // Transform object to generic spreadsheet
        let spreadsheet = arctrl.XlsxController.Assay.toFsWorkbook(myAssay);

        // Write spreadsheet to xlsx file
        const outPath = "arc/assays/" + assayName + "/isa.assay.xlsx";

        console.log(spreadsheet);

        await Xlsx.toFile(outPath, spreadsheet);
    } catch (err) {
        console.error(err);
    }
}

// ============================================================
// Window Exports - Core Libraries
// ============================================================

// Export ARCtrl library to window
window.arctrl = arctrl;

// Export Xlsx module for Excel file operations
window.Xlsx = Xlsx;

// Export memfs filesystem
window.FS = { fs, Volume, vol };

// Log successful load
console.log('[ARCtrl] Bundle loaded successfully');
console.log('[ARCtrl] Version: 3.0.1');
console.log('[ARCtrl] window.Xlsx:', typeof window.Xlsx);
console.log('[ARCtrl] window.arctrl:', typeof window.arctrl);
console.log('[ARCtrl] window.FS:', typeof window.FS);