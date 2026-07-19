import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAssetMeta, type GraphSource } from '@ilsochrone/engine';
import { BundledGraphSource } from './bundled-source';
import { LocalIsochroneProvider } from './local';

const FIXTURE = join(__dirname, '..', '..', '..', 'engine', 'src', '__fixtures__', 'tiny-walk.v1.bin');
const REAL_ASSET = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'assets', 'graphs', 'walk-tlv.v1.bin');

function fixtureSource(): GraphSource {
  return {
    name: 'fixture',
    async load() {
      const raw = await readFile(FIXTURE);
      const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      return { buffer, meta: readAssetMeta(buffer) };
    },
  };
}

describe('LocalIsochroneProvider', () => {
  it('supports walk only', () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    expect(p.supports('walk')).toBe(true);
    expect(p.supports('bike')).toBe(false);
    expect(p.supports('transit')).toBe(false);
  });

  it('computes an isochrone with engine metadata', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    const res = await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 5 });
    expect(['Polygon', 'MultiPolygon']).toContain(res.polygon.type);
    expect(res.metadata.provider).toBe('local');
    expect(res.metadata.engine?.version).toBeTruthy();
    expect(res.metadata.engine?.profile).toBe('walk-v1');
    expect(res.metadata.warnings ?? []).toEqual([]);
  });

  it('rejects invalid requests via the shared schema', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    await expect(
      p.getIsochrone({ origin: [34.78, 32.08], mode: 'walk', minutes: 7 as never }),
    ).rejects.toThrow();
  });

  it('propagates OutOfCoverageError for far origins', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    await expect(
      p.getIsochrone({ origin: [35.5, 33.0], mode: 'walk', minutes: 10 }),
    ).rejects.toMatchObject({ name: 'OutOfCoverageError' });
  });

  it('loads the graph once across calls', async () => {
    let loads = 0;
    const src = fixtureSource();
    const counting: GraphSource = {
      name: 'counting',
      load: (profile) => {
        loads++;
        return src.load(profile);
      },
    };
    const p = new LocalIsochroneProvider({ source: counting });
    await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 5 });
    await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 10 });
    expect(loads).toBe(1);
  });
});

describe('BundledGraphSource', () => {
  it('loads an explicit asset path', async () => {
    const src = new BundledGraphSource({ assetPath: FIXTURE });
    const { buffer, meta } = await src.load('walk');
    expect(meta.formatVersion).toBe(1);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });

  it('falls back to cwd candidates and finds the real asset', async () => {
    const src = new BundledGraphSource();
    const { meta } = await src.load('walk');
    expect(meta.profile).toBe('walk-v1');
  });

  it('fails loudly on a missing path', async () => {
    const src = new BundledGraphSource({ assetPath: 'C:/nope/missing.bin' });
    await expect(src.load('walk')).rejects.toThrow(/graph asset/i);
  });
});

describe('perf guard (real asset)', () => {
  it('computes a 30-min isochrone under budget when warm', async () => {
    const p = new LocalIsochroneProvider({ source: new BundledGraphSource({ assetPath: REAL_ASSET }) });
    const req = { origin: [34.7745, 32.075] as [number, number], mode: 'walk' as const, minutes: 30 as const };
    await p.getIsochrone(req); // cold: load + parse
    const t0 = performance.now();
    await p.getIsochrone(req);
    const ms = performance.now() - t0;
    console.log(`30-min isochrone (warm): ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(process.env.CI ? 1000 : 200);
  });
});
