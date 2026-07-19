import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import difference from '@turf/difference';
import { feature, featureCollection, point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';
import { OutOfCoverageError } from '../errors';
import { loadGraph } from '../graph';
import { computeIsochrone } from '../isochrone';
import { buildAsset } from './helpers/build-asset';

// 3x3 grid, ~200 m spacing, all edges 144 s.
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

describe('computeIsochrone', () => {
  it('returns a polygon containing the origin', () => {
    const { polygon, degraded, snapDistanceM } = computeIsochrone(GRID, CENTER, 5);
    expect(degraded).toBe(false);
    expect(snapDistanceM).toBeLessThan(10);
    expect(booleanPointInPolygon(point(CENTER), feature(polygon))).toBe(true);
  });

  it('nests: 5-min within 10-min within 15-min (small tolerance)', () => {
    const p5 = computeIsochrone(GRID, CENTER, 5).polygon;
    const p10 = computeIsochrone(GRID, CENTER, 10).polygon;
    const p15 = computeIsochrone(GRID, CENTER, 15).polygon;
    for (const [small, big] of [
      [p5, p10],
      [p10, p15],
    ] as const) {
      const leak = difference(featureCollection([feature(small), feature(big)]));
      const leakArea = leak ? area(leak) : 0;
      expect(leakArea).toBeLessThan(0.03 * area(feature(small)));
    }
  });

  it('monotonic area growth', () => {
    const a5 = area(feature(computeIsochrone(GRID, CENTER, 5).polygon));
    const a10 = area(feature(computeIsochrone(GRID, CENTER, 10).polygon));
    expect(a10).toBeGreaterThan(a5);
  });

  it('throws OutOfCoverageError far from the network', () => {
    expect(() => computeIsochrone(GRID, [34.9, 32.2], 10)).toThrow(OutOfCoverageError);
  });

  it('rejects nonsense minutes', () => {
    expect(() => computeIsochrone(GRID, CENTER, 0)).toThrow();
    expect(() => computeIsochrone(GRID, CENTER, -5)).toThrow();
  });
});
