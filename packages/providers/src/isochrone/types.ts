/**
 * IsochroneProvider — abstracts the routing engine that computes travel-time polygons.
 *
 * MVP adapter: ORS (OpenRouteService).
 * Phase-2 adapter: OTP (self-hosted OpenTripPlanner) for transit.
 *
 * Adapters MUST run server-side only. Their constructors receive secrets from env vars.
 * The route handler is the only thing in the app that imports an adapter directly;
 * components depend on this interface via `IsochroneProvider`.
 */
import { z } from 'zod';
import type { Polygon, MultiPolygon } from 'geojson';
import { LngLatSchema, TravelModeSchema, type ProviderMetadata, type TravelMode } from '../types';

/** Allowed time bands in minutes. Keep in sync with the UI selector. */
export const TIME_BANDS_MIN = [5, 10, 15, 20, 30] as const;
export type TimeBandMin = (typeof TIME_BANDS_MIN)[number];

export const IsochroneRequestSchema = z.object({
  origin: LngLatSchema,
  mode: TravelModeSchema,
  minutes: z.number().int().refine(
    (n): n is TimeBandMin => (TIME_BANDS_MIN as readonly number[]).includes(n),
    { message: `minutes must be one of ${TIME_BANDS_MIN.join(', ')}` },
  ),
});
export type IsochroneRequest = z.infer<typeof IsochroneRequestSchema>;

export interface IsochroneResult {
  /** GeoJSON Polygon or MultiPolygon in WGS-84 (lng/lat). */
  polygon: Polygon | MultiPolygon;
  metadata: ProviderMetadata;
}

export interface IsochroneProvider {
  /** Stable adapter id, e.g. `'ors'`, `'otp'`. */
  readonly name: string;
  /** Whether this adapter can serve the given mode. */
  supports(mode: TravelMode): boolean;
  /** Compute an isochrone. Should throw on upstream failure; the route handler maps to HTTP. */
  getIsochrone(req: IsochroneRequest): Promise<IsochroneResult>;
}
