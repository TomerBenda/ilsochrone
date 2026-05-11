/**
 * TileProvider — abstracts the basemap behind MapLibre.
 *
 * MVP adapter: Stadia Maps (light + dark, generous free tier, decent Israel coverage).
 * Alternate adapter: MapTiler.
 *
 * Adapters return a MapLibre style URL — both Stadia and MapTiler ship hosted styles,
 * so we don't need inline StyleSpecification at this layer. Attribution is mandatory
 * and surfaced in the UI by the MapLibre attribution control.
 *
 * Kept maplibre-gl-free on purpose: this package has no map runtime dependency.
 */

export type TileTheme = 'light' | 'dark';

export interface TileStyle {
  /** URL to a MapLibre-compatible style JSON. */
  styleUrl: string;
  /** Required attribution string, displayed in the map's attribution control. */
  attribution: string;
}

export interface TileProvider {
  readonly name: string;
  getStyle(theme: TileTheme): TileStyle;
}
