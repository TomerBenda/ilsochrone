'use client';

/**
 * The home page is a fully interactive, URL-state-driven map tool — its state
 * (origin/time/mode from the query string) is only knowable in the browser.
 * Rendering it on the server produced hydration mismatches for any deep link
 * (server HTML = defaults, client = parsed URL), so the whole page renders
 * client-only. The map itself was already ssr:false; there is no SEO content
 * here beyond the metadata in layout.tsx.
 */
import dynamic from 'next/dynamic';

const HomeInner = dynamic(() => import('./home-inner').then((m) => m.HomeInner), {
  ssr: false,
  loading: () => <div className="h-screen w-screen bg-muted" aria-hidden />,
});

export default function HomePage() {
  return <HomeInner />;
}
