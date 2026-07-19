/**
 * T-13 smoke: load /, see a walking isochrone polygon (local engine), see POI
 * markers inside it, change the time band, and drag the origin pin — each map
 * state change must refetch the isochrone.
 *
 * Requires GEOAPIFY_API_KEY in apps/web/.env.local for the POI assertion.
 */
import { expect, test, type Response } from '@playwright/test';

const isIso = (r: Response) => r.url().includes('/api/isochrone') && r.status() === 200;

test('walking isochrone smoke', async ({ page }) => {
  test.setTimeout(90_000);

  const firstIso = page.waitForResponse(isIso);
  await page.goto('/');

  // 1. Initial isochrone comes from the local engine and is a polygon.
  const first = await firstIso;
  const body = await first.json();
  expect(['Polygon', 'MultiPolygon']).toContain(body.polygon.type);
  expect(body.metadata.provider).toBe('local');

  // 2. Origin pin is on the map.
  const pin = page.getByRole('img', { name: 'Origin (drag to move)' });
  await expect(pin).toBeVisible();

  // 3. At least one POI marker appears inside the isochrone.
  await expect(page.locator('.maplibregl-marker button[aria-label]').first()).toBeVisible({
    timeout: 20_000,
  });

  // 4. Changing the time band refetches with t=30.
  const iso30Promise = page.waitForResponse((r) => isIso(r) && r.url().includes('t=30'));
  await page.getByRole('radio', { name: '30 min' }).click();
  const iso30 = await iso30Promise;
  const body30 = await iso30.json();
  expect(['Polygon', 'MultiPolygon']).toContain(body30.polygon.type);

  // 5. Dragging the origin pin refetches for a new origin (different URL).
  const beforeDragUrl = iso30.url();
  const draggedPromise = page.waitForResponse(
    (r) => isIso(r) && r.url().includes('t=30') && r.url() !== beforeDragUrl,
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
  expect(['Polygon', 'MultiPolygon']).toContain(draggedBody.polygon.type);
});
