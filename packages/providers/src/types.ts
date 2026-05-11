/**
 * Shared geographic primitives used across all providers.
 *
 * We use plain tuples and discriminated unions rather than classes so the
 * shapes serialize cleanly across the network and are easy to test against.
 */
import { z } from 'zod';

/** Longitude, latitude — the order MapLibre and GeoJSON use. */
export const LngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
export type LngLat = z.infer<typeof LngLatSchema>;

/** [west, south, east, north] — same order as Mapbox/MapLibre `getBounds().toArray().flat()`. */
export const BBoxSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
export type BBox = z.infer<typeof BBoxSchema>;

/** Travel modes the app cares about. Walking is MVP; the rest are phase-2 placeholders. */
export const TravelModeSchema = z.enum(['walk', 'bike', 'drive', 'transit']);
export type TravelMode = z.infer<typeof TravelModeSchema>;

/** Internal POI taxonomy. Adapters normalize provider-specific tags into these values. */
export const PoiCategorySchema = z.enum([
  'park',
  'cafe',
  'restaurant',
  'museum',
  'viewpoint',
  'beach',
]);
export type PoiCategory = z.infer<typeof PoiCategorySchema>;

/** A non-fatal warning from a provider (e.g., truncated results, fallback used). */
export interface ProviderWarning {
  code: string;
  message: string;
}

/** Common metadata returned alongside any provider result. */
export interface ProviderMetadata {
  /** Stable identifier, e.g. `'ors'`, `'geoapify'`, `'overpass'`, `'stadia'`. */
  provider: string;
  /** ISO-8601 timestamp of when the upstream call returned. */
  computedAt: string;
  /** Optional non-fatal warnings worth surfacing in the UI. */
  warnings?: ProviderWarning[];
}
