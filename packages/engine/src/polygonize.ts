import simplify from '@turf/simplify';
import { contours } from 'd3-contour';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { WalkGraph } from './graph';
import type { SnapPoint } from './search';

export const GRID_CELL_M = 60;
export const OFFROAD_BUFFER_M = 100;
export const OFFROAD_MPS = 5 / 3.6;
export const SAMPLE_STEP_M = 45;
const SIMPLIFY_TOLERANCE_DEG = 0.00005;

export interface PolygonizeResult {
  polygon: Polygon | MultiPolygon;
  degraded: boolean;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

export function polygonize(
  graph: WalkGraph,
  times: Float64Array,
  snap: SnapPoint,
  cutoffSec: number,
): PolygonizeResult {
  const samples = collectSamples(graph, times, snap, cutoffSec);
  const rings = samples.length > 0 ? contourRings(samples, cutoffSec, graph) : [];
  const polygons = rings.filter((poly) => poly.length > 0);
  if (polygons.length === 0) {
    return { polygon: fallbackCircle(graph, snap, cutoffSec), degraded: true };
  }
  const geometry: Polygon | MultiPolygon =
    polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0]! }
      : { type: 'MultiPolygon', coordinates: polygons };
  simplify(geometry, { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: false, mutate: true });
  return { polygon: geometry, degraded: false };
}

function collectSamples(
  graph: WalkGraph,
  times: Float64Array,
  snap: SnapPoint,
  cutoffSec: number,
): Sample[] {
  const samples: Sample[] = [{ x: snap.xm, y: snap.ym, t: 0 }];
  for (let e = 0; e < graph.undirectedEdgeCount; e++) {
    const ta = times[graph.edgeA[e]!]!;
    const tb = times[graph.edgeB[e]!]!;
    if (ta >= cutoffSec && tb >= cutoffSec && e !== snap.edge) continue;
    const len = graph.edgeLenM[e]!;
    const edgeTimeS = graph.edgeTimeCs[e]! / 100;
    const v = len > 0 && edgeTimeS > 0 ? len / edgeTimeS : 0;
    const start = graph.geomOffsets[e]!;
    const end = graph.geomOffsets[e + 1]!;
    let along = 0;
    const emit = (x: number, y: number, d: number): void => {
      let t = v > 0 ? Math.min(ta + d / v, tb + (len - d) / v) : Math.min(ta, tb);
      if (e === snap.edge && v > 0) t = Math.min(t, Math.abs(d - snap.distAlongM) / v);
      if (t <= cutoffSec) samples.push({ x, y, t });
    };
    for (let i = start; i + 1 < end; i++) {
      const ax = graph.geomXm[i]!;
      const ay = graph.geomYm[i]!;
      const bx = graph.geomXm[i + 1]!;
      const by = graph.geomYm[i + 1]!;
      const segLen = Math.hypot(bx - ax, by - ay);
      emit(ax, ay, along);
      for (let s = SAMPLE_STEP_M; s < segLen; s += SAMPLE_STEP_M) {
        const f = s / segLen;
        emit(ax + (bx - ax) * f, ay + (by - ay) * f, along + s);
      }
      along += segLen;
      if (i + 2 === end) emit(bx, by, along);
    }
  }
  return samples;
}

function contourRings(samples: Sample[], cutoffSec: number, graph: WalkGraph): Position[][][] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  }
  const pad = OFFROAD_BUFFER_M + GRID_CELL_M;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = Math.max(4, Math.ceil((maxX - minX) / GRID_CELL_M) + 1);
  const h = Math.max(4, Math.ceil((maxY - minY) / GRID_CELL_M) + 1);
  const values = new Float64Array(w * h).fill(-1);

  for (const s of samples) {
    const r = Math.min((cutoffSec - s.t) * OFFROAD_MPS, OFFROAD_BUFFER_M);
    if (r < 0) continue;
    const cellR = Math.ceil(r / GRID_CELL_M);
    const ci = Math.round((s.x - minX) / GRID_CELL_M);
    const cj = Math.round((s.y - minY) / GRID_CELL_M);
    for (let j = Math.max(0, cj - cellR); j <= Math.min(h - 1, cj + cellR); j++) {
      for (let i = Math.max(0, ci - cellR); i <= Math.min(w - 1, ci + cellR); i++) {
        const dx = minX + i * GRID_CELL_M - s.x;
        const dy = minY + j * GRID_CELL_M - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const g = cutoffSec - (s.t + dist / OFFROAD_MPS);
        const k = j * w + i;
        if (g > values[k]!) values[k] = g;
      }
    }
  }

  const [contour] = contours().size([w, h]).thresholds([0])(Array.from(values));
  if (!contour) return [];
  const minAreaM2 = 1.5 * GRID_CELL_M * GRID_CELL_M;
  const out: Position[][][] = [];
  for (const poly of contour.coordinates) {
    const ringsM = poly.map((ring) =>
      ring.map(
        ([cx, cy]) =>
          [minX + (cx! - 0.5) * GRID_CELL_M, minY + (cy! - 0.5) * GRID_CELL_M] as [number, number],
      ),
    );
    const outer = ringsM[0];
    if (!outer || outer.length < 4 || Math.abs(shoelace(outer)) < minAreaM2) continue;
    out.push(
      ringsM
        .filter((ring) => ring.length >= 4)
        .map((ring) => ring.map(([x, y]) => graph.toLngLat(x, y) as Position)),
    );
  }
  return out;
}

function shoelace(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    area += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return area / 2;
}

function fallbackCircle(graph: WalkGraph, snap: SnapPoint, cutoffSec: number): Polygon {
  const r = Math.max(40, Math.min(cutoffSec * OFFROAD_MPS, OFFROAD_BUFFER_M));
  const ring: Position[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    ring.push(graph.toLngLat(snap.xm + r * Math.cos(a), snap.ym + r * Math.sin(a)) as Position);
  }
  return { type: 'Polygon', coordinates: [ring] };
}
