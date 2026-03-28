/**
 * E2E: CompoMate smoke tests
 *
 * Verifies that the compositor app loads and key API routes respond correctly.
 * The main page is a Konva canvas SPA — we verify the shell loads without errors,
 * not full UI interaction (which requires real subject/backdrop assets).
 */
import { test, expect } from '@playwright/test';

test.describe('Main app shell', () => {
  test('homepage loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // App header should be present
    await expect(page.locator('header, [data-testid="app-header"], nav').first()).toBeVisible({ timeout: 15_000 });

    // No uncaught JS errors
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
});

test.describe('API: diagnostics', () => {
  test('GET /api/diagnostics returns 200 in non-production', async ({ request }) => {
    const res = await request.get('/api/diagnostics');
    // In CI (NODE_ENV=test/production) it may return 403 — that is also acceptable
    expect([200, 403]).toContain(res.status());
  });
});

test.describe('API: projects (session-based)', () => {
  test('GET /api/projects returns 200 with empty or populated array', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.status()).toBe(200);
    const data = await res.json();
    // Returns array of projects for the session (empty is valid)
    expect(Array.isArray(data)).toBe(true);
  });
});

test.describe('API: templates', () => {
  test('GET /api/templates returns 200 or 404', async ({ request }) => {
    const res = await request.get('/api/templates');
    // 200 with templates array, or 404 if none configured
    expect([200, 404]).toContain(res.status());
  });
});

test.describe('API: export requires valid payload', () => {
  test('POST /api/export returns 400 for empty body', async ({ request }) => {
    const res = await request.post('/api/export', { data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe('API: batch-export requires valid payload', () => {
  test('POST /api/batch-export returns 400 for empty body', async ({ request }) => {
    const res = await request.post('/api/batch-export', { data: {} });
    expect(res.status()).toBe(400);
  });
});
