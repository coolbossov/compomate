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

  test('guided background workflow generates 3 directions, finishes 1 master, and restores the saved workspace', async ({ page }) => {
    const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const appOrigin = process.env.BASE_URL ?? 'http://localhost:3000';
    let savedSnapshot: unknown = null;
    let generationCount = 0;
    let presignCount = 0;
    let uploadCount = 0;

    await page.route('**/api/generate-backdrop*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 400, json: { error: 'Unexpected poll in mocked test.' } });
        return;
      }
      const body = route.request().postDataJSON() as { mode?: string };
      generationCount += 1;
      const isMaster = body.mode === 'master';
      const count = isMaster ? 1 : 3;
      await route.fulfill({
        status: 200,
        json: {
          pending: false,
          model: isMaster ? 'topaz/upscale/image/precision' : 'fal-ai/flux/schnell',
          sourceUrl: `https://fal.test/${generationCount}-1.jpg`,
          images: Array.from({ length: count }, (_, index) => ({
            sourceUrl: `https://fal.test/${generationCount}-${index + 1}.jpg`,
            width: isMaster ? 4096 : 1024,
            height: isMaster ? 5120 : 1280,
          })),
        },
      });
    });
    await page.route('**/api/generate-backdrop/image*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(onePixelPng.split(',')[1]!, 'base64') });
    });
    await page.route('**/api/r2/presign', async (route) => {
      presignCount += 1;
      const body = route.request().postDataJSON() as { filename: string };
      await route.fulfill({
        status: 200,
        json: {
          uploadUrl: `${appOrigin}/mock-r2/${encodeURIComponent(body.filename)}`,
          key: `backdrops/${body.filename}`,
          downloadUrl: `${appOrigin}/mock-r2-download/${encodeURIComponent(body.filename)}`,
        },
      });
    });
    await page.route('**/mock-r2/**', async (route) => {
      uploadCount += 1;
      await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
    });
    await page.route('**/mock-r2-download/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(onePixelPng.split(',')[1]!, 'base64') });
    });
    await page.route('**/api/r2/download*', async (route) => {
      const key = new URL(route.request().url()).searchParams.get('key') ?? 'asset';
      await route.fulfill({ status: 200, json: { downloadUrl: `${appOrigin}/mock-r2-download/${encodeURIComponent(key)}` } });
    });
    await page.route('**/api/projects**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { snapshot: unknown };
        savedSnapshot = body.snapshot;
        await route.fulfill({ status: 201, json: { project: { id: 'qa-project', name: 'QA guided workflow', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } } });
        return;
      }
      if (url.pathname.endsWith('/qa-project')) {
        await route.fulfill({ status: 200, json: { project: { id: 'qa-project', name: 'QA guided workflow', payload: savedSnapshot } } });
        return;
      }
      await route.fulfill({
        status: 200,
        json: {
          configured: true,
          projects: savedSnapshot ? [{ id: 'qa-project', name: 'QA guided workflow', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] : [],
        },
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Background Studio' }).click();
    await page.getByRole('button', { name: 'Generate 3 directions', exact: true }).click();
    await expect(page.getByText('Direction option', { exact: true })).toHaveCount(3);
    await expect(page.getByText(/^1024×1280/)).toHaveCount(3);

    const directionButtons = page.getByRole('button', { name: /Select direction_/i });
    await directionButtons.nth(1).click();
    await page.getByRole('button', { name: 'Finish production master', exact: true }).click();
    await expect(page.getByText('Production master', { exact: true })).toHaveCount(1);
    await expect(page.getByText(/^4096×5120/)).toBeVisible();
    await expect.poll(() => presignCount).toBe(4);
    await expect.poll(() => uploadCount).toBe(4);

    const projectName = page.getByPlaceholder('Project name');
    await projectName.fill('QA guided workflow');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'QA guided workflow', exact: true })).toBeVisible();
    expect(savedSnapshot).not.toBeNull();

    await page.reload();
    await page.getByRole('button', { name: 'Background Studio' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'QA guided workflow', exact: true }).click();
    await expect(page.getByText('Direction option', { exact: true })).toHaveCount(3);
    await expect(page.getByText('Production master', { exact: true })).toHaveCount(1);
    await expect(page.getByText(/^4096×5120/)).toBeVisible();
  });

  test('project storage unavailability is explained instead of looking stuck', async ({ page }) => {
    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          projects: [],
          configured: false,
          available: false,
          reason: 'Remote project persistence is disabled until auth is implemented.',
        },
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Background Studio' }).click();

    const unavailable = page.getByRole('status').filter({ hasText: 'Project saving is unavailable' });
    await expect(unavailable).toContainText('cannot be reopened later');
    const saveButton = page.getByRole('button', { name: 'Project saving unavailable', exact: true });
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute('aria-describedby', 'project-persistence-unavailable');
  });

  test('a failed backdrop upload blocks project save with a recovery action', async ({ page }) => {
    await page.route('**/api/projects', async (route) => {
      await route.fulfill({ status: 200, json: { projects: [], configured: true, available: true } });
    });
    await page.route('**/api/r2/presign', async (route) => {
      await route.fulfill({ status: 500, json: { error: 'R2_UPLOAD_FAILED' } });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Background Studio' }).click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add Files', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'failed-backdrop.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });

    await expect(page.getByText(/save failed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
    const saveButton = page.getByRole('button', { name: 'Fix asset saves first', exact: true });
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute('title', /Retry or remove every asset/i);
  });
});

test.describe('API: export requires valid payload', () => {
  test('POST /api/export returns 400 for empty body', async ({ request }) => {
    const res = await request.post('/api/export', { data: {} });
    expect(res.status()).toBe(400);
  });
});
