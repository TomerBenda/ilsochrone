/** Uniform-grid spatial index over edge polylines, built once at load. */
export const CELL_M = 250;

export interface SpatialIndex {
  cols: number;
  rows: number;
  /** cell -> undirected edge ids overlapping it (by per-segment bbox). */
  cells: Map<number, number[]>;
  maxXm: number;
  maxYm: number;
}

export function buildSpatialIndex(
  edgeCount: number,
  geomOffsets: Uint32Array,
  geomXm: Float64Array,
  geomYm: Float64Array,
  maxXm: number,
  maxYm: number,
): SpatialIndex {
  const cols = Math.max(1, Math.ceil(maxXm / CELL_M));
  const rows = Math.max(1, Math.ceil(maxYm / CELL_M));
  const cells = new Map<number, number[]>();
  const clampCol = (c: number) => Math.min(cols - 1, Math.max(0, c));
  const clampRow = (r: number) => Math.min(rows - 1, Math.max(0, r));
  for (let e = 0; e < edgeCount; e++) {
    const start = geomOffsets[e]!;
    const end = geomOffsets[e + 1]!;
    for (let i = start; i + 1 < end; i++) {
      const c0 = clampCol(Math.floor(Math.min(geomXm[i]!, geomXm[i + 1]!) / CELL_M));
      const c1 = clampCol(Math.floor(Math.max(geomXm[i]!, geomXm[i + 1]!) / CELL_M));
      const r0 = clampRow(Math.floor(Math.min(geomYm[i]!, geomYm[i + 1]!) / CELL_M));
      const r1 = clampRow(Math.floor(Math.max(geomYm[i]!, geomYm[i + 1]!) / CELL_M));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * cols + c;
          const list = cells.get(key);
          if (list === undefined) cells.set(key, [e]);
          else if (list[list.length - 1] !== e) list.push(e);
        }
      }
    }
  }
  return { cols, rows, cells, maxXm, maxYm };
}

/** Edge ids in the cell containing (x, y) plus the 8 neighbors. */
export function candidateEdges(index: SpatialIndex, xm: number, ym: number): number[] {
  const col = Math.floor(xm / CELL_M);
  const row = Math.floor(ym / CELL_M);
  const out = new Set<number>();
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= index.rows) continue;
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || c >= index.cols) continue;
      const list = index.cells.get(r * index.cols + c);
      if (list) for (const e of list) out.add(e);
    }
  }
  return [...out];
}
