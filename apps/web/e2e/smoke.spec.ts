/**
 * T-13 smoke, bands edition: load /, get all five nested bands from the local
 * engine, see POI markers, change the time band WITHOUT a network refetch,
 * and drag the origin pin (which does refetch).
 *
 * Requires GEOAPIFY_API_KEY in apps/web/.env.local for the POI assertion.
 */
import { expect, test, type Response } from '@playwright/test';

const isIso = (r: Response) => r.url().includes('/api/isochrone') && r.status() === 200;

test('walking isochrone smoke', async ({ page }) => {
  test.setTimeout(90_000);

  const firstIso = page.waitForResponse(isIso);
  await page.goto('/');

  // 1. Initial response carries all five nested bands from the local engine.
  const first = await firstIso;
  const body = await first.json();
  expect(body.type).toBe('FeatureCollection');
  expect(body.features).toHaveLength(5);
  expect(body.metadata.provider).toBe('local');

  // 2. Origin pin is on the map.
  const pin = page.getByRole('img', { name: 'Origin (drag to move)' });
  await expect(pin).toBeVisible();

  // 3. At least one POI marker appears inside the isochrone.
  await expect(page.locator('.maplibregl-marker button[aria-label]').first()).toBeVisible({
    timeout: 20_000,
  });

  // 4. Changing the time band is INSTANT — no new isochrone request.
  let extraRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/isochrone')) extraRequests++;
  });
  await page.getByRole('radio', { name: '30 min' }).first().click();
  await page.waitForTimeout(1500);
  expect(extraRequests).toBe(0);

  // 5. Dragging the origin pin refetches for a new origin (different URL).
  const beforeDragUrl = first.url();
  const draggedPromise = page.waitForResponse(
    (r) => isIso(r) && r.url().includes('bands=1') && r.url() !== beforeDragUrl,
  );
  const box = await pin.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 12 });
  await page.mouse.up();
  const dragged = await draggedPromise;
  const draggedBody = await dragged.json();
  expect(draggedBody.type).toBe('FeatureCollection');
});

test('mobile: bottom sheet hosts the controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByLabel('Map controls')).toBeVisible();
  await expect(page.getByLabel('Map controls').getByRole('radio', { name: '15 min' })).toBeVisible();
});
