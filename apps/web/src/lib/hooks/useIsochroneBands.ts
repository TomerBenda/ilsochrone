'use client';

/**
 * Fetches ALL time bands for the current origin/mode in one request, so the
 * time selector is instant client state. If the active provider can't compute
 * bands (warning `bands_unsupported`), falls back to refetching per selected
 * time like the classic hook.
 */
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  TIME_BANDS_MIN,
  type IsochroneBandsFeatureCollection,
  type TimeBandMin,
  type TravelMode,
} from '@ilsochrone/providers';

const MAX_BAND = TIME_BANDS_MIN[TIME_BANDS_MIN.length - 1]!;

interface Args {
  lng: number;
  lat: number;
  minutes: TimeBandMin;
  mode: TravelMode;
}

const fetcher = async (url: string): Promise<IsochroneBandsFeatureCollection> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error('isochrone_fetch_failed'), { status: res.status, body });
  }
  return res.json() as Promise<IsochroneBandsFeatureCollection>;
};

export function useIsochroneBands({ lng, lat, minutes, mode }: Args) {
  const [perTime, setPerTime] = useState(false);
  const lngR = round(lng, 4);
  const latR = round(lat, 4);
  const t = perTime ? minutes : MAX_BAND;
  const key = `/api/isochrone?lng=${lngR}&lat=${latR}&t=${t}&mode=${mode}&bands=1`;
  const swr = useSWR<IsochroneBandsFeatureCollection, Error & { status?: number }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (swr.data?.metadata.warnings?.some((w) => w.code === 'bands_unsupported')) setPerTime(true);
  }, [swr.data]);

  return swr;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
