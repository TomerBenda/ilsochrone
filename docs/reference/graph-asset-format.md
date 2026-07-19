# Graph asset binary format (v1)

The versioned binary walk-graph asset is the **language-neutral contract**
between the Python build pipeline (`tools/graph-pipeline`) and the TypeScript
runtime engine (`packages/engine`) — spec §5 of
`docs/superpowers/specs/2026-07-18-self-maintained-isochrone-engine-design.md`.

Any change here must update, together:

- Python writer: `tools/graph-pipeline/src/graph_pipeline/binfmt.py`
- TS reader: `packages/engine/src/asset/reader.ts`
- TS test writer: `packages/engine/src/__tests__/helpers/build-asset.ts`
- The committed fixture assets (`packages/engine/src/__fixtures__/tiny-walk.v1.bin`,
  `apps/web/assets/graphs/walk-tlv.v1.bin`)

## Layout (little-endian throughout)

```
bytes 0..8    magic "ILSOWALK" (ASCII)
bytes 8..12   uint32 formatVersion = 1
bytes 12..16  uint32 metaByteLength M
bytes 16..16+M  meta JSON, UTF-8, compact separators
then, each section 8-byte aligned (zero padding before each section start):
  nodeX        uint16[nodes]              quantized lng
  nodeY        uint16[nodes]              quantized lat
  csrOffsets   uint32[nodes+1]
  csrTargets   uint32[directedEdges]
  csrTimeCs    uint32[directedEdges]      walk time, centiseconds
  csrGeomRef   uint32[directedEdges]      (undirectedEdgeIndex << 1) | reversedBit
  geomOffsets  uint32[undirectedEdges+1]  indices into geom point arrays
  geomX        uint16[geometryPoints]
  geomY        uint16[geometryPoints]
```

## Meta JSON

Keys: `formatVersion, profile, osmSnapshot, buildTimestamp, bbox,
counts{nodes, directedEdges, undirectedEdges, geometryPoints},
speeds{defaultKmh, stepsKmh}`.

`bbox = [minLng, minLat, maxLng, maxLat]` — the exact min/max over ALL node
**and** geometry coordinates (padded by 1e-6° if degenerate).

## Quantization

Coordinates are stored as uint16 fractions of the bbox:

```
q = round((v - lo) / (hi - lo) * 65535)   clipped to [0, 65535]
v = lo + q / 65535 * (hi - lo)
```

Worked example: bbox lng span `34.74 → 34.92` (0.18°). One quantization step
is `0.18 / 65535 ≈ 2.75e-6°` ≈ **0.26 m** at 32°N — well under GPS accuracy,
fine for walking isochrones.

## CSR / geometry relationship

- Each **undirected** edge is stored once: its polyline runs from endpoint A
  to endpoint B **inclusive** (first/last points equal the node positions,
  within quantization error), at `geomOffsets[e] .. geomOffsets[e+1]`.
- Each undirected edge appears as exactly **two directed CSR entries**:
  the A→B entry has `csrGeomRef = (e << 1) | 0`, the B→A entry
  `(e << 1) | 1` (reversed bit set).
- `csrOffsets[n] .. csrOffsets[n+1]` are node *n*'s outgoing entries in
  `csrTargets` / `csrTimeCs` / `csrGeomRef`. Walk time is symmetric.
- Times are uint32 **centiseconds** (no practical overflow ceiling).

## Producers / consumers

| Role | Where |
| --- | --- |
| Writer (build) | `tools/graph-pipeline/src/graph_pipeline/binfmt.py` (`write_asset`) |
| Reader (test-only, Python) | same module (`read_asset`) |
| Reader (runtime) | `packages/engine/src/asset/reader.ts` (`parseAsset`, `readAssetMeta`) |
| Writer (test-only, TS) | `packages/engine/src/__tests__/helpers/build-asset.ts` (`buildAsset`) |
