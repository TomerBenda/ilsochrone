'use client';

import { TIME_BANDS_MIN } from '@ilsochrone/providers';

/** Composite swatches of #F97316 accumulation over the basemap (validated sequential ramp). */
const SWATCHES: Record<number, string> = {
  5: '#F4D1B9',
  10: '#F3D7C4',
  15: '#F3DDCE',
  20: '#F3E4D9',
  30: '#F2EAE4',
};

export function BandLegend({ selectedMinutes }: { selectedMinutes: number }) {
  const active = TIME_BANDS_MIN.filter((m) => m <= selectedMinutes);
  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2 text-xs shadow-md ring-1 ring-border backdrop-blur">
      <span className="font-medium">Walk time</span>
      <div
        className="flex overflow-hidden rounded-md ring-1 ring-border"
        role="img"
        aria-label={`Bands from 5 to ${selectedMinutes} minutes`}
      >
        {active.map((m) => (
          <span key={m} className="h-3 w-6" style={{ backgroundColor: SWATCHES[m] }} title={`${m} min`} />
        ))}
      </div>
      <span className="tabular-nums text-muted-foreground">5–{selectedMinutes} min</span>
    </div>
  );
}
