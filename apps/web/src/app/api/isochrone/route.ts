/**
 * GET /api/isochrone?lng=...&lat=...&t=15&mode=walk
 *
 * Server-side proxy for the ORS isochrones endpoint. Hides the API key from
 * the browser, validates inputs with Zod, and adds short-lived caching to
 * survive the ORS free-tier rate limit (20 req/min).
 *
 * Cache strategy: round coordinates to 4 decimals (~11 m), cache 60 s. That
 * gives us many cache hits when the user nudges the pin or toggles time.
 *
 * Error contract (returned to the browser):
 *   200 OK                   — { polygon, metadata }
 *   400 invalid_request      — params failed Zod validation
 *   401 missing_api_key      — server has no ORS_API_KEY configured
 *   401 upstream_unauthorized — ORS rejected our key (invalid / unverified)
 *   429 rate_limited         — ORS free-tier exhausted
 *   502 upstream_failed      — ORS returned a non-2xx we don't have a label for
 *   500 internal_error       — anything else
 *
 * In development (NODE_ENV !== 'production') we attach `debug.{message, status,
 * body}` so the actual upstream error is visible in DevTools without grepping
 * the Next terminal.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  IsochroneRequestSchema,
  OrsError,
  OrsIsochroneProvider,
  TIME_BANDS_MIN,
  TravelModeSchema,
} from '@ilsochrone/providers';

export const runtime = 'nodejs';
export const revalidate = 60;

const QuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  t: z.coerce
    .number()
    .int()
    .refine((n): n is (typeof TIME_BANDS_MIN)[number] =>
      (TIME_BANDS_MIN as readonly number[]).includes(n),
    ),
  mode: TravelModeSchema.default('walk'),
});

let provider: OrsIsochroneProvider | null = null;
function getProvider(): OrsIsochroneProvider {
  if (provider) return provider;
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  provider = new OrsIsochroneProvider({ apiKey });
  return provider;
}

class MissingApiKeyError extends Error {
  constructor() {
    super('ORS_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

const isDev = process.env.NODE_ENV !== 'production';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    lng: url.searchParams.get('lng'),
    lat: url.searchParams.get('lat'),
    t: url.searchParams.get('t'),
    mode: url.searchParams.get('mode') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const req = IsochroneRequestSchema.parse({
    origin: [parsed.data.lng, parsed.data.lat],
    mode: parsed.data.mode,
    minutes: parsed.data.t,
  });

  try {
    const result = await getProvider().getIsochrone(req);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown): NextResponse {
  // Log everything we have on the server. The structured fields make it easy
  // to grep your Next terminal.
  console.error('[/api/isochrone] failed', summarize(err));

  if (err instanceof MissingApiKeyError) {
    return NextResponse.json(
      withDebug({ error: 'missing_api_key' }, err),
      { status: 401 },
    );
  }

  if (err instanceof OrsError) {
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json(
        withDebug({ error: 'upstream_unauthorized' }, err),
        { status: 401 },
      );
    }
    if (err.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json(
      withDebug({ error: 'upstream_failed', upstreamStatus: err.status }, err),
      { status: 502 },
    );
  }

  return NextResponse.json(
    withDebug({ error: 'internal_error' }, err),
    { status: 500 },
  );
}

function withDebug<T extends Record<string, unknown>>(payload: T, err: unknown): T & {
  debug?: { name: string; message: string; status?: number; body?: string };
} {
  if (!isDev) return payload;
  if (err instanceof OrsError) {
    return {
      ...payload,
      debug: {
        name: err.name,
        message: err.message,
        status: err.status,
        body: err.responseBody?.slice(0, 1000),
      },
    };
  }
  if (err instanceof Error) {
    return { ...payload, debug: { name: err.name, message: err.message } };
  }
  return payload;
}

function summarize(err: unknown): Record<string, unknown> {
  if (err instanceof OrsError) {
    return {
      name: err.name,
      status: err.status,
      message: err.message,
      body: err.responseBody?.slice(0, 500),
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: err };
}
