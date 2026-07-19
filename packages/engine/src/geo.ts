/** Local equirectangular meter frame — good to <0.5% error at metro scale. */
export interface MeterFrame {
  minLng: number;
  minLat: number;
  kx: number;
  ky: number;
}

export function makeFrame(bbox: [number, number, number, number]): MeterFrame {
  const [minLng, minLat, , maxLat] = bbox;
  const refLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  return { minLng, minLat, kx: 111320 * Math.cos(refLat), ky: 111132 };
}

export function toMeters(f: MeterFrame, lng: number, lat: number): [number, number] {
  return [(lng - f.minLng) * f.kx, (lat - f.minLat) * f.ky];
}

export function toLngLat(f: MeterFrame, x: number, y: number): [number, number] {
  return [f.minLng + x / f.kx, f.minLat + y / f.ky];
}

/** Squared distance from point P to segment AB, plus the projection parameter t in [0,1]. */
export function projectToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; x: number; y: number; dist2: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, x, y, dist2: (px - x) * (px - x) + (py - y) * (py - y) };
}
