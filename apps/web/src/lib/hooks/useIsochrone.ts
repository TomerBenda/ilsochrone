'use client';

/**
 * SWR hook for fetching the isochrone polygon for the current map state.
 *
 * Cache key includes rounded coordinates and the time band, so dragging the
 * pin a few meters reuses the response while a real change triggers a refresh.
 */
import useSWR from 'swr';
import type { IsochroneResult, TimeBandMin, TravelMode } from '@ilsochrone/providers';

interface Args {
  lng: number;
  lat: number;
  minutes: TimeBandMin;
  mode: TravelMode;
}

const fetcher = async (url: string): Promise<IsochroneResult> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error('isochrone_fetch_failed'), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<IsochroneResult>;
};

export function useIsochrone({ lng, lat, minutes, mode }: Args) {
  // Round coordinates so micro-jitter doesn't bust the cache.
  const lngR = round(lng, 4);
  const latR = round(lat, 4);
  const key = `/api/isochrone?lng=${lngR}&lat=${latR}&t=${minutes}&mode=${mode}`;
  return useSWR<IsochroneResult, Error & { status?: number }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
