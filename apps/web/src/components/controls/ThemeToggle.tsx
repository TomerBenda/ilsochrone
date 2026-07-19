'use client';

import { Moon, Sun } from 'lucide-react';
import type { Theme } from '@/lib/hooks/useTheme';

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-accent"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}
