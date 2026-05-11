/**
 * GET /api/pois?bbox=w,s,e,n&cats=park,cafe&limit=100
 *
 * Server-side proxy for the Geoapify Places API. Hides the API key from
 * the browser, validates inputs with Zod, and adds short-lived caching.
 *
 * The route returns POIs in the bbox; client filters to inside the
 * isochrone polygon (see usePois + PoiLayer).
 *
 * Error contract:
 *   200 OK                    — { pois, metadata }
 *   400 invalid_request       — params failed Zod validation
 *   401 missing_api_key       — GEOAPIFY_API_KEY missing
 *   502 upstream_failed       — Geoapify returned a non-2xx
 *   500 internal_error        — anything else
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GeoapifyPoiProvider,
  PoiCategorySchema,
  PoiQuerySchema,
} from '@ilsochrone/providers';

export const runtime = 'nodejs';
export const revalidate = 120;

const QuerySchema = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(',').map(Number))
    .refine(
      (a): a is [number, number, number, number] =>
        a.length === 4 && a.every((n) => Number.isFinite(n)),
      { message: 'bbox must be 4 comma-separated numbers: w,s,e,n' },
    ),
  cats: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(PoiCategorySchema).min(1)),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

let provider: GeoapifyPoiProvider | null = null;
function getProvider(): GeoapifyPoiProvider {
  if (provider) return provider;
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  provider = new GeoapifyPoiProvider({ apiKey });
  return provider;
}

class MissingApiKeyError extends Error {
  constructor() {
    super('GEOAPIFY_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

const isDev = process.env.NODE_ENV !== 'production';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    bbox: url.searchParams.get('bbox'),
    cats: url.searchParams.get('cats'),
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const query = PoiQuerySchema.parse({
    bbox: parsed.data.bbox,
    categories: parsed.data.cats,
    limit: parsed.data.limit,
  });

  try {
    const result = await getProvider().searchInBbox(query);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('[/api/pois] failed', summarize(err));
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(withDebug({ error: 'missing_api_key' }, err), {
        status: 401,
      });
    }
    return NextResponse.json(withDebug({ error: 'upstream_failed' }, err), {
      status: 502,
    });
  }
}

function withDebug<T extends Record<string, unknown>>(payload: T, err: unknown): T & {
  debug?: { name: string; message: string };
} {
  if (!isDev || !(err instanceof Error)) return payload;
  return { ...payload, debug: { name: err.name, message: err.message } };
}

function summarize(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { value: err };
}
