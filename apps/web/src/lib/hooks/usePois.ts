'use client';

/**
 * SWR hook for fetching POIs scoped to a bounding box and category set.
 *
 * The polygon-clipping step happens in the layer (turf.booleanPointInPolygon)
 * since the bbox is a superset of the polygon. We round bbox coords to 3
 * decimals so micro-pans don't bust the cache.
 */
import useSWR from 'swr';
import type { PoiCategory, PoiResult } from '@ilsochrone/providers';

interface Args {
  bbox: [number, number, number, number] | null;
  categories: PoiCategory[];
  limit?: number;
}

const fetcher = async (url: string): Promise<PoiResult> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error('pois_fetch_failed'), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<PoiResult>;
};

export function usePois({ bbox, categories, limit = 200 }: Args) {
  const key =
    bbox && categories.length > 0
      ? `/api/pois?bbox=${bbox.map((n) => round(n, 3)).join(',')}&cats=${categories.join(',')}&limit=${limit}`
      : null;
  return useSWR<PoiResult, Error & { status?: number }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
