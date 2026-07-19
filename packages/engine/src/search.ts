import { projectToSegment } from './geo';
import type { WalkGraph } from './graph';
import { MinHeap } from './heap';
import { candidateEdges } from './spatial';
import type { LngLat } from './types';

export const SNAP_MAX_M = 250;

export interface SnapPoint {
  edge: number;
  xm: number;
  ym: number;
  /** Distance from the requested origin to the snapped point. */
  distM: number;
  /** Distance along the edge polyline from endpoint A to the snapped point. */
  distAlongM: number;
}

export function snapOrigin(graph: WalkGraph, origin: LngLat, maxDistM = SNAP_MAX_M): SnapPoint | null {
  const [px, py] = graph.toMeters(origin[0], origin[1]);
  // Quick reject: far outside the data frame.
  if (
    px < -maxDistM ||
    py < -maxDistM ||
    px > graph.spatial.maxXm + maxDistM ||
    py > graph.spatial.maxYm + maxDistM
  ) {
    return null;
  }
  let best: SnapPoint | null = null;
  let bestDist2 = maxDistM * maxDistM;
  for (const e of candidateEdges(graph.spatial, px, py)) {
    const start = graph.geomOffsets[e]!;
    const end = graph.geomOffsets[e + 1]!;
    let along = 0;
    for (let i = start; i + 1 < end; i++) {
      const ax = graph.geomXm[i]!;
      const ay = graph.geomYm[i]!;
      const bx = graph.geomXm[i + 1]!;
      const by = graph.geomYm[i + 1]!;
      const segLen = Math.hypot(bx - ax, by - ay);
      const proj = projectToSegment(px, py, ax, ay, bx, by);
      if (proj.dist2 <= bestDist2) {
        bestDist2 = proj.dist2;
        best = {
          edge: e,
          xm: proj.x,
          ym: proj.y,
          distM: Math.sqrt(proj.dist2),
          distAlongM: along + proj.t * segLen,
        };
      }
      along += segLen;
    }
  }
  return best;
}

/**
 * Dijkstra from the snapped point over walk-time weights, bounded by cutoffSec.
 * Returns per-node arrival seconds (Infinity = unreached within cutoff).
 */
export function shortestTimes(graph: WalkGraph, snap: SnapPoint, cutoffSec: number): Float64Array {
  const times = new Float64Array(graph.nodeCount).fill(Infinity);
  const heap = new MinHeap();

  const e = snap.edge;
  const edgeTimeS = graph.edgeTimeCs[e]! / 100;
  const len = graph.edgeLenM[e]!;
  const frac = len > 0 ? snap.distAlongM / len : 0;
  const seed = (node: number, t: number): void => {
    if (t <= cutoffSec && t < times[node]!) {
      times[node] = t;
      heap.push(t, node);
    }
  };
  seed(graph.edgeA[e]!, edgeTimeS * frac);
  seed(graph.edgeB[e]!, edgeTimeS * (1 - frac));

  for (let top = heap.pop(); top !== null; top = heap.pop()) {
    if (top.time > times[top.id]!) continue; // stale entry
    const end = graph.csrOffsets[top.id + 1]!;
    for (let k = graph.csrOffsets[top.id]!; k < end; k++) {
      const v = graph.csrTargets[k]!;
      const nt = top.time + graph.csrTimeCs[k]! / 100;
      if (nt <= cutoffSec && nt < times[v]!) {
        times[v] = nt;
        heap.push(nt, v);
      }
    }
  }
  return times;
}
