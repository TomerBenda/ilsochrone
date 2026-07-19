import { describe, expect, it } from 'vitest';
import { OutOfCoverageError } from '../errors';
import { loadGraph } from '../graph';
import { computeIsochrone, computeIsochroneBands } from '../isochrone';
import { buildAsset } from './helpers/build-asset';

const nodes: [number, number][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) nodes.push([34.78 + c * 0.0021, 32.08 + r * 0.0018]);
const edges: { a: number; b: number; timeS: number }[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    if (c < 2) edges.push({ a: i, b: i + 1, timeS: 144 });
    if (r < 2) edges.push({ a: i, b: i + 3, timeS: 144 });
  }
const GRID = loadGraph(buildAsset({ nodes, edges }));
const CENTER: [number, number] = [34.7821, 32.0818];

describe('computeIsochroneBands', () => {
  it('one pass equals per-band computeIsochrone results', () => {
    const { bands, snapDistanceM } = computeIsochroneBands(GRID, CENTER, [5, 10, 15]);
    expect(bands.map((b) => b.minutes)).toEqual([5, 10, 15]);
    expect(snapDistanceM).toBeLessThan(10);
    for (const band of bands) {
      const solo = computeIsochrone(GRID, CENTER, band.minutes);
      expect(band.polygon).toEqual(solo.polygon);
      expect(band.degraded).toBe(solo.degraded);
    }
  });

  it('sorts unsorted input ascending', () => {
    const { bands } = computeIsochroneBands(GRID, CENTER, [15, 5, 10]);
    expect(bands.map((b) => b.minutes)).toEqual([5, 10, 15]);
  });

  it('rejects empty/invalid bands', () => {
    expect(() => computeIsochroneBands(GRID, CENTER, [])).toThrow(RangeError);
    expect(() => computeIsochroneBands(GRID, CENTER, [0, 5])).toThrow(RangeError);
  });

  it('throws OutOfCoverageError off-network', () => {
    expect(() => computeIsochroneBands(GRID, [34.9, 32.2], [5, 10])).toThrow(OutOfCoverageError);
  });
});
