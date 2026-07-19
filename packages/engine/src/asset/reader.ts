/** Binary asset parser. Contract: docs/reference/graph-asset-format.md. */
import { AssetFormatError } from '../errors';
import type { GraphAssetMeta } from '../types';
import { COORD_MAX, FORMAT_VERSION, MAGIC, align8 } from './format';

export interface ParsedAsset {
  meta: GraphAssetMeta;
  /** Dequantized WGS-84 coordinates. */
  nodeLng: Float64Array;
  nodeLat: Float64Array;
  csrOffsets: Uint32Array;
  csrTargets: Uint32Array;
  csrTimeCs: Uint32Array;
  csrGeomRef: Uint32Array;
  geomOffsets: Uint32Array;
  geomLng: Float64Array;
  geomLat: Float64Array;
}

export function readAssetMeta(buffer: ArrayBuffer): GraphAssetMeta {
  if (buffer.byteLength < 16) throw new AssetFormatError('asset too small for header');
  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new AssetFormatError(`bad magic "${magic}"`);
  const version = view.getUint32(8, true);
  if (version !== FORMAT_VERSION) {
    throw new AssetFormatError(`unsupported format version ${version} (engine supports ${FORMAT_VERSION})`);
  }
  const metaLen = view.getUint32(12, true);
  if (16 + metaLen > buffer.byteLength) throw new AssetFormatError('meta length exceeds buffer');
  const json = new TextDecoder().decode(new Uint8Array(buffer, 16, metaLen));
  try {
    return JSON.parse(json) as GraphAssetMeta;
  } catch {
    throw new AssetFormatError('meta JSON is unparseable');
  }
}

export function parseAsset(buffer: ArrayBuffer): ParsedAsset {
  const meta = readAssetMeta(buffer);
  const { nodes: n, directedEdges: d, undirectedEdges: u, geometryPoints: g } = meta.counts;
  const metaLen = new DataView(buffer).getUint32(12, true);

  let pos = 16 + metaLen;
  const takeU16 = (count: number): Uint16Array => {
    pos = align8(pos);
    if (pos + count * 2 > buffer.byteLength) throw new AssetFormatError('asset truncated');
    const arr = new Uint16Array(buffer, pos, count);
    pos += count * 2;
    return arr;
  };
  const takeU32 = (count: number): Uint32Array => {
    pos = align8(pos);
    if (pos + count * 4 > buffer.byteLength) throw new AssetFormatError('asset truncated');
    const arr = new Uint32Array(buffer, pos, count);
    pos += count * 4;
    return arr;
  };

  const [minLng, minLat, maxLng, maxLat] = meta.bbox;
  const deq = (q: Uint16Array, lo: number, hi: number): Float64Array => {
    const out = new Float64Array(q.length);
    const scale = (hi - lo) / COORD_MAX;
    for (let i = 0; i < q.length; i++) out[i] = lo + q[i]! * scale;
    return out;
  };

  const nodeX = takeU16(n);
  const nodeY = takeU16(n);
  const csrOffsets = takeU32(n + 1);
  const csrTargets = takeU32(d);
  const csrTimeCs = takeU32(d);
  const csrGeomRef = takeU32(d);
  const geomOffsets = takeU32(u + 1);
  const geomX = takeU16(g);
  const geomY = takeU16(g);

  return {
    meta,
    nodeLng: deq(nodeX, minLng, maxLng),
    nodeLat: deq(nodeY, minLat, maxLat),
    csrOffsets,
    csrTargets,
    csrTimeCs,
    csrGeomRef,
    geomOffsets,
    geomLng: deq(geomX, minLng, maxLng),
    geomLat: deq(geomY, minLat, maxLat),
  };
}
