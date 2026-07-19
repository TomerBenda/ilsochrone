/** Binary contract constants — docs/reference/graph-asset-format.md. */
export const MAGIC = 'ILSOWALK';
export const FORMAT_VERSION = 1;
export const COORD_MAX = 65535;
export const HEADER_FIXED_BYTES = 16; // magic(8) + version(4) + metaLength(4)

export function align8(n: number): number {
  return Math.ceil(n / 8) * 8;
}
