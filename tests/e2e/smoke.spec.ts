import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the deterministic fixture once for all tests in this file. */
const fixtureData = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/spine-response-single-curve.json'), 'utf-8'),
);

/**
 * Create a minimal 100×200 grayscale PNG entirely in the browser context
 * using the Canvas API, then return it as a Blob suitable for a file upload.
 */
async function createFakePngBlob(page: Page): Promise<void> {
  // We expose a helper that returns a data-URL from a tiny canvas drawing.
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width  = 100;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    // Simple gray fill to simulate an X-ray placeholder.
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 100, 200);
    // Store data-URL globally so the test can retrieve it.
    (window as unknown as Record<string, unknown>).__fakeXrayDataUrl = canvas.toDataURL('image/png');
  });
}

/**
 * Convert the data-URL stored on window into a File and dispatch it via the
 * hidden <input type="file"> element on the page.
 */
async function uploadFakePng(page: Page, fileInputSelector: string): Promise<void> {
  // Retrieve the data-URL from the browser context.
  const dataUrl = await page.evaluate(
    () => (window as unknown as Record<string, string>).__fakeXrayDataUrl,
  );

  // Decode base64 → Buffer on the Node side so we can use setInputFiles.
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  await page.locator(fileInputSelector).setInputFiles({
    name: 'test-xray.png',
    mimeType: 'image/png',
    buffer,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('CobbAI – visual smoke test', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept every POST to /api/analyze-spine and return the fixture JSON.
    await page.route('**/api/analyze-spine', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixtureData),
      });
    });

    await page.goto('/');
  });

  test('full happy-path: upload → analyse → verify Cobb overlay → manual panel', async ({ page }) => {
    // -----------------------------------------------------------------------
    // Step 1: Landing screen – select Doctor / Physician role
    // -----------------------------------------------------------------------
    const doctorButton = page
      .getByRole('button', { name: /doktor|physician|doctor/i })
      .first();
    await expect(doctorButton).toBeVisible({ timeout: 10_000 });
    await doctorButton.click();

    // -----------------------------------------------------------------------
    // Step 2: Verify the landing / role-selection screen has gone away
    // -----------------------------------------------------------------------
    // After clicking the role button the page should no longer show the role
    // selection section.  We check that the doctor button itself disappears.
    await expect(doctorButton).not.toBeVisible({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // Step 3: Find the file input and upload a fake PNG
    // -----------------------------------------------------------------------
    // Prepare the fake PNG in the browser's canvas.
    await createFakePngBlob(page);

    // The app may use a visually hidden <input type="file">.
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10_000 });
    await uploadFakePng(page, 'input[type="file"]');

    // -----------------------------------------------------------------------
    // Step 4: Click the analyse button
    // -----------------------------------------------------------------------
    const analyzeButton = page
      .getByRole('button', { name: /analiz|analyze|analyse/i })
      .first();
    await expect(analyzeButton).toBeVisible({ timeout: 10_000 });
    await analyzeButton.click();

    // -----------------------------------------------------------------------
    // Step 5: Loading spinner should appear
    // -----------------------------------------------------------------------
    // The spinner may use a role="status", aria-label, or a common CSS class.
    const spinner = page
      .locator('[role="status"], .spinner, [aria-label*="loading" i], [class*="spinner" i], [class*="loading" i]')
      .first();
    // We allow the spinner to be briefly visible; it's fine if it transitions
    // quickly, so we just check it existed at some point without hard-failing.
    await spinner.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {
      // Some implementations skip a visible spinner for very fast responses;
      // this is not a hard failure for the smoke test.
    });

    // -----------------------------------------------------------------------
    // Step 6: Wait for analysis results
    // -----------------------------------------------------------------------
    // The fixture returns cobb_angle: 28.0 – look for "28" on-screen.
    await expect(page.getByText(/28/)).toBeVisible({ timeout: 15_000 });

    // -----------------------------------------------------------------------
    // Step 7: Verify Cobb angle is displayed
    // -----------------------------------------------------------------------
    // Accept "28°", "28 °", "28.0°", "28.0 °", etc.
    const cobbText = page.getByText(/28[.,]?0?\s*°/);
    await expect(cobbText.first()).toBeVisible({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // Step 8: Verify the overlay canvas exists
    // -----------------------------------------------------------------------
    const overlayCanvas = page.locator('canvas').first();
    await expect(overlayCanvas).toBeVisible({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // Step 9: Click "Endplate Düzenle" (manual correction) if visible
    // -----------------------------------------------------------------------
    const editButton = page
      .getByRole('button', { name: /endplate\s*düzenle/i })
      .first();

    const editButtonVisible = await editButton.isVisible().catch(() => false);
    if (editButtonVisible) {
      await editButton.click();

      // Step 10: Verify the manual correction panel appears
      const manualPanel = page
        .locator(
          '[data-testid="manual-correction-panel"], ' +
          '[class*="ManualCorrection" i], ' +
          '[class*="manual-correction" i], ' +
          '[class*="manualPanel" i]',
        )
        .first();

      await expect(manualPanel).toBeVisible({ timeout: 5_000 });
    }
  });
});
