import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: './',
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
