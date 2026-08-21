/**
 * ARC Skeleton Service for elab2arc
 * Ensures the canonical top-level ARC folders (assays/, studies/, workflows/, runs/)
 * exist in the target repository before any conversion writes content into it.
 *
 * Why this exists: elab2arc's own "Create new ARC" flow (createNewArc() in
 * elab2arc-core...js) already gets a complete skeleton for free, because it builds the
 * ARC via ARCtrl's `ARC.fromArcInvestigation()` + `GetWriteContracts()`, and ARCtrl's
 * own `UpdateFileSystem()` (see ARCAux_updateFSByARC in
 * js/node_modules/@nfdi4plants/arctrl/dist/ts/ts/ARC.js) always builds all four
 * top-level folders - each an empty folder + a `.gitkeep`, via
 * `FileSystemTree.createAssaysFolder([])` / `createStudiesFolder([])` /
 * `createWorkflowsFolder([])` / `createRunsFolder([])` - regardless of whether any
 * assays/studies/workflows/runs are registered yet.
 *
 * But a conversion can also be pointed at an *existing* ARC that was never created
 * through that flow (created manually, via a host's own "new repo" UI, via a bare
 * `git init`, etc.) - that ARC never got the skeleton, and nothing in the conversion
 * path checked for or repaired that. Confirmed as the real-world cause of a missing
 * skeleton on a live test repo by reading its actual commit history: no
 * "Initial ARC setup" commit (createNewArc()'s commit message) anywhere in it.
 *
 * This module is the fix: called once per conversion run, before any assay/study
 * content is written, to create whichever of the four folders are missing - using the
 * exact same empty-folder-plus-.gitkeep convention ARCtrl itself uses, so a
 * self-healed ARC is indistinguishable from one ARCtrl built from scratch.
 *
 * Deliberately isolated in its own file (not inlined into the ~8,700-line core file):
 * keeps this single-purpose, easy to unit-test in isolation, and easy to audit/revert
 * on its own.
 *
 * @module ArcSkeletonService
 * @version 1.0.0
 */

// Canonical top-level ARC folders. Order matches ARCtrl's own FileSystemTree.createRootFolder
// (assays, studies, workflows, runs) - see FileSystemTree.js / ARCAux_updateFSByARC in ARC.js.
const ARC_SKELETON_FOLDERS = ['assays', 'studies', 'workflows', 'runs'];

/**
 * Ensure every canonical top-level ARC folder exists under gitRoot, creating an empty
 * folder + `.gitkeep` (and staging it with git.add) for any that are missing.
 *
 * Never throws. Every failure mode - bad parameters, a filesystem error on one
 * specific folder, a git.add failure - is caught and reported in the returned result
 * instead, so a problem here can never abort a conversion that's already under way
 * (matching this codebase's existing per-entry isolation pattern in
 * processElabEntries()). A single folder's failure does not stop the other three from
 * being checked.
 *
 * Folders that already contain real content (e.g. `assays/` after a prior conversion)
 * are left completely untouched - this function only ever creates a `.gitkeep` inside
 * an otherwise-empty or entirely-missing folder, never modifies existing files.
 *
 * @param {object} fs - memfs filesystem instance (window.FS.fs). Must implement
 *   existsSync, mkdirSync, writeFileSync, readdirSync.
 * @param {object} git - isomorphic-git instance (window.git). Must implement add().
 * @param {string} gitRoot - root directory of the already-cloned ARC (trailing slash
 *   optional). The ARC must already exist on the filesystem - this function does not
 *   clone or create the repository itself.
 * @returns {Promise<{
 *   created: string[],
 *   alreadyPresent: string[],
 *   errors: {folder: string, error: string}[]
 * }>} Structured result: which folders were newly created, which already existed
 *   (with or without content), and any per-folder errors encountered.
 */
