/**
 * Browser geolocation wrapper.
 *
 * Promise-based, with a sensible timeout and a graceful fallback to a fixed
 * default when permission is denied or the API isn't available.
 */

export interface GeoFix {
  lng: number;
  lat: number;
  accuracyMeters: number;
}

export interface GeolocateOptions {
  /** Timeout in ms before falling back. */
  timeoutMs?: number;
  /** Fallback used on denial / failure. */
  fallback: { lng: number; lat: number };
}

export async function tryGeolocate(opts: GeolocateOptions): Promise<{
  fix: GeoFix | null;
  fallbackUsed: boolean;
}> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { fix: null, fallbackUsed: true };
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ fix: null, fallbackUsed: true });
    }, opts.timeoutMs ?? 6_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          fix: {
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            accuracyMeters: pos.coords.accuracy,
          },
          fallbackUsed: false,
        });
      },
      () => {
        clearTimeout(timer);
        resolve({ fix: null, fallbackUsed: true });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: opts.timeoutMs ?? 6_000 },
    );
  });
}
