'use client';

import { TIME_BANDS_MIN, type TimeBandMin } from '@ilsochrone/providers';
import { cn } from '@/lib/utils';

interface Props {
  value: TimeBandMin;
  onChange: (next: TimeBandMin) => void;
}

export function TimeSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Travel time"
      className="inline-flex rounded-md border border-border bg-background p-1 shadow-sm"
    >
      {TIME_BANDS_MIN.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn(
            'min-w-[3rem] rounded px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
            value === m
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {m} min
        </button>
      ))}
    </div>
  );
}
