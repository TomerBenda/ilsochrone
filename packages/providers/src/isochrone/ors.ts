/**
 * OrsIsochroneProvider — adapter for the OpenRouteService isochrones endpoint.
 *
 * Endpoint: https://api.openrouteservice.org/v2/isochrones/{profile}
 * Docs:     https://openrouteservice.org/dev/#/api-docs/isochrones
 *
 * Free tier (May 2026): 500 requests/day, 20 req/min, 5 simultaneous.
 *
 * Server-side only. The `apiKey` comes from the ORS_API_KEY env var, read by the
 * route handler in apps/web. Never import this module into client components.
 */
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import {
  IsochroneRequestSchema,
  type IsochroneProvider,
  type IsochroneRequest,
  type IsochroneResult,
} from './types';
import type { TravelMode } from '../types';

/** Map our internal modes onto ORS profile slugs. */
const ORS_PROFILE: Record<TravelMode, string | null> = {
  walk: 'foot-walking',
  bike: 'cycling-regular',
  drive: 'driving-car',
  // Transit isn't supported by ORS; phase-2 OTP adapter handles it.
  transit: null,
};

const DEFAULT_BASE_URL = 'https://api.openrouteservice.org';

export interface OrsIsochroneOptions {
  /** ORS API key. Required. */
  apiKey: string;
  /** Override base URL for tests or self-hosted ORS. */
  baseUrl?: string;
  /** Optional fetch implementation for testability; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

export class OrsIsochroneProvider implements IsochroneProvider {
  readonly name = 'ors';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OrsIsochroneOptions) {
    if (!opts.apiKey) throw new Error('OrsIsochroneProvider: apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  supports(mode: TravelMode): boolean {
    return ORS_PROFILE[mode] !== null;
  }

  async getIsochrone(reqInput: IsochroneRequest): Promise<IsochroneResult> {
    // Validate at the boundary — even though TypeScript callers are typed,
    // route handlers may pass parsed JSON we don't fully trust.
    const req = IsochroneRequestSchema.parse(reqInput);

    const profile = ORS_PROFILE[req.mode];
    if (!profile) {
      throw new Error(`ORS does not support mode "${req.mode}"`);
    }

    const url = `${this.baseUrl}/v2/isochrones/${profile}`;
    const body = {
      // ORS uses [lng, lat]; matches our LngLat tuple.
      locations: [req.origin],
      // ORS expects seconds when range_type defaults to "time".
      range: [req.minutes * 60],
      attributes: ['area'],
      // Intentionally omit `smoothing` — its accepted scale (0-1 vs 0-100)
      // varies across ORS versions and the default is fine for MVP.
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json, application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await safeText(res);
      throw new OrsError(
        `ORS isochrone request failed: ${res.status} ${res.statusText}`,
        res.status,
        text,
      );
    }

    const data = (await res.json()) as FeatureCollection;
    const polygon = extractPolygon(data);

    return {
      polygon,
      metadata: {
        provider: this.name,
        computedAt: new Date().toISOString(),
      },
    };
  }
}

export class OrsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'OrsError';
  }
}

function extractPolygon(fc: FeatureCollection): Polygon | MultiPolygon {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('ORS response is not a FeatureCollection');
  }
  const feat = fc.features[0] as Feature | undefined;
  if (!feat || !feat.geometry) {
    throw new Error('ORS response has no features');
  }
  if (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon') {
    throw new Error(`Unexpected ORS geometry type: ${feat.geometry.type}`);
  }
  return feat.geometry;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
