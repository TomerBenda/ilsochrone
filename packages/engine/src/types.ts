import type { Polygon, MultiPolygon } from 'geojson';

/** [lng, lat] in WGS-84, matching the providers package convention. */
export type LngLat = [number, number];

export type ProfileId = 'walk';

/** Travels with every graph asset; embedded as JSON in the binary header. */
export interface GraphAssetMeta {
  formatVersion: number;
  profile: string; // e.g. 'walk-v1'
  osmSnapshot: string;
  buildTimestamp: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  counts: {
    nodes: number;
    directedEdges: number;
    undirectedEdges: number;
    geometryPoints: number;
  };
  speeds: { defaultKmh: number; stepsKmh: number };
}

/** Where graph bytes come from — the engine never knows (spec §5). */
export interface GraphSource {
  readonly name: string; // 'bundled', 'remote', ...
  load(profile: ProfileId): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }>;
}

export interface IsochroneComputation {
  polygon: Polygon | MultiPolygon;
  /** True when the polygonizer fell back to a minimal buffer around the origin. */
  degraded: boolean;
  /** Meters from the requested origin to the snapped point on the network. */
  snapDistanceM: number;
}
