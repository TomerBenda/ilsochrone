import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { MinHeap } from '../heap';
import { snapOrigin, shortestTimes } from '../search';
import { buildAsset } from './helpers/build-asset';

describe('MinHeap', () => {
  it('pops in ascending time order', () => {
    const h = new MinHeap();
    [5, 1, 4, 1.5, 9, 0.5].forEach((t, i) => h.push(t, i));
    const out: number[] = [];
    for (let x = h.pop(); x !== null; x = h.pop()) out.push(x.time);
    expect(out).toEqual([0.5, 1, 1.5, 4, 5, 9]);
  });
});

// Square with a shortcut: 4 corners ~200 m apart; diagonal edge 0-2 is SLOW.
//   3 --- 2
//   |   / |
//   0 --- 1        edges: 0-1:144s, 1-2:144s, 2-3:144s, 3-0:144s, 0-2:600s
const SQUARE = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7821, 32.08],
      [34.7821, 32.0818],
      [34.78, 32.0818],
    ],
    edges: [
      { a: 0, b: 1, timeS: 144 },
      { a: 1, b: 2, timeS: 144 },
      { a: 2, b: 3, timeS: 144 },
      { a: 3, b: 0, timeS: 144 },
      { a: 0, b: 2, timeS: 600 },
    ],
  }),
);

describe('shortestTimes', () => {
  it('finds known shortest paths, ignoring the slow shortcut', () => {
    const snap = snapOrigin(SQUARE, [34.78, 32.08])!; // exactly node 0
    const times = shortestTimes(SQUARE, snap, 1800);
    expect(times[0]!).toBeLessThan(1);
    expect(times[1]!).toBeCloseTo(144, 0);
    expect(times[3]!).toBeCloseTo(144, 0);
    expect(times[2]!).toBeCloseTo(288, 0); // via 1 or 3, not the 600 s diagonal
  });

  it('respects the cutoff', () => {
    const snap = snapOrigin(SQUARE, [34.78, 32.08])!;
    const times = shortestTimes(SQUARE, snap, 150);
    expect(times[1]!).toBeCloseTo(144, 0);
    expect(times[2]!).toBe(Infinity);
  });

  it('seeds both endpoints proportionally from a mid-edge snap', () => {
    // snap near middle of edge 0-1 (~99 m from node 0 -> ~72 s each way)
    const snap = snapOrigin(SQUARE, [34.78105, 32.0801])!;
    expect(snap.edge).toBe(0);
    const times = shortestTimes(SQUARE, snap, 1800);
    expect(times[0]!).toBeGreaterThan(50);
    expect(times[0]!).toBeLessThan(95);
    expect(times[1]!).toBeGreaterThan(50);
    expect(times[1]!).toBeLessThan(95);
    expect(Math.abs(times[0]! + times[1]! - 144)).toBeLessThan(2);
  });
});
