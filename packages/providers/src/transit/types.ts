/**
 * TransitDataProvider — phase-2 placeholder.
 *
 * In phase 2 we'll feed Israel MOT GTFS into a self-hosted OpenTripPlanner instance.
 * The provider abstracts how we fetch + refresh the static GTFS archive (and, if it
 * ever exists publicly for Israel, GTFS-Realtime).
 *
 * The interface is here from day 1 so the architectural seam is documented; no MVP
 * adapter implements it.
 */

export interface GtfsArchive {
  /** Filesystem path to the downloaded zip. */
  archivePath: string;
  validFrom: Date;
  validTo: Date;
  /** Source URL the archive was fetched from. */
  sourceUrl: string;
}

/** Minimal placeholder type — exact shape will follow gtfs-realtime-bindings when we wire it. */
export interface GtfsRtMessage {
  type: 'vehicle_position' | 'trip_update' | 'alert';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export interface TransitDataProvider {
  readonly name: string;
  /** Pull the latest static GTFS archive. */
  pullStaticGtfs(): Promise<GtfsArchive>;
  /** Optional realtime stream. Not available for Israel as of May 2026. */
  pullRealtime?(): AsyncIterable<GtfsRtMessage>;
}
