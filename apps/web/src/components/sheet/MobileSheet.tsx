'use client';

import { useState } from 'react';
import { Drawer } from 'vaul';

/**
 * Persistent, non-modal bottom sheet for < md screens. Peek shows the time
 * selector + mode row; dragging up reveals categories, surprise, legend.
 */
export function MobileSheet({ peek, expanded }: { peek: React.ReactNode; expanded: React.ReactNode }) {
  const [snap, setSnap] = useState<number | string | null>(0.28);
  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={[0.28, 0.62]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-label="Map controls"
          // Full-height: vaul's snap-point transform assumes the content spans
          // the viewport and slides it down so `fraction` stays visible.
          className="fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-2xl bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)] ring-1 ring-border outline-none"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
          <div className="flex flex-col gap-3 overflow-y-auto p-4">
            {peek}
            {expanded}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
