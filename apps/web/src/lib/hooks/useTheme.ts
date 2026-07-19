'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ilso.theme';

export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * System preference by default; an explicit toggle overrides it and persists.
 * Applies `data-theme` on <html> (Tailwind darkMode selector + globals.css).
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    setTheme(stored ?? systemTheme());
    if (stored) return; // explicit choice: stop following the OS
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(systemTheme());
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
