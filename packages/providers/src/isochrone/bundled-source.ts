/**
 * BundledGraphSource — reads the walk-graph asset committed to the deployment.
 * Server-side only (node:fs). Exported via '@ilsochrone/providers/server' ONLY.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAssetMeta, type GraphAssetMeta, type GraphSource, type ProfileId } from '@ilsochrone/engine';

const ASSET_FILENAME = 'walk-tlv.v1.bin';

/** cwd-relative candidates: next dev/build (apps/web), Vercel lambda (traced repo layout), package tests. */
function defaultCandidates(): string[] {
  return [
    join(process.cwd(), 'assets', 'graphs', ASSET_FILENAME),
    join(process.cwd(), 'apps', 'web', 'assets', 'graphs', ASSET_FILENAME),
    join(process.cwd(), '..', '..', 'apps', 'web', 'assets', 'graphs', ASSET_FILENAME),
  ];
}

const cache = new Map<string, Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }>>();

export interface BundledGraphSourceOptions {
  /** Explicit absolute path to the asset; overrides candidate resolution. */
  assetPath?: string;
}

export class BundledGraphSource implements GraphSource {
  readonly name = 'bundled';
  private readonly assetPath: string | undefined;

  constructor(opts?: BundledGraphSourceOptions) {
    this.assetPath = opts?.assetPath;
  }

  load(_profile: ProfileId): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }> {
    const key = this.assetPath ?? 'auto';
    let entry = cache.get(key);
    if (!entry) {
      entry = this.read();
      cache.set(key, entry);
      entry.catch(() => cache.delete(key)); // don't cache failures
    }
    return entry;
  }

  private async read(): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }> {
    const candidates = this.assetPath ? [this.assetPath] : defaultCandidates();
    for (const path of candidates) {
      try {
        const raw = await readFile(path);
        const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
        return { buffer, meta: readAssetMeta(buffer) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    throw new Error(
      `BundledGraphSource: graph asset "${ASSET_FILENAME}" not found. Tried: ${candidates.join(' | ')}`,
    );
  }
}
