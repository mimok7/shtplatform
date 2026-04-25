import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  serverExternalPackages: ['@supabase/supabase-js'],
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
