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
