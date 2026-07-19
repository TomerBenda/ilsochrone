'use client';

import { useEffect, useState } from 'react';

/**
 * True below Tailwind's `md` breakpoint. Used to conditionally MOUNT
 * portal-based UI (vaul's Drawer.Portal escapes any `md:hidden` wrapper, so
 * CSS hiding cannot keep it off desktop — and a mounted drawer aria-hides
 * the rest of the app).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return isMobile;
}
