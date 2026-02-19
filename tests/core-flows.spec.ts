import { test, expect } from '@playwright/test';

test.describe('LAZY Work Tracker Core Flows', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app root
        await page.goto('/');
    });

    test('should navigate to tracker and see session recording buttons', async ({ page }) => {
        await page.click('text=Work Tracker');
        await expect(page).toHaveURL(/.*tracker/);

        // Verify visibility of core elements
        const recordButton = page.locator('button:has-text("Record")');
        await expect(recordButton).toBeVisible();

        const generateButton = page.locator('button:has-text("Generate AI")');
        await expect(generateButton).toBeVisible();
    });

    test('should navigate to meeting recorder', async ({ page }) => {
        await page.click('text=Meeting Transcription');
        await expect(page).toHaveURL(/.*meeting/);

        const startRecordingBtn = page.locator('button:has-text("Record")');
        await expect(startRecordingBtn).toBeVisible();
    });
});
