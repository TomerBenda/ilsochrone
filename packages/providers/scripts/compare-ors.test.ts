/**
 * Reality-check: local engine vs ORS, IoU over 10 origins x 3 time bands (spec §9).
 * Run: pnpm --filter @ilsochrone/providers compare:ors   (needs ORS_API_KEY or apps/web/.env.local)
 * Writes docs/research/02-local-vs-ors-iou.md. Skips silently without a key.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import area from '@turf/area';
import { feature, featureCollection } from '@turf/helpers';
import intersect from '@turf/intersect';
import union from '@turf/union';
import type { MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { BundledGraphSource } from '../src/isochrone/bundled-source';
import { LocalIsochroneProvider } from '../src/isochrone/local';
import { OrsIsochroneProvider } from '../src/isochrone/ors';

const REPO = join(__dirname, '..', '..', '..');
const OUT = join(REPO, 'docs', 'research', '02-local-vs-ors-iou.md');
const ASSET = join(REPO, 'apps', 'web', 'assets', 'graphs', 'walk-tlv.v1.bin');

function orsKey(): string | null {
  if (process.env.ORS_API_KEY) return process.env.ORS_API_KEY;
  const envFile = join(REPO, 'apps', 'web', '.env.local');
  if (!existsSync(envFile)) return null;
  const m = readFileSync(envFile, 'utf8').match(/^ORS_API_KEY=(.+)$/m);
  // Mirror dotenv: trim whitespace/CR and strip surrounding quotes.
  return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null;
}

const ORIGINS: Array<[string, number, number]> = [
  ['Dizengoff Center', 34.7745, 32.075],
  ['Tel Aviv Port', 34.7754, 32.0966],
  ['Jaffa Clock Tower', 34.7522, 32.0543],
  ['Ramat Gan Diamond District', 34.8039, 32.0839],
  ['Tel Aviv University', 34.8044, 32.1133],
  ['Bnei Brak', 34.8338, 32.0807],
  ['Holon Center', 34.7722, 32.0114],
  ['Bat Yam', 34.7519, 32.0171],
  ['Herzliya Center', 34.8447, 32.1663],
  ['Neve Tzedek', 34.7639, 32.0609],
];
const BANDS = [5, 15, 30] as const;

function iou(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon): number {
  const fa = feature(a);
  const fb = feature(b);
  const inter = intersect(featureCollection([fa, fb]));
  if (!inter) return 0;
  const uni = union(featureCollection([fa, fb]));
  return uni ? area(inter) / area(uni) : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('local vs ORS IoU', () => {
  const key = orsKey();

  it('asset exists for comparison', () => {
    expect(existsSync(ASSET)).toBe(true);
  });

  it.skipIf(!key)(
    'mean IoU >= 0.75 across 10 origins x 3 bands',
    async () => {
      const ors = new OrsIsochroneProvider({ apiKey: key! });
      const local = new LocalIsochroneProvider({ source: new BundledGraphSource({ assetPath: ASSET }) });
      const rows: string[] = ['| Origin | Band (min) | IoU |', '| --- | --- | --- |'];
      const scores: number[] = [];
      for (const [name, lng, lat] of ORIGINS) {
        for (const minutes of BANDS) {
          const req = { origin: [lng, lat] as [number, number], mode: 'walk' as const, minutes };
          const mine = await local.getIsochrone(req);
          const theirs = await ors.getIsochrone(req);
          const score = iou(mine.polygon, theirs.polygon);
          scores.push(score);
          rows.push(`| ${name} | ${minutes} | ${score.toFixed(3)} |`);
          console.log(`${name} ${minutes}min IoU=${score.toFixed(3)}`);
          await sleep(3500); // ORS free tier: 20 req/min
        }
      }
      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      const doc = [
        '# Local engine vs ORS — IoU validation',
        '',
        `_Run: ${new Date().toISOString().slice(0, 10)} · asset: walk-tlv.v1 · target: mean IoU >= 0.75 (spec §9)_`,
        '',
        ...rows,
        '',
        `**Mean IoU: ${mean.toFixed(3)}** (min ${Math.min(...scores).toFixed(3)}, max ${Math.max(...scores).toFixed(3)})`,
        '',
      ].join('\n');
      writeFileSync(OUT, doc);
      console.log(`mean IoU: ${mean.toFixed(3)} -> ${OUT}`);
      expect(mean).toBeGreaterThanOrEqual(0.75);
    },
    600_000,
  );
});
