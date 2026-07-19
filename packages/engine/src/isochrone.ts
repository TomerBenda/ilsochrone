import { OutOfCoverageError } from './errors';
import type { WalkGraph } from './graph';
import { polygonize } from './polygonize';
import { snapOrigin, shortestTimes, SNAP_MAX_M } from './search';
import type { IsochroneComputation, LngLat } from './types';

/** Snap -> bounded Dijkstra -> polygonize. Pure; throws OutOfCoverageError when unsnappable. */
export function computeIsochrone(graph: WalkGraph, origin: LngLat, minutes: number): IsochroneComputation {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new RangeError(`minutes must be a positive number, got ${minutes}`);
  }
  const snap = snapOrigin(graph, origin);
  if (!snap) {
    throw new OutOfCoverageError(
      `No walkable street within ${SNAP_MAX_M} m of [${origin[0]}, ${origin[1]}] — outside the covered area.`,
    );
  }
  const cutoffSec = minutes * 60;
  const times = shortestTimes(graph, snap, cutoffSec);
  const { polygon, degraded } = polygonize(graph, times, snap, cutoffSec);
  return { polygon, degraded, snapDistanceM: snap.distM };
}

export interface IsochroneBand {
  minutes: number;
  polygon: IsochroneComputation['polygon'];
  degraded: boolean;
}

export interface IsochroneBandsComputation {
  bands: IsochroneBand[];
  snapDistanceM: number;
}

/**
 * Multi-band isochrone: one snap, ONE Dijkstra at the largest cutoff, then a
 * polygonization per band from the same travel-time array. Entries beyond a
 * band's cutoff behave exactly like Infinity in polygonize's filters, so each
 * band's polygon is identical to a standalone computeIsochrone at that cutoff.
 */
export function computeIsochroneBands(
  graph: WalkGraph,
  origin: LngLat,
  bandsMinutes: number[],
): IsochroneBandsComputation {
  if (bandsMinutes.length === 0) throw new RangeError('bands must be non-empty');
  const sorted = [...bandsMinutes].sort((a, b) => a - b);
  for (const m of sorted) {
    if (!Number.isFinite(m) || m <= 0) throw new RangeError(`invalid band minutes: ${m}`);
  }
  const snap = snapOrigin(graph, origin);
  if (!snap) {
    throw new OutOfCoverageError(
      `No walkable street within ${SNAP_MAX_M} m of [${origin[0]}, ${origin[1]}] — outside the covered area.`,
    );
  }
  const times = shortestTimes(graph, snap, sorted[sorted.length - 1]! * 60);
  const bands = sorted.map((minutes) => {
    const { polygon, degraded } = polygonize(graph, times, snap, minutes * 60);
    return { minutes, polygon, degraded };
  });
  return { bands, snapDistanceM: snap.distM };
}
