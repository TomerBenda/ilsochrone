/**
 * Unit tests for OrsIsochroneProvider.
 *
 * We don't hit the real ORS API. A fake fetch implementation returns the
 * fixture file we'd expect for a 15-minute walking isochrone from downtown
 * Tel Aviv. This means CI never burns ORS quota.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OrsError, OrsIsochroneProvider } from './ors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '__fixtures__', 'ors-walking-15min.json');

async function loadFixture() {
  const text = await readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(text) as unknown;
}

function makeFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/geo+json' },
    }),
  ) as unknown as typeof fetch;
}

function makeFetchStatus(status: number, body = ''): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe('OrsIsochroneProvider', () => {
  it('returns a polygon for a valid walking request', async () => {
    const fixture = await loadFixture();
    const provider = new OrsIsochroneProvider({
      apiKey: 'test-key',
      fetchImpl: makeFetchOk(fixture),
    });

    const result = await provider.getIsochrone({
      origin: [34.7818, 32.0853],
      mode: 'walk',
      minutes: 15,
    });

    expect(result.polygon.type).toBe('Polygon');
    expect(result.metadata.provider).toBe('ors');
    expect(typeof result.metadata.computedAt).toBe('string');
  });

  it('rejects unsupported modes (transit)', async () => {
    const provider = new OrsIsochroneProvider({
      apiKey: 'test-key',
      fetchImpl: makeFetchOk({}),
    });
    expect(provider.supports('transit')).toBe(false);
    await expect(
      provider.getIsochrone({ origin: [34.7818, 32.0853], mode: 'transit', minutes: 15 }),
    ).rejects.toThrow(/transit/i);
  });

  it('validates inputs at the boundary', async () => {
    const provider = new OrsIsochroneProvider({
      apiKey: 'test-key',
      fetchImpl: makeFetchOk({}),
    });
    await expect(
      provider.getIsochrone({
        origin: [34.7818, 32.0853],
        mode: 'walk',
        // @ts-expect-error invalid time band
        minutes: 7,
      }),
    ).rejects.toThrow();
  });

  it('throws OrsError on non-200 responses', async () => {
    const provider = new OrsIsochroneProvider({
      apiKey: 'test-key',
      fetchImpl: makeFetchStatus(429, 'rate limited'),
    });
    await expect(
      provider.getIsochrone({ origin: [34.7818, 32.0853], mode: 'walk', minutes: 15 }),
    ).rejects.toBeInstanceOf(OrsError);
  });

  it('requires an api key', () => {
    expect(() => new OrsIsochroneProvider({ apiKey: '' })).toThrow(/apiKey/);
  });
});
