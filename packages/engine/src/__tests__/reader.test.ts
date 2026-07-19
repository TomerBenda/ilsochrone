import { describe, expect, it } from 'vitest';
import { parseAsset, readAssetMeta } from '../asset/reader';
import { AssetFormatError } from '../errors';
import { buildAsset } from './helpers/build-asset';

const LINE = buildAsset({
  nodes: [
    [34.78, 32.08],
    [34.781, 32.08],
    [34.782, 32.08],
  ],
  edges: [
    { a: 0, b: 1, timeS: 60 },
    { a: 1, b: 2, timeS: 70 },
  ],
});

describe('readAssetMeta', () => {
  it('reads header meta', () => {
    const meta = readAssetMeta(LINE);
    expect(meta.formatVersion).toBe(1);
    expect(meta.profile).toBe('walk-v1');
    expect(meta.counts).toEqual({ nodes: 3, directedEdges: 4, undirectedEdges: 2, geometryPoints: 4 });
  });

  it('rejects bad magic', () => {
    const bad = LINE.slice(0);
    new Uint8Array(bad)[0] = 88;
    expect(() => readAssetMeta(bad)).toThrow(AssetFormatError);
  });

  it('rejects future format versions', () => {
    const bad = LINE.slice(0);
    new DataView(bad).setUint32(8, 99, true);
    expect(() => readAssetMeta(bad)).toThrow(AssetFormatError);
  });
});

describe('parseAsset', () => {
  it('round-trips arrays and dequantizes coordinates to ~0.5 m', () => {
    const parsed = parseAsset(LINE);
    expect(Array.from(parsed.csrOffsets)).toEqual([0, 1, 3, 4]);
    expect(Array.from(parsed.csrTargets)).toEqual([1, 0, 2, 1]);
    expect(Array.from(parsed.csrTimeCs)).toEqual([6000, 6000, 7000, 7000]);
    expect(Array.from(parsed.geomOffsets)).toEqual([0, 2, 4]);
    expect(parsed.nodeLng[1]!).toBeCloseTo(34.781, 5);
    expect(parsed.nodeLat[0]!).toBeCloseTo(32.08, 5);
  });

  it('rejects truncated buffers', () => {
    expect(() => parseAsset(LINE.slice(0, LINE.byteLength - 16))).toThrow(AssetFormatError);
  });
});
