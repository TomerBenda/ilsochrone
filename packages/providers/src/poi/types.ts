/**
 * PoiProvider — abstracts the source of point-of-interest data inside a bounding box.
 *
 * MVP adapter: Geoapify Places (OSM-sourced, predictable category model, free tier).
 * Escape-hatch adapter: Overpass (Private.coffee mirror) for raw-tag queries when needed.
 *
 * Adapters normalize results to the internal `PoiCategory` enum. Provider-specific tags
 * MUST NOT leak past the adapter boundary.
 */
import { z } from 'zod';
import {
  BBoxSchema,
  LngLatSchema,
  PoiCategorySchema,
  type PoiCategory,
  type ProviderMetadata,
} from '../types';

export const PoiQuerySchema = z.object({
  bbox: BBoxSchema,
  categories: z.array(PoiCategorySchema).min(1),
  limit: z.number().int().min(1).max(500).default(100),
});
export type PoiQuery = z.infer<typeof PoiQuerySchema>;

export const PoiSchema = z.object({
  /** Stable id within the provider; not globally unique across providers. */
  id: z.string(),
  name: z.string(),
  category: PoiCategorySchema,
  lngLat: LngLatSchema,
  /** Optional URL into the source dataset (e.g. an OSM way/node link). */
  sourceUrl: z.string().url().optional(),
});
export type Poi = z.infer<typeof PoiSchema>;

export interface PoiResult {
  pois: Poi[];
  metadata: ProviderMetadata;
}

export interface PoiProvider {
  readonly name: string;
  /** Categories the adapter can resolve; the route handler filters requests to this set. */
  supportedCategories(): readonly PoiCategory[];
  searchInBbox(query: PoiQuery): Promise<PoiResult>;
}
