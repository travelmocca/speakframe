import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3'], poweredByHeader: false, turbopack: { root: process.cwd() },
  outputFileTracingExcludes: { '/*': ['./.env*', './*apiKey*.csv', './var/**/*', './var-test*/**/*', './outputs/**/*'] },
};
export default config;
