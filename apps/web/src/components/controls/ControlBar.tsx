'use client';

import { cn } from '@/lib/utils';

/** Single desktop control surface: mode · time · categories · surprise. */
export function ControlBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl bg-background/95 px-3 py-2 shadow-md ring-1 ring-border backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}
