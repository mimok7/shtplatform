const path = require('path');
const fs = require('fs');

function loadRootEnv() {
  const rootDir = path.join(__dirname, '../../');
  const envFiles = ['.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);
    if (!fs.existsSync(envPath)) continue;

    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      if (process.env[key] !== undefined) continue;

      let value = match[2] ?? '';
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, '\n');
    }
  }
}

loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
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

module.exports = nextConfig;