async function ensureArcSkeleton(fs, git, gitRoot) {
  const result = { created: [], alreadyPresent: [], errors: [] };

  // --- Robust setup: validate every input explicitly before touching anything ---
  if (!fs || typeof fs.existsSync !== 'function' || typeof fs.mkdirSync !== 'function' ||
      typeof fs.writeFileSync !== 'function' || typeof fs.readdirSync !== 'function') {
    const msg = 'ensureArcSkeleton: fs parameter is missing or does not implement the required memfs API (existsSync/mkdirSync/writeFileSync/readdirSync)';
    console.error('[ArcSkeleton]', msg, fs);
    result.errors.push({ folder: '(setup)', error: msg });
    return result;
  }
  if (!git || typeof git.add !== 'function') {
    const msg = 'ensureArcSkeleton: git parameter is missing or does not implement add()';
    console.error('[ArcSkeleton]', msg, git);
    result.errors.push({ folder: '(setup)', error: msg });
    return result;
  }
  if (!gitRoot || typeof gitRoot !== 'string' || gitRoot.trim() === '') {
    const msg = `ensureArcSkeleton: gitRoot must be a non-empty string, got: ${JSON.stringify(gitRoot)}`;
    console.error('[ArcSkeleton]', msg);
    result.errors.push({ folder: '(setup)', error: msg });
    return result;
  }

  const root = gitRoot.endsWith('/') ? gitRoot.slice(0, -1) : gitRoot;

  let rootExists;
  try {
    rootExists = fs.existsSync(root);
  } catch (e) {
    const msg = `ensureArcSkeleton: fs.existsSync threw while checking gitRoot "${root}": ${(e && e.message) || e}`;
    console.error('[ArcSkeleton]', msg);
    result.errors.push({ folder: '(setup)', error: msg });
    return result;
  }
  if (!rootExists) {
    const msg = `ensureArcSkeleton: gitRoot "${root}" does not exist on the filesystem - the ARC must already be cloned before calling this`;
    console.error('[ArcSkeleton]', msg);
    result.errors.push({ folder: '(setup)', error: msg });
    return result;
  }

  // --- Per-folder check/create, each isolated so one failure can't block the rest ---
  for (const folder of ARC_SKELETON_FOLDERS) {
    const folderPath = `${root}/${folder}`;
    const gitkeepPath = `${folderPath}/.gitkeep`;
    const gitkeepRelPath = `${folder}/.gitkeep`;

    try {
      const folderExists = fs.existsSync(folderPath);
      const hasContent = folderExists && fs.readdirSync(folderPath).length > 0;

      if (hasContent) {
        // Real content already present (e.g. assays/ from a prior conversion) - never
        // touch it.
        result.alreadyPresent.push(folder);
        continue;
      }
      if (folderExists && fs.existsSync(gitkeepPath)) {
        // Empty folder that's already correctly marked - nothing to do.
        result.alreadyPresent.push(folder);
        continue;
      }

      if (!folderExists) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      fs.writeFileSync(gitkeepPath, '');
      await git.add({ fs, dir: root, filepath: gitkeepRelPath });

      result.created.push(folder);
      console.log(`[ArcSkeleton] Created missing folder: ${folder}/ (+ .gitkeep, staged)`);
    } catch (e) {
      const message = (e && e.message) || String(e);
      console.error(`[ArcSkeleton] Failed to ensure folder "${folder}":`, message);
      result.errors.push({ folder, error: message });
      // Deliberately no rethrow - move on to the next folder.
    }
  }

  return result;
}

// --- User-facing on/off toggle (Token tab) -----------------------------------------
// Self-heal is additive-only (it only ever creates a missing empty folder + .gitkeep,
// never touches existing content) and directly fixes a real observed bug, so it
// defaults to enabled - but it does add an extra staged change to every conversion,
// so it's a visible, persisted, one-click-revertible toggle rather than forced-on.

const SELF_HEAL_STORAGE_KEY = 'arcSkeletonSelfHeal';

/**
 * Whether self-heal should run. Defaults to true (enabled) when the user has never
 * touched the toggle - explicit 'false' in localStorage is the only way to disable it.
 * @returns {boolean}
 */
function isSelfHealEnabled() {
  const stored = localStorage.getItem(SELF_HEAL_STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

/**
 * Persist the self-heal on/off preference. Called from the Token tab checkbox's
 * onchange handler.
 * @param {boolean} enabled
 */
function setSelfHealEnabled(enabled) {
  localStorage.setItem(SELF_HEAL_STORAGE_KEY, enabled ? 'true' : 'false');
  console.log(`[ArcSkeleton] Self-heal ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Checkbox onchange handler (referenced directly from index.html's Token tab).
 * @param {boolean} enabled
 */
function toggleArcSkeletonSelfHeal(enabled) {
  setSelfHealEnabled(enabled);
}

/**
 * Sync the Token tab checkbox to the persisted (or default) state. Safe to call even
 * if the checkbox isn't in the DOM yet (e.g. module loaded before the page's own
 * init logic runs) - it's a no-op in that case rather than an error.
 */
function syncSelfHealCheckbox() {
  const checkbox = document.getElementById('enableArcSkeletonSelfHeal');
  if (checkbox) {
    checkbox.checked = isSelfHealEnabled();
  }
}

// Export public API
window.ArcSkeletonService = {
  ensureArcSkeleton,
  isSelfHealEnabled,
  setSelfHealEnabled,
  syncSelfHealCheckbox,
  ARC_SKELETON_FOLDERS
};

console.log('[ArcSkeleton] ARC Skeleton Service loaded (ensures assays/studies/workflows/runs exist before conversion)');
