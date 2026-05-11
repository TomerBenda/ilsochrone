'use client';

/**
 * PoiLayer — renders POI markers on the map.
 *
 * Responsibilities:
 *   - Filter incoming POIs to those inside the isochrone polygon (since the
 *     fetch was scoped to the bbox, which is a superset).
 *   - Render one Marker per POI, with a category-coloured dot.
 *   - On marker click, emit `onSelect(poi)` so the page can show the
 *     DestinationCard at the right place.
 */
import { useMemo } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import type { Polygon, MultiPolygon } from 'geojson';
import type { Poi, PoiCategory } from '@ilsochrone/providers';
import { isInsidePolygon } from '@/lib/polygon';
import { cn } from '@/lib/utils';

interface Props {
  pois: Poi[];
  polygon?: Polygon | MultiPolygon;
  onSelect: (poi: Poi) => void;
  /** When set, render the selected POI marker emphasized. */
  selectedId?: string;
}

const CATEGORY_COLORS: Record<PoiCategory, string> = {
  park: 'bg-emerald-500',
  cafe: 'bg-amber-600',
  restaurant: 'bg-orange-500',
  museum: 'bg-violet-500',
  viewpoint: 'bg-sky-500',
  beach: 'bg-cyan-500',
};

export function PoiLayer({ pois, polygon, onSelect, selectedId }: Props) {
  const visible = useMemo(() => {
    if (!polygon) return pois;
    return pois.filter((p) => isInsidePolygon([p.lngLat[0], p.lngLat[1]], polygon));
  }, [pois, polygon]);

  return (
    <>
      {visible.map((p) => (
        <Marker
          key={p.id}
          longitude={p.lngLat[0]}
          latitude={p.lngLat[1]}
          anchor="center"
          onClick={(e) => {
            // Stop the click from propagating to the map (which would dismiss
            // any open destination card).
            e.originalEvent?.stopPropagation();
            onSelect(p);
          }}
        >
          <PoiDot category={p.category} emphasized={p.id === selectedId} label={p.name} />
        </Marker>
      ))}
    </>
  );
}

function PoiDot({
  category,
  emphasized,
  label,
}: {
  category: PoiCategory;
  emphasized: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'block rounded-full border-2 border-white shadow-md transition-transform',
        CATEGORY_COLORS[category],
        emphasized ? 'h-4 w-4 scale-125' : 'h-3 w-3 hover:scale-110',
      )}
    />
  );
}
