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

/** Pastel chip fill + saturated icon per category (warm & playful, harmonized). */
const CATEGORY_STYLES: Record<PoiCategory, { chip: string; icon: string }> = {
  park: { chip: 'bg-emerald-100 text-emerald-900', icon: 'text-emerald-600' },
  cafe: { chip: 'bg-amber-100 text-amber-900', icon: 'text-amber-600' },
  restaurant: { chip: 'bg-rose-100 text-rose-900', icon: 'text-rose-600' },
  museum: { chip: 'bg-violet-100 text-violet-900', icon: 'text-violet-600' },
  viewpoint: { chip: 'bg-sky-100 text-sky-900', icon: 'text-sky-600' },
  beach: { chip: 'bg-cyan-100 text-cyan-900', icon: 'text-cyan-600' },
};

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
      className={cn('flex flex-wrap gap-1', className)}
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
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              on
                ? CATEGORY_STYLES[id].chip
                : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', on ? CATEGORY_STYLES[id].icon : 'text-muted-foreground')} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
