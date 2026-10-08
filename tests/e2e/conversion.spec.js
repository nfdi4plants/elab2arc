import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const GITLAB_API = 'https://git.nfdi4plants.org/api/v4';
const APP_URL = 'https://nfdi4plants.org/elab2arc/';

// elab2arc has a fully URL-driven, no-click entry point: softRoute() /
// executePreparedConversion() (js/elab2arc-core20260504.js ~7117-7276) read
// elabid/elabtoken/datahubtoken/targetPath/arcURL/llmDatamap/autoConvert
// straight off the query string and, with autoConvert=1, call multiConvert()
// itself once both connection checks resolve - no tab clicks or button
// presses needed. Only targetPath/arcURL/datahubURL/datahubAPISuffix/
// datahubSSOURL are decodeURIComponent()'d by the app; elabtoken/datahubtoken
// are used raw, so they must NOT be percent-encoded here.

function buildConversionUrl({ elabId, elabToken, datahubToken, targetPath, arcURL, llmMode }) {
  const parts = [
    `elabid=${elabId}`,
    `elabtoken=${elabToken}`,
    `datahubtoken=${datahubToken}`,
    `targetPath=${encodeURIComponent(targetPath)}`,
    `arcURL=${encodeURIComponent(arcURL)}`,
    `autoConvert=true`,
  ];
  if (llmMode) parts.push(`llmDatamap=true`);
  return `${APP_URL}?${parts.join('&')}#elabftw`;
}

async function latestCommitSha(projectId, token) {
  const res = await fetch(
    `${GITLAB_API}/projects/${projectId}/repository/commits?per_page=1`,
    { headers: { 'PRIVATE-TOKEN': token } }
  );
  if (!res.ok) {
    throw new Error(`GitLab API error ${res.status}: ${await res.text()}`);
  }
  const [commit] = await res.json();
  return commit?.id ?? null;
}

test('elab2arc conversion smoke test (URL-driven, no UI interaction)', async ({ page }) => {
  const llmMode = process.env.LLM_MODE === 'true';
  const elabId = process.env.ELABFTW_ID || '40';
  const projectId = process.env.E2E_DATAHUB_PROJECT_ID;
  const datahubToken = process.env.E2E_DATAHUB_TOKEN;
  const elabToken = process.env.ELABFTW_TOKEN;
  const targetPath = process.env.TARGET_PATH || 'elab2arc_test/assays';
  const arcURL = process.env.ARC_URL || 'https://git.nfdi4plants.org/elab/elab2arc_test.git';

  test.skip(
    !projectId || !datahubToken || !elabToken,
    'E2E_DATAHUB_PROJECT_ID / E2E_DATAHUB_TOKEN / ELABFTW_TOKEN secrets are not set'
  );

  // Pre-seed cloud-LLM consent so the LLM-enabled path never blocks on the
  // consent modal, which multiConvert() does not await (see
  // executePreparedConversion() - the modal open and the auto-convert call
  // race). Real consent, granted once by a human, is what should populate
  // this in practice; this just reproduces "already granted" for the
  // dataplan/dataplan-gemma provider group (js/modules/llm-consent-store.js).
  if (llmMode) {
    await page.addInitScript(() => {
      window.localStorage.setItem('llmCloudConsent_community', 'true');
    });
  }

  const beforeSha = await latestCommitSha(projectId, datahubToken);

  const url = buildConversionUrl({ elabId, elabToken, datahubToken, targetPath, arcURL, llmMode });
  await page.goto(url);

  // Real success signal from the app's own progress UI, not a fixed sleep.
  await page.waitForFunction(
    () => document.getElementById('pbarLabel')?.textContent?.includes('All conversions complete'),
    null,
    { timeout: 4 * 60 * 1000 }
  );
  await expect(page.locator('#toastContainer')).toContainText('converted to ARC format and pushed', { timeout: 10000 });

  const afterSha = await latestCommitSha(projectId, datahubToken);
  expect(afterSha, 'expected a new commit on elab2arc_test after conversion').not.toBe(beforeSha);

  // Hand the new commit off to the workflow's optional cleanup job.
  fs.writeFileSync('new-commit.sha', afterSha);

  // Export ISA-JSON through the app's own (already-authenticated, already
  // has the just-converted ARC in memfs) export path, for the workflow's
  // follow-up isatools validation step. Call the handler directly rather
  // than clicking the button - it lives inside #folderModal, which the
  // auto-convert flow never opens, so the button itself isn't "visible" to
  // Playwright's actionability checks even though the handler works fine
  // regardless of modal visibility.
  const outputDir = path.resolve('output');
  fs.mkdirSync(outputDir, { recursive: true });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.handleExportIsaJson());
  const download = await downloadPromise;
  await download.saveAs(path.join(outputDir, 'isa.json'));
});
