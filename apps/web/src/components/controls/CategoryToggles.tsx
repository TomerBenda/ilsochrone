'use client';

import type { PoiCategory } from '@ilsochrone/providers';
import { cn } from '@/lib/utils';
import {
  Trees,
  Coffee,
  Utensils,
  Landmark,
  Eye,
  Waves,
  type LucideIcon,
} from 'lucide-react';

interface Props {
  value: PoiCategory[];
  onChange: (next: PoiCategory[]) => void;
  className?: string;
}

const CATEGORIES: { id: PoiCategory; label: string; Icon: LucideIcon }[] = [
  { id: 'park', label: 'Parks', Icon: Trees },
  { id: 'cafe', label: 'Cafés', Icon: Coffee },
  { id: 'restaurant', label: 'Restaurants', Icon: Utensils },
  { id: 'museum', label: 'Museums', Icon: Landmark },
  { id: 'viewpoint', label: 'Viewpoints', Icon: Eye },
  { id: 'beach', label: 'Beaches', Icon: Waves },
];

export function CategoryToggles({ value, onChange, className }: Props) {
  const enabled = new Set(value);
  const toggle = (id: PoiCategory) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(CATEGORIES.filter((c) => next.has(c.id)).map((c) => c.id));
  };

  return (
    <div
      role="group"
      aria-label="POI categories"
      className={cn(
        'flex flex-wrap gap-1 rounded-md border border-border bg-background p-1 shadow-sm',
        className,
      )}
    >
      {CATEGORIES.map(({ id, label, Icon }) => {
        const on = enabled.has(id);
        return (
          <button
            key={id}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => toggle(id)}
            title={label}
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
              on
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
