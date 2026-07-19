/**
 * LocalIsochroneProvider — the self-maintained engine behind the standard
 * IsochroneProvider seam (spec §7). Server-side only via '@ilsochrone/providers/server'.
 */
import {
  computeIsochrone,
  loadGraph,
  ENGINE_VERSION,
  type GraphSource,
  type WalkGraph,
} from '@ilsochrone/engine';
import {
  IsochroneRequestSchema,
  type IsochroneProvider,
  type IsochroneRequest,
  type IsochroneResult,
} from './types';
import type { ProviderWarning, TravelMode } from '../types';

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
    const warnings: ProviderWarning[] | undefined = degraded
      ? [
          {
            code: 'degraded_polygon',
            message: 'Isochrone fell back to a minimal buffer around the origin.',
          },
        ]
      : undefined;
    return {
      polygon,
      metadata: {
        provider: this.name,
        computedAt: new Date().toISOString(),
        engine: {
          version: ENGINE_VERSION,
          profile: graph.meta.profile,
          graphBuiltAt: graph.meta.buildTimestamp,
          osmSnapshot: graph.meta.osmSnapshot,
        },
        ...(warnings ? { warnings } : {}),
      },
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
