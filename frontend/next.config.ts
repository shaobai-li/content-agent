import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

const authApiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL;
if (authApiUrl) {
  nextConfig.rewrites = async () => [
    {
      source: "/api/:path*",
      destination: `${authApiUrl}/api/:path*`,
    },
  ];
}

export default nextConfig;