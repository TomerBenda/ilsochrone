/**
 * Polygon helpers: bbox extraction, point-in-polygon, etc.
 *
 * MapLibre doesn't ship a turf equivalent; we use @turf/* for point-in-polygon
 * and bbox math. Keep this file thin — wrap turf surface area so the rest of
 * the app doesn't import turf directly.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Polygon, MultiPolygon, Feature, Position } from 'geojson';

/** Compute a tight bbox [west, south, east, north] for a (Multi)Polygon. */
export function bboxOf(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const rings: Position[][] =
    geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flatMap((p) => p);
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}

/** Whether [lng, lat] is inside the polygon. */
export function isInsidePolygon(
  point: [number, number],
  geom: Polygon | MultiPolygon,
): boolean {
  const feature: Feature<Polygon | MultiPolygon> = {
    type: 'Feature',
    geometry: geom,
    properties: {},
  };
  return booleanPointInPolygon({ type: 'Point', coordinates: point }, feature);
}
