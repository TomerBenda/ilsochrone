import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { feature, point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { computeIsochrone } from '../isochrone';
import { snapOrigin, shortestTimes } from '../search';

const raw = readFileSync(join(__dirname, '..', '__fixtures__', 'tiny-walk.v1.bin'));
const GRAPH = loadGraph(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

// Fixture layout: see tools/graph-pipeline/tests/make_fixture.py
// Node osmids sorted ascending -> index: osmid 1..13 -> 0..12, osmid 16 -> 13.
const B_LNG = 34.78;
const B_LAT = 32.08;
const D = 0.0009;

describe('cross-language contract (Python-built asset)', () => {
  it('has the expected structure', () => {
    expect(GRAPH.meta.formatVersion).toBe(1);
    expect(GRAPH.meta.profile).toBe('walk-v1');
    expect(GRAPH.nodeCount).toBe(14);
    expect(GRAPH.undirectedEdgeCount).toBe(19);
  });

  it('reproduces a known shortest path (two ~85 m blocks at 5 km/h)', () => {
    const snap = snapOrigin(GRAPH, [B_LNG, B_LAT])!; // grid corner, osmid 1 -> index 0
    expect(snap.distM).toBeLessThan(2);
    const times = shortestTimes(GRAPH, snap, 1800);
    // osmid 3 (r0c2) -> index 2: 2 * ~84.9 m at 5 km/h ~ 122 s
    expect(times[2]!).toBeGreaterThan(115);
    expect(times[2]!).toBeLessThan(130);
  });

  it('computes a sane 5-minute isochrone', () => {
    const { polygon, degraded } = computeIsochrone(GRAPH, [B_LNG + D, B_LAT + D], 5);
    expect(degraded).toBe(false);
    expect(booleanPointInPolygon(point([B_LNG + D, B_LAT + D]), feature(polygon))).toBe(true);
    // island way 306 was pruned: its area must not be covered
    expect(booleanPointInPolygon(point([34.7876, 32.0872]), feature(polygon))).toBe(false);
  });
});
