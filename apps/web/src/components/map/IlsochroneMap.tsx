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
import { useEffect, useRef } from 'react';
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
  AttributionControl,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  TIME_BANDS_MIN,
  type IsochroneBandsFeatureCollection,
  type TileStyle,
} from '@ilsochrone/providers';

interface Props {
  tileStyle: TileStyle;
  viewState: { longitude: number; latitude: number; zoom: number };
  onViewStateChange: (next: { longitude: number; latitude: number; zoom: number }) => void;
  origin: { lng: number; lat: number };
  onOriginDragEnd: (next: { lng: number; lat: number }) => void;
  /** All computed time bands; layers below/at selectedMinutes are shown. */
  bands?: IsochroneBandsFeatureCollection;
  selectedMinutes: number;
  /** Shows a soft pulsing halo on the origin pin while bands are loading. */
  originLoading?: boolean;
  /** Optional destination pin + popup content (e.g. NavigateTo card). */
  destination?: { lng: number; lat: number; popup: React.ReactNode };
  /**
   * Fired on right-click / long-press anywhere on the map. This is the
   * "drop a destination" gesture — distinct from a plain click so the user
   * can pan, dismiss, and interact with markers without accidentally pinning.
   */
  onPickDestination?: (lngLat: { lng: number; lat: number }) => void;
  /**
   * Fired on a plain click on the map background. Used by the page to
   * dismiss an open destination card.
   */
  onMapBackgroundClick?: () => void;
  /** Optional POI markers to overlay. */
  poiMarkers?: React.ReactNode;
  /**
   * When this changes, the camera animates to the target. Used by "Surprise me".
   * Include a `key` field that changes per invocation so repeated flights to
   * the same lng/lat still fire.
   */
  cameraTarget?: { lng: number; lat: number; zoom?: number; key: number };
}

export function IlsochroneMap({
  tileStyle,
  viewState,
  onViewStateChange,
  origin,
  onOriginDragEnd,
  bands,
  selectedMinutes,
  originLoading,
  destination,
  onPickDestination,
  onMapBackgroundClick,
  poiMarkers,
  cameraTarget,
}: Props) {
  const mapRef = useRef<MapRef>(null);

  // Drive camera flights from outside. Re-fires whenever cameraTarget.key
  // changes — pick any monotonic number (Date.now() works) when invoking.
  useEffect(() => {
    if (!cameraTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({
      center: [cameraTarget.lng, cameraTarget.lat],
      zoom: cameraTarget.zoom ?? Math.max(viewState.zoom, 15),
      duration: reduced ? 0 : 1200,
      essential: true,
    });
    // We intentionally exclude viewState.zoom from the dep list — we want
    // this effect to fire only when cameraTarget changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTarget]);

  const handleContextMenu = (e: MapLayerMouseEvent) => {
    // Suppress the native browser context menu over the map canvas.
    e.originalEvent?.preventDefault();
    if (!onPickDestination) return;
    onPickDestination({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };

  const handleClick = () => {
    onMapBackgroundClick?.();
  };

  return (
    <Map
      ref={mapRef}
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
      onContextMenu={handleContextMenu}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" />
      {/* Sources already inject their own attribution; a customAttribution
          here duplicated the line. */}
      <AttributionControl position="bottom-right" compact />

      {bands && (
        <Source id="isochrone-bands" type="geojson" data={bands}>
          {TIME_BANDS_MIN.map((m) => (
            <Layer
              key={`fill-${m}`}
              id={`band-fill-${m}`}
              type="fill"
              filter={['==', ['get', 'minutes'], m]}
              layout={{ visibility: m <= selectedMinutes ? 'visible' : 'none' }}
              paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.05 }}
            />
          ))}
          {TIME_BANDS_MIN.map((m) => (
            <Layer
              key={`line-${m}`}
              id={`band-line-${m}`}
              type="line"
              filter={['==', ['get', 'minutes'], m]}
              layout={{ visibility: m <= selectedMinutes ? 'visible' : 'none' }}
              paint={
                m === selectedMinutes
                  ? { 'line-color': '#c2410c', 'line-width': 2.5, 'line-opacity': 0.9 }
                  : { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.9 }
              }
            />
          ))}
        </Source>
      )}

      <Marker
        longitude={origin.lng}
        latitude={origin.lat}
        draggable
        onDragEnd={(e) => onOriginDragEnd({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
        anchor="bottom"
      >
        <OriginPin loading={originLoading} />
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

function OriginPin({ loading }: { loading?: boolean }) {
  // Outer wrapper is a transparent hit-area extender so the drag target is
  // forgiving (~48px) without changing the visible pin (~32px). The cursor
  // affordance teaches the gesture: grab on hover, grabbing while dragging.
  return (
    <div
      role="img"
      aria-label="Origin (drag to move)"
      title="Drag me anywhere"
      className="relative flex h-12 w-12 cursor-grab items-center justify-center active:cursor-grabbing"
    >
      {loading && (
        <span
          className="absolute h-8 w-8 rounded-full bg-primary/40 motion-safe:animate-ping"
          aria-hidden
        />
      )}
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary shadow-lg">
        <span className="h-2 w-2 rounded-full bg-white" />
      </div>
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
