'use client';

import type { TravelMode } from '@ilsochrone/providers';
import { cn } from '@/lib/utils';
import { Footprints, Bike, Car, Bus } from 'lucide-react';

interface Props {
  value: TravelMode;
  onChange: (next: TravelMode) => void;
}

const MODES: { mode: TravelMode; label: string; Icon: typeof Footprints; enabled: boolean; tip: string }[] = [
  { mode: 'walk', label: 'Walking', Icon: Footprints, enabled: true, tip: 'Walking — MVP' },
  { mode: 'bike', label: 'Cycling', Icon: Bike, enabled: false, tip: 'Phase 2' },
  { mode: 'transit', label: 'Transit', Icon: Bus, enabled: false, tip: 'Phase 2' },
  { mode: 'drive', label: 'Driving', Icon: Car, enabled: false, tip: 'Phase 2' },
];

export function ModeSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Travel mode"
      className="inline-flex rounded-lg bg-muted p-1"
    >
      {MODES.map(({ mode, label, Icon, enabled, tip }) => (
        <button
          key={mode}
          role="radio"
          aria-checked={value === mode}
          aria-disabled={!enabled}
          title={tip}
          onClick={() => enabled && onChange(mode)}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            value === mode
              ? 'bg-primary text-primary-foreground'
              : enabled
                ? 'text-foreground hover:bg-accent hover:text-accent-foreground'
                : 'cursor-not-allowed text-muted-foreground opacity-60',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
