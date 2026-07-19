'use client';

import { useEffect, useState } from 'react';

const KEY = 'ilso.coachmark.v1';

/** One-time hint bubble near the pin; dismissed on any origin/destination interaction. */
export function CoachMark({ dismissed }: { dismissed: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!dismissed && localStorage.getItem(KEY) !== 'done') setShow(true);
  }, [dismissed]);
  useEffect(() => {
    if (dismissed && show) {
      localStorage.setItem(KEY, 'done');
      setShow(false);
    }
  }, [dismissed, show]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[calc(50%-4.5rem)] -translate-x-1/2">
      <div className="motion-safe:animate-bounce rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background shadow-lg">
        Drag me! Right-click drops a destination 👇
      </div>
    </div>
  );
}
