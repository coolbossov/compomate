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

  test('Minimal Canvas shell uses the brand pink highlight', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('minimal-canvas-shell')).toHaveAttribute('data-theme', 'minimal-canvas');
    const activeWorkspace = page.getByRole('button', { name: 'Composite', exact: true });
    await expect(activeWorkspace).toHaveCSS('background-color', 'rgb(255, 219, 253)');
    await expect(page.getByTestId('app-header')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await page.getByRole('button', { name: 'Application settings' }).click();
    await expect(page.getByText('Application settings', { exact: true })).toBeVisible();
    await page.mouse.click(10, 100);
    await expect(page.getByText('Application settings', { exact: true })).toBeHidden();
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
    await expect(page.getByTestId('background-studio-workspace')).toHaveAttribute('data-layout', 'minimal-canvas');
    await expect(page.getByTestId('background-preview')).toBeVisible();
    await expect(page.getByTestId('preview-actions')).toBeVisible();
    await expect(page.locator('details[open]')).toHaveCount(0);
    await expect(page.getByTestId('subject-guide')).toHaveCount(1);

    await page.getByText('Composition', { exact: true }).click();
    await page.getByRole('button', { name: '3 poses' }).click();
    await expect(page.getByTestId('subject-guide')).toHaveCount(3);

    await page.getByRole('button', { name: 'Collapse library' }).click();
    await expect(page.getByRole('button', { name: 'Expand library' })).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Composite', exact: true }).click();
    await expect(page.getByTestId('composite-workspace')).toBeVisible();
  });

  test('Minimal Canvas stays image-first without horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Background Studio' }).click();

    await expect(page.getByTestId('background-preview')).toBeVisible();
    const widths = await page.getByTestId('background-studio-workspace').evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBe(widths.client);
  });
});

test.describe('API: export requires valid payload', () => {
  test('POST /api/export returns 400 for empty body', async ({ request }) => {
    const res = await request.post('/api/export', { data: {} });
    expect(res.status()).toBe(400);
  });
});
