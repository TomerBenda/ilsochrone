'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

export function LogoChip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2 shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-accent"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          i
        </span>
        <span className="text-sm font-semibold">ilsochrone</span>
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="About ilsochrone"
          className="ilso-pop absolute left-0 top-full z-10 mt-2 w-64 rounded-xl bg-background p-3 text-sm shadow-lg ring-1 ring-border"
        >
          <p className="font-medium">Where can you get on foot?</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>🧡 Drag the pin anywhere</li>
            <li>⏱️ Pick how long you&apos;re willing to walk</li>
            <li>📍 Right-click the map to drop a destination</li>
            <li>✨ Surprise me picks a reachable spot</li>
          </ul>
        </div>
      )}
    </div>
  );
}
