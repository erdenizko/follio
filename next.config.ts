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
    // Increase the body size limit for API routes
    // 200MB for batch uploads (zip files), 10MB for regular image uploads
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
