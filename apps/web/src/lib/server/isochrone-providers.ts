/**
 * Server-side isochrone provider selection (spec §7).
 * ISOCHRONE_PROVIDER=local|ors picks the adapter; ISOCHRONE_FALLBACK=ors adds
 * an ORS fallback for unexpected engine errors (never for out-of-coverage).
 */
import { OrsIsochroneProvider, type IsochroneProvider } from '@ilsochrone/providers';
import { BundledGraphSource, LocalIsochroneProvider } from '@ilsochrone/providers/server';

// 'local' is the default since the ORS validation run passed (mean IoU 0.825,
// docs/research/02-local-vs-ors-iou.md); set ISOCHRONE_PROVIDER=ors to compare.
const DEFAULT_PROVIDER = 'local';

export class MissingApiKeyError extends Error {
  constructor() {
    super('ORS_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

export interface IsochroneProviders {
  primary: IsochroneProvider;
  fallback: IsochroneProvider | null;
}

let cached: IsochroneProviders | null = null;

function makeOrs(): OrsIsochroneProvider {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return new OrsIsochroneProvider({ apiKey });
}

function makeLocal(): LocalIsochroneProvider {
  return new LocalIsochroneProvider({
    source: new BundledGraphSource(
      process.env.ISOCHRONE_GRAPH_PATH ? { assetPath: process.env.ISOCHRONE_GRAPH_PATH } : undefined,
    ),
  });
}

export function getIsochroneProviders(): IsochroneProviders {
  if (cached) return cached;
  const choice = process.env.ISOCHRONE_PROVIDER ?? DEFAULT_PROVIDER;
  if (choice === 'local') {
    const wantFallback = process.env.ISOCHRONE_FALLBACK === 'ors' && !!process.env.ORS_API_KEY;
    cached = { primary: makeLocal(), fallback: wantFallback ? makeOrs() : null };
  } else if (choice === 'ors') {
    cached = { primary: makeOrs(), fallback: null };
  } else {
    throw new Error(`Unknown ISOCHRONE_PROVIDER "${choice}" (expected 'local' or 'ors')`);
  }
  return cached;
}

export function __resetIsochroneProvidersForTests(): void {
  cached = null;
}
