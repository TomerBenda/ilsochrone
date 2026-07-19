/**
 * Server-only exports — anything touching node:fs or the engine runtime.
 * Import as '@ilsochrone/providers/server'. NEVER re-export from the main barrel:
 * the client bundle imports the barrel for types/constants.
 */
export { BundledGraphSource, type BundledGraphSourceOptions } from './isochrone/bundled-source';
export { LocalIsochroneProvider, type LocalIsochroneOptions } from './isochrone/local';
export {
  AssetFormatError,
  OutOfCoverageError,
  ENGINE_VERSION,
  type GraphAssetMeta,
  type GraphSource,
} from '@ilsochrone/engine';
