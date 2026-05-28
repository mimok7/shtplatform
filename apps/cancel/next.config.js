const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@supabase/supabase-js'],
};

module.exports = nextConfig;
