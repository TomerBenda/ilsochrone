/**
 * URL-state encoding and parsing.
 *
 * The map state is the URL. We pick short keys so the link is shareable.
 * Unknown values fall back to defaults; we never throw on parse.
 *
 *   ?lng=34.78&lat=32.08&t=20&mode=walk&cats=park,cafe&z=14
 */
import { z } from 'zod';
import {
  PoiCategorySchema,
  TIME_BANDS_MIN,
  TravelModeSchema,
  type PoiCategory,
  type TimeBandMin,
  type TravelMode,
} from '@ilsochrone/providers';

export interface AppUrlState {
  origin: { lng: number; lat: number };
  mode: TravelMode;
  minutes: TimeBandMin;
  categories: PoiCategory[];
  zoom: number;
}

const TimeBandSchema = z
  .number()
  .refine((n): n is TimeBandMin => (TIME_BANDS_MIN as readonly number[]).includes(n));

export const DEFAULT_CATEGORIES: PoiCategory[] = ['park', 'cafe', 'museum', 'viewpoint'];

export interface AppUrlDefaults {
  lng: number;
  lat: number;
  zoom: number;
}

export function parseUrlState(
  search: string | URLSearchParams,
  defaults: AppUrlDefaults,
): AppUrlState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;

  const lng = parseNumber(params.get('lng'), defaults.lng);
  const lat = parseNumber(params.get('lat'), defaults.lat);
  const zoom = parseNumber(params.get('z'), defaults.zoom);

  const minutesRaw = parseNumber(params.get('t'), 15);
  const minutes = TimeBandSchema.safeParse(minutesRaw).success
    ? (minutesRaw as TimeBandMin)
    : 15;

  const modeParsed = TravelModeSchema.safeParse(params.get('mode'));
  const mode: TravelMode = modeParsed.success ? modeParsed.data : 'walk';

  const catsRaw = (params.get('cats') ?? '').split(',').filter(Boolean);
  const categories = catsRaw
    .map((c) => PoiCategorySchema.safeParse(c))
    .flatMap((r) => (r.success ? [r.data] : []));

  return {
    origin: { lng, lat },
    mode,
    minutes,
    categories: categories.length > 0 ? categories : DEFAULT_CATEGORIES,
    zoom,
  };
}

export function serializeUrlState(state: AppUrlState): string {
  const params = new URLSearchParams();
  params.set('lng', round(state.origin.lng, 5).toString());
  params.set('lat', round(state.origin.lat, 5).toString());
  params.set('z', round(state.zoom, 2).toString());
  params.set('t', state.minutes.toString());
  params.set('mode', state.mode);
  params.set('cats', state.categories.join(','));
  return params.toString();
}

function parseNumber(s: string | null, fallback: number): number {
  if (s === null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
