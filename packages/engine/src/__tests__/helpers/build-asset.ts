/**
 * Test-only binary asset writer mirroring tools/graph-pipeline binfmt.py.
 * Contract: docs/reference/graph-asset-format.md. Keep the three in sync.
 */
import { COORD_MAX, FORMAT_VERSION, MAGIC, align8 } from '../../asset/format';
import type { GraphAssetMeta, LngLat } from '../../types';

export interface EdgeSpec {
  a: number;
  b: number;
  timeS: number;
  /** Full polyline A->B incl. endpoints; defaults to straight line. */
  geometry?: LngLat[];
}

export interface AssetSpec {
  nodes: LngLat[];
  edges: EdgeSpec[];
  meta?: Partial<Pick<GraphAssetMeta, 'profile' | 'osmSnapshot' | 'buildTimestamp' | 'speeds'>>;
}

export function buildAsset(spec: AssetSpec): ArrayBuffer {
  const { nodes, edges } = spec;
  const geometries = edges.map((e) => {
    const geom = e.geometry ?? [nodes[e.a]!, nodes[e.b]!];
    if (geom.length < 2) throw new Error('edge geometry needs >= 2 points');
    return geom;
  });

  const allPts: LngLat[] = [...nodes, ...geometries.flat()];
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of allPts) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (maxLng - minLng < 1e-9) maxLng += 1e-6;
  if (maxLat - minLat < 1e-9) maxLat += 1e-6;
  const qLng = (v: number) =>
    Math.min(COORD_MAX, Math.max(0, Math.round(((v - minLng) / (maxLng - minLng)) * COORD_MAX)));
  const qLat = (v: number) =>
    Math.min(COORD_MAX, Math.max(0, Math.round(((v - minLat) / (maxLat - minLat)) * COORD_MAX)));

  const geomOffsets = new Uint32Array(edges.length + 1);
  for (let e = 0; e < edges.length; e++) geomOffsets[e + 1] = geomOffsets[e]! + geometries[e]!.length;
  const gCount = geomOffsets[edges.length]!;
  const geomX = new Uint16Array(gCount);
  const geomY = new Uint16Array(gCount);
  let gi = 0;
  for (const geom of geometries) {
    for (const [lng, lat] of geom) {
      geomX[gi] = qLng(lng);
      geomY[gi] = qLat(lat);
      gi++;
    }
  }

  const adjacency: Array<Array<[number, number, number]>> = nodes.map(() => []);
  edges.forEach((e, i) => {
    const timeCs = Math.round(e.timeS * 100);
    adjacency[e.a]!.push([e.b, timeCs, (i << 1) | 0]);
    adjacency[e.b]!.push([e.a, timeCs, (i << 1) | 1]);
  });
  const dCount = edges.length * 2;
  const csrOffsets = new Uint32Array(nodes.length + 1);
  const csrTargets = new Uint32Array(dCount);
  const csrTimeCs = new Uint32Array(dCount);
  const csrGeomRef = new Uint32Array(dCount);
  let di = 0;
  adjacency.forEach((entries, n) => {
    entries.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]); // (target, time, ref) — matches binfmt.py
    for (const [target, timeCs, ref] of entries) {
      csrTargets[di] = target;
      csrTimeCs[di] = timeCs;
      csrGeomRef[di] = ref;
      di++;
    }
    csrOffsets[n + 1] = di;
  });

  const meta: GraphAssetMeta = {
    formatVersion: FORMAT_VERSION,
    profile: spec.meta?.profile ?? 'walk-v1',
    osmSnapshot: spec.meta?.osmSnapshot ?? 'test',
    buildTimestamp: spec.meta?.buildTimestamp ?? '2026-07-19T00:00:00+00:00',
    bbox: [minLng, minLat, maxLng, maxLat],
    counts: {
      nodes: nodes.length,
      directedEdges: dCount,
      undirectedEdges: edges.length,
      geometryPoints: gCount,
    },
    speeds: spec.meta?.speeds ?? { defaultKmh: 5, stepsKmh: 3 },
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));

  const nodeX = new Uint16Array(nodes.length);
  const nodeY = new Uint16Array(nodes.length);
  nodes.forEach(([lng, lat], i) => {
    nodeX[i] = qLng(lng);
    nodeY[i] = qLat(lat);
  });

  const sections: Array<Uint16Array | Uint32Array> = [
    nodeX,
    nodeY,
    csrOffsets,
    csrTargets,
    csrTimeCs,
    csrGeomRef,
    geomOffsets,
    geomX,
    geomY,
  ];
  let total = 16 + metaBytes.length;
  for (const s of sections) total = align8(total) + s.byteLength;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < 8; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint32(8, FORMAT_VERSION, true);
  view.setUint32(12, metaBytes.length, true);
  bytes.set(metaBytes, 16);
  let pos = 16 + metaBytes.length;
  for (const s of sections) {
    pos = align8(pos);
    bytes.set(new Uint8Array(s.buffer, s.byteOffset, s.byteLength), pos);
    pos += s.byteLength;
  }
  return buffer;
}
