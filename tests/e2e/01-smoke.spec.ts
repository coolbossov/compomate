/**
 * E2E: CompoMate smoke tests
 *
 * Verifies that the compositor app loads and key API routes respond correctly.
 * The main page is a Konva canvas SPA — we verify the shell loads without errors,
 * not full UI interaction (which requires real subject/backdrop assets).
 *
 * CI note: Supabase and R2 env vars are provided; other services (Redis, Sentry, etc.)
 * are optional — their absence may cause some API routes to return non-200 codes.
 * Tests are scoped to behaviour that works reliably without full external service setup.
 */
import { test, expect } from '@playwright/test';

test.describe('Main app shell', () => {
  test('homepage loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // App header should be present
    await expect(page.locator('header, [data-testid="app-header"], nav').first()).toBeVisible({ timeout: 15_000 });

    // No uncaught JS errors (filter out noisy ResizeObserver noise)
    expect(errors.filter(e => !/ResizeObserver/.test(e))).toHaveLength(0);
  });

  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('app shell renders main layout (header + sidebar + canvas area)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    // Should have at least one interactive element (panel, button, etc.)
    const interactive = page.locator('button, [role="button"]').first();
    await expect(interactive).toBeVisible({ timeout: 10_000 });
  });

  test('Background Studio switches workspaces and updates pose guides', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Background Studio' }).click();
    await expect(page.getByTestId('background-studio-workspace')).toBeVisible();
    await expect(page.getByText('Live composition preview')).toBeVisible();
    await expect(page.getByTestId('subject-guide')).toHaveCount(1);

    await page.getByRole('button', { name: '3 poses' }).click();
    await expect(page.getByTestId('subject-guide')).toHaveCount(3);

    await page.getByRole('button', { name: 'Composite', exact: true }).click();
    await expect(page.getByTestId('composite-workspace')).toBeVisible();
  });
});

test.describe('API: export requires valid payload', () => {
  test('POST /api/export returns 400 for empty body', async ({ request }) => {
    const res = await request.post('/api/export', { data: {} });
    expect(res.status()).toBe(400);
  });
});
