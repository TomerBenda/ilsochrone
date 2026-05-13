'use client';

import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  /** Tooltip override (useful for empty-state messaging). */
  title?: string;
}

export function SurpriseMe({ disabled, onClick, className, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? (disabled ? 'Toggle categories or expand time to surprise yourself' : 'Pick a random reachable POI')}
      aria-label="Surprise me"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors',
        disabled
          ? 'cursor-not-allowed border-border bg-background text-muted-foreground opacity-60'
          : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
        className,
      )}
    >
      <Shuffle className="h-4 w-4" aria-hidden />
      <span>Surprise me</span>
    </button>
  );
}
