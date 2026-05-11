'use client';

/**
 * Re-export wrapper used to gate IlsochroneMap behind a client-only dynamic import.
 *
 * MapLibre's bundle assumes `window` exists. We import the heavy module here so
 * `next/dynamic({ ssr: false })` can do its job.
 */
export { IlsochroneMap } from './IlsochroneMap';
