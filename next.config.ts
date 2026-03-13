import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowedHosts: ['mangueras.everwear', 'localhost', '10.10.0.159'],
  },
};

export default nextConfig;

