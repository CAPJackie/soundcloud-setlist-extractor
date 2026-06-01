import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
