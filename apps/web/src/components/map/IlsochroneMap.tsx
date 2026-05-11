'use client';

/**
 * IlsochroneMap — the MapLibre canvas plus draggable origin and isochrone layer.
 *
 * Architecture:
 *   - State (origin, minutes, mode, destination) is owned by the parent page.
 *   - This component is presentational: it renders the map, exposes drag and
 *     click events, and accepts a polygon and optional destination to render.
 *   - All provider logic stays out of components — they receive primitives.
 */
import { useMemo } from 'react';
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
  AttributionControl,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Polygon, MultiPolygon, Feature } from 'geojson';
import type { TileStyle } from '@ilsochrone/providers';

interface Props {
  tileStyle: TileStyle;
  viewState: { longitude: number; latitude: number; zoom: number };
  onViewStateChange: (next: { longitude: number; latitude: number; zoom: number }) => void;
  origin: { lng: number; lat: number };
  onOriginDragEnd: (next: { lng: number; lat: number }) => void;
  polygon?: Polygon | MultiPolygon;
  /** Optional destination pin + popup content (e.g. NavigateTo card). */
  destination?: { lng: number; lat: number; popup: React.ReactNode };
  /** Fired when the user clicks the map outside the origin pin or destination popup. */
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** Optional POI markers to overlay. */
  poiMarkers?: React.ReactNode;
}

export function IlsochroneMap({
  tileStyle,
  viewState,
  onViewStateChange,
  origin,
  onOriginDragEnd,
  polygon,
  destination,
  onMapClick,
  poiMarkers,
}: Props) {
  const polygonFeature = useMemo<Feature<Polygon | MultiPolygon> | null>(() => {
    if (!polygon) return null;
    return { type: 'Feature', geometry: polygon, properties: {} };
  }, [polygon]);

  const handleClick = (e: MapLayerMouseEvent) => {
    if (!onMapClick) return;
    onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };

  return (
    <Map
      mapStyle={tileStyle.styleUrl}
      attributionControl={false}
      longitude={viewState.longitude}
      latitude={viewState.latitude}
      zoom={viewState.zoom}
      onMove={(e) =>
        onViewStateChange({
          longitude: e.viewState.longitude,
          latitude: e.viewState.latitude,
          zoom: e.viewState.zoom,
        })
      }
      onClick={handleClick}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" />
      <AttributionControl
        position="bottom-right"
        compact
        customAttribution={tileStyle.attribution}
      />

      {polygonFeature && (
        <Source id="isochrone" type="geojson" data={polygonFeature}>
          <Layer
            id="isochrone-fill"
            type="fill"
            paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.18 }}
          />
          <Layer
            id="isochrone-line"
            type="line"
            paint={{ 'line-color': '#1d4ed8', 'line-width': 2 }}
          />
        </Source>
      )}

      <Marker
        longitude={origin.lng}
        latitude={origin.lat}
        draggable
        onDragEnd={(e) => onOriginDragEnd({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
        anchor="bottom"
      >
        <OriginPin />
      </Marker>

      {destination && (
        <>
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
            <DestinationPin />
          </Marker>
          <Popup
            longitude={destination.lng}
            latitude={destination.lat}
            anchor="top"
            closeButton={false}
            closeOnClick={false}
            // Slight pixel offset so the popup doesn't overlap the pin.
            offset={[0, -28] as [number, number]}
            maxWidth="none"
            className="ilsochrone-destination-popup"
          >
            {destination.popup}
          </Popup>
        </>
      )}

      {poiMarkers}
    </Map>
  );
}

function OriginPin() {
  return (
    <div
      role="img"
      aria-label="Origin"
      className="flex h-8 w-8 -translate-y-1 items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow-lg"
    >
      <span className="h-2 w-2 rounded-full bg-white" />
    </div>
  );
}

function DestinationPin() {
  return (
    <div
      role="img"
      aria-label="Destination"
      className="flex h-7 w-7 -translate-y-1 items-center justify-center rounded-full border-2 border-white bg-amber-500 shadow-lg"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </div>
  );
}
