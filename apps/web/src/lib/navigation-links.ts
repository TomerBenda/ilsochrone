/**
 * Deep-link builders for handing off a destination to external navigation apps.
 *
 * There's no single web-standard "open in maps" interface. `geo:` URIs work on
 * Android and only Android. The Web Share API shares a URL but can't say
 * "navigate to here." So this is the pragmatic approach: a small set of
 * per-provider URL builders. On mobile, each provider's universal link opens
 * its native app if installed; on desktop, it opens a web tab.
 *
 * If you add a new provider, keep the function pure — no React, no DOM, no
 * `window.open`. That's the caller's job.
 */
import type { TravelMode } from '@ilsochrone/providers';

export interface NavigationDestination {
  lng: number;
  lat: number;
  /** Display label, used by some providers as the search query text. */
  name?: string;
}

export interface BuildOptions {
  origin?: { lng: number; lat: number };
  mode?: TravelMode;
}

export interface NavLink {
  id: 'google_maps' | 'waze' | 'moovit' | 'apple_maps' | 'osm';
  label: string;
  url: string;
}

/** Google Maps universal directions link. Mode hints are best-effort. */
export function googleMapsUrl(dest: NavigationDestination, opts: BuildOptions = {}): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
  });
  if (opts.origin) params.set('origin', `${opts.origin.lat},${opts.origin.lng}`);
  if (opts.mode) {
    const gmm = GOOGLE_MAPS_MODES[opts.mode];
    if (gmm) params.set('travelmode', gmm);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Waze universal link. Always car-mode by definition. */
export function wazeUrl(dest: NavigationDestination): string {
  // ll=<lat>,<lng>; navigate=yes starts directions immediately.
  return `https://www.waze.com/ul?ll=${dest.lat}%2C${dest.lng}&navigate=yes`;
}

/** Moovit — transit-focused, big in Israel. */
export function moovitUrl(dest: NavigationDestination, opts: BuildOptions = {}): string {
  const params = new URLSearchParams({
    to: `${dest.lat}_${dest.lng}_${dest.name ?? 'Destination'}`,
    customerId: '4908',
    ref: 'ilsochrone',
  });
  if (opts.origin) {
    params.set('from', `${opts.origin.lat}_${opts.origin.lng}_Origin`);
  }
  return `https://moovitapp.com/tripplan/?${params.toString()}`;
}

/** Apple Maps. iOS opens the native app; other platforms open the web view. */
export function appleMapsUrl(dest: NavigationDestination, opts: BuildOptions = {}): string {
  const params = new URLSearchParams({
    daddr: `${dest.lat},${dest.lng}`,
  });
  if (opts.origin) params.set('saddr', `${opts.origin.lat},${opts.origin.lng}`);
  if (opts.mode) {
    const m = APPLE_MAPS_MODES[opts.mode];
    if (m) params.set('dirflg', m);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

/** OpenStreetMap, as a credit-paying fallback that always works. */
export function osmUrl(dest: NavigationDestination): string {
  return `https://www.openstreetmap.org/?mlat=${dest.lat}&mlon=${dest.lng}#map=17/${dest.lat}/${dest.lng}`;
}

/** Build the full list of links for a destination, in display order. */
export function buildNavLinks(dest: NavigationDestination, opts: BuildOptions = {}): NavLink[] {
  return [
    { id: 'google_maps', label: 'Google Maps', url: googleMapsUrl(dest, opts) },
    { id: 'waze', label: 'Waze', url: wazeUrl(dest) },
    { id: 'moovit', label: 'Moovit', url: moovitUrl(dest, opts) },
    { id: 'apple_maps', label: 'Apple Maps', url: appleMapsUrl(dest, opts) },
    { id: 'osm', label: 'OpenStreetMap', url: osmUrl(dest) },
  ];
}

const GOOGLE_MAPS_MODES: Partial<Record<TravelMode, string>> = {
  walk: 'walking',
  bike: 'bicycling',
  drive: 'driving',
  transit: 'transit',
};

const APPLE_MAPS_MODES: Partial<Record<TravelMode, string>> = {
  walk: 'w',
  drive: 'd',
  transit: 'r',
};
