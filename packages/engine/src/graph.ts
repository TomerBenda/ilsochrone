import { parseAsset } from './asset/reader';
import { makeFrame, toLngLat as frameToLngLat, toMeters as frameToMeters } from './geo';
import { buildSpatialIndex, type SpatialIndex } from './spatial';
import type { GraphAssetMeta } from './types';

export interface WalkGraph {
  meta: GraphAssetMeta;
  nodeCount: number;
  undirectedEdgeCount: number;
  nodeXm: Float64Array;
  nodeYm: Float64Array;
  csrOffsets: Uint32Array;
  csrTargets: Uint32Array;
  csrTimeCs: Uint32Array;
  csrGeomRef: Uint32Array;
  geomOffsets: Uint32Array;
  geomXm: Float64Array;
  geomYm: Float64Array;
  edgeA: Uint32Array;
  edgeB: Uint32Array;
  edgeTimeCs: Uint32Array;
  edgeLenM: Float64Array;
  spatial: SpatialIndex;
  toMeters(lng: number, lat: number): [number, number];
  toLngLat(xm: number, ym: number): [number, number];
}

/** Parse + index a graph asset. Called once per process; the result is cached by callers. */
export function loadGraph(buffer: ArrayBuffer): WalkGraph {
  const p = parseAsset(buffer);
  const frame = makeFrame(p.meta.bbox);
  const n = p.meta.counts.nodes;
  const u = p.meta.counts.undirectedEdges;
  const g = p.meta.counts.geometryPoints;

  const nodeXm = new Float64Array(n);
  const nodeYm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = frameToMeters(frame, p.nodeLng[i]!, p.nodeLat[i]!);
    nodeXm[i] = x;
    nodeYm[i] = y;
  }
  const geomXm = new Float64Array(g);
  const geomYm = new Float64Array(g);
  for (let i = 0; i < g; i++) {
    const [x, y] = frameToMeters(frame, p.geomLng[i]!, p.geomLat[i]!);
    geomXm[i] = x;
    geomYm[i] = y;
  }

  // Derive per-undirected-edge endpoints/times from the forward CSR entries.
  const edgeA = new Uint32Array(u);
  const edgeB = new Uint32Array(u);
  const edgeTimeCs = new Uint32Array(u);
  for (let node = 0; node < n; node++) {
    const end = p.csrOffsets[node + 1]!;
    for (let k = p.csrOffsets[node]!; k < end; k++) {
      const ref = p.csrGeomRef[k]!;
      if ((ref & 1) === 0) {
        const e = ref >>> 1;
        edgeA[e] = node;
        edgeB[e] = p.csrTargets[k]!;
        edgeTimeCs[e] = p.csrTimeCs[k]!;
      }
    }
  }

  const edgeLenM = new Float64Array(u);
  for (let e = 0; e < u; e++) {
    let len = 0;
    const end = p.geomOffsets[e + 1]!;
    for (let i = p.geomOffsets[e]!; i + 1 < end; i++) {
      len += Math.hypot(geomXm[i + 1]! - geomXm[i]!, geomYm[i + 1]! - geomYm[i]!);
    }
    edgeLenM[e] = len;
  }

  const [maxXm, maxYm] = frameToMeters(frame, p.meta.bbox[2], p.meta.bbox[3]);
  const spatial = buildSpatialIndex(u, p.geomOffsets, geomXm, geomYm, maxXm, maxYm);

  return {
    meta: p.meta,
    nodeCount: n,
    undirectedEdgeCount: u,
    nodeXm,
    nodeYm,
    csrOffsets: p.csrOffsets,
    csrTargets: p.csrTargets,
    csrTimeCs: p.csrTimeCs,
    csrGeomRef: p.csrGeomRef,
    geomOffsets: p.geomOffsets,
    geomXm,
    geomYm,
    edgeA,
    edgeB,
    edgeTimeCs,
    edgeLenM,
    spatial,
    toMeters: (lng, lat) => frameToMeters(frame, lng, lat),
    toLngLat: (xm, ym) => frameToLngLat(frame, xm, ym),
  };
}
