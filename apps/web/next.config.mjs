/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the workspace packages without a build step.
  transpilePackages: ['@ilsochrone/providers', '@ilsochrone/engine'],
  // MapLibre ships ESM-only; keep things simple.
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Ship the committed walk-graph asset with the isochrone lambda (Vercel
    // output tracing does not follow fs.readFile paths).
    outputFileTracingIncludes: {
      '/api/isochrone': ['./assets/graphs/**'],
    },
  },
};

export default nextConfig;
