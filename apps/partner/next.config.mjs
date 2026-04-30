import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
    outputFileTracingRoot: path.join(__dirname, '../../'),
    images: {
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [{ protocol: 'https', hostname: '**' }],
    },
    pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
    experimental: {
        optimizePackageImports: ['lucide-react', 'date-fns'],
    },
    compiler: {
        removeConsole:
            process.env.NODE_ENV === 'production'
                ? { exclude: ['error', 'warn'] }
                : false,
    },
};

export default nextConfig;
