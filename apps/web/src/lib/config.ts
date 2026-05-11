/**
 * Centralized config. Anything that varies between environments lives here so
 * components and route handlers don't read process.env directly.
 */

export const PUBLIC_CONFIG = {
  defaultLng: numFromEnv(process.env.NEXT_PUBLIC_DEFAULT_LNG, 34.7818),
  defaultLat: numFromEnv(process.env.NEXT_PUBLIC_DEFAULT_LAT, 32.0853),
  defaultZoom: numFromEnv(process.env.NEXT_PUBLIC_DEFAULT_ZOOM, 13),
  // Public Stadia URLs use a `?api_key=` query string. The key is fine to expose
  // because Stadia gates the key by referer/origin in production.
  stadiaApiKey: process.env.NEXT_PUBLIC_STADIA_API_KEY ?? '',
} as const;

function numFromEnv(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
