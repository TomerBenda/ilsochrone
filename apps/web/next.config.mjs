/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the workspace package without a build step.
  transpilePackages: ['@ilsochrone/providers'],
  // MapLibre ships ESM-only; keep things simple.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
