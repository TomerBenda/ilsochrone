import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { snapOrigin } from '../search';
import { buildAsset } from './helpers/build-asset';

// One horizontal edge ~200 m long at lat 32.08: [34.780->34.7821]
const GRAPH = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7821, 32.08],
    ],
    edges: [{ a: 0, b: 1, timeS: 144 }],
  }),
);

describe('loadGraph derivations', () => {
  it('derives undirected edge endpoints and polyline length', () => {
    expect(GRAPH.nodeCount).toBe(2);
    expect(GRAPH.undirectedEdgeCount).toBe(1);
    expect(GRAPH.edgeA[0]).toBe(0);
    expect(GRAPH.edgeB[0]).toBe(1);
    // 0.0021 deg lng at 32.08N ~ 198 m
    expect(GRAPH.edgeLenM[0]!).toBeGreaterThan(180);
    expect(GRAPH.edgeLenM[0]!).toBeLessThan(215);
  });
});

describe('snapOrigin', () => {
  it('snaps a point ~30 m north of the edge midpoint onto the edge', () => {
    const snap = snapOrigin(GRAPH, [34.781, 32.0803]);
    expect(snap).not.toBeNull();
    expect(snap!.edge).toBe(0);
    expect(snap!.distM).toBeGreaterThan(20);
    expect(snap!.distM).toBeLessThan(45);
    // distance along from node A ~ 94 m (proportional position of lng 34.781)
    expect(snap!.distAlongM).toBeGreaterThan(75);
    expect(snap!.distAlongM).toBeLessThan(115);
  });

  it('snaps beyond an endpoint to the endpoint itself', () => {
    const snap = snapOrigin(GRAPH, [34.7795, 32.08]);
    expect(snap).not.toBeNull();
    expect(snap!.distAlongM).toBeLessThan(1);
  });

  it('returns null when nothing is within 250 m', () => {
    expect(snapOrigin(GRAPH, [34.79, 32.09])).toBeNull(); // ~1.4 km away
    expect(snapOrigin(GRAPH, [35.5, 33.0])).toBeNull(); // far outside bbox
  });
});
