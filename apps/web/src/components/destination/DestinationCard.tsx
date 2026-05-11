'use client';

/**
 * DestinationCard — a small floating card with destination details and NavigateTo.
 *
 * Used by:
 *   - Map click handler (this PR — anchored to the clicked point as a MapLibre Popup)
 *   - POI marker click (T-09)
 *   - "Surprise me" reveal (T-11)
 */
import type { TravelMode } from '@ilsochrone/providers';
import { NavigateTo } from './NavigateTo';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: string;
  destination: { lng: number; lat: number; name?: string };
  origin?: { lng: number; lat: number };
  mode?: TravelMode;
  onClose?: () => void;
  className?: string;
}

export function DestinationCard({
  title,
  subtitle,
  destination,
  origin,
  mode,
  onClose,
  className,
}: Props) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        'w-72 rounded-lg border border-border bg-background p-3 shadow-lg',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-3">
        <NavigateTo destination={destination} origin={origin} mode={mode} />
      </div>
    </div>
  );
}
