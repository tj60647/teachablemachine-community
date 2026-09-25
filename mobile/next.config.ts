import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.TM_DEPLOY_TARGET === 'vercel' ? { output: 'export' as const } : {}),
};

export default nextConfig;
