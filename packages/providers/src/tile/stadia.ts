/**
 * StadiaTileProvider — basemap adapter for Stadia Maps.
 *
 * Docs: https://docs.stadiamaps.com/themes/
 *
 * Stadia hosts MapLibre-compatible style JSONs at predictable URLs. We use
 * `alidade_smooth` for light and `alidade_smooth_dark` for dark.
 *
 * The API key is appended as a query string. Stadia also supports
 * referer-based auth (no key for whitelisted domains) — we use the key
 * for portability.
 */
import type { TileProvider, TileStyle, TileTheme } from './types';

const STYLE_BY_THEME: Record<TileTheme, string> = {
  light: 'alidade_smooth',
  dark: 'alidade_smooth_dark',
};

const ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; ' +
  '<a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

export interface StadiaTileOptions {
  /** Stadia API key. Optional when running on a domain whitelisted in your Stadia dashboard. */
  apiKey?: string;
}

export class StadiaTileProvider implements TileProvider {
  readonly name = 'stadia';

  private readonly apiKey: string | undefined;

  constructor(opts: StadiaTileOptions = {}) {
    this.apiKey = opts.apiKey;
  }

  getStyle(theme: TileTheme): TileStyle {
    // Direct property access keeps TS happy with `noUncheckedIndexedAccess`.
    const slug = theme === 'dark' ? STYLE_BY_THEME.dark : STYLE_BY_THEME.light;
    const qs = this.apiKey ? `?api_key=${encodeURIComponent(this.apiKey)}` : '';
    return {
      styleUrl: `https://tiles.stadiamaps.com/styles/${slug}.json${qs}`,
      attribution: ATTRIBUTION,
    };
  }
}
