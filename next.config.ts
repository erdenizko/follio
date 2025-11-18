import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "v3b.fal.media",
      },
    ],
  },
  experimental: {
    // Increase body size limit for API routes to handle large uploads
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
