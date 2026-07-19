/**
 * LocalIsochroneProvider — the self-maintained engine behind the standard
 * IsochroneProvider seam (spec §7). Server-side only via '@ilsochrone/providers/server'.
 */
import {
  computeIsochrone,
  computeIsochroneBands,
  loadGraph,
  ENGINE_VERSION,
  type GraphSource,
  type WalkGraph,
} from '@ilsochrone/engine';
import {
  IsochroneBandsRequestSchema,
  IsochroneRequestSchema,
  type IsochroneBandsRequest,
  type IsochroneBandsResult,
  type IsochroneProvider,
  type IsochroneRequest,
  type IsochroneResult,
  type TimeBandMin,
} from './types';
import type { ProviderMetadata, TravelMode } from '../types';

export interface LocalIsochroneOptions {
  source: GraphSource;
}

export class LocalIsochroneProvider implements IsochroneProvider {
  readonly name = 'local';

  private readonly source: GraphSource;
  private graphPromise: Promise<WalkGraph> | null = null;

  constructor(opts: LocalIsochroneOptions) {
    this.source = opts.source;
  }

  supports(mode: TravelMode): boolean {
    return mode === 'walk';
  }

  async getIsochrone(reqInput: IsochroneRequest): Promise<IsochroneResult> {
    const req = IsochroneRequestSchema.parse(reqInput);
    if (!this.supports(req.mode)) {
      throw new Error(`local engine does not support mode "${req.mode}" yet`);
    }
    const graph = await this.getGraph();
    const { polygon, degraded } = computeIsochrone(graph, req.origin, req.minutes);
    return { polygon, metadata: this.buildMetadata(graph, degraded) };
  }

  async getIsochroneBands(reqInput: IsochroneBandsRequest): Promise<IsochroneBandsResult> {
    const req = IsochroneBandsRequestSchema.parse(reqInput);
    if (!this.supports(req.mode)) {
      throw new Error(`local engine does not support mode "${req.mode}" yet`);
    }
    const graph = await this.getGraph();
    const { bands } = computeIsochroneBands(graph, req.origin, req.bands);
    const anyDegraded = bands.some((b) => b.degraded);
    return {
      bands: bands.map((b) => ({ minutes: b.minutes as TimeBandMin, polygon: b.polygon })),
      metadata: this.buildMetadata(graph, anyDegraded),
    };
  }

  private buildMetadata(graph: WalkGraph, degraded: boolean): ProviderMetadata {
    return {
      provider: this.name,
      computedAt: new Date().toISOString(),
      engine: {
        version: ENGINE_VERSION,
        profile: graph.meta.profile,
        graphBuiltAt: graph.meta.buildTimestamp,
        osmSnapshot: graph.meta.osmSnapshot,
      },
      ...(degraded
        ? {
            warnings: [
              {
                code: 'degraded_polygon',
                message: 'Isochrone fell back to a minimal buffer around the origin.',
              },
            ],
          }
        : {}),
    };
  }

  private getGraph(): Promise<WalkGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.source.load('walk').then(({ buffer }) => loadGraph(buffer));
      this.graphPromise.catch(() => {
        this.graphPromise = null; // allow retry after a failed load
      });
    }
    return this.graphPromise;
  }
}
