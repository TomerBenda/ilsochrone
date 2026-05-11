'use client';

/**
 * NavigateTo — handoff menu that opens a destination in an external maps/transit app.
 *
 * Renders as a horizontal row of provider buttons. Pure presentational; the parent
 * decides where it sits (inline card, popup, sheet). On phones the universal
 * links open the native app if installed; on desktop they open a web tab.
 *
 * Why a custom menu and not the Web Share API: `navigator.share` can only share
 * a URL or text, not a "navigate to coordinates" intent. Per-provider deep links
 * are the only reliable cross-platform way to hand off a location.
 */
import { useCallback, useState } from 'react';
import type { TravelMode } from '@ilsochrone/providers';
import { buildNavLinks, type NavigationDestination } from '@/lib/navigation-links';
import { cn } from '@/lib/utils';
import { Check, Copy, ExternalLink } from 'lucide-react';

interface Props {
  destination: NavigationDestination;
  origin?: { lng: number; lat: number };
  mode?: TravelMode;
  className?: string;
}

export function NavigateTo({ destination, origin, mode, className }: Props) {
  const links = buildNavLinks(destination, { origin, mode });
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    const text = `${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard might be blocked (insecure context); silently no-op.
    }
  }, [destination]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Navigate with
      </p>
      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <span>{link.label}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
          </a>
        ))}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy coordinates"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          )}
          <span>{copied ? 'Copied' : 'Copy coords'}</span>
        </button>
      </div>
    </div>
  );
}
