'use client';

/**
 * Home page — single map view with origin, time selector, and isochrone polygon.
 *
 * State flow:
 *   URL  ──parse──► state  ──serialize──► history.replaceState
 *                  │
 *                  ├──► <IlsochroneMap origin={...} polygon={...} />
 *                  ├──► <TimeSelector value={minutes} />
 *                  └──► useIsochrone(...) → SWR → /api/isochrone → ORS
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { StadiaTileProvider, type TimeBandMin } from '@ilsochrone/providers';
import { TimeSelector } from '@/components/controls/TimeSelector';
import { ModeSelector } from '@/components/controls/ModeSelector';
import { DestinationCard } from '@/components/destination/DestinationCard';
import { tryGeolocate } from '@/lib/geolocation';
import { useIsochrone } from '@/lib/hooks/useIsochrone';
import { PUBLIC_CONFIG } from '@/lib/config';
import {
  DEFAULT_CATEGORIES,
  parseUrlState,
  serializeUrlState,
  type AppUrlState,
} from '@/lib/url-state';

// Client-only import: MapLibre touches `window` at module load.
const IlsochroneMap = dynamic(
  () => import('@/components/map/IlsochroneMap.client').then((m) => m.IlsochroneMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted" aria-hidden /> },
);

export default function HomePage() {
  const tileProvider = useMemo(
    () => new StadiaTileProvider({ apiKey: PUBLIC_CONFIG.stadiaApiKey || undefined }),
    [],
  );
  const tileStyle = useMemo(() => tileProvider.getStyle('light'), [tileProvider]);

  // Initial state: parse from URL on first render, fall back to public defaults.
  const initialState = useMemo<AppUrlState>(() => {
    if (typeof window === 'undefined') {
      return {
        origin: { lng: PUBLIC_CONFIG.defaultLng, lat: PUBLIC_CONFIG.defaultLat },
        zoom: PUBLIC_CONFIG.defaultZoom,
        minutes: 15,
        mode: 'walk',
        categories: DEFAULT_CATEGORIES,
      };
    }
    return parseUrlState(window.location.search, {
      lng: PUBLIC_CONFIG.defaultLng,
      lat: PUBLIC_CONFIG.defaultLat,
      zoom: PUBLIC_CONFIG.defaultZoom,
    });
  }, []);

  const [state, setState] = useState<AppUrlState>(initialState);
  const [destination, setDestination] = useState<{ lng: number; lat: number } | null>(null);

  // On mount: if no `lng`/`lat` in URL, ask for geolocation and use it.
  const askedGeoRef = useRef(false);
  useEffect(() => {
    if (askedGeoRef.current) return;
    askedGeoRef.current = true;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('lng') && params.has('lat')) return;
    tryGeolocate({
      fallback: { lng: PUBLIC_CONFIG.defaultLng, lat: PUBLIC_CONFIG.defaultLat },
    }).then(({ fix }) => {
      if (fix) {
        setState((s) => ({ ...s, origin: { lng: fix.lng, lat: fix.lat } }));
      }
    });
  }, []);

  // Persist state to URL (debounced lightly via rAF).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = serializeUrlState(state);
    const next = `${window.location.pathname}?${qs}`;
    window.history.replaceState(null, '', next);
  }, [state]);

  const onOriginDragEnd = useCallback((next: { lng: number; lat: number }) => {
    setState((s) => ({ ...s, origin: next }));
  }, []);

  const onMinutesChange = useCallback((minutes: TimeBandMin) => {
    setState((s) => ({ ...s, minutes }));
  }, []);

  const onModeChange = useCallback((mode: AppUrlState['mode']) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const onMapClick = useCallback((lngLat: { lng: number; lat: number }) => {
    setDestination(lngLat);
  }, []);

  const onDismissDestination = useCallback(() => setDestination(null), []);

  const { data, error, isLoading } = useIsochrone({
    lng: state.origin.lng,
    lat: state.origin.lat,
    minutes: state.minutes,
    mode: state.mode,
  });

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <IlsochroneMap
          tileStyle={tileStyle}
          viewState={{
            longitude: state.origin.lng,
            latitude: state.origin.lat,
            zoom: state.zoom,
          }}
          onViewStateChange={(v) =>
            setState((s) => ({
              ...s,
              zoom: v.zoom,
              // Don't move origin on pan; only on marker drag.
            }))
          }
          origin={state.origin}
          onOriginDragEnd={onOriginDragEnd}
          polygon={data?.polygon}
          onMapClick={onMapClick}
          destination={
            destination
              ? {
                  lng: destination.lng,
                  lat: destination.lat,
                  popup: (
                    <DestinationCard
                      title="Drop point"
                      subtitle={`${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}`}
                      destination={destination}
                      origin={state.origin}
                      mode={state.mode}
                      onClose={onDismissDestination}
                    />
                  ),
                }
              : undefined
          }
        />
      </div>

      <header className="pointer-events-none absolute left-0 right-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-lg bg-background/95 px-4 py-2 shadow-md ring-1 ring-border backdrop-blur">
          <h1 className="text-base font-semibold">Ilsochrone</h1>
          <p className="text-xs text-muted-foreground">Where can you get in {state.minutes} min?</p>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <ModeSelector value={state.mode} onChange={onModeChange} />
          <TimeSelector value={state.minutes} onChange={onMinutesChange} />
        </div>
      </header>

      <Status isLoading={isLoading} error={error} />
    </main>
  );
}

function Status({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (!error && !isLoading) return null;
  const message = error
    ? errorMessage(error)
    : 'Computing isochrone…';
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 transform">
      <div className="pointer-events-auto rounded-full bg-background/95 px-4 py-1.5 text-sm shadow-md ring-1 ring-border backdrop-blur">
        {message}
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: number }).status;
    if (status === 429) return 'Rate-limited. Try again in a few seconds.';
    if (status === 502) return 'Upstream routing service is unavailable.';
  }
  return 'Something went wrong fetching the isochrone.';
}
