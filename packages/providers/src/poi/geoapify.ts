/**
 * GeoapifyPoiProvider — POI search via Geoapify Places API.
 *
 * Docs: https://apidocs.geoapify.com/docs/places/
 *
 * Geoapify exposes an OSM-derived category taxonomy. We map our internal
 * `PoiCategory` enum onto Geoapify category strings, and normalize the
 * response back to the internal `Poi` shape.
 *
 * Free tier (May 2026): 3000 req/day, no credit card.
 *
 * Server-side only. Implementation is a stub for T-08; the wiring in T-09
 * will exercise it. The interface and category mapping are committed now
 * so the route handler can be sketched against it.
 */
import {
  PoiQuerySchema,
  type Poi,
  type PoiProvider,
  type PoiQuery,
  type PoiResult,
} from './types';
import type { PoiCategory } from '../types';

const GEOAPIFY_BY_CATEGORY: Record<PoiCategory, string> = {
  park: 'leisure.park',
  cafe: 'catering.cafe',
  restaurant: 'catering.restaurant',
  museum: 'entertainment.museum',
  viewpoint: 'tourism.attraction.viewpoint',
  beach: 'beach',
};

const SUPPORTED: readonly PoiCategory[] = Object.keys(GEOAPIFY_BY_CATEGORY) as PoiCategory[];

const DEFAULT_BASE_URL = 'https://api.geoapify.com';

interface GeoapifyFeature {
  properties: {
    place_id?: string;
    name?: string;
    categories?: string[];
    lon: number;
    lat: number;
    datasource?: { raw?: { osm_type?: string; osm_id?: number } };
  };
}

interface GeoapifyResponse {
  features?: GeoapifyFeature[];
}

export interface GeoapifyPoiOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GeoapifyPoiProvider implements PoiProvider {
  readonly name = 'geoapify';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GeoapifyPoiOptions) {
    if (!opts.apiKey) throw new Error('GeoapifyPoiProvider: apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  supportedCategories(): readonly PoiCategory[] {
    return SUPPORTED;
  }

  async searchInBbox(input: PoiQuery): Promise<PoiResult> {
    const query = PoiQuerySchema.parse(input);
    const categoryParam = query.categories
      .map((c) => GEOAPIFY_BY_CATEGORY[c])
      .filter((c): c is string => Boolean(c))
      .join(',');
    const [w, s, e, n] = query.bbox;
    const params = new URLSearchParams({
      categories: categoryParam,
      filter: `rect:${w},${s},${e},${n}`,
      limit: String(query.limit),
      apiKey: this.apiKey,
    });

    const url = `${this.baseUrl}/v2/places?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`Geoapify Places request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GeoapifyResponse;
    const pois: Poi[] = (data.features ?? []).flatMap((f) => {
      const cat = matchInternalCategory(f.properties.categories ?? []);
      if (!cat) return [];
      const id = f.properties.place_id ?? makeFallbackId(f);
      return [
        {
          id,
          name: f.properties.name ?? 'Unnamed',
          category: cat,
          lngLat: [f.properties.lon, f.properties.lat],
          sourceUrl: osmUrlFor(f),
        },
      ];
    });

    return {
      pois,
      metadata: {
        provider: this.name,
        computedAt: new Date().toISOString(),
      },
    };
  }
}

function matchInternalCategory(geoapifyCategories: string[]): PoiCategory | undefined {
  for (const [internal, geoapify] of Object.entries(GEOAPIFY_BY_CATEGORY) as Array<
    [PoiCategory, string]
  >) {
    if (geoapifyCategories.some((c) => c === geoapify || c.startsWith(`${geoapify}.`))) {
      return internal;
    }
  }
  return undefined;
}

function makeFallbackId(f: GeoapifyFeature): string {
  const raw = f.properties.datasource?.raw;
  if (raw?.osm_type && raw?.osm_id) return `osm:${raw.osm_type}/${raw.osm_id}`;
  return `geoapify:${f.properties.lon},${f.properties.lat}`;
}

function osmUrlFor(f: GeoapifyFeature): string | undefined {
  const raw = f.properties.datasource?.raw;
  if (!raw?.osm_type || !raw?.osm_id) return undefined;
  return `https://www.openstreetmap.org/${raw.osm_type}/${raw.osm_id}`;
}
