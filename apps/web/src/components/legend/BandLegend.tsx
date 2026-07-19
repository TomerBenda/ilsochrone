'use client';

import { TIME_BANDS_MIN } from '@ilsochrone/providers';

/**
 * Composite swatches of the graded #F97316 band stack over each basemap
 * (validated monotonic ramps; keep in sync with BAND_FILL_OPACITY /
 * DARK_BAND_FILL_OPACITY in IlsochroneMap).
 */
const SWATCHES: Record<number, string> = {
  5: '#F5BE98',
  10: '#F4CEB5',
  15: '#F3DBCA',
  20: '#F3E4DA',
  30: '#F2EAE5',
};

const DARK_SWATCHES: Record<number, string> = {
  5: '#874619',
  10: '#663919',
  15: '#4D2F1A',
  20: '#39271A',
  30: '#2B221B',
};

export function BandLegend({
  selectedMinutes,
  theme = 'light',
}: {
  selectedMinutes: number;
  theme?: 'light' | 'dark';
}) {
  const swatches = theme === 'dark' ? DARK_SWATCHES : SWATCHES;
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
          <span key={m} className="h-3 w-6" style={{ backgroundColor: swatches[m] }} title={`${m} min`} />
        ))}
      </div>
      <span className="tabular-nums text-muted-foreground">5–{selectedMinutes} min</span>
    </div>
  );
}
