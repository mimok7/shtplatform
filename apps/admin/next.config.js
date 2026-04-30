const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  reactStrictMode: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // unzipper가 옵셔널 의존성(@aws-sdk/client-s3)을 동적 require → webpack 번들에서 제외
  serverExternalPackages: ['unzipper'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 사용하지 않는 옵셔널 모듈을 빈 모듈로 alias 처리(보호용)
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@aws-sdk/client-s3': false,
      };
    }
    return config;
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/:all*(svg|jpg|png|gif|ico|webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

module.exports = nextConfig;
