'use client';

/**
 * PoiLayer — renders POI markers on the map.
 *
 * Dumb renderer: the parent passes already-visible POIs (i.e. inside the
 * isochrone polygon) and we just draw them. Polygon clipping lives in
 * page.tsx so "Surprise me" and the layer share the same visible set.
 */
import { Marker } from 'react-map-gl/maplibre';
import type { Poi, PoiCategory } from '@ilsochrone/providers';
import { cn } from '@/lib/utils';
import { Trees, Coffee, Utensils, Landmark, Eye, Waves, type LucideIcon } from 'lucide-react';

interface Props {
  pois: Poi[];
  onSelect: (poi: Poi) => void;
  /** When set, render the selected POI marker emphasized. */
  selectedId?: string;
  /** Current map zoom; at close zoom the dots gain category glyphs. */
  zoom?: number;
}

/** Kept in the same hue family as the CategoryToggles pastel chips. */
const CATEGORY_COLORS: Record<PoiCategory, string> = {
  park: 'bg-emerald-500',
  cafe: 'bg-amber-500',
  restaurant: 'bg-rose-500',
  museum: 'bg-violet-500',
  viewpoint: 'bg-sky-500',
  beach: 'bg-cyan-500',
};

const CATEGORY_ICONS: Record<PoiCategory, LucideIcon> = {
  park: Trees,
  cafe: Coffee,
  restaurant: Utensils,
  museum: Landmark,
  viewpoint: Eye,
  beach: Waves,
};

const GLYPH_ZOOM = 15;

export function PoiLayer({ pois, onSelect, selectedId, zoom }: Props) {
  const showGlyphs = (zoom ?? 0) >= GLYPH_ZOOM;
  return (
    <>
      {pois.map((p) => (
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
          <PoiDot
            category={p.category}
            emphasized={p.id === selectedId}
            label={p.name}
            glyph={showGlyphs}
          />
        </Marker>
      ))}
    </>
  );
}

function PoiDot({
  category,
  emphasized,
  label,
  glyph,
}: {
  category: PoiCategory;
  emphasized: boolean;
  label: string;
  glyph: boolean;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          'flex items-center justify-center rounded-full border-2 border-white shadow-md transition-transform',
          CATEGORY_COLORS[category],
          emphasized
            ? 'h-5 w-5 scale-125'
            : glyph
              ? 'h-5 w-5 hover:scale-110'
              : 'h-3.5 w-3.5 hover:scale-110',
        )}
      >
        {(glyph || emphasized) && <Icon className="h-2.5 w-2.5 text-white" aria-hidden />}
      </button>
      {emphasized && (
        <span className="pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium shadow ring-1 ring-border">
          {label}
        </span>
      )}
    </div>
  );
}
