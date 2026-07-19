import { afterEach, describe, expect, it } from 'vitest';
import {
  getIsochroneProviders,
  MissingApiKeyError,
  __resetIsochroneProvidersForTests,
} from './isochrone-providers';

const ENV_KEYS = ['ISOCHRONE_PROVIDER', 'ISOCHRONE_FALLBACK', 'ORS_API_KEY', 'ISOCHRONE_GRAPH_PATH'] as const;
const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetIsochroneProvidersForTests();
});

describe('getIsochroneProviders', () => {
  it('defaults to local when ISOCHRONE_PROVIDER is unset', () => {
    delete process.env.ISOCHRONE_PROVIDER;
    delete process.env.ISOCHRONE_FALLBACK;
    __resetIsochroneProvidersForTests();
    expect(getIsochroneProviders().primary.name).toBe('local');
  });

  it('selects local when ISOCHRONE_PROVIDER=local, no fallback by default', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    delete process.env.ISOCHRONE_FALLBACK;
    __resetIsochroneProvidersForTests();
    const { primary, fallback } = getIsochroneProviders();
    expect(primary.name).toBe('local');
    expect(fallback).toBeNull();
  });

  it('selects ors when ISOCHRONE_PROVIDER=ors and key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'ors';
    process.env.ORS_API_KEY = 'test-key';
    __resetIsochroneProvidersForTests();
    expect(getIsochroneProviders().primary.name).toBe('ors');
  });

  it('throws MissingApiKeyError for ors without a key', () => {
    process.env.ISOCHRONE_PROVIDER = 'ors';
    delete process.env.ORS_API_KEY;
    __resetIsochroneProvidersForTests();
    expect(() => getIsochroneProviders()).toThrow(MissingApiKeyError);
  });

  it('wires the ors fallback for local when requested and key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    process.env.ISOCHRONE_FALLBACK = 'ors';
    process.env.ORS_API_KEY = 'test-key';
    __resetIsochroneProvidersForTests();
    const { fallback } = getIsochroneProviders();
    expect(fallback?.name).toBe('ors');
  });

  it('silently skips the fallback when no ors key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    process.env.ISOCHRONE_FALLBACK = 'ors';
    delete process.env.ORS_API_KEY;
    __resetIsochroneProvidersForTests();
    expect(getIsochroneProviders().fallback).toBeNull();
  });
});

describe('route integration (local provider)', () => {
  it('maps an out-of-coverage origin to 422', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    delete process.env.ISOCHRONE_FALLBACK;
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    // Jerusalem — far outside the Tel Aviv clip bbox
    const res = await GET(new Request('http://test/api/isochrone?lng=35.2137&lat=31.7683&t=15&mode=walk'));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('out_of_coverage');
  });

  it('serves a walk isochrone from the bundled asset', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    const res = await GET(new Request('http://test/api/isochrone?lng=34.7745&lat=32.075&t=15&mode=walk'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(['Polygon', 'MultiPolygon']).toContain(body.polygon.type);
    expect(body.metadata.provider).toBe('local');
    expect(body.metadata.engine.version).toBeTruthy();
  });
});
