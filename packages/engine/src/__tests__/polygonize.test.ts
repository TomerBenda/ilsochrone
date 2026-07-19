import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { polygonize } from '../polygonize';
import { snapOrigin, shortestTimes } from '../search';
import { buildAsset } from './helpers/build-asset';

const LINE = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7842, 32.08], // ~396 m east
    ],
    edges: [{ a: 0, b: 1, timeS: 285 }], // ~5 km/h
  }),
);

function isoOn(graph: ReturnType<typeof loadGraph>, origin: [number, number], cutoffSec: number) {
  const snap = snapOrigin(graph, origin)!;
  const times = shortestTimes(graph, snap, cutoffSec);
  return { snap, result: polygonize(graph, times, snap, cutoffSec) };
}

describe('polygonize', () => {
  it('contains the origin and is not degraded on a healthy graph', () => {
    const { result } = isoOn(LINE, [34.781, 32.08], 120);
    expect(result.degraded).toBe(false);
    expect(
      booleanPointInPolygon(point([34.781, 32.08]), {
        type: 'Feature',
        properties: {},
        geometry: result.polygon,
      }),
    ).toBe(true);
  });

  it('extends along the reachable edge but stops near the time frontier', () => {
    // From node 0 with 120 s budget: reach ~167 m along the edge (+100 m offroad buffer).
    const { result } = isoOn(LINE, [34.78, 32.08], 120);
    const geom = result.polygon;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    const lngs = rings.flat().map((c) => c[0]!);
    const maxLng = Math.max(...lngs);
    // frontier at ~34.78 + 167m/94.3m-per-0.001deg ~ 34.7818; +buffer/cell slack < 34.7842
    expect(maxLng).toBeGreaterThan(34.781);
    expect(maxLng).toBeLessThan(34.7835);
    // and it must NOT cover the far, unreachable end
    expect(
      booleanPointInPolygon(point([34.7842, 32.08]), {
        type: 'Feature',
        properties: {},
        geometry: geom,
      }),
    ).toBe(false);
  });

  it('centers on a lone origin sample (grid transform calibration)', () => {
    // 1 s budget: only the snap-point sample fills cells -> small blob centered on it
    const { result } = isoOn(LINE, [34.781, 32.08], 1);
    const geom = result.polygon;
    const coords = (geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()).flat();
    const cLng = coords.reduce((s, c) => s + c[0]!, 0) / coords.length;
    const cLat = coords.reduce((s, c) => s + c[1]!, 0) / coords.length;
    // centroid within ~half a grid cell (60 m -> ~0.0007 deg) of the snapped point
    expect(Math.abs(cLng - 34.781)).toBeLessThan(0.0007);
    expect(Math.abs(cLat - 32.08)).toBeLessThan(0.0007);
  });

  it('is symmetric around a mid-edge origin (detects half-cell grid offset)', () => {
    // From the exact midpoint with a 60 s budget the reachable stretch is
    // symmetric east/west, so the contoured polygon must be too. A systematic
    // half-cell (30 m) transform offset shifts BOTH frontiers the same way,
    // producing ~60 m of east/west asymmetry; raster + simplify noise measures
    // ~20 m. The 38 m tolerance sits between the two, so this fails on a real
    // transform bug but not on discretization jitter. (The lone-sample test
    // above can't catch offsets: tiny budgets fall back to the origin circle.)
    const mid: [number, number] = [34.7821, 32.08];
    const { result } = isoOn(LINE, mid, 60);
    expect(result.degraded).toBe(false);
    const coords = (
      result.polygon.type === 'Polygon' ? result.polygon.coordinates : result.polygon.coordinates.flat()
    ).flat();
    const lngs = coords.map((c) => c[0]!);
    const lats = coords.map((c) => c[1]!);
    const eastReach = Math.max(...lngs) - mid[0];
    const westReach = mid[0] - Math.min(...lngs);
    const northReach = Math.max(...lats) - mid[1];
    const southReach = mid[1] - Math.min(...lats);
    const tolDeg = 0.0004; // ~38 m — above noise (~20 m), below half-cell signature (~60 m)
    expect(Math.abs(eastReach - westReach)).toBeLessThan(tolDeg);
    expect(Math.abs(northReach - southReach)).toBeLessThan(tolDeg);
  });

  it('is deterministic', () => {
    const a = isoOn(LINE, [34.781, 32.08], 120).result;
    const b = isoOn(LINE, [34.781, 32.08], 120).result;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
